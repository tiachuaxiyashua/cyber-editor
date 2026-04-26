import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

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

async function createProject(page: import('@playwright/test').Page, rootPath: string) {
  await page.evaluate(async (projectRoot) => {
    await window.api.createProject({
      name: 'runtime-approval-project',
      locationPath: projectRoot,
      directoryMode: 'create-in-parent',
      templateId: 'software-factory'
    });
  }, rootPath);
  await page.reload();
  await page.waitForTimeout(1200);
}

test('approval-gated runtime runs can be approved from orchestration UI', async () => {
  test.setTimeout(300_000);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-approval-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-approval-userdata-'));

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

    const payload = await page.evaluate(async () => {
      const bootstrap = await window.api.bootstrapLoad();
      if (!bootstrap.platform?.flows.length) {
        throw new Error('No platform flow available for approval runtime test.');
      }
      const flow = structuredClone(bootstrap.platform.flows[0]);
      const approvalNodeId = 'approval-e2e-node';
      flow.nodes.push({
        id: approvalNodeId,
        type: 'approval',
        position: { x: 520, y: 240 },
        data: {
          label: 'Approval Gate',
          approvalPrompt: 'Need approval before continue.'
        }
      });
      await window.api.saveFlow(flow);
      const debug = await window.api.debugFlowNode({
        kind: 'flow',
        flowId: flow.id,
        nodeId: approvalNodeId
      });
      return {
        flowId: flow.id,
        nodeId: approvalNodeId,
        runId: debug.result.run.id
      };
    });

    const waitingState = await page.evaluate(async (runId) => {
      const bootstrap = await window.api.bootstrapLoad();
      return bootstrap.runtimeRuns.find((run) => run.id === runId)?.status ?? null;
    }, payload.runId);
    expect(waitingState).toBe('waiting-approval');

    const pendingApprovalId = await page.evaluate(async (runId) => {
      const bootstrap = await window.api.bootstrapLoad();
      const run = bootstrap.runtimeRuns.find((item) => item.id === runId);
      return run?.pendingApprovals?.find((approval) => approval.status === 'pending')?.id ?? null;
    }, payload.runId);
    expect(pendingApprovalId).toBeTruthy();

    await page.evaluate(async ({ runId, approvalId }) => {
      if (!approvalId) {
        throw new Error('Missing pending approval id.');
      }
      await window.api.resolveRuntimeApproval({
        runId,
        approvalId,
        approved: true,
        reason: 'approved-from-e2e'
      });
    }, { runId: payload.runId, approvalId: pendingApprovalId });

    await expect.poll(async () => {
      const bootstrap = await page.evaluate(async () => window.api.bootstrapLoad());
      return bootstrap.runtimeRuns.find((run) => run.id === payload.runId)?.status ?? null;
    }, { timeout: 20_000 }).toBe('completed');
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});

test('approval-gated runtime runs record rejection cleanup and rollback hints on reject', async () => {
  test.setTimeout(300_000);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-approval-reject-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-approval-reject-userdata-'));

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

    const payload = await page.evaluate(async () => {
      const bootstrap = await window.api.bootstrapLoad();
      if (!bootstrap.platform?.flows.length) {
        throw new Error('No platform flow available for approval rejection test.');
      }
      const flow = structuredClone(bootstrap.platform.flows[0]);
      const approvalNodeId = 'approval-e2e-reject-node';
      flow.nodes.push({
        id: approvalNodeId,
        type: 'approval',
        position: { x: 520, y: 240 },
        data: {
          label: 'Reject Gate',
          approvalPrompt: 'Need approval before continue.',
          approvalRollbackNodeId: 'start'
        }
      });
      await window.api.saveFlow(flow);
      const debug = await window.api.debugFlowNode({
        kind: 'flow',
        flowId: flow.id,
        nodeId: approvalNodeId
      });
      return {
        runId: debug.result.run.id
      };
    });

    const pendingApprovalId = await page.evaluate(async (runId) => {
      const bootstrap = await window.api.bootstrapLoad();
      const run = bootstrap.runtimeRuns.find((item) => item.id === runId);
      return run?.pendingApprovals?.find((approval) => approval.status === 'pending')?.id ?? null;
    }, payload.runId);

    expect(pendingApprovalId).toBeTruthy();

    await page.evaluate(async ({ runId, approvalId }) => {
      if (!approvalId) {
        throw new Error('Missing pending approval id.');
      }
      await window.api.resolveRuntimeApproval({
        runId,
        approvalId,
        approved: false,
        reason: 'rejected-from-e2e'
      });
    }, { runId: payload.runId, approvalId: pendingApprovalId });

    await expect.poll(async () => {
      const bootstrap = await page.evaluate(async () => window.api.bootstrapLoad());
      const run = bootstrap.runtimeRuns.find((item) => item.id === payload.runId);
      return {
        status: run?.status ?? '',
        recoveryStatus: run?.recovery?.status ?? '',
        errorMessage: run?.errorMessage ?? '',
        hasRejectedEvent: bootstrap.runtimeEvents.some((event) => event.runId === payload.runId && event.type === 'approval.rejected'),
        hasCleanupEvent: bootstrap.runtimeEvents.some((event) => event.runId === payload.runId && event.type === 'run.cleanup')
      };
    }, { timeout: 20_000 }).toEqual({
      status: 'stopped',
      recoveryStatus: 'discarded',
      errorMessage: 'rejected-from-e2e',
      hasRejectedEvent: true,
      hasCleanupEvent: true
    });
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
