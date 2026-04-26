import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformFlowAsset, PlatformRole, TaskTemplate, AgentProfile } from '../../src/shared/types.js';

const handlers = new Map<string, Function>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers.set(channel, handler);
    })
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn()
  }
}));

describe('registerRuntimePlatformIpc', () => {
  beforeEach(() => {
    handlers.clear();
    vi.resetModules();
  });

  it('validates save-flow requests against task templates and agent profiles', async () => {
    const { registerRuntimePlatformIpc } = await import('../../src/main/ipc/register-runtime-platform-ipc.js');

    const flow: PlatformFlowAsset = {
      id: 'main-flow',
      kind: 'flow',
      name: 'Main Flow',
      description: 'Tests execution bindings.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        {
          id: 'agent',
          type: 'agent',
          position: { x: 180, y: 0 },
          data: {
            label: 'Planner Agent',
            roleId: 'planner-role',
            taskTemplateId: 'planner-task',
            agentProfileId: 'planner-agent'
          }
        },
        { id: 'end', type: 'end', position: { x: 360, y: 0 }, data: { label: 'End' } }
      ],
      edges: [
        { id: 'edge-start-agent', source: 'start', target: 'agent' },
        { id: 'edge-agent-end', source: 'agent', target: 'end' }
      ]
    };

    const roles: PlatformRole[] = [{
      id: 'planner-role',
      name: 'Planner Role',
      description: 'Plans the next result',
      promptHint: 'Focus on planning.',
      allowedSkillIds: [],
      allowedCapabilities: [],
      outputSchema: 'markdown',
      outputFormat: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    }];

    const taskTemplates: TaskTemplate[] = [{
      id: 'planner-task',
      name: 'Planner Task',
      objective: 'Summarize the next step.',
      inputContract: {},
      outputContract: {
        format: 'markdown'
      },
      recommendedSkillIds: ['outline-skill'],
      requiredCapabilities: ['read_artifact']
    }];

    const agentProfiles: AgentProfile[] = [{
      id: 'planner-agent',
      name: 'Planner Agent Profile',
      roleProfileId: 'planner-role',
      defaultSkillBundle: ['verification-before-completion'],
      capabilityPolicy: {
        allowedCapabilities: ['review_artifact']
      },
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      },
      dependencySpec: []
    }];

    const saveFlow = vi.fn();
    const ensureProjectRuntime = vi.fn();
    const buildBootstrap = vi.fn(() => ({ platform: { flows: [flow] } }));

    registerRuntimePlatformIpc({
      requireActiveRoot: () => 'E:/workspace/project',
      buildBootstrap,
      getMainWindow: vi.fn(),
      getProviderProfiles: vi.fn(() => []),
      settingsStore: {
        getSettings: vi.fn(() => ({ activeProviderProfileId: undefined }))
      },
      runtimeService: {
        getRuntimeTemplate: vi.fn(() => null),
        ensureProjectRuntime,
        listRunEvents: vi.fn(),
        pauseRun: vi.fn(),
        stopRun: vi.fn(),
        retryRun: vi.fn(),
        resumeRun: vi.fn()
      },
      projectService: {
        loadPlatformAssets: vi.fn(() => ({
          template: null,
          flows: [flow],
          subflows: [],
          roles,
          taskTemplates,
          agentProfiles,
          connectors: [],
          tools: []
        })),
        openProject: vi.fn(() => ({
          manifest: {
            templateId: undefined
          }
        }))
      },
      platformService: {
        saveFlow
      }
    } as any);

    const handler = handlers.get('platform:save-flow');
    expect(handler).toBeTypeOf('function');

    await expect(handler?.({}, flow)).resolves.toEqual({ platform: { flows: [flow] } });
    expect(saveFlow).toHaveBeenCalledWith('E:/workspace/project', flow);
    expect(ensureProjectRuntime).toHaveBeenCalledWith('E:/workspace/project');
    expect(buildBootstrap).toHaveBeenCalledWith('E:/workspace/project');
  });

  it('ignores injected rootPath values when syncing experience sources', async () => {
    const { registerRuntimePlatformIpc } = await import('../../src/main/ipc/register-runtime-platform-ipc.js');
    const syncExperienceSources = vi.fn(() => ({ lessonCount: 1 }));
    const buildBootstrap = vi.fn(() => ({ project: { rootPath: 'E:/workspace/project' } }));

    registerRuntimePlatformIpc({
      requireActiveRoot: () => 'E:/workspace/project',
      buildBootstrap,
      getMainWindow: vi.fn(),
      getProviderProfiles: vi.fn(() => []),
      settingsStore: {
        getSettings: vi.fn(() => ({ activeProviderProfileId: undefined }))
      },
      runtimeService: {
        getRuntimeTemplate: vi.fn(() => null),
        ensureProjectRuntime: vi.fn(),
        listRunEvents: vi.fn(),
        pauseRun: vi.fn(),
        stopRun: vi.fn(),
        retryRun: vi.fn(),
        resumeRun: vi.fn()
      },
      projectService: {
        loadPlatformAssets: vi.fn(() => ({
          template: null,
          flows: [],
          subflows: [],
          roles: [],
          taskTemplates: [],
          agentProfiles: [],
          connectors: [],
          tools: []
        })),
        openProject: vi.fn(() => ({
          manifest: {
            templateId: undefined
          }
        }))
      },
      platformService: {},
      rulesDistillationService: {
        syncExperienceSources
      }
    } as any);

    const handler = handlers.get('rules:sync-experience');
    expect(handler).toBeTypeOf('function');

    await handler?.({}, {
      rootPath: 'E:/attacker/project',
      sourcePath: 'E:/workspace/project/.scratch/napkin.md'
    });

    expect(syncExperienceSources).toHaveBeenCalledWith('E:/workspace/project', 'E:/workspace/project/.scratch/napkin.md');
    expect(buildBootstrap).toHaveBeenCalledWith('E:/workspace/project');
  });
});
