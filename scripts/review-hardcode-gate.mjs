import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const scanRoots = ['src'];
const ignoredDirNames = new Set(['node_modules', '.git', '.vite', 'dist', 'out', 'artifacts', 'docs', 'openspec']);

const acceptedDebt = [
  {
    id: 'legacy-project-layout-bootstrap',
    path: 'src/main/services/project-service.ts',
    reason: '工程创建、校验与迁移仍依赖旧版基础目录，需要单独做模板化工程骨架迁移。'
  },
  {
    id: 'legacy-template-fallback-name',
    path: 'src/main/services/template-authoring-service.ts',
    reason: '模板作者工具在缺省 discover 工件时仍保留旧版文件名回退，需要与模板 schema 升级一起收敛。'
  }
];

const patterns = [
  {
    id: 'template-path-literal',
    severity: 'high',
    description: 'Generic runtime/UI code should not depend on software-factory directory names.',
    regex: /\b(?:01-requirements|02-solution|03-openspec)(?:\/|\b)/g,
    allow: (relativePath) =>
      relativePath.startsWith('src/shared/template-packages/')
      || relativePath.startsWith('src/shared/template-manifests/')
      || relativePath.startsWith('tests/')
      || relativePath === 'src/shared/runtime-template.ts'
      || relativePath === 'src/main/services/runtime-template-contracts.ts'
      || relativePath === 'scripts/review-hardcode-gate.mjs'
  },
  {
    id: 'provider-default-literal',
    severity: 'high',
    description: 'Provider defaults must live in src/shared/provider-registry.ts only.',
    regex: /https:\/\/api\.openai\.com\/v1|https:\/\/api\.deepseek\.com|http:\/\/127\.0\.0\.1:11434\/v1|mock-chat|gpt-4\.1-mini|deepseek-chat|qwen3:8b/g,
    allow: (relativePath) =>
      relativePath === 'src/shared/provider-registry.ts'
      || relativePath.startsWith('tests/')
      || relativePath === 'scripts/review-hardcode-gate.mjs'
  },
  {
    id: 'provider-label-duplicate',
    severity: 'medium',
    description: 'Provider labels should be rendered from the shared registry.',
    regex: /模拟服务|OpenAI 兼容|DeepSeek|Ollama/g,
    allow: (relativePath) =>
      relativePath === 'src/shared/provider-registry.ts'
      || relativePath.startsWith('tests/')
      || relativePath === 'scripts/review-hardcode-gate.mjs'
  },
  {
    id: 'template-specific-artifact-name',
    severity: 'medium',
    description: 'Template-specific artifact names should not appear in generic services.',
    regex: /原始需求|需求澄清|功能树|功能清单|技术方案/g,
    allow: (relativePath) =>
      relativePath.startsWith('src/shared/template-packages/')
      || relativePath.startsWith('src/shared/template-manifests/')
      || relativePath === 'src/shared/builtin-skill-packages.ts'
      || relativePath.startsWith('tests/')
      || relativePath === 'scripts/review-hardcode-gate.mjs'
  }
];

function walkFiles(targetPath, bucket) {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    const baseName = path.basename(targetPath);
    if (ignoredDirNames.has(baseName)) {
      return;
    }
    for (const entry of fs.readdirSync(targetPath)) {
      walkFiles(path.join(targetPath, entry), bucket);
    }
    return;
  }
  if (!/\.(ts|tsx|js|mjs|cjs|json|md)$/i.test(targetPath)) {
    return;
  }
  bucket.push(targetPath);
}

function normalizeRelativePath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

function findDebt(relativePath) {
  return acceptedDebt.find((entry) => relativePath === entry.path || relativePath.startsWith(`${entry.path}/`)) ?? null;
}

function collectFindings() {
  const files = [];
  for (const root of scanRoots) {
    const absoluteRoot = path.join(repoRoot, root);
    if (fs.existsSync(absoluteRoot)) {
      walkFiles(absoluteRoot, files);
    }
  }

  const findings = [];
  for (const filePath of files) {
    const relativePath = normalizeRelativePath(filePath);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (const pattern of patterns) {
      if (pattern.allow(relativePath)) {
        continue;
      }
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const matches = [...line.matchAll(pattern.regex)];
        if (!matches.length) continue;
        for (const match of matches) {
          findings.push({
            id: pattern.id,
            severity: pattern.severity,
            description: pattern.description,
            relativePath,
            line: index + 1,
            match: match[0],
            excerpt: line.trim(),
            acceptedDebt: findDebt(relativePath)
          });
        }
      }
    }
  }
  return findings;
}

function summarize(findings) {
  return findings.reduce((summary, finding) => {
    const bucket = finding.acceptedDebt ? 'acceptedDebt' : finding.severity;
    summary[bucket] += 1;
    return summary;
  }, { high: 0, medium: 0, low: 0, acceptedDebt: 0 });
}

function toMarkdownReport(findings, summary) {
  const lines = [
    '# Hardcode Gate Report',
    '',
    `- Generated At: ${new Date().toISOString()}`,
    `- High: ${summary.high}`,
    `- Medium: ${summary.medium}`,
    `- Accepted Debt: ${summary.acceptedDebt}`,
    ''
  ];

  if (!findings.length) {
    lines.push('No findings.');
    return lines.join('\n');
  }

  lines.push('## Findings', '');
  for (const finding of findings) {
    lines.push(`- [${finding.severity.toUpperCase()}] ${finding.relativePath}:${finding.line} :: ${finding.id}`);
    lines.push(`  match: ${finding.match}`);
    lines.push(`  rule: ${finding.description}`);
    lines.push(`  excerpt: ${finding.excerpt}`);
    if (finding.acceptedDebt) {
      lines.push(`  accepted-debt: ${finding.acceptedDebt.id} - ${finding.acceptedDebt.reason}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const findings = collectFindings();
const summary = summarize(findings);

const outputRoot = path.join(repoRoot, 'artifacts', 'hardcode-gate');
fs.mkdirSync(outputRoot, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  summary,
  acceptedDebt,
  findings
};

fs.writeFileSync(path.join(outputRoot, 'latest.json'), JSON.stringify(report, null, 2), 'utf8');
fs.writeFileSync(path.join(outputRoot, 'latest.md'), toMarkdownReport(findings, summary), 'utf8');

console.log(JSON.stringify(report, null, 2));
