import { assertPublicHttpUrl, type LookupAllFn } from './network-target-guard';

const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class RemoteFetchGuardError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'RemoteFetchGuardError';
  }
}

export function isRetryableRemoteFetchError(error: unknown): error is RemoteFetchGuardError {
  return error instanceof RemoteFetchGuardError && error.retryable;
}

type FetchLike = typeof fetch;

type RemoteFetchOptions = {
  label: string;
  maxBytes?: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  lookupImpl?: LookupAllFn;
  enforcePublicHttpTarget?: boolean;
};

function buildSizeMessage(label: string, maxBytes: number) {
  return `${label} download exceeds the allowed size of ${maxBytes} bytes.`;
}

function contentLengthExceedsLimit(contentLengthHeader: string | null, maxBytes: number) {
  if (!contentLengthHeader) return false;
  const declaredBytes = Number.parseInt(contentLengthHeader, 10);
  return Number.isFinite(declaredBytes) && declaredBytes > maxBytes;
}

async function fetchRemoteResponseWithLimits(url: string, options: RemoteFetchOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const enforcePublicHttpTarget = options.enforcePublicHttpTarget ?? fetchImpl === fetch;
  const requestUrl = enforcePublicHttpTarget
    ? (await assertPublicHttpUrl(url, options.label, options.lookupImpl)).toString()
    : new URL(url).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await fetchImpl(requestUrl, {
        signal: controller.signal
      });
    } catch (error) {
      if ((error as { name?: string } | undefined)?.name === 'AbortError') {
        throw new RemoteFetchGuardError(`${options.label} download timed out after ${timeoutMs}ms.`, false);
      }
      throw new RemoteFetchGuardError(
        error instanceof Error ? `${options.label} download failed: ${error.message}` : `${options.label} download failed.`,
        error instanceof TypeError
      );
    }

    if (!response.ok) {
      throw new RemoteFetchGuardError(
        `${options.label} download failed: ${response.status} ${response.statusText}`,
        RETRYABLE_HTTP_STATUSES.has(response.status),
        response.status
      );
    }

    const contentLengthHeader = response.headers?.get?.('content-length') ?? null;
    if (contentLengthExceedsLimit(contentLengthHeader, maxBytes)) {
      throw new RemoteFetchGuardError(buildSizeMessage(options.label, maxBytes), false);
    }

    return { response, maxBytes };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchRemoteTextWithLimits(url: string, options: RemoteFetchOptions) {
  const { response, maxBytes } = await fetchRemoteResponseWithLimits(url, options);
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new RemoteFetchGuardError(buildSizeMessage(options.label, maxBytes), false);
  }
  return text;
}

export async function fetchRemoteJsonWithLimits<T>(url: string, options: RemoteFetchOptions): Promise<T> {
  const { response, maxBytes } = await fetchRemoteResponseWithLimits(url, options);
  try {
    if (typeof response.text === 'function') {
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > maxBytes) {
        throw new RemoteFetchGuardError(buildSizeMessage(options.label, maxBytes), false);
      }
      return JSON.parse(text) as T;
    }

    if (typeof response.json === 'function') {
      return (await response.json()) as T;
    }

    throw new RemoteFetchGuardError(`${options.label} payload is not readable.`, false);
  } catch (error) {
    if (error instanceof RemoteFetchGuardError) {
      throw error;
    }
    throw new RemoteFetchGuardError(`${options.label} payload is not valid JSON.`, false);
  }
}
