import { expect, type Locator, type Page } from '@playwright/test';

const activityAliases = {
  workbench: ['主工作台', '工程'],
  project: ['工程', '主工作台'],
  sessions: ['会话'],
  search: ['搜索'],
  resources: ['资源中心', '资源'],
  rules: ['规则与沉淀中心', '规则'],
  settings: ['设置'],
  orchestration: ['流编排', '编排'],
  thinkingChain: ['思路地图']
} as const;

export async function clickFirstVisible(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (!await locator.count()) continue;
    if (!await locator.isVisible().catch(() => false)) continue;
    await locator.click();
    return locator;
  }
  throw new Error(`No visible selector matched: ${selectors.join(' | ')}`);
}

export async function clickFirstVisibleButton(page: Page, labels: string[]) {
  for (const label of labels) {
    const locator = page.getByRole('button', { name: label, exact: true }).first();
    if (!await locator.count()) continue;
    if (!await locator.isVisible().catch(() => false)) continue;
    await locator.click();
    return locator;
  }
  throw new Error(`No visible button matched: ${labels.join(' | ')}`);
}

export async function openActivity(
  page: Page,
  activity: keyof typeof activityAliases,
  options: { settleMs?: number } = {},
) {
  const titles = activityAliases[activity];
  const selectors = titles.map((title) => `.activity-bar .activity-button[title="${title}"]`);
  const settleMs = options.settleMs ?? 200;
  for (const selector of selectors) {
    const button = page.locator(selector).first();
    if (!await button.count()) continue;
    if (!await button.isVisible().catch(() => false)) continue;

    if (await button.isEnabled().catch(() => false)) {
      await button.click();
      if (settleMs > 0) {
        await page.waitForTimeout(settleMs);
      }
      return button;
    }

    // The activity bar disables the already-active view button.
    return button;
  }

  throw new Error(`No visible selector matched: ${selectors.join(' | ')}`);
}

export function resourceItem(page: Page, value: string): Locator {
  if (value.includes(':')) {
    return page.locator(`[data-resource-id="${value}"]`).first();
  }
  return page.locator('.resource-list-item, .template-list-item').filter({ hasText: value }).first();
}

export async function selectResourceSource(page: Page, source: 'all' | 'builtin' | 'local' | 'remote') {
  const select = page.locator('.resource-source-select, .template-center-toolbar select').first();
  await expect(select).toBeVisible();
  await select.selectOption(source);
}
