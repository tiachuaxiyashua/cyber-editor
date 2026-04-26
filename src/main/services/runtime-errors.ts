export class RuntimeError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'auth_error'
      | 'network_error'
      | 'rate_limit'
      | 'model_error'
      | 'validation_error'
      | 'capability_error'
      | 'permission_error'
      | 'cancelled_error'
      | 'state_error'
  ) {
    super(message);
    this.name = 'RuntimeError';
  }
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 300,
  shouldRetry?: (error: unknown, attempt: number) => boolean,
  onRetry?: (error: unknown, attempt: number) => void
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (shouldRetry && !shouldRetry(error, attempt)) {
        break;
      }
      if (attempt === attempts) break;
      onRetry?.(error, attempt);
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }
  throw lastError;
}
