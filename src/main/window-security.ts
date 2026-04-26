import net from 'node:net';
import { shell } from 'electron';
import { assertPublicHttpUrl } from './services/network-target-guard';

type GuardedWebContents = {
  setWindowOpenHandler: (handler: (details: { url: string }) => { action: 'deny' }) => void;
  on: (event: 'will-navigate', listener: (event: { preventDefault: () => void }, url: string) => void) => void;
  getURL: () => string;
};

type OpenExternal = (url: string) => Promise<unknown>;
type NormalizeExternalTarget = (url: string) => Promise<string | null>;

const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

function parseUrl(input: string) {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function isSafeExternalOpen(targetUrl: string) {
  const parsed = parseUrl(targetUrl);
  if (!parsed) return false;
  if (!SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return false;
  if (parsed.protocol === 'mailto:') return true;
  if (parsed.username || parsed.password) return false;

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local')) {
    return false;
  }

  const normalizedIp = hostname.startsWith('::ffff:')
    ? hostname.slice('::ffff:'.length)
    : hostname;
  const family = net.isIP(normalizedIp);
  if (family === 4) {
    const parts = normalizedIp.split('.').map((value) => Number.parseInt(value, 10));
    if (parts.length === 4) {
      const [first, second] = parts;
      if (
        first === 0
        || first === 10
        || first === 127
        || (first === 169 && second === 254)
        || (first === 172 && second >= 16 && second <= 31)
        || (first === 192 && second === 168)
        || (first === 100 && second >= 64 && second <= 127)
      ) {
        return false;
      }
    }
  }
  if (family === 6) {
    if (
      normalizedIp === '::1'
      || normalizedIp.startsWith('fe80:')
      || normalizedIp.startsWith('fc')
      || normalizedIp.startsWith('fd')
    ) {
      return false;
    }
  }

  return true;
}

function isCurrentAppSurface(targetUrl: string, currentUrl: string) {
  const parsedTarget = parseUrl(targetUrl);
  const parsedCurrent = parseUrl(currentUrl);
  if (!parsedTarget || !parsedCurrent) return false;
  return parsedTarget.href === parsedCurrent.href;
}

const defaultNormalizeExternalTarget: NormalizeExternalTarget = async (targetUrl) => {
  if (!isSafeExternalOpen(targetUrl)) return null;
  const parsed = parseUrl(targetUrl);
  if (!parsed) return null;
  if (parsed.protocol === 'mailto:') {
    return targetUrl;
  }
  try {
    return (await assertPublicHttpUrl(targetUrl, 'External navigation')).toString();
  } catch {
    return null;
  }
};

async function openExternalIfAllowed(
  targetUrl: string,
  openExternal: OpenExternal,
  normalizeExternalTarget: NormalizeExternalTarget
) {
  const safeTarget = await normalizeExternalTarget(targetUrl);
  if (!safeTarget) return;
  await openExternal(safeTarget);
}

export function attachExternalNavigationGuards(
  webContents: GuardedWebContents,
  openExternal: OpenExternal = (url) => shell.openExternal(url),
  normalizeExternalTarget: NormalizeExternalTarget = defaultNormalizeExternalTarget
) {
  webContents.setWindowOpenHandler(({ url }) => {
    void openExternalIfAllowed(url, openExternal, normalizeExternalTarget);
    return { action: 'deny' };
  });

  webContents.on('will-navigate', (event, url) => {
    if (isCurrentAppSurface(url, webContents.getURL())) {
      return;
    }
    event.preventDefault();
    void openExternalIfAllowed(url, openExternal, normalizeExternalTarget);
  });
}
