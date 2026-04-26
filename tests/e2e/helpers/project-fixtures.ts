import { expect, type Page } from '@playwright/test';

type ProjectFixtureInput = {
  name: string;
  locationPath: string;
  directoryMode?: 'create-in-parent' | 'use-existing-directory';
  templateId?: string;
};

export async function waitForAppReady(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await expect
    .poll(
      async () => page.evaluate(() => Boolean(window.api?.bootstrapLoad)),
      { timeout: 15_000 }
    )
    .toBe(true);
}

export async function createProjectAndHydrate(page: Page, input: ProjectFixtureInput) {
  await waitForAppReady(page);
  const rootPath = await page.evaluate(async (payload) => {
    const result = await window.api.createProject({
      name: payload.name,
      locationPath: payload.locationPath,
      directoryMode: payload.directoryMode ?? 'create-in-parent',
      templateId: payload.templateId ?? 'software-factory'
    });
    return result.project?.rootPath ?? null;
  }, input);

  expect(rootPath).toBeTruthy();
  if (!rootPath) {
    throw new Error(`Project fixture did not create ${input.name}.`);
  }

  await page.evaluate(async (projectRoot) => {
    await window.api.openProject(projectRoot);
  }, rootPath);
  await page.reload();
  await waitForAppReady(page);
  await expect
    .poll(
      async () => page.evaluate(async () => {
        const bootstrap = await window.api.bootstrapLoad();
        return bootstrap.project?.manifest.name ?? null;
      }),
      { timeout: 20_000 }
    )
    .toBe(input.name);
  return rootPath;
}

export async function refreshProjectAndHydrate(page: Page) {
  await waitForAppReady(page);
  await page.evaluate(async () => {
    await window.api.refreshProject();
  });
  await page.reload();
  await waitForAppReady(page);
}
