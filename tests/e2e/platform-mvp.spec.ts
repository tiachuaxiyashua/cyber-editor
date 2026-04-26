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

async function mockDialogPaths(app: any, filePaths: string[]) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await app.evaluate(({ dialog }: any, nextPaths: string[]) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: nextPaths
        });
      }, filePaths);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

test('p027 dual entry and resource center support projects, drafts, templates, skills, and role packages', async () => {
  test.setTimeout(300_000);

  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-p027-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-p027-userdata-'));
  const resourceBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-p027-resources-'));

  const localSkillRoot = path.join(resourceBase, 'local-checker');
  fs.mkdirSync(localSkillRoot, { recursive: true });
  fs.writeFileSync(
    path.join(localSkillRoot, 'manifest.json'),
    JSON.stringify(
      {
        id: 'local-checker',
        name: 'Local Checker',
        version: '1.0.0',
        description: 'Local test skill for unified resource center.',
        applicableStages: ['discover', 'plan']
      },
      null,
      2
    ),
    'utf8'
  );
  fs.writeFileSync(path.join(localSkillRoot, 'SKILL.md'), '# Local Checker\n\n- Test skill\n', 'utf8');

  const localRoleRoot = path.join(resourceBase, 'flow-judge');
  fs.mkdirSync(path.join(localRoleRoot, 'Skills'), { recursive: true });
  fs.mkdirSync(path.join(localRoleRoot, 'MEMORY'), { recursive: true });
  fs.writeFileSync(
    path.join(localRoleRoot, 'role-package.json'),
    JSON.stringify(
      {
        id: 'flow-judge',
        name: 'Flow Judge',
        version: '1.0.0',
        description: 'Local role package for resource center coverage.',
        source: `local:${localRoleRoot}`,
        domain: 'review',
        tags: ['review', 'judge']
      },
      null,
      2
    ),
    'utf8'
  );
  fs.writeFileSync(path.join(localRoleRoot, 'IDENTITY.md'), '# Identity\n- Name: Flow Judge\n', 'utf8');
  fs.writeFileSync(path.join(localRoleRoot, 'SOUL.md'), '# Soul\n- Decide clearly.\n', 'utf8');
  fs.writeFileSync(path.join(localRoleRoot, 'AGENTS.md'), '# Agents\n- Summarize evidence.\n', 'utf8');
  fs.writeFileSync(path.join(localRoleRoot, 'USER.md'), '# User\n- Needs review conclusions.\n', 'utf8');
  fs.writeFileSync(path.join(localRoleRoot, 'Skills', 'README.md'), '# Skills\n- Review and synthesis\n', 'utf8');
  fs.writeFileSync(path.join(localRoleRoot, 'MEMORY', 'MEMORY.md'), '# Memory\n- Shared review memory\n', 'utf8');

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1600, height: 1100 });
    });
    await expect(page.locator('.welcome-screen')).toBeVisible();

    await page.locator('.welcome-actions').getByRole('button', { name: '资源中心' }).click();
    await expect(page.getByTestId('resource-center-page')).toBeVisible();
    await expect(page.locator('.template-list-item', { hasText: '软件工厂' }).first()).toBeVisible();
    await expect(page.locator('.template-list-item', { hasText: 'GStack Office Hours' }).first()).toBeVisible();

    await page.getByTestId('resource-center-page').locator('.segmented.compact').getByRole('button', { name: 'Skill', exact: true }).click();
    await mockDialogPaths(app, [localSkillRoot]);
    await page.getByTitle('导入本地 Skill').click();
    await expect(page.locator('.template-list-item', { hasText: 'Local Checker' }).first()).toBeVisible();

    await page.getByTestId('resource-center-page').locator('.segmented.compact').getByRole('button', { name: '角色包', exact: true }).click();
    await mockDialogPaths(app, [localRoleRoot]);
    await page.getByTitle('导入本地角色包').click();
    await expect(page.locator('.template-list-item', { hasText: 'Flow Judge' }).first()).toBeVisible();

    await page.getByTestId('resource-center-page').locator('.segmented.compact').getByRole('button', { name: '模板', exact: true }).click();
    await page.locator('.template-list-item', { hasText: '软件工厂' }).first().click();
    await page.getByTestId('resource-center-use-template').click();

    await expect(page.getByTestId('project-template-dialog')).toBeVisible();
    await page.getByLabel('工程名称').fill('dual-entry-project');
    await mockDialogPaths(app, [projectBase]);
    await page.getByTestId('project-dialog-choose-location').click();
    await page.getByTestId('project-dialog-submit').click();

    await expect(page.locator('.document-workspace-headline strong')).toHaveText('dual-entry-project');

    await page.getByTitle('欢迎页').click();
    await expect(page.locator('.welcome-screen')).toBeVisible();

    await page.getByTestId('welcome-start-orchestration').click();
    await expect(page.locator('.orchestration-workspace')).toBeVisible();
    await expect(page.getByRole('button', { name: '保存到本地模板' })).toBeVisible();
    await expect(page.getByText('已保存草稿').first()).toBeVisible({ timeout: 15_000 });

    await page.getByTitle('返回欢迎页').click();
    await expect(page.locator('.welcome-screen')).toBeVisible();
    await expect(page.getByRole('button', { name: /继续编排/ }).first()).toBeVisible();
    await page.getByRole('button', { name: /继续编排/ }).first().click();
    await expect(page.locator('.orchestration-workspace')).toBeVisible();

    await page.getByRole('button', { name: '保存到本地模板' }).click();
    await expect(page.getByTestId('save-template-dialog')).toBeVisible();
    await page.getByLabel('模板名称').fill('Draft Resource Template');
    await page.getByLabel('模板 ID').fill('draft-resource-template');
    await page.getByLabel('简短说明').fill('Saved from draft orchestration.');
    await page.getByRole('button', { name: '保存模板', exact: true }).click();
    await expect(page.getByTestId('save-template-dialog')).toBeHidden();

    await page.getByRole('button', { name: '保存到本地模板' }).click();
    await expect(page.getByTestId('save-template-dialog')).toBeVisible();
    await page.getByLabel('模板名称').fill('Draft Resource Template');
    await page.getByLabel('模板 ID').fill('draft-resource-template');
    await page.getByLabel('简短说明').fill('Saved from draft orchestration again.');
    await page.getByRole('button', { name: '保存模板', exact: true }).click();
    await expect(page.getByTestId('save-template-dialog')).toBeHidden();

    await page.locator('.orchestration-flow-head').getByRole('button', { name: '创建工程' }).click();
    await expect(page.getByTestId('project-template-dialog')).toBeVisible();
    await page.getByLabel('工程名称').fill('draft-bound-project');
    await mockDialogPaths(app, [projectBase]);
    await page.getByTestId('project-dialog-choose-location').click();
    await page.getByTestId('project-dialog-submit').click();
    await expect(page.locator('.document-workspace-headline strong')).toHaveText('draft-bound-project');

    await page.getByTitle('欢迎页').click();
    await expect(page.locator('.welcome-screen')).toBeVisible();

    await page.locator('.welcome-actions').getByRole('button', { name: '资源中心' }).click();
    await page.locator('.segmented.compact').getByRole('button', { name: '模板', exact: true }).click();
    await page.locator('.template-center-toolbar select').selectOption('local');
    await expect(page.locator('.template-list-item', { hasText: 'Draft Resource Template' }).first()).toBeVisible();
  } finally {
    await app.close();
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
    fs.rmSync(resourceBase, { recursive: true, force: true });
  }
});
