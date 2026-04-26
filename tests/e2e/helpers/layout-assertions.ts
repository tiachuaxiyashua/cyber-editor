import { expect, type Page } from '@playwright/test';

import type { UiContract } from '../../contracts/types.js';

export async function assertLayoutContract(page: Page, contract: UiContract) {
  if (contract.assert.locator) {
    await expect(page.locator(contract.assert.locator)).toBeVisible();
  }

  const geometry = contract.assert.geometry;
  if (!geometry) {
    return;
  }

  if (geometry.leftPaneMinPx || geometry.centerPaneMinPx || geometry.rightPaneMinPx) {
    const widths = await page.evaluate(() => ({
      left: document.querySelector('.primary-sidebar')?.getBoundingClientRect().width ?? 0,
      center: document.querySelector('.document-pane')?.getBoundingClientRect().width ?? 0,
      right: document.querySelector('.context-pane')?.getBoundingClientRect().width ?? 0,
    }));

    if (typeof geometry.leftPaneMinPx === 'number') {
      expect(widths.left).toBeGreaterThanOrEqual(geometry.leftPaneMinPx);
    }
    if (typeof geometry.centerPaneMinPx === 'number') {
      expect(widths.center).toBeGreaterThanOrEqual(geometry.centerPaneMinPx);
    }
    if (typeof geometry.rightPaneMinPx === 'number') {
      expect(widths.right).toBeGreaterThanOrEqual(geometry.rightPaneMinPx);
    }
  }

  if (
    geometry.maxWorkbenchIdleGapAbovePx
    || geometry.maxWorkbenchIdleGapBelowPx
    || geometry.maxWorkbenchIdleComposerOffsetPx
    || geometry.maxWorkbenchIdleSpacerHeightPx
    || geometry.maxWorkbenchIdleEmptyHeightPx
    || geometry.maxWorkbenchIdleSummaryToComposerTopPx
    || geometry.maxWorkbenchIdleSummaryToComposerCenterPx
    || geometry.minWorkbenchContextMainGridRows
    || geometry.forbidGenericSessionTitle
  ) {
    const metrics = await page.evaluate(() => {
      const rect = (selector: string) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return {
          top: box.top,
          bottom: box.bottom,
          height: box.height,
        };
      };
      const visibleText = (selector: string) => Array.from(document.querySelectorAll(selector))
        .map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' ');
      const splitGridRows = (value: string) => {
        const rows: string[] = [];
        let current = '';
        let depth = 0;

        for (const ch of value) {
          if (ch === '(') {
            depth += 1;
          } else if (ch === ')') {
            depth = Math.max(0, depth - 1);
          }

          if (ch === ' ' && depth === 0) {
            if (current.trim()) {
              rows.push(current.trim());
              current = '';
            }
            continue;
          }

          current += ch;
        }

        if (current.trim()) {
          rows.push(current.trim());
        }

        return rows;
      };

      return {
        title: document.querySelector('.workbench-ai-head strong')?.textContent?.trim() ?? '',
        paneText: visibleText('.workbench-ai-head, .ai-summary-strip, [data-testid="workbench-conversation-empty"]'),
        contextMain: rect('.workbench-context-main'),
        summary: rect('.ai-summary-strip'),
        empty: rect('[data-testid="workbench-conversation-empty"]'),
        composer: rect('[data-testid="workbench-composer"]'),
        spacer: rect('.workbench-context-spacer'),
        conversation: rect('.workbench-conversation'),
        contextPaneMainGridRows: (() => {
          const node = document.querySelector('.context-pane-main');
          if (!node) return null;
          const rows = window.getComputedStyle(node).gridTemplateRows;
          if (!rows) {
            return 0;
          }
          return splitGridRows(rows).length;
        })(),
        summaryItems: Array.from(document.querySelectorAll('.ai-summary-item')).map((element) => {
          const box = element.getBoundingClientRect();
          return {
            top: box.top,
            bottom: box.bottom,
          };
        }),
      };
    });

    expect(metrics.empty).not.toBeNull();
    expect(metrics.summary).not.toBeNull();
    expect(metrics.composer).not.toBeNull();
    expect(metrics.contextMain).not.toBeNull();
    expect(metrics.conversation).not.toBeNull();

    if (typeof geometry.maxWorkbenchIdleGapAbovePx === 'number') {
      const gapAbove = Math.max(0, (metrics.empty?.top ?? 0) - (metrics.summary?.bottom ?? 0));
      expect(gapAbove).toBeLessThanOrEqual(geometry.maxWorkbenchIdleGapAbovePx);
    }

    if (typeof geometry.maxWorkbenchIdleGapBelowPx === 'number') {
      const gapBelow = Math.max(0, (metrics.composer?.top ?? 0) - (metrics.empty?.bottom ?? 0));
      expect(gapBelow).toBeLessThanOrEqual(geometry.maxWorkbenchIdleGapBelowPx);
    }

    if (typeof geometry.maxWorkbenchIdleSummaryToComposerTopPx === 'number') {
      const summaryToComposerTop = Math.max(0, (metrics.composer?.top ?? 0) - (metrics.summary?.bottom ?? 0));
      expect(summaryToComposerTop).toBeLessThanOrEqual(geometry.maxWorkbenchIdleSummaryToComposerTopPx);
    }

    if (typeof geometry.maxWorkbenchIdleSummaryToComposerCenterPx === 'number') {
      const composerTop = metrics.composer?.top ?? 0;
      const composerHeight = metrics.composer?.height ?? 0;
      const summaryToComposerCenter = Math.max(0, (composerTop + composerHeight / 2) - (metrics.summary?.bottom ?? 0));
      expect(summaryToComposerCenter).toBeLessThanOrEqual(geometry.maxWorkbenchIdleSummaryToComposerCenterPx);
    }

    if (typeof geometry.maxWorkbenchIdleComposerOffsetPx === 'number') {
      const compactBottom = Math.max(metrics.empty?.bottom ?? 0, metrics.summary?.bottom ?? 0);
      const composerOffset = Math.max(0, (metrics.composer?.top ?? 0) - compactBottom);
      expect(composerOffset).toBeLessThanOrEqual(geometry.maxWorkbenchIdleComposerOffsetPx);
    }

    if (typeof geometry.maxWorkbenchIdleSpacerHeightPx === 'number') {
      const spacerHeight = metrics.spacer?.height ?? 0;
      expect(spacerHeight).toBeLessThanOrEqual(geometry.maxWorkbenchIdleSpacerHeightPx);
    }

    if (typeof geometry.maxWorkbenchIdleEmptyHeightPx === 'number') {
      expect(metrics.empty?.height ?? 0).toBeLessThanOrEqual(geometry.maxWorkbenchIdleEmptyHeightPx);
    }

    if (typeof geometry.minWorkbenchContextMainGridRows === 'number') {
      const gridRows = metrics.contextPaneMainGridRows ?? 0;
      expect(gridRows).toBeGreaterThanOrEqual(geometry.minWorkbenchContextMainGridRows);
    }

    if (geometry.forbidGenericSessionTitle) {
      expect(metrics.title).not.toMatch(/^新会话\s+\d+$/);
    }
    if (geometry.forbidStageSuffixInWorkbenchTitle) {
      expect(metrics.title).not.toMatch(/·\s*(发现|澄清|方案|编排|交付)$/);
    }
    if (geometry.forbidAssistantMechanicsCopy) {
      expect(metrics.paneText).not.toMatch(/而不是跳去单独会话页|直接从下方输入框|自动组织上下文|当前会话会自动沿用/);
    }
    if (geometry.maxWorkbenchSummaryInternalGapPx && metrics.summaryItems.length >= 2) {
      const gap = Math.max(0, metrics.summaryItems[1].top - metrics.summaryItems[0].bottom);
      expect(gap).toBeLessThanOrEqual(Number(geometry.maxWorkbenchSummaryInternalGapPx));
    }
  }

  if (geometry.requiresMainColumn) {
    await expect(page.locator('.welcome-main-column')).toBeVisible();
  }
  if (geometry.requiresSectionsGrid) {
    await expect(page.locator('.welcome-sections-grid')).toBeVisible();
  }
  if (geometry.requiresModulePane) {
    await expect(page.locator('.flow-module-panel')).toBeVisible();
  }
  if (geometry.requiresRightPanel) {
    await expect(page.locator('.orchestration-right-panel')).toBeVisible();
  }
  if (geometry.requiresRightRail) {
    await expect(page.locator('.orchestration-right-rail')).toBeVisible();
  }
  if (geometry.requiresResourceTypePane) {
    await expect(page.locator('.resource-type-pane')).toBeVisible();
  }
  if (geometry.requiresResourceListPane) {
    await expect(page.locator('.resource-list-pane')).toBeVisible();
  }
  if (geometry.requiresResourceDetailPane) {
    await expect(page.locator('.resource-detail-pane')).toBeVisible();
  }
  if (geometry.requiresRulesListPane) {
    await expect(page.locator('[data-testid="rules-panel-list"]')).toBeVisible();
  }
  if (geometry.requiresRulesGraphPane) {
    await expect(page.locator('[data-testid="knowledge-graph-panel"]')).toBeVisible();
  }
  if (geometry.requiresRulesCreatePane) {
    await expect(page.locator('[data-testid="rules-panel-create-rule"]')).toBeVisible();
  }
  if (geometry.requiresSettingsSectionNav) {
    await expect(page.locator('.settings-section-nav')).toBeVisible();
  }
  if (geometry.requiresSettingsMainColumn) {
    await expect(page.locator('.settings-main-column')).toBeVisible();
  }
  if (geometry.requiresSettingsDetailGrid) {
    await expect(page.locator('.settings-detail-grid')).toBeVisible();
  }
}
