import { expect, type Page } from '@playwright/test';

type RectMetrics = {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

function assertRect(rect: RectMetrics | null, label: string): asserts rect is RectMetrics {
  expect(rect, `${label} should be measurable`).not.toBeNull();
}

export async function assertShellFillsViewport(page: Page, selector: string) {
  const shell = page.locator(selector).first();
  await expect(shell).toBeVisible();

  const metrics = await shell.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    const borderWidths = [
      styles.borderLeftWidth,
      styles.borderTopWidth,
      styles.borderRightWidth,
      styles.borderBottomWidth,
    ]
      .map((value) => Number.parseFloat(value) || 0);
    const renderTolerance = Math.max(...borderWidths, 1 / (window.devicePixelRatio || 1));

    return {
      leftGap: Math.max(0, rect.left),
      topGap: Math.max(0, rect.top),
      rightGap: Math.max(0, window.innerWidth - rect.right),
      bottomGap: Math.max(0, window.innerHeight - rect.bottom),
      renderTolerance,
    };
  });

  expect(metrics.leftGap).toBeLessThanOrEqual(metrics.renderTolerance);
  expect(metrics.topGap).toBeLessThanOrEqual(metrics.renderTolerance);
  expect(metrics.rightGap).toBeLessThanOrEqual(metrics.renderTolerance);
  expect(metrics.bottomGap).toBeLessThanOrEqual(metrics.renderTolerance);
}

export async function assertWorkbenchEmptyStateSpacing(page: Page) {
  await expect(page.getByTestId('workbench-conversation-empty')).toBeVisible();
  await expect(page.locator('.workbench-ai-head')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const rect = (selector: string) => {
      const node = document.querySelector(selector);
      if (!node) {
        return null;
      }
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
      title: visibleText('.workbench-ai-head strong'),
      paneText: visibleText('.workbench-ai-head, .ai-summary-strip, [data-testid="workbench-conversation-empty"]'),
      contextMain: rect('.workbench-context-main'),
      summary: rect('.ai-summary-strip'),
      empty: rect('[data-testid="workbench-conversation-empty"]'),
      composer: rect('[data-testid="workbench-composer"]'),
      spacer: rect('.workbench-context-spacer'),
      contextPaneMainGridRows: (() => {
        const node = document.querySelector('.context-pane-main');
        if (!node) return null;
        const rows = window.getComputedStyle(node).gridTemplateRows;
        return rows ? splitGridRows(rows).length : 0;
      })(),
      summaryItems: Array.from(document.querySelectorAll('.ai-summary-item')).map((element) => {
        const box = element.getBoundingClientRect();
        return {
          top: box.top,
          bottom: box.bottom,
          height: box.height,
        };
      }),
      overflowingButtons: Array.from(document.querySelectorAll('[data-testid="workbench-composer"] button'))
        .filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)
        .map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim()),
    };
  });

  expect(metrics.summary).not.toBeNull();
  expect(metrics.empty).not.toBeNull();
  expect(metrics.composer).not.toBeNull();
  expect(metrics.contextMain).not.toBeNull();
  expect(metrics.title).not.toMatch(/·\s*(发现|澄清|方案|编排|交付)$/);
  expect(metrics.paneText).not.toMatch(/而不是跳去单独会话页|直接从下方输入框|自动组织上下文|当前会话会自动沿用/);
  expect(metrics.overflowingButtons).toEqual([]);
  expect(metrics.summaryItems.length).toBeGreaterThanOrEqual(2);
  expect(metrics.spacer?.height ?? 0).toBeLessThanOrEqual(24);
  expect(metrics.contextPaneMainGridRows ?? 0).toBeGreaterThanOrEqual(4);

  const summary = metrics.summary;
  const empty = metrics.empty;
  const composer = metrics.composer;
  if (!summary || !empty || !composer) {
    return;
  }

  const gapAbove = Math.max(0, empty.top - summary.bottom);
  const gapBelow = Math.max(0, composer.top - empty.bottom);
  const summaryToComposerTop = Math.max(0, composer.top - summary.bottom);
  const summaryToComposerCenter = Math.max(0, composer.top + composer.height / 2 - summary.bottom);

  expect(gapAbove).toBeLessThanOrEqual(28);
  expect(gapBelow).toBeLessThanOrEqual(28);
  expect(summaryToComposerTop).toBeLessThanOrEqual(180);
  expect(summaryToComposerCenter).toBeLessThanOrEqual(260);

  const [firstSummaryItem, secondSummaryItem] = metrics.summaryItems;
  if (firstSummaryItem && secondSummaryItem) {
    const summaryInternalGap = Math.max(0, secondSummaryItem.top - firstSummaryItem.bottom);
    expect(summaryInternalGap).toBeLessThanOrEqual(8);
  }
}

export async function assertCompactWorkbenchThreePaneUsable(page: Page) {
  const leftPane = page.locator('.primary-sidebar').first();
  const centerPane = page.locator('.document-pane').first();
  const rightPane = page.locator('.context-pane').first();

  await Promise.all([
    expect(leftPane).toBeVisible(),
    expect(centerPane).toBeVisible(),
    expect(rightPane).toBeVisible(),
    expect(page.locator('.workbench-explorer-toolbar')).toBeVisible(),
  ]);

  const metrics = await page.evaluate(() => {
    const rect = (selector: string): RectMetrics | null => {
      const node = document.querySelector(selector);
      if (!node) {
        return null;
      }
      const box = node.getBoundingClientRect();
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        right: box.right,
        bottom: box.bottom,
      };
    };

    const isVisible = (selector: string) => {
      const node = document.querySelector(selector) as HTMLElement | null;
      if (!node) {
        return false;
      }
      const box = node.getBoundingClientRect();
      const styles = window.getComputedStyle(node);
      return box.width > 0
        && box.height > 0
        && styles.visibility !== 'hidden'
        && styles.display !== 'none';
    };

    return {
      left: rect('.primary-sidebar'),
      center: rect('.document-pane'),
      right: rect('.context-pane'),
      explorerVisible: isVisible('.workbench-explorer-toolbar'),
      editorVisible: isVisible('.document-tabs') || isVisible('.document-surface') || isVisible('.document-pane-empty'),
      contextVisible: isVisible('[data-testid="workbench-composer"]') || isVisible('.ai-summary-strip') || isVisible('.context-pane'),
      tolerance: 1 / (window.devicePixelRatio || 1),
      viewportWidth: window.innerWidth,
    };
  });

  assertRect(metrics.left, 'left pane');
  assertRect(metrics.center, 'center pane');
  assertRect(metrics.right, 'right pane');

  expect(metrics.left.width).toBeGreaterThanOrEqual(180);
  expect(metrics.center.width).toBeGreaterThanOrEqual(260);
  expect(metrics.right.width).toBeGreaterThanOrEqual(240);
  expect(metrics.left.right).toBeLessThanOrEqual(metrics.center.x + metrics.tolerance);
  expect(metrics.center.right).toBeLessThanOrEqual(metrics.right.x + metrics.tolerance);
  expect(metrics.right.right).toBeLessThanOrEqual(metrics.viewportWidth + metrics.tolerance);
  expect(metrics.explorerVisible).toBe(true);
  expect(metrics.editorVisible).toBe(true);
  expect(metrics.contextVisible).toBe(true);
}

async function armArtifactLoadBarrier(page: Page) {
  await page.evaluate(() => {
    const runtimeWindow = window as typeof window & {
      __cyberArtifactBarrierInstalled?: boolean;
      __cyberArtifactBarrier?: { release: () => void };
    };
    const api = window.api;

    if (runtimeWindow.__cyberArtifactBarrierInstalled) {
      return;
    }

    let releaseBarrier: (() => void) | null = null;
    let pendingBarrier: Promise<void> | null = null;

    const waitForRelease = () => {
      if (!pendingBarrier) {
        pendingBarrier = new Promise<void>((resolve) => {
          releaseBarrier = () => {
            resolve();
            pendingBarrier = null;
            releaseBarrier = null;
          };
        });
      }
      return pendingBarrier;
    };

    const originalOpenArtifact = api.openArtifact.bind(api);
    const originalGetDocumentMeta = api.getDocumentMeta.bind(api);

    const delayedOpenArtifact: typeof api.openArtifact = async (...args) => {
      await waitForRelease();
      return originalOpenArtifact(...args);
    };

    const delayedGetDocumentMeta: typeof api.getDocumentMeta = async (...args) => {
      await waitForRelease();
      return originalGetDocumentMeta(...args);
    };

    api.openArtifact = delayedOpenArtifact;
    api.getDocumentMeta = delayedGetDocumentMeta;

    runtimeWindow.__cyberArtifactBarrier = {
      release: () => {
        releaseBarrier?.();
      },
    };
    runtimeWindow.__cyberArtifactBarrierInstalled = true;
  });
}

async function releaseArtifactLoadBarrier(page: Page) {
  await page.evaluate(() => {
    const runtimeWindow = window as typeof window & {
      __cyberArtifactBarrier?: { release: () => void };
    };
    runtimeWindow.__cyberArtifactBarrier?.release();
  });
}

export async function assertFileSwitchFeedbackBeforeArtifactLoad(
  page: Page,
  targetName: string,
  options: { timeoutMs?: number } = {},
) {
  const timeout = options.timeoutMs ?? 5000;
  await armArtifactLoadBarrier(page);
  let feedbackMs = timeout;

  try {
    const result = await page.evaluate(({ target, timeoutMs }) => new Promise<{
      feedbackMs?: number;
      error?: string;
      diagnostics?: unknown;
    }>((resolve) => {
      const isVisible = (element: Element | null) => {
        if (!element) {
          return false;
        }
        const box = element.getBoundingClientRect();
        const styles = window.getComputedStyle(element);
        return box.width > 0
          && box.height > 0
          && styles.visibility !== 'hidden'
          && styles.display !== 'none';
      };
      const findByText = (selector: string) =>
        Array.from(document.querySelectorAll(selector)).find((element) =>
          (element.textContent ?? '').includes(target)
        ) ?? null;
      const visibility = (selector: string) => Array.from(document.querySelectorAll(selector))
        .map((element) => {
          const box = element.getBoundingClientRect();
          const styles = window.getComputedStyle(element);
          return {
            text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
            visible: box.width > 0 && box.height > 0 && styles.visibility !== 'hidden' && styles.display !== 'none',
            className: element.getAttribute('class') ?? '',
          };
        })
        .slice(0, 8);
      const diagnostics = () => ({
        target,
        activeItems: visibility('.workbench-pane-item.active'),
        matchingItems: visibility('.workbench-pane-item'),
        activeTabs: visibility('.document-tab.tab-chip.active'),
        breadcrumbs: Array.from(document.querySelectorAll('.document-breadcrumbs'))
          .map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim())
          .filter(Boolean),
      });

      const item = Array.from(document.querySelectorAll('.workbench-pane-item')).find((element) =>
        (element.textContent ?? '').includes(target)
      ) as HTMLElement | undefined;
      if (!item) {
        resolve({ error: `missing workbench item: ${target}`, diagnostics: diagnostics() });
        return;
      }

      const startedAt = performance.now();
      (window as typeof window & { __cyberFileSwitchStartedAt?: number }).__cyberFileSwitchStartedAt = startedAt;

      let settled = false;
      let timeoutHandle: number | null = null;
      let observer: MutationObserver | null = null;
      const measureFeedback = () => {
        const activeItem = findByText('.workbench-pane-item.active');
        const activeTab = findByText('.document-tab.tab-chip.active');
        const breadcrumbs = document.querySelector('.document-breadcrumbs');
        return isVisible(activeItem)
          || isVisible(activeTab)
          || (isVisible(breadcrumbs) && (breadcrumbs?.textContent ?? '').includes(target))
          ? performance.now() - startedAt
          : null;
      };
      const settle = (value: { feedbackMs?: number; error?: string; diagnostics?: unknown }) => {
        if (settled) return;
        settled = true;
        observer?.disconnect();
        if (timeoutHandle) {
          window.clearTimeout(timeoutHandle);
        }
        resolve(value);
      };

      observer = new MutationObserver(() => {
        const measured = measureFeedback();
        if (measured !== null) {
          settle({ feedbackMs: measured });
        }
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden'],
      });

      item.click();
      const immediate = measureFeedback();
      if (immediate !== null) {
        settle({ feedbackMs: immediate });
        return;
      }

      timeoutHandle = window.setTimeout(() => {
        settle({
          error: `No visible file switch feedback within ${timeoutMs}ms`,
          diagnostics: diagnostics(),
        });
      }, timeoutMs);
    }), { target: targetName, timeoutMs: timeout });

    if (result.error) {
      throw new Error(`${result.error}\nFile switch feedback diagnostics: ${JSON.stringify(result.diagnostics, null, 2)}`);
    }
    feedbackMs = typeof result.feedbackMs === 'number' ? result.feedbackMs : timeout;
  } finally {
    await releaseArtifactLoadBarrier(page);
  }

  await expect(page.locator('.workbench-pane-item.active', { hasText: targetName })).toBeVisible();
  await expect(page.locator('.document-tab.tab-chip.active', { hasText: targetName })).toBeVisible();
  await expect(page.locator('.document-breadcrumbs')).toContainText(targetName);
  return feedbackMs;
}
