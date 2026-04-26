import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiService } from '../../src/main/services/ai-service.js';

describe('AiService network safeguards', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects non-http provider base urls', async () => {
    const service = new AiService();

    await expect(service.testConnection({
      provider: 'openai-compatible',
      baseUrl: 'file:///tmp/provider',
      model: 'gpt-test',
      apiKey: 'secret'
    })).rejects.toThrow('http/https');
  });

  it('times out connection checks instead of hanging indefinitely', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, init?: { signal?: AbortSignal }) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortError = new Error('The operation was aborted.');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      })
    ));

    const service = new AiService();
    const pending = service.testConnection({
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      model: 'gpt-test',
      apiKey: 'secret'
    });

    vi.advanceTimersByTime(120_000);

    await expect(pending).rejects.toThrow('timed out');
  });

  it('keeps DeepSeek completions alive longer and reports the applied timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, init?: { signal?: AbortSignal }) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortError = new Error('The operation was aborted.');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      })
    ));

    const service = new AiService();
    let settled = 'pending';
    const pending = service.complete({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      apiKey: 'secret'
    }, {
      system: 'system prompt',
      user: 'user prompt'
    });
    pending.then(
      () => {
        settled = 'resolved';
      },
      () => {
        settled = 'rejected';
      }
    );

    await vi.advanceTimersByTimeAsync(120_000);
    expect(settled).toBe('pending');

    await vi.advanceTimersByTimeAsync(800_000);

    await expect(pending).rejects.toThrow('300 秒内未完成');
  });
});
