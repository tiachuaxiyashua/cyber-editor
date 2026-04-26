import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { createProjectAndHydrate } from './helpers/project-fixtures';
import { openActivity } from './helpers/ui-compat';

function buildElectronEnv(userDataRoot: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  ) as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  env.APPDATA = path.join(userDataRoot, 'appdata');
  env.LOCALAPPDATA = path.join(userDataRoot, 'localappdata');
  env.HOME = path.join(userDataRoot, 'home');
  env.CYBER_EDITOR_USER_DATA = path.join(userDataRoot, 'userData');
  fs.mkdirSync(env.APPDATA, { recursive: true });
  fs.mkdirSync(env.LOCALAPPDATA, { recursive: true });
  fs.mkdirSync(env.HOME, { recursive: true });
  fs.mkdirSync(env.CYBER_EDITOR_USER_DATA, { recursive: true });
  return env;
}

function localConnectorCommand() {
  return process.platform === 'win32'
    ? { command: 'cmd', args: ['/c', 'echo connector-ready'] }
    : { command: 'sh', args: ['-lc', 'printf connector-ready'] };
}

function localToolCommand() {
  return process.platform === 'win32'
    ? { command: 'cmd', args: ['/c', 'echo tool-ok>tool-output.txt'] }
    : { command: 'sh', args: ['-lc', "printf 'tool-ok' > tool-output.txt"] };
}

async function createProject(page: import('@playwright/test').Page, rootPath: string) {
  await createProjectAndHydrate(page, {
    name: 'local-binding-project',
    locationPath: rootPath,
    templateId: 'software-factory'
  });
}

test('local workflow execution bindings resolve through role, task template, and agent profile assets', async () => {
  test.setTimeout(300_000);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-local-bindings-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-local-bindings-userdata-'));

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1600, height: 1040 });
    });
    await createProject(page, projectRoot);

    const payload = await page.evaluate(async ({ connectorCommand, connectorArgs, toolCommand, toolArgs }) => {
      const bootstrap = await window.api.bootstrapLoad();
      const baseFlow = structuredClone(bootstrap.platform!.flows[0]);
      const startNode = baseFlow.nodes.find((node) => node.type === 'start');
      const endNode = baseFlow.nodes.find((node) => node.type === 'end');
      if (!startNode || !endNode) {
        throw new Error('Base flow does not contain start/end nodes.');
      }

      const settings = await window.api.getSettings();
      const mockProfile = settings.providerProfiles.find((profile: any) => profile.id === 'profile-mock') ?? settings.providerProfiles[0];
      if (!mockProfile) {
        throw new Error('Missing baseline provider profile.');
      }
      await window.api.saveSettings({
        theme: settings.theme,
        sidebar: settings.sidebar,
        activeProviderProfileId: settings.activeProviderProfileId,
        providerProfiles: [
          ...settings.providerProfiles.map((profile: any) => ({
            id: profile.id,
            name: profile.name,
            provider: profile.provider,
            baseUrl: profile.baseUrl,
            model: profile.model,
            enabled: profile.enabled,
            capabilities: profile.capabilities,
            diagnostics: profile.diagnostics
          })),
          {
            id: 'profile-agent',
            name: 'Agent Fixed Profile',
            provider: mockProfile.provider,
            baseUrl: mockProfile.baseUrl,
            model: mockProfile.model,
            enabled: true,
            capabilities: mockProfile.capabilities,
            diagnostics: mockProfile.diagnostics
          }
        ],
        recentProjects: settings.recentProjects,
        recentTemplates: settings.recentTemplates,
        recentResources: settings.recentResources,
        recentDrafts: settings.recentDrafts
      });

      await window.api.saveRoles([
        {
          id: 'planner-role',
          name: 'Planner Role',
          description: 'Plans the next result',
          promptHint: 'Focus on planning.',
          allowedSkillIds: ['outline-skill'],
          allowedCapabilities: ['read_artifact'],
          outputSchema: 'markdown',
          outputFormat: 'markdown',
          modelPolicy: {
            mode: 'fixed',
            fixedProfileId: 'profile-mock',
            preferredProfileIds: [],
            fallbackToActive: true
          }
        }
      ]);

      await window.api.saveTaskTemplates([
        {
          id: 'planner-task',
          name: 'Planner Task',
          objective: 'Summarize the next workflow deliverable.',
          inputContract: {
            requiredArtifacts: ['docs/requirements.md']
          },
          outputContract: {
            format: 'markdown'
          },
          recommendedSkillIds: ['outline-skill'],
          requiredCapabilities: ['read_artifact']
        }
      ]);

      await window.api.saveAgentProfiles([
        {
          id: 'planner-agent',
          name: 'Planner Agent Profile',
          roleProfileId: 'planner-role',
          defaultSkillBundle: ['verification-before-completion'],
          capabilityPolicy: {
            allowedCapabilities: ['review_artifact']
          },
          modelPolicy: {
            mode: 'fixed',
            fixedProfileId: 'profile-agent',
            preferredProfileIds: [],
            fallbackToActive: true
          },
          dependencySpec: []
        }
      ]);

      await window.api.saveConnectors([
        {
          id: 'local-connector',
          name: 'Local Connector',
          description: 'Tests local stdio availability.',
          scope: 'local',
          transport: 'stdio',
          command: connectorCommand,
          args: connectorArgs,
          enabled: true,
          health: 'unknown'
        }
      ]);

      await window.api.saveTools([
        {
          id: 'local-tool',
          name: 'Local Tool',
          description: 'Writes a local file.',
          command: toolCommand,
          args: toolArgs,
          cwd: '.',
          timeoutMs: 3000,
          enabled: true,
          connectorId: 'local-connector',
          inputSchemaRef: 'tool-args'
        }
      ]);

      const connectorTest = await window.api.testConnector('local-connector');
      const preview = await window.api.previewSideEffect('script:local-tool', {}, 'run-local-tool');
      if (!preview) {
        throw new Error('Failed to create side-effect preview for local tool.');
      }
      const approval = await window.api.approveSideEffect(preview.id, true, 'approve-local-tool');
      const toolRun = await window.api.runTool('local-tool', approval.id);

      const flow = {
        ...baseFlow,
        nodes: [
          startNode,
          {
            id: 'agent-local-binding',
            type: 'agent' as const,
            position: { x: 280, y: 160 },
            data: {
              label: 'Planner Agent',
              roleId: 'planner-role',
              taskTemplateId: 'planner-task',
              agentProfileId: 'planner-agent',
              connectorId: 'local-connector',
              toolId: 'local-tool',
              skillIds: ['review-skill']
            }
          },
          endNode
        ],
        edges: [
          { id: 'edge-start-agent', source: startNode.id, target: 'agent-local-binding' },
          { id: 'edge-agent-end', source: 'agent-local-binding', target: endNode.id }
        ]
      };

      await window.api.saveFlow(flow);

      const debug = await window.api.debugFlowNode({
        kind: 'flow',
        flowId: flow.id,
        nodeId: 'agent-local-binding'
      });
      const refreshed = await window.api.bootstrapLoad();
      const savedNode = refreshed.platform?.flows
        .flatMap((item) => item.nodes)
        .find((node) => node.id === 'agent-local-binding');

      return {
        flowId: flow.id,
        debugRun: {
          status: debug.result.run.status,
          selectedProfileId: debug.result.run.selectedProfileId,
          allowedCapabilities: debug.result.run.resumeContext?.allowedCapabilities ?? []
        },
        savedNode: savedNode?.data
          ? {
              roleId: savedNode.data.roleId ?? null,
              taskTemplateId: savedNode.data.taskTemplateId ?? null,
              agentProfileId: savedNode.data.agentProfileId ?? null
            }
          : null,
        connectorTest: connectorTest.result,
        toolRun: toolRun.result,
        toolHealth: refreshed.platform?.tools.find((item) => item.id === 'local-tool')?.health ?? null,
        connectorHealth: refreshed.platform?.connectors.find((item) => item.id === 'local-connector')?.health ?? null
      };
    }, {
      connectorCommand: localConnectorCommand().command,
      connectorArgs: localConnectorCommand().args,
      toolCommand: localToolCommand().command,
      toolArgs: localToolCommand().args
    });

    await page.reload();
    await page.waitForTimeout(1200);
    await openActivity(page, 'orchestration');
    await expect(page.getByTestId('orchestration-workspace')).toBeVisible();
    const agentNode = page.locator('.react-flow__node-agent', { hasText: 'Planner Agent' }).first();
    await expect(agentNode).toBeVisible();
    await agentNode.click();
    await expect(page.locator('.flow-node-inspector-view')).toBeVisible();
    await page.getByRole('button', { name: '打开深度配置' }).click();

    const inspector = page.locator('.flow-editor-side-modal [data-testid="orchestration-inspector"]').first();
    await expect(inspector).toBeVisible();
    await inspector.getByRole('button', { name: '绑定' }).click();
    await expect(inspector.getByText('工作流绑定')).toBeVisible();
    await expect(inspector.getByLabel('角色绑定')).toHaveValue('planner-role');
    await expect(inspector.getByLabel('任务模板')).toHaveValue('planner-task');
    await expect(inspector.getByLabel('执行配置')).toHaveValue('planner-agent');
    await expect(inspector.getByText('Execution Summary')).toBeVisible();
    await expect(inspector.getByText('outline-skill')).toBeVisible();
    await expect(inspector.getByText('verification-before-completion')).toBeVisible();
    await expect(inspector.getByText('review-skill')).toBeVisible();
    await expect(inspector.getByText('read_artifact')).toBeVisible();
    await expect(inspector.getByText('review_artifact')).toBeVisible();
    await expect(inspector.getByText('模型策略来源', { exact: true })).toBeVisible();
    await expect(inspector.getByText('agent', { exact: true })).toBeVisible();
    await expect(inspector.getByText('当前由执行配置“Planner Agent Profile”主导模型策略。')).toBeVisible();

    expect(payload.debugRun.status).toBe('completed');
    expect(payload.debugRun.selectedProfileId).toBe('profile-agent');
    expect(payload.debugRun.allowedCapabilities).toEqual(expect.arrayContaining([
      'read_artifact',
      'review_artifact',
      'connector:local-connector',
      'script:local-tool'
    ]));
    expect(payload.savedNode).toEqual({
      roleId: 'planner-role',
      taskTemplateId: 'planner-task',
      agentProfileId: 'planner-agent'
    });
    expect(payload.connectorTest.ok).toBe(true);
    expect(payload.toolRun.result.ok).toBe(true);
    expect(payload.toolHealth).toBe('healthy');
    expect(payload.connectorHealth).toBe('healthy');

    const outputPath = path.join(projectRoot, 'local-binding-project', 'tool-output.txt');
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.readFileSync(outputPath, 'utf8')).toContain('tool-ok');
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
