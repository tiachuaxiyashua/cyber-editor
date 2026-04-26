import path from 'node:path';
import type { AppStage, RuntimeTemplateAsset } from '../../shared/types';
import type { RuntimeTemplateStageDocumentRef } from './runtime-template-contracts';

export type OpenSpecSourceArtifact = RuntimeTemplateStageDocumentRef & {
  absolutePath: string;
  content: string;
};

function normalizeDirectoryLabel(targetPath: string) {
  const normalized = targetPath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized || normalized === '.') {
    return '';
  }
  return `${normalized}/`;
}

function summarizeSourceDirectories(sourceArtifacts: OpenSpecSourceArtifact[]) {
  const directories = Array.from(new Set(
    sourceArtifacts
      .map((artifact) => normalizeDirectoryLabel(path.posix.dirname(artifact.path)))
      .filter(Boolean)
  ));
  if (!directories.length) {
    return '模板声明的上游工件目录';
  }
  return directories.map((directory) => `\`${directory}\``).join('、');
}

function buildArtifactSection(artifact: OpenSpecSourceArtifact) {
  return [
    `#### ${artifact.title}`,
    '',
    `- 阶段：${artifact.stage}`,
    `- 路径：${artifact.path}`,
    `- 目标：${artifact.purpose}`,
    '',
    artifact.content.trim(),
    ''
  ].join('\n');
}

export function collectOpenSpecSourceArtifacts(
  rootPath: string,
  documents: RuntimeTemplateStageDocumentRef[],
  readFile: (filePath: string) => string,
  fileExists: (filePath: string) => boolean
) {
  return documents
    .map((document) => {
      const absolutePath = path.join(rootPath, document.path);
      if (!fileExists(absolutePath)) {
        return null;
      }
      return {
        ...document,
        absolutePath,
        content: readFile(absolutePath)
      } satisfies OpenSpecSourceArtifact;
    })
    .filter((artifact): artifact is OpenSpecSourceArtifact => Boolean(artifact));
}

export function buildOpenSpecRoadmap(projectName: string, changeName: string, sourceArtifacts: OpenSpecSourceArtifact[]) {
  return [
    '# OpenSpec Roadmap',
    '',
    `- 项目：${projectName}`,
    `- 生成时间：${new Date().toISOString()}`,
    `- 当前 change：${changeName}`,
    '',
    '## 来源工件',
    '',
    ...sourceArtifacts.map((artifact, index) => `${index + 1}. ${artifact.title} (${artifact.path})`),
    '',
    '## 交付顺序',
    '',
    `1. ${changeName}`,
    ''
  ].join('\n');
}

export function buildOpenSpecRoadmapV2(projectName: string, changeName: string, sourceArtifacts: OpenSpecSourceArtifact[]) {
  const generatedAt = new Date().toISOString();
  const sourceDirectorySummary = summarizeSourceDirectories(sourceArtifacts);
  const sourceRows = sourceArtifacts.length
    ? sourceArtifacts.map((artifact, index) =>
        `| ${index + 1} | ${artifact.stage} | \`${artifact.path}\` | ${artifact.title} | ${artifact.purpose} |`
      )
    : ['| 1 | n/a | n/a | No confirmed source artifact | Confirm upstream inputs before implementation. |'];
  const sourceChecklist = sourceArtifacts.length
    ? sourceArtifacts.map((artifact, index) =>
        `- [ ] R${index + 1}. Verify \`${artifact.path}\` is still the accepted baseline before coding, export, or packaged handoff.`
      )
    : ['- [ ] R1. Add at least one accepted upstream source artifact before closing this change.'];

  return [
    '# OpenSpec Roadmap',
    '',
    '## Delivery Baseline',
    '',
    `- Project: ${projectName}`,
    `- Change: ${changeName}`,
    `- Generated at: ${generatedAt}`,
    `- Source directories: ${sourceDirectorySummary}`,
    '- Quality bar: every core handoff document must be specific, actionable, traceable to source artifacts, and safe to reopen from the packaged build.',
    '',
    '## Source Artifact Inventory',
    '',
    '| # | Stage | Path | Title | Purpose |',
    '| - | - | - | - | - |',
    ...sourceRows,
    '',
    '## Execution Order',
    '',
    `1. Confirm that \`${changeName}\` is the only active change in scope for this export.`,
    '2. Review `proposal.md`, `design.md`, `tasks.md`, and the generated `specs/` package against the source inventory above.',
    '3. Run the baseline gates: `npm run lint`, `npm run test:unit`, and `npm run build`.',
    '4. Run the runtime evidence gate: `npm run test:post-change-extreme`, then inspect `summary.json`, scenario `result.json`, and quality reviews.',
    '5. Package the application and validate the preserved verification project from `out/manual-projects/` through the packaged executable under `out/package/`.',
    '',
    '## Acceptance Checklist',
    '',
    ...sourceChecklist,
    '- [ ] A1. The export bundle contains `manifest.json`, markdown, text, pdf, and OpenSpec artifacts from the same revision.',
    '- [ ] A2. The delivery package explains inputs, outputs, constraints, recovery path, validation evidence, and owner-facing next actions.',
    '- [ ] A3. No deterministic fallback marker, placeholder wording, empty section, or generic demo content remains in user-facing artifacts.',
    '- [ ] A4. UI validation evidence shows no layout overflow, scaling distortion, drag regression, or `window.unresponsive` event.',
    '',
    '## Risk And Recovery Notes',
    '',
    '- If source artifacts drift, stop implementation, refresh the affected proposal/design/tasks sections, and regenerate the export evidence.',
    '- If output quality drops below the strict delivery bar, treat the export as blocked even when files exist on disk.',
    '- If packaged validation fails, keep the preserved manual project intact, capture the failing app log and screenshot evidence, then rerun only after the defect is fixed.',
    '',
    '## Evidence Pointers',
    '',
    '- Primary runtime evidence: `artifacts/post-change-extreme-validation/`.',
    '- Packaged handoff evidence: `artifacts/packaged-project-validation/` and `artifacts/direct-packaged-open-validation/`.',
    '- Human reopening path: packaged launcher and pointer entry under `out/package/`, with the real project preserved under `out/manual-projects/`.',
    ''
  ].join('\n');
}

export function buildOpenSpecProposal(projectName: string, sourceArtifacts: OpenSpecSourceArtifact[]) {
  const [primaryArtifact, ...restArtifacts] = sourceArtifacts;
  const whyContent = primaryArtifact
    ? buildArtifactSection(primaryArtifact)
    : '#### No confirmed artifacts\n\n- 当前模板没有可用于 handoff 的已确认工件。\n';
  const changeSections = (restArtifacts.length ? restArtifacts : primaryArtifact ? [primaryArtifact] : [])
    .map((artifact) => buildArtifactSection(artifact))
    .join('\n');

  return [
    '# Proposal',
    '',
    `## ${projectName}`,
    '',
    '### Why',
    '',
    whyContent.trimEnd(),
    '',
    '### What Changes',
    '',
    changeSections.trim() || '#### Pending\n\n- 需要补充已确认工件。',
    ''
  ].join('\n');
}

export function buildOpenSpecDesign(template: RuntimeTemplateAsset, sourceArtifacts: OpenSpecSourceArtifact[]) {
  return [
    '# Design',
    '',
    '## Template Context',
    '',
    `- 模板：${template.name}`,
    `- 描述：${template.description}`,
    '',
    '## Source Package',
    '',
    ...sourceArtifacts.map((artifact) => buildArtifactSection(artifact)),
    ''
  ].join('\n');
}

export function buildOpenSpecTasks(
  sourceArtifacts: OpenSpecSourceArtifact[],
  options?: {
    exportRoot?: string;
    exportFormatSummary?: string;
  }
) {
  const prioritizedArtifacts = sourceArtifacts.slice(0, 4);
  const artifactTitles = prioritizedArtifacts.map((artifact) => artifact.title);
  const summary = artifactTitles.length ? artifactTitles.join('、') : '已确认工件';
  const sourceDirectorySummary = summarizeSourceDirectories(sourceArtifacts);
  const exportRoot = normalizeDirectoryLabel(options?.exportRoot ?? '');
  const exportRootLabel = exportRoot ? `\`${exportRoot}\`` : '模板声明的交付导出目录';
  const exportFormatSummary = options?.exportFormatSummary?.trim() || '模板声明的交付格式';
  const sourceArtifactChecklist = prioritizedArtifacts.length
    ? prioritizedArtifacts.map((artifact, index) =>
        `- [ ] 1.${index + 1} 对齐 \`${artifact.path}\` 的阶段边界、目标和交付约束，确认“${artifact.title}”与 Proposal / Design 没有冲突`
      )
    : ['- [ ] 1.1 对齐已确认工件的阶段边界、目标和交付约束，确认 Proposal / Design 没有冲突'];
  return [
    '## 1. Confirm Source Package',
    '',
    `- 将 ${summary} 作为本次 handoff 的上游基线，优先核对 ${sourceDirectorySummary} 中已确认工件的输入 / 输出合同。`,
    ...sourceArtifactChecklist,
    '- [ ] 1.5 记录仍未关闭的风险、人工确认点、权限边界和失败恢复条件，避免编码时再次猜测需求。',
    '',
    '## 2. Implement Confirmed Scope',
    '',
    `- [ ] 2.1 依据 Proposal、Design 和 ${summary} 实现确认范围内的代码、流程、文档或配置变更，不引入未约定的扩张项。`,
    '- [ ] 2.2 把输入来源、输出目录、失败重试、人工合并、权限校验和导出契约落实到真实实现，而不是只写静态说明。',
    '- [ ] 2.3 如果实现过程中发现 `proposal.md`、`design.md` 或 `spec.md` 与源工件不一致，先回写差异，再继续编码与导出。',
    '',
    '## 3. Validate Runtime And Delivery',
    '',
    '- [ ] 3.1 运行 `npm run lint`、`npm run test:unit` 与 `npm run build`，确认基础回归、类型边界和产物构建全部通过。',
    '- [ ] 3.2 运行 `npm run test:post-change-extreme`，检查运行日志、snapshot、rerun 证据与 `manifest.json` 是否能够支持真实交付。',
    '- [ ] 3.3 对 `proposal.md`、`tasks.md` 和关键交付文档执行输出质量复核，要求 90+ 交付分、无占位脚手架词、无 deterministic fallback 标记再进入签收。',
    '',
    '## 4. Record Evidence And Handoff',
    '',
    '- [ ] 4.1 在 `artifacts/post-change-extreme-validation/` 中记录验证证据、失败恢复结论、剩余风险和人工复核结果，便于另一位 AI 直接接手。',
    `- [ ] 4.2 确认 ${exportRootLabel} 中的 ${exportFormatSummary} 交付包完整可读，且目录、命名、版本与上游工件一致。`,
    '- [ ] 4.3 如果存在认证失败、路径冲突、人工编辑覆盖、审批阻断或导出异常，补充明确的 retry / recover / rollback 步骤后再关闭 change。',
    ''
  ].join('\n');
}

export function buildOpenSpecSpec(changeName: string) {
  return [
    '## ADDED Requirements',
    '',
    '### Requirement: The system SHALL deliver the confirmed planning package',
    'The system SHALL persist the confirmed planning package as developer-facing OpenSpec handoff artifacts.',
    '',
    '#### Scenario: Generating project handoff',
    '- **WHEN** the user triggers OpenSpec generation after plan confirmation',
    `- **THEN** the system SHALL generate project-local proposal, design, tasks, and spec files for \`${changeName}\``,
    ''
  ].join('\n');
}
