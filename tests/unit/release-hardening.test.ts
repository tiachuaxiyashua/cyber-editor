import { describe, expect, it } from 'vitest';

async function loadReleaseHardeningHelpers() {
  // @ts-expect-error JS-only release hardening helper is loaded dynamically for test coverage.
  const module = await import('../../scripts/lib/release-hardening.mjs');
  return {
    getDependencyBlockers: module.getDependencyBlockers as (
      step: { dependsOn?: string[] },
      results: Array<{ id: string; status: string }>
    ) => string[],
    summarizeAuditReport: module.summarizeAuditReport as (
      report: Record<string, unknown>,
      options: { scope: 'production' | 'full' }
    ) => {
      scope: 'production' | 'full';
      counts: Record<string, number>;
      status: 'passed' | 'failed' | 'warn';
      blocking: boolean;
      summary: string;
    },
    summarizeHardcodeGate: module.summarizeHardcodeGate as (report: {
      summary?: { high?: number; medium?: number; low?: number; acceptedDebt?: number };
    }) => {
      status: 'passed' | 'failed' | 'warn';
      blocking: boolean;
      summary: string;
    },
    renderReleaseHardeningMarkdown: module.renderReleaseHardeningMarkdown as (report: {
      generatedAt: string;
      runRoot: string;
      overallStatus: string;
      steps: Array<{
        id: string;
        title: string;
        status: string;
        required: boolean;
        durationMs?: number;
        logPath?: string;
        notes?: string[];
      }>;
      artifacts?: Record<string, string>;
    }) => string
  };
}

describe('release hardening helpers', () => {
  it('blocks dependent steps when a required predecessor failed or was skipped', async () => {
    const { getDependencyBlockers } = await loadReleaseHardeningHelpers();

    const blockers = getDependencyBlockers(
      { dependsOn: ['build', 'package'] },
      [
        { id: 'lint', status: 'passed' },
        { id: 'build', status: 'failed' },
        { id: 'package', status: 'skipped' }
      ]
    );

    expect(blockers).toEqual(['build', 'package']);
  });

  it('treats production audit vulnerabilities as a blocking failure', async () => {
    const { summarizeAuditReport } = await loadReleaseHardeningHelpers();

    const summary = summarizeAuditReport(
      {
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 0,
            moderate: 1,
            high: 1,
            critical: 0,
            total: 2
          }
        }
      },
      { scope: 'production' }
    );

    expect(summary.status).toBe('failed');
    expect(summary.blocking).toBe(true);
    expect(summary.summary).toMatch(/2/);
  });

  it('treats full audit dev-tooling findings as warnings instead of release blockers', async () => {
    const { summarizeAuditReport } = await loadReleaseHardeningHelpers();

    const summary = summarizeAuditReport(
      {
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 1,
            moderate: 0,
            high: 0,
            critical: 0,
            total: 1
          }
        }
      },
      { scope: 'full' }
    );

    expect(summary.status).toBe('warn');
    expect(summary.blocking).toBe(false);
    expect(summary.summary).toMatch(/warning/i);
  });

  it('renders a readable markdown summary with step statuses and artifacts', async () => {
    const { renderReleaseHardeningMarkdown } = await loadReleaseHardeningHelpers();

    const markdown = renderReleaseHardeningMarkdown({
      generatedAt: '2026-04-22T10:00:00.000Z',
      runRoot: 'E:/scan/run',
      overallStatus: 'warn',
      steps: [
        {
          id: 'lint',
          title: 'Type check',
          status: 'passed',
          required: true,
          durationMs: 1200,
          logPath: 'E:/scan/run/logs/lint.log'
        },
        {
          id: 'audit-full',
          title: 'Full npm audit',
          status: 'warn',
          required: false,
          notes: ['Dev tooling advisories remain.']
        }
      ],
      artifacts: {
        summary: 'E:/scan/run/summary.json',
        extremeSuite: 'E:/artifacts/post-change-extreme-validation/2026-04-22T06-20-34-278Z'
      }
    });

    expect(markdown).toContain('# Release Hardening Scan');
    expect(markdown).toContain('Type check');
    expect(markdown).toContain('audit-full');
    expect(markdown).toContain('extremeSuite');
  });

  it('treats high-severity hardcode findings as a blocking failure', async () => {
    const { summarizeHardcodeGate } = await loadReleaseHardeningHelpers();

    const summary = summarizeHardcodeGate({
      summary: {
        high: 2,
        medium: 1,
        low: 0,
        acceptedDebt: 0
      }
    });

    expect(summary.status).toBe('failed');
    expect(summary.blocking).toBe(true);
    expect(summary.summary).toMatch(/high/i);
  });
});
