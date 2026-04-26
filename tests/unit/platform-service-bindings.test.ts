import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ControlledScriptTool, PlatformConnector, PlatformRole } from '../../src/shared/types.js';

const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-platform-bindings-user-data-'));
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
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('PlatformService role package bindings', () => {
  it('resolves runtime bundles from role package defaults and node bindings', async () => {
    const { PlatformService } = await import('../../src/main/services/platform-service.js');
    const service = new PlatformService();
    const rootPath = tempRoot('cyber-editor-platform-root-');

    const role: PlatformRole = {
      id: 'planner-role',
      name: 'Planner',
      description: 'Plans the next draft.',
      promptHint: 'Focus on planning.',
      allowedSkillIds: ['skill-outline'],
      allowedCapabilities: ['read_artifact'],
      outputSchema: 'markdown',
      outputFormat: 'markdown',
      modelPolicy: {
        mode: 'fixed',
        fixedProfileId: 'profile-ollama',
        preferredProfileIds: [],
        fallbackToActive: false
      }
    };
    const connector: PlatformConnector = {
      id: 'connector-local',
      name: 'Local Connector',
      description: 'Local stdio connector',
      scope: 'local',
      transport: 'stdio',
      command: process.platform === 'win32' ? 'cmd' : 'sh',
      args: [],
      enabled: true,
      health: 'healthy',
      compatibility: 'current',
      authStatus: 'not_required',
      capabilitySummary: ['stdio-command'],
      diagnostic: {
        status: 'healthy',
        code: 'CONNECTOR_READY',
        summary: 'Connector ready.'
      }
    };
    const tool: ControlledScriptTool = {
      id: 'tool-local',
      name: 'Local Tool',
      description: 'Writes local output.',
      command: process.platform === 'win32' ? 'cmd' : 'sh',
      args: [],
      cwd: '.',
      timeoutMs: 1000,
      enabled: true,
      connectorId: connector.id,
      inputSchemaRef: 'tool-args',
      health: 'healthy',
      diagnostic: {
        status: 'healthy',
        code: 'TOOL_READY',
        summary: 'Tool ready.'
      }
    };

    service.saveRoles(rootPath, [role]);
    service.saveConnectors(rootPath, [connector]);
    service.saveTools(rootPath, [tool]);

    const bundle = service.resolveRoleRuntimeBundle(rootPath, role.id, {
      connectorId: connector.id,
      toolId: tool.id,
      skillIds: ['skill-review']
    });

    expect(bundle.roleId).toBe(role.id);
    expect(bundle.packageRoot).toContain(path.join('.project', 'platform', 'roles', role.id));
    expect(bundle.packageHealth).toBe('healthy');
    expect(bundle.defaultSkillIds).toEqual(['skill-outline']);
    expect(bundle.effectiveSkillIds.sort()).toEqual(['skill-outline', 'skill-review']);
    expect(bundle.allowedCapabilities).toEqual(expect.arrayContaining([
      'read_artifact',
      `connector:${connector.id}`,
      `script:${tool.id}`
    ]));
    expect(bundle.modelPolicy.mode).toBe('fixed');
    expect(bundle.modelPolicy.fixedProfileId).toBe('profile-ollama');
    expect(bundle.sourceMap.skillIds).toBe('node');
    expect(bundle.sourceMap.capabilities).toBe('node');
  });

  it('surfaces connector and tool diagnostics during runtime resolution', async () => {
    const { PlatformService } = await import('../../src/main/services/platform-service.js');
    const service = new PlatformService();
    const rootPath = tempRoot('cyber-editor-platform-damaged-root-');

    const role: PlatformRole = {
      id: 'diagnostic-role',
      name: 'Diagnostic',
      description: 'Needs local bindings',
      promptHint: 'Observe local bindings.',
      allowedSkillIds: [],
      allowedCapabilities: [],
      outputSchema: 'markdown',
      outputFormat: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };
    const connector: PlatformConnector = {
      id: 'broken-connector',
      name: 'Broken Connector',
      description: 'Not tested yet',
      scope: 'local',
      transport: 'stdio',
      command: process.platform === 'win32' ? 'cmd' : 'sh',
      args: [],
      enabled: true,
      health: 'error',
      compatibility: 'review',
      authStatus: 'missing',
      diagnostic: {
        status: 'error',
        code: 'CONNECTOR_TEST_FAILED',
        summary: 'Connector authorization is missing.'
      }
    };
    const tool: ControlledScriptTool = {
      id: 'warning-tool',
      name: 'Warning Tool',
      description: 'Depends on missing schema and connector',
      command: process.platform === 'win32' ? 'cmd' : 'sh',
      args: [],
      cwd: '.',
      timeoutMs: 1000,
      enabled: true,
      connectorId: connector.id,
      inputSchemaRef: 'tool-args',
      health: 'warning',
      diagnostic: {
        status: 'warning',
        code: 'TOOL_CONNECTOR_UNAVAILABLE',
        summary: 'Tool connector is unavailable.'
      }
    };

    service.saveRoles(rootPath, [role]);
    service.saveConnectors(rootPath, [connector]);
    service.saveTools(rootPath, [tool]);

    const bundle = service.resolveRoleRuntimeBundle(rootPath, role.id, {
      connectorId: connector.id,
      toolId: tool.id
    });

    expect(bundle.packageHealth).toBe('healthy');
    expect(bundle.diagnostics.some((issue) => issue.code === 'ROLE_BUNDLE_CONNECTOR_UNAVAILABLE')).toBe(true);
    expect(bundle.diagnostics.some((issue) => issue.code === 'ROLE_BUNDLE_TOOL_UNAVAILABLE')).toBe(true);
  });

  it('persists task templates and agent profiles as separate platform assets', async () => {
    const { PlatformService } = await import('../../src/main/services/platform-service.js');
    const service = new PlatformService();
    const rootPath = tempRoot('cyber-editor-platform-assets-root-');

    const tasks = service.saveTaskTemplates(rootPath, [{
      id: 'task-review',
      name: '回归审查',
      objective: '判断当前变更是否带来回归风险',
      inputContract: {
        requiredArtifacts: ['docs/requirements.md']
      },
      outputContract: {
        format: 'markdown'
      },
      recommendedSkillIds: ['regression-risk-check'],
      requiredCapabilities: ['read_artifact']
    }]);

    const profiles = service.saveAgentProfiles(rootPath, [{
      id: 'agent-review',
      name: 'Review Agent',
      roleProfileId: 'planner-role',
      defaultSkillBundle: ['verification-before-completion'],
      capabilityPolicy: {
        allowedCapabilities: ['read_artifact']
      },
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      },
      dependencySpec: []
    }]);

    const assets = service.loadAssets(rootPath) as any;

    expect(tasks).toHaveLength(1);
    expect(profiles).toHaveLength(1);
    expect(assets.taskTemplates).toHaveLength(1);
    expect(assets.agentProfiles).toHaveLength(1);
  });
});
