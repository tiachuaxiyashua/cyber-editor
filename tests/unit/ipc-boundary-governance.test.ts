import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('IPC boundary governance', () => {
  it('keeps ipc.ts as a composition-only registration shell', () => {
    const source = read(path.join('src', 'main', 'ipc.ts'));

    expect(source).toContain("from './ipc/register-project-document-ipc'");
    expect(source).toContain("from './ipc/register-settings-session-ai-ipc'");
    expect(source).toContain("from './ipc/register-runtime-platform-ipc'");
    expect(source).toContain("from './ipc/register-resource-ipc'");
    expect(source).toContain("from './ipc/register-recent-system-ipc'");
    expect(source).toContain('registerProjectDocumentIpc(registrationContext);');
    expect(source).toContain('registerSettingsSessionAiIpc(registrationContext);');
    expect(source).toContain('registerRuntimePlatformIpc(registrationContext);');
    expect(source).toContain('registerResourceIpc(registrationContext);');
    expect(source).toContain('registerRecentSystemIpc(registrationContext);');
    expect(source).not.toMatch(/\bipcMain\.handle\(/);
    expect(source).not.toMatch(/\bipcMain\.on\(/);
  });

  it('keeps registration modules delegating to existing service owners', () => {
    const registerDir = path.join(process.cwd(), 'src', 'main', 'ipc');
    const modules = [
      'register-project-document-ipc.ts',
      'register-settings-session-ai-ipc.ts',
      'register-runtime-platform-ipc.ts',
      'register-resource-ipc.ts',
      'register-recent-system-ipc.ts'
    ];

    for (const moduleName of modules) {
      const source = fs.readFileSync(path.join(registerDir, moduleName), 'utf8');
      expect(source).toContain("from './context'");
      expect(source).toMatch(/context\.(projectService|runtimeService|platformService|settingsStore|skillRegistry|rolePackageRegistry|conversationFlowService|orchestrator|resourceGovernance|sideEffectGovernance|aiService)/);
      expect(source).not.toMatch(/\bnew\s+[A-Z][A-Za-z]+Service\b/);
    }
  });
});
