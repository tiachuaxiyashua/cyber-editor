import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { createProjectAndHydrate, refreshProjectAndHydrate } from './helpers/project-fixtures';

function buildElectronEnv(userDataRoot: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  ) as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  env.APPDATA = path.join(userDataRoot, 'appdata');
  env.LOCALAPPDATA = path.join(userDataRoot, 'localappdata');
  env.HOME = path.join(userDataRoot, 'home');
  env.CYBER_EDITOR_USER_DATA = path.join(userDataRoot, 'userData');
  return env;
}

test('shows note references, backlinks, and comparison in the context pane', async () => {
  test.setTimeout(180_000);

  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-note-refs-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-note-refs-userdata-'));
  const outputDir = path.resolve(process.cwd(), 'artifacts', 'ui-review');
  fs.mkdirSync(outputDir, { recursive: true });

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await page.evaluate(async () => {
      await window.api.clearAllRecentProjects();
      await window.api.closeProject();
    });
    await page.reload();

    await createProjectAndHydrate(page, { name: 'note-reference-project', locationPath: projectBase });

    const bootstrap = await page.evaluate(async () => window.api.bootstrapLoad());
    const rootPath = bootstrap.project?.rootPath;
    const noteAPath = bootstrap.project?.workflow.activeDocumentPath;
    expect(rootPath).toBeTruthy();
    expect(noteAPath).toBeTruthy();
    if (!rootPath || !noteAPath) {
      throw new Error('project bootstrap did not provide rootPath or activeDocumentPath');
    }

    const noteBPath = await page.evaluate(async ({ rootPath }) =>
      window.api.createFile(rootPath, 'note-b.md'),
    { rootPath: path.join(rootPath, '01-requirements') });
    const noteCPath = await page.evaluate(async ({ rootPath }) =>
      window.api.createFile(rootPath, 'note-c.md'),
    { rootPath: path.join(rootPath, '01-requirements') });
    const noteDPath = await page.evaluate(async ({ rootPath }) =>
      window.api.createFile(rootPath, 'note-d.md'),
    { rootPath: path.join(rootPath, '01-requirements') });

    await page.evaluate(async ({ noteAPath, noteBPath, noteCPath, noteDPath }) => {
      await window.api.saveDocument(noteBPath, '# note-b\n\n[[note-c]]\n');
      await window.api.saveDocument(noteCPath, '# note-c\n\n');
      await window.api.saveDocument(noteDPath, '# note-d\n\n[[01-原始需求]]\n');
      await window.api.saveDocument(noteAPath, '# 01-原始需求\n\n[引用 B](note-b.md)\n[[note-c]]\n[[missing-note]]\n');
    }, { noteAPath, noteBPath, noteCPath, noteDPath });

    const refreshed = await page.evaluate(async () => window.api.refreshProject());
    expect(refreshed.noteReferenceGraph?.edges.length).toBeGreaterThanOrEqual(3);
    await refreshProjectAndHydrate(page);

    await page.getByTestId('workbench-tree-file').filter({ hasText: '01-原始需求.md' }).first().click();
    const referencesCard = page.locator('.context-panel-card').filter({
      has: page.locator('.context-reference-grid')
    }).first();
    await expect(referencesCard).toContainText('笔记引用');
    await expect(referencesCard).toContainText('note-b');
    await expect(referencesCard).toContainText('note-c');
    await expect(referencesCard).toContainText('note-d.md');

    await referencesCard.locator('select').selectOption({ label: 'note-b' });
    await expect(referencesCard).toContainText('引用对比');
    await expect(referencesCard).toContainText('共同引用');
    await expect(referencesCard).toContainText('当前独有引用');
    await expect(referencesCard).toContainText('反向引用对比');
    await expect(referencesCard).toContainText('note-c');

    await page.locator('.reference-pill', { hasText: 'note-b' }).first().click();
    await expect(page.locator('.document-heading')).toContainText('note-b.md');

    await page.getByTestId('workbench-tree-file').filter({ hasText: '01-原始需求.md' }).first().click();
    await page.screenshot({ path: path.join(outputDir, 'note-references.png'), fullPage: true });
    expect(fs.existsSync(path.join(outputDir, 'note-references.png'))).toBeTruthy();
  } finally {
    await app.close();
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
