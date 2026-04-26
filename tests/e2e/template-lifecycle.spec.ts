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

function loadTemplateFixture() {
  const filePath = path.join(process.cwd(), 'src', 'shared', 'template-packages', 'software-factory.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, any>;
}

function createTemplatePackage(id: string, name: string, version: string) {
  const templatePackage = loadTemplateFixture();
  templatePackage.definition = {
    ...templatePackage.definition,
    id,
    name,
    source: 'local',
    version
  };
  templatePackage.runtime.template = {
    ...templatePackage.runtime.template,
    id,
    name
  };
  return templatePackage;
}

test('p031 resource center shows blocked templates and supports repair', async () => {
  test.setTimeout(180_000);

  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-p031-userdata-'));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-p031-template-source-'));
  const env = buildElectronEnv(userDataRoot);
  const actualUserDataRoot = env.CYBER_EDITOR_USER_DATA;

  const packageFile = path.join(sourceRoot, 'template-package.json');
  fs.writeFileSync(packageFile, JSON.stringify(createTemplatePackage('repairable-template', 'Repairable Template', '1.0.0'), null, 2), 'utf8');

  const registryRoot = path.join(actualUserDataRoot, 'templates');
  const installedRoot = path.join(registryRoot, 'installed', 'repairable-template');
  fs.mkdirSync(installedRoot, { recursive: true });
  fs.writeFileSync(path.join(installedRoot, 'template-package.json'), '{broken json', 'utf8');
  fs.writeFileSync(
    path.join(registryRoot, 'index.json'),
    JSON.stringify([
      {
        id: 'repairable-template',
        name: 'Repairable Template',
        packageFile: path.join(installedRoot, 'template-package.json'),
        installedAt: '2026-04-13T00:00:00.000Z',
        packageUrl: `local:${sourceRoot}`,
        version: '1.0.0'
      }
    ], null, 2),
    'utf8'
  );

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env
  });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1600, height: 1100 });
    });

    await expect(page.locator('.welcome-screen')).toBeVisible();
    await page.locator('.welcome-actions').getByRole('button', { name: '资源中心' }).click();
    await expect(page.getByTestId('resource-center-page')).toBeVisible();

    await page.locator('.segmented.compact').getByRole('button', { name: '模板', exact: true }).click();
    await page.locator('.template-center-toolbar select').selectOption('local');
    await page.locator('.template-search-field input').fill('Repairable Template');
    await expect(page.locator('[data-resource-id="template:repairable-template"]').first()).toBeVisible();
    await page.locator('[data-resource-id="template:repairable-template"]').first().click();

    await expect(page.getByTestId('resource-center-template-blocked')).toBeVisible();
    await expect(page.getByTestId('resource-center-use-template')).toBeDisabled();
    await expect(page.getByTestId('resource-center-start-draft')).toBeDisabled();

    await page.getByTestId('resource-center-repair-template').click();

    await expect(page.getByTestId('resource-center-template-blocked')).toBeHidden();
    await expect(page.getByTestId('resource-center-use-template')).toBeEnabled();
    await expect(page.getByTestId('resource-center-start-draft')).toBeEnabled();
  } finally {
    await app.close();
    fs.rmSync(userDataRoot, { recursive: true, force: true });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});
