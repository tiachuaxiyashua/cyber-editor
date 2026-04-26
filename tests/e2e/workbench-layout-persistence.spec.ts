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

async function setWindowBounds(app: any, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }: any, bounds: { width: number; height: number }) => {
    BrowserWindow.getAllWindows()[0].setBounds(bounds);
  }, { width, height });
}

async function dragResizer(page: import('@playwright/test').Page, selector: string, deltaX: number, index = 0) {
  const handle = page.locator(selector).nth(index);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`missing resizer: ${selector}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + deltaX, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
}

test('restores persisted workbench pane widths after relaunch and keeps compact layout usable', async () => {
  test.setTimeout(240_000);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-layout-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-layout-userdata-'));
  const env = buildElectronEnv(userDataRoot);

  let app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env
  });

  try {
    let page = await app.firstWindow();
    await setWindowBounds(app, 1560, 1040);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    await page.evaluate(async (rootPath) => {
      await window.api.createProject({
        name: 'layout-project',
        locationPath: rootPath,
        directoryMode: 'create-in-parent',
        templateId: 'software-factory'
      });
    }, projectRoot);
    await page.waitForTimeout(250);
    await page.reload();
    await page.waitForTimeout(1000);
    const createdRootPath = await page.evaluate(async () => {
      const bootstrap = await window.api.bootstrapLoad();
      return bootstrap.project?.rootPath ?? null;
    });
    expect(createdRootPath).toBeTruthy();
    if (!createdRootPath) {
      throw new Error('Project root was not created.');
    }

    await dragResizer(page, '.resizer', -120, 0);
    await dragResizer(page, '.resizer', -100, 1);
    await page.waitForTimeout(240);

    const leftBefore = (await page.locator('.primary-sidebar').boundingBox())?.width ?? 0;
    const rightBefore = (await page.locator('.context-pane').boundingBox())?.width ?? 0;
    expect(leftBefore).toBeGreaterThan(180);
    expect(rightBefore).toBeGreaterThan(260);

    await app.close();

    app = await electron.launch({
      args: ['.'],
      cwd: path.resolve(__dirname, '../..'),
      env
    });
    page = await app.firstWindow();
    await setWindowBounds(app, 1560, 1040);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);
    await page.evaluate(async (rootPath) => {
      await window.api.openProject(rootPath);
    }, createdRootPath);
    await page.waitForTimeout(250);
    await page.reload();
    await page.waitForTimeout(1200);

    const leftAfter = (await page.locator('.primary-sidebar').boundingBox())?.width ?? 0;
    const rightAfter = (await page.locator('.context-pane').boundingBox())?.width ?? 0;
    expect(Math.abs(leftAfter - leftBefore)).toBeLessThanOrEqual(18);
    expect(Math.abs(rightAfter - rightBefore)).toBeLessThanOrEqual(18);

    await setWindowBounds(app, 900, 760);
    await page.waitForTimeout(400);
    const compactLeft = (await page.locator('.primary-sidebar').boundingBox())?.width ?? 0;
    const compactRight = (await page.locator('.context-pane').boundingBox())?.width ?? 0;
    const compactCenter = (await page.locator('.document-pane').boundingBox())?.width ?? 0;
    expect(compactLeft).toBeGreaterThan(179);
    expect(compactRight).toBeGreaterThan(239);
    expect(compactCenter).toBeGreaterThan(259);
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
