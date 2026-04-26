import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRemoteJsonWithLimits, fetchRemoteTextWithLimits } from '../../src/main/services/remote-fetch-guard.js';

function createResponse(init: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  text?: string;
}): Response {
  const status = init.status ?? (init.ok === false ? 500 : 200);
  return new Response(init.text ?? '', {
    status,
    statusText: init.statusText ?? (status >= 200 && status < 300 ? 'OK' : 'Error'),
    headers: init.headers
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('remote fetch guard', () => {
  it('rejects responses that declare oversized payloads', async () => {
    const fetchImpl = vi.fn(async () => createResponse({
      headers: { 'content-length': String(2_500_000) },
      text: '{"ignored":true}'
    })) as typeof fetch;

    await expect(
      fetchRemoteTextWithLimits('https://example.com/package.json', {
        label: 'Role package',
        maxBytes: 1024,
        fetchImpl
      })
    ).rejects.toThrow('Role package download exceeds the allowed size');
  });

  it('times out hung requests and aborts the fetch', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })) as typeof fetch;

    const pending = fetchRemoteTextWithLimits('https://example.com/hangs', {
      label: 'Skill package',
      timeoutMs: 25,
      fetchImpl
    });
    const assertion = expect(pending).rejects.toThrow('Skill package download timed out');

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });

  it('parses remote json through the same size and timeout guards', async () => {
    const fetchImpl = vi.fn(async () => createResponse({
      text: JSON.stringify([{ id: 'remote-skill' }])
    })) as typeof fetch;

    const payload = await fetchRemoteJsonWithLimits<Array<{ id: string }>>('https://example.com/catalog.json', {
      label: 'Skill catalog',
      fetchImpl
    });

    expect(payload[0]?.id).toBe('remote-skill');
  });
});
