import { lookup as defaultLookup } from 'node:dns/promises';
import net from 'node:net';
import { RuntimeError } from './runtime-errors';

type LookupResult = { address: string; family: number };

export type LookupAllFn = (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<LookupResult[]>;

function normalizeIpLiteral(address: string) {
  return address.toLowerCase().startsWith('::ffff:')
    ? address.slice('::ffff:'.length)
    : address;
}

function isBlockedIpv4(address: string) {
  const parts = address.split('.').map((value) => Number.parseInt(value, 10));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return false;
  }
  const [first, second] = parts;
  return first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second >= 64 && second <= 127);
}

function isBlockedIpv6(address: string) {
  const normalized = address.toLowerCase();
  return normalized === '::1'
    || normalized.startsWith('fe80:')
    || normalized.startsWith('fc')
    || normalized.startsWith('fd');
}

function isBlockedAddress(address: string) {
  const normalized = normalizeIpLiteral(address);
  const family = net.isIP(normalized);
  if (family === 4) {
    return isBlockedIpv4(normalized);
  }
  if (family === 6) {
    return isBlockedIpv6(normalized);
  }
  return false;
}

export async function assertPublicHttpUrl(
  rawUrl: string,
  label: string,
  lookupImpl: LookupAllFn = defaultLookup as LookupAllFn
) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new RuntimeError(`${label} only supports http/https URLs.`, 'validation_error');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new RuntimeError(`${label} only supports http/https URLs.`, 'validation_error');
  }
  if (parsed.username || parsed.password) {
    throw new RuntimeError(`${label} does not allow embedded credentials.`, 'validation_error');
  }
  if (parsed.hostname === 'localhost' || parsed.hostname.toLowerCase().endsWith('.local')) {
    throw new RuntimeError(`${label} cannot access loopback or private network hosts.`, 'permission_error');
  }
  if (isBlockedAddress(parsed.hostname)) {
    throw new RuntimeError(`${label} cannot access loopback or private network hosts.`, 'permission_error');
  }

  if (net.isIP(parsed.hostname)) {
    return parsed;
  }

  let resolvedAddresses: LookupResult[];
  try {
    resolvedAddresses = await lookupImpl(parsed.hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new RuntimeError(
      error instanceof Error ? error.message : `${label} could not resolve the target host.`,
      'network_error'
    );
  }

  if (!resolvedAddresses.length) {
    throw new RuntimeError(`${label} could not resolve the target host.`, 'network_error');
  }

  if (resolvedAddresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new RuntimeError(`${label} cannot access loopback or private network hosts.`, 'permission_error');
  }

  return parsed;
}
