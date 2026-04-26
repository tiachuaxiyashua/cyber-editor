import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformConnector } from '../../src/shared/types.js';

const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-platform-connectors-user-data-'));
const tempRoots: string[] = [];

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataRoot,
    getAppPath: () => process.cwd()
  }
}));

function tempRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('PlatformService connector diagnostics', () => {
  it('normalizes missing http endpoint as a connector error with explicit auth and compatibility state', async () => {
    const { PlatformService } = await import('../../src/main/services/platform-service.js');
    const service = new PlatformService();
    const rootPath = tempRoot('cyber-editor-platform-connectors-root-');

    const connector: PlatformConnector = {
      id: 'remote-connector',
      name: 'Remote Connector',
      description: 'Requires an endpoint',
      scope: 'remote',
      transport: 'http',
      args: [],
      enabled: true,
      health: 'unknown'
    };

    service.saveConnectors(rootPath, [connector]);
    const assets = service.loadAssets(rootPath);
    const saved = assets.connectors[0];

    expect(saved.health).toBe('error');
    expect(saved.compatibility).toBe('incompatible');
    expect(saved.authStatus).toBe('not_required');
    expect(saved.diagnostic?.code).toBe('CONNECTOR_ENDPOINT_MISSING');
  });

  it('marks unauthorized http connector checks as auth missing instead of a generic failure', async () => {
    const { PlatformService } = await import('../../src/main/services/platform-service.js');
    const service = new PlatformService();
    const rootPath = tempRoot('cyber-editor-platform-connectors-auth-root-');

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized'
    })));

    service.saveConnectors(rootPath, [{
      id: 'auth-connector',
      name: 'Protected Connector',
      description: 'Needs auth',
      scope: 'remote',
      transport: 'http',
      endpoint: 'https://example.com/protected',
      args: [],
      enabled: true,
      health: 'unknown'
    } satisfies PlatformConnector]);

    const result = await service.testConnector(rootPath, 'auth-connector');
    const saved = service.loadAssets(rootPath).connectors[0];

    expect(result.ok).toBe(false);
    expect(saved.health).toBe('error');
    expect(saved.authStatus).toBe('missing');
    expect(saved.diagnostic?.code).toBe('CONNECTOR_AUTH_REQUIRED');
    expect(saved.lastCheckedAt).toBeTruthy();
  });

  it('rejects embedded credentials in http connector endpoints before persisting or testing them', async () => {
    const { PlatformService } = await import('../../src/main/services/platform-service.js');
    const service = new PlatformService();
    const rootPath = tempRoot('cyber-editor-platform-connectors-credentials-root-');
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    service.saveConnectors(rootPath, [{
      id: 'credential-connector',
      name: 'Credential Connector',
      description: 'Should not allow embedded credentials',
      scope: 'remote',
      transport: 'http',
      endpoint: 'https://user:secret@example.com/protected',
      args: [],
      enabled: true,
      health: 'unknown'
    } satisfies PlatformConnector]);

    const saved = service.loadAssets(rootPath).connectors[0];
    expect(saved.health).toBe('error');
    expect(saved.diagnostic?.code).toBe('CONNECTOR_ENDPOINT_INVALID');

    const result = await service.testConnector(rootPath, 'credential-connector');
    const reloaded = service.loadAssets(rootPath).connectors[0];

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(reloaded.diagnostic?.code).toBe('CONNECTOR_ENDPOINT_INVALID');
    expect(reloaded.lastError).toBeTruthy();
  });
});
