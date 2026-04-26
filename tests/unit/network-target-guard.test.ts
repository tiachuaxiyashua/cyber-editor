import { describe, expect, it, vi } from 'vitest';
import { assertPublicHttpUrl } from '../../src/main/services/network-target-guard.js';

describe('network target guard', () => {
  it('blocks link-local metadata addresses', async () => {
    await expect(
      assertPublicHttpUrl('http://169.254.169.254/latest/meta-data', 'Network validation')
    ).rejects.toMatchObject({ code: 'permission_error' });
  });

  it('blocks hostnames that resolve to private network addresses', async () => {
    const lookup = vi.fn(async () => [{ address: '192.168.10.25', family: 4 }]);

    await expect(
      assertPublicHttpUrl('https://intranet.example.com/resource', 'Headless browser', lookup)
    ).rejects.toMatchObject({ code: 'permission_error' });

    expect(lookup).toHaveBeenCalledWith('intranet.example.com', { all: true, verbatim: true });
  });

  it('allows public addresses after dns resolution', async () => {
    const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);

    const resolved = await assertPublicHttpUrl('https://example.com/docs', 'Headless browser', lookup);

    expect(resolved.toString()).toBe('https://example.com/docs');
  });
});
