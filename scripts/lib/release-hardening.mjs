import path from 'node:path';

function toNumber(value) {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function sanitizeStepId(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'step';
}

export function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return 'n/a';
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainderSeconds}s`;
}

export function getDependencyBlockers(step, results) {
  const resultMap = new Map(results.map((item) => [item.id, item]));
  return (step.dependsOn ?? []).filter((dependencyId) => {
    const dependency = resultMap.get(dependencyId);
    if (!dependency) return true;
    return dependency.status === 'failed' || dependency.status === 'skipped';
  });
}

export function summarizeAuditReport(report, { scope }) {
  const rawCounts = report?.metadata?.vulnerabilities ?? {};
  const counts = {
    info: toNumber(rawCounts.info),
    low: toNumber(rawCounts.low),
    moderate: toNumber(rawCounts.moderate),
    high: toNumber(rawCounts.high),
    critical: toNumber(rawCounts.critical),
    total: toNumber(rawCounts.total)
  };
  if (!counts.total) {
    counts.total = counts.info + counts.low + counts.moderate + counts.high + counts.critical;
  }

  const hasFindings = counts.total > 0;
  const blocking = scope === 'production' && hasFindings;
  const status = !hasFindings ? 'passed' : blocking ? 'failed' : 'warn';
  const summary = !hasFindings
    ? `${scope} audit clean (0 advisories).`
    : scope === 'production'
      ? `${scope} audit found ${counts.total} production advisories.`
      : `${scope} audit found ${counts.total} advisories. Treat as warning until the toolchain is cleaned.`;

  return {
    scope,
    counts,
    status,
    blocking,
    summary
  };
}

export function summarizeHardcodeGate(report) {
  const counts = report?.summary ?? {};
  const high = toNumber(counts.high);
  const medium = toNumber(counts.medium);
  const low = toNumber(counts.low);
  const acceptedDebt = toNumber(counts.acceptedDebt);

  if (high > 0) {
    return {
      status: 'failed',
      blocking: true,
      summary: `Hardcode gate found ${high} high-severity findings, ${medium} medium, ${low} low, accepted debt ${acceptedDebt}.`
    };
  }

  if (medium > 0 || low > 0) {
    return {
      status: 'warn',
      blocking: false,
      summary: `Hardcode gate found ${medium} medium-severity and ${low} low-severity findings, accepted debt ${acceptedDebt}.`
    };
  }

  return {
    status: 'passed',
    blocking: false,
    summary: `Hardcode gate clean. Accepted debt ${acceptedDebt}.`
  };
}

export function renderReleaseHardeningMarkdown(report) {
  const lines = [
    '# Release Hardening Scan',
    '',
    `- Generated At: ${report.generatedAt}`,
    `- Run Root: ${report.runRoot}`,
    `- Overall Status: ${report.overallStatus}`,
    ''
  ];

  lines.push('## Steps', '');
  for (const step of report.steps ?? []) {
    lines.push(`- ${step.id} | ${step.title} | status=${step.status} | required=${step.required ? 'yes' : 'no'} | duration=${formatDuration(step.durationMs)}`);
    if (step.logPath) {
      lines.push(`  - log: ${step.logPath}`);
    }
    if (step.notes?.length) {
      for (const note of step.notes) {
        lines.push(`  - note: ${note}`);
      }
    }
  }
  lines.push('');

  if (report.artifacts && Object.keys(report.artifacts).length) {
    lines.push('## Artifacts', '');
    for (const [key, value] of Object.entries(report.artifacts)) {
      lines.push(`- ${key}: ${value}`);
    }
    lines.push('');
  }

  if (report.audits?.length) {
    lines.push('## Audits', '');
    for (const audit of report.audits) {
      lines.push(`- ${audit.scope} | status=${audit.status} | total=${audit.counts?.total ?? 0} | low=${audit.counts?.low ?? 0} | moderate=${audit.counts?.moderate ?? 0} | high=${audit.counts?.high ?? 0} | critical=${audit.counts?.critical ?? 0}`);
      lines.push(`  - ${audit.summary}`);
    }
    lines.push('');
  }

  if (report.quality?.length) {
    lines.push('## Output Quality', '');
    for (const item of report.quality) {
      lines.push(`- ${item.filePath} | verdict=${item.verdict} | band=${item.band} | score=${item.score} | deliveryScore=${item.deliveryScore ?? 'n/a'}`);
    }
    lines.push('');
  }

  if (report.failures?.length) {
    lines.push('## Failures', '');
    for (const failure of report.failures) {
      lines.push(`- ${failure.id}: ${failure.reason}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function buildStepLogPath(runRoot, stepId) {
  return path.join(runRoot, 'logs', `${sanitizeStepId(stepId)}.log`);
}
