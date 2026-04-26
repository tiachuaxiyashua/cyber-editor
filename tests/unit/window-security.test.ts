import { describe, expect, it, vi } from 'vitest';
import { attachExternalNavigationGuards, isSafeExternalOpen } from '../../src/main/window-security.js';

describe('window-security', () => {
  const normalizeForTest = async (targetUrl: string) => (isSafeExternalOpen(targetUrl) ? targetUrl : null);

  it('allowlists only browser-safe external protocols', () => {
    expect(isSafeExternalOpen('https://example.com')).toBe(true);
    expect(isSafeExternalOpen('http://example.com')).toBe(true);
    expect(isSafeExternalOpen('mailto:test@example.com')).toBe(true);
    expect(isSafeExternalOpen('http://localhost:3000')).toBe(false);
    expect(isSafeExternalOpen('http://127.0.0.1:8080')).toBe(false);
    expect(isSafeExternalOpen('http://192.168.1.10')).toBe(false);
    expect(isSafeExternalOpen('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isSafeExternalOpen('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalOpen('cmd://calc')).toBe(false);
  });

  it('denies popup creation and routes safe external URLs to the system browser', async () => {
    const openExternal = vi.fn(async () => undefined);
    const setWindowOpenHandler = vi.fn();
    const on = vi.fn();

    attachExternalNavigationGuards(
      {
        setWindowOpenHandler,
        on,
        getURL: () => 'file:///app/index.html'
      },
      openExternal,
      normalizeForTest
    );

    expect(setWindowOpenHandler).toHaveBeenCalledTimes(1);
    const handler = setWindowOpenHandler.mock.calls[0]?.[0] as ({ url }: { url: string }) => { action: 'deny' };
    expect(handler({ url: 'https://example.com' })).toEqual({ action: 'deny' });
    expect(handler({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' });
    expect(handler({ url: 'http://localhost:3000' })).toEqual({ action: 'deny' });

    await new Promise((resolve) => setImmediate(resolve));
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  it('prevents in-app navigation away from the current app surface', async () => {
    const openExternal = vi.fn(async () => undefined);
    const setWindowOpenHandler = vi.fn();
    const listeners = new Map<string, (event: { preventDefault: () => void }, url: string) => void>();
    const preventDefault = vi.fn();

    attachExternalNavigationGuards(
      {
        setWindowOpenHandler,
        on: (eventName, listener) => {
          listeners.set(eventName, listener);
        },
        getURL: () => 'file:///app/index.html'
      },
      openExternal,
      normalizeForTest
    );

    const willNavigate = listeners.get('will-navigate');
    expect(willNavigate).toBeTypeOf('function');

    willNavigate?.({ preventDefault }, 'https://example.com');
    willNavigate?.({ preventDefault }, 'file:///app/index.html');
    willNavigate?.({ preventDefault }, 'javascript:alert(1)');

    await new Promise((resolve) => setImmediate(resolve));
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
    expect(openExternal).toHaveBeenCalledTimes(1);
  });
});
