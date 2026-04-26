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
      name: 'runtime-pause-project',
      locationPath: projectRoot,
      directoryMode: 'create-in-parent',
      templateId: 'software-factory'
    });
  }, rootPath);
  await page.reload();
  await page.waitForTimeout(1200);
}

test('running stage runs can be paused, survive reload, and resume from checkpoint', async () => {
  test.setTimeout(300_000);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-runtime-pause-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-runtime-pause-userdata-'));

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

    await page.evaluate(async () => {
      const settings = await window.api.getSettings();
      await window.api.saveSettings({
        theme: settings.theme,
        sidebar: settings.sidebar,
        activeProviderProfileId: 'profile-mock'
      });
    });

    await page.evaluate(async () => {
      const bootstrap = await window.api.bootstrapLoad();
      const sessionId = bootstrap.sessions[0]?.id;
      if (!sessionId) {
        throw new Error('Missing session for pause/resume runtime test.');
      }
      (window as unknown as { __p057StagePromise?: Promise<unknown> }).__p057StagePromise =
        window.api.generateStageDraft(sessionId, 'pause-runtime-e2e [mock-delay:20000]');
    });

    let runId = '';
    let pauseResult = { status: 'waiting', runId: '', hasPauseRequestedEvent: false };
    await expect.poll(async () => {
      const result = await page.evaluate(async () => {
        const bootstrap = await window.api.bootstrapLoad();
        const runningRun = bootstrap.runtimeRuns.find((run) => run.kind === 'stage' && run.status === 'running');
        if (!runningRun) {
          return { status: 'waiting', runId: '', hasPauseRequestedEvent: false };
        }
        const payload = await window.api.pauseRuntimeRun(runningRun.id);
        return {
          status: payload.result.run.status,
          runId: runningRun.id,
          hasPauseRequestedEvent: payload.result.events.some((event: { type: string }) => event.type === 'run.pause-requested')
        };
      });
      pauseResult = result;
      runId = result.runId;
      return result;
    }, { timeout: 30_000 }).toEqual(expect.objectContaining({
      status: 'pause-requested',
      hasPauseRequestedEvent: true
    }));

    expect(pauseResult.runId).toBeTruthy();

    const stageResult = await page.evaluate(async () => {
      const holder = window as unknown as { __p057StagePromise?: Promise<any> };
      if (!holder.__p057StagePromise) {
        throw new Error('Missing staged generation promise.');
      }
      return holder.__p057StagePromise;
    });

    expect(stageResult).toMatchObject({
      paused: true,
      pausedRunId: runId
    });

    await page.reload();
    await page.waitForTimeout(1200);

    await expect.poll(async () => {
      const persistedStatus = await page.evaluate(async (sourceRunId) => {
        const bootstrap = await window.api.bootstrapLoad();
        return bootstrap.runtimeRuns.find((run) => run.id === sourceRunId)?.status ?? null;
      }, runId);
      return persistedStatus;
    }, { timeout: 20_000 }).toBe('paused');

    const resumeResult = await page.evaluate(async (sourceRunId) => {
      const payload = await window.api.resumeRuntimeRun(sourceRunId);
      return {
        sourceRunStatus: payload.bootstrap.runtimeRuns.find((run: { id: string }) => run.id === sourceRunId)?.status ?? null,
        resumedRunId: payload.result.run.id,
        resumedFromRunId: payload.result.run.resumedFromRunId,
        resumedStatus: payload.result.run.status,
        hasResumeEvent: payload.bootstrap.runtimeEvents.some((event: { runId: string; type: string }) => event.runId === sourceRunId && event.type === 'run.resumed'),
        hasCompletedEvent: payload.result.events.some((event: { runId: string; type: string }) => event.runId === payload.result.run.id && event.type === 'run.completed')
      };
    }, runId);

    expect(resumeResult).toMatchObject({
      sourceRunStatus: 'paused',
      resumedFromRunId: runId,
      resumedStatus: 'completed',
      hasResumeEvent: true,
      hasCompletedEvent: true
    });
    expect(resumeResult.resumedRunId).not.toBe(runId);
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
