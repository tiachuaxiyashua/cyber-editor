import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SideEffectGovernanceService } from '../../src/main/services/side-effect-governance-service.js';

const roots: string[] = [];
const mockedUserDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-side-effects-user-data-'));

vi.mock('electron', () => ({
  app: {
    getPath: () => mockedUserDataRoot,
    getAppPath: () => process.cwd()
  }
}));

function createRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.project'), { recursive: true });
  return root;
}

beforeEach(() => {
  fs.rmSync(path.join(mockedUserDataRoot, 'evidence'), { recursive: true, force: true });
});

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('SideEffectGovernanceService', () => {
  it('requires approval before executing a script-backed side effect', () => {
    const rootPath = createRoot('cyber-editor-side-effects-');
    const service = new SideEffectGovernanceService({
      resolveProjectPath: (_rootPath: string, targetPath: string) => path.join(rootPath, targetPath)
    } as never);

    const preview = service.previewCapability(rootPath, 'script:tool-ok', {}, 'run-1');
    expect(preview?.requiresApproval).toBe(true);

    expect(() => service.assertExecutionAllowed(rootPath, preview!, undefined)).toThrow(/requires explicit approval/i);

    const approval = service.approvePreview(rootPath, preview!.id, true, 'allow test');
    expect(() => service.assertExecutionAllowed(rootPath, preview!, approval.id)).not.toThrow();
  });

  it('blocks writes into .project internal paths', () => {
    const rootPath = createRoot('cyber-editor-side-effects-blocked-');
    const service = new SideEffectGovernanceService({
      resolveProjectPath: (_rootPath: string, targetPath: string) => path.join(rootPath, targetPath)
    } as never);

    const preview = service.previewCapability(rootPath, 'builtin:write_artifact', {
      path: '.project/runtime/events.jsonl',
      content: 'x'
    }, 'run-1');

    expect(preview?.status).toBe('blocked');
    expect(() => service.assertExecutionAllowed(rootPath, preview!, undefined)).toThrow(/blocked by policy/i);
  });

  it('rejects approvals bound to a different preview id', () => {
    const rootPath = createRoot('cyber-editor-side-effects-mismatch-');
    const service = new SideEffectGovernanceService({
      resolveProjectPath: (_rootPath: string, targetPath: string) => path.join(rootPath, targetPath)
    } as never);

    const approvedPreview = service.previewCapability(rootPath, 'script:tool-ok', {}, 'run-1');
    const replayPreview = service.previewCapability(rootPath, 'script:tool-ok', {}, 'run-2');
    const approval = service.approvePreview(rootPath, approvedPreview!.id, true, 'allow first preview');

    expect(() => service.assertExecutionAllowed(rootPath, replayPreview!, approval.id)).toThrow(/does not match this side effect preview/i);
  });

  it('rejects expired approvals', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T00:00:00.000Z'));

    const rootPath = createRoot('cyber-editor-side-effects-expired-');
    const service = new SideEffectGovernanceService({
      resolveProjectPath: (_rootPath: string, targetPath: string) => path.join(rootPath, targetPath)
    } as never);

    const preview = service.previewCapability(rootPath, 'script:tool-ok', {}, 'run-1');
    const approval = service.approvePreview(rootPath, preview!.id, true, 'allow test');

    vi.setSystemTime(new Date('2026-04-14T00:11:00.000Z'));

    expect(() => service.assertExecutionAllowed(rootPath, preview!, approval.id)).toThrow(/has expired/i);
  });
});
