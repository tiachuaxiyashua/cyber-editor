import type {
  AppStage,
  ArtifactSchemaAsset,
  FlowPathConfig,
  RuntimeExportFormat,
  RuntimeExecutionBinding,
  RuntimeReviewExecutionProfiles,
  RuntimeTemplateAsset,
  RuntimeTemplateExportMapping,
  StageOutputContract
} from './types';

export const STAGE_ORDER: AppStage[] = ['discover', 'clarify', 'plan', 'draft', 'review', 'finalize'];

export function defaultFlowPathConfig(): FlowPathConfig {
  return {
    inputRoot: 'input',
    outputRoot: 'output',
    inheritProjectRoot: true
  };
}

export function buildDefaultStageContracts(template: RuntimeTemplateAsset): Record<AppStage, StageOutputContract> {
  return STAGE_ORDER.reduce<Record<AppStage, StageOutputContract>>((result, stage) => {
    result[stage] = {
      stageId: stage,
      requiredArtifactPaths: (template.stageDocuments[stage] ?? []).map((document) => document.path),
      validatorIds: Array.from(new Set((template.stageDocuments[stage] ?? []).map((document) => document.validatorId))),
      blockingPolicy: 'all_required',
      allowManualBypass: false
    };
    return result;
  }, {} as Record<AppStage, StageOutputContract>);
}

export function normalizeStageContracts(template: RuntimeTemplateAsset): Record<AppStage, StageOutputContract> {
  const defaults = buildDefaultStageContracts(template);
  const current = template.stageContracts ?? defaults;
  return STAGE_ORDER.reduce<Record<AppStage, StageOutputContract>>((result, stage) => {
    const contract = current[stage] ?? defaults[stage];
    result[stage] = {
      stageId: stage,
      requiredArtifactPaths: Array.from(new Set((contract.requiredArtifactPaths ?? []).filter(Boolean))),
      validatorIds: Array.from(new Set((contract.validatorIds ?? defaults[stage].validatorIds).filter(Boolean))),
      blockingPolicy: contract.blockingPolicy ?? defaults[stage].blockingPolicy,
      allowManualBypass: contract.allowManualBypass ?? defaults[stage].allowManualBypass
    };
    return result;
  }, {} as Record<AppStage, StageOutputContract>);
}

export function resolveRuntimeExportMapping(template: RuntimeTemplateAsset): RuntimeTemplateExportMapping {
  const allArtifactPaths = Array.from(
    new Set(
      Object.values(template.stageDocuments)
        .flat()
        .map((document) => document.path)
        .filter(Boolean)
    )
  );
  const defaults: RuntimeTemplateExportMapping = {
    markdown: {
      enabled: template.exportProfile.markdown,
      artifactPaths: allArtifactPaths,
      outputPathPattern: 'exports/markdown',
      fileNamePattern: 'delivery-package.md',
      transformProfile: 'markdown'
    },
    text: {
      enabled: template.exportProfile.text,
      artifactPaths: allArtifactPaths,
      outputPathPattern: 'exports/text',
      fileNamePattern: 'delivery-package.txt',
      transformProfile: 'text'
    },
    pdf: {
      enabled: template.exportProfile.pdf,
      artifactPaths: allArtifactPaths,
      outputPathPattern: 'exports/pdf',
      fileNamePattern: 'delivery-package.pdf',
      transformProfile: 'pdf'
    },
    openspec: {
      enabled: template.exportProfile.openspec,
      artifactPaths: allArtifactPaths,
      outputPathPattern: 'exports/openspec',
      fileNamePattern: 'openspec',
      transformProfile: 'openspec'
    },
    custom: {
      enabled: template.exportProfile.custom,
      artifactPaths: allArtifactPaths,
      outputPathPattern: 'exports/custom',
      fileNamePattern: 'artifact-{index}.md',
      transformProfile: 'copy'
    }
  };
  const current = template.exportMapping ?? defaults;
  return (Object.keys(defaults) as RuntimeExportFormat[]).reduce<RuntimeTemplateExportMapping>((result, format) => {
    const mapping = current[format] ?? defaults[format];
    result[format] = {
      enabled: mapping.enabled ?? defaults[format].enabled,
      artifactPaths: Array.from(new Set((mapping.artifactPaths ?? defaults[format].artifactPaths).filter(Boolean))),
      outputPathPattern: mapping.outputPathPattern ?? defaults[format].outputPathPattern,
      fileNamePattern: mapping.fileNamePattern ?? defaults[format].fileNamePattern,
      transformProfile: mapping.transformProfile ?? defaults[format].transformProfile
    };
    return result;
  }, {} as RuntimeTemplateExportMapping);
}

function normalizeExecutionBinding(
  binding?: RuntimeExecutionBinding | null
): RuntimeExecutionBinding | undefined {
  if (!binding?.roleId?.trim()) {
    return undefined;
  }
  return {
    roleId: binding.roleId.trim(),
    taskTemplateId: binding.taskTemplateId?.trim() || undefined,
    agentProfileId: binding.agentProfileId?.trim() || undefined
  };
}

function normalizeStageExecutionProfiles(template: RuntimeTemplateAsset) {
  return STAGE_ORDER.reduce<Partial<Record<AppStage, RuntimeExecutionBinding>>>((result, stage) => {
    const binding = normalizeExecutionBinding(template.stageExecutionProfiles?.[stage]);
    if (binding) {
      result[stage] = binding;
    }
    return result;
  }, {});
}

function normalizeReviewExecutionProfiles(executionProfiles?: RuntimeReviewExecutionProfiles) {
  const result: RuntimeReviewExecutionProfiles = {};
  for (const reviewer of ['blue', 'red', 'judge'] as const) {
    const binding = normalizeExecutionBinding(executionProfiles?.[reviewer]);
    if (binding) {
      result[reviewer] = binding;
    }
  }
  return result;
}

export function normalizeRuntimeTemplate(template: RuntimeTemplateAsset): RuntimeTemplateAsset {
  return {
    ...template,
    stageExecutionProfiles: normalizeStageExecutionProfiles(template),
    review: {
      ...template.review,
      executionProfiles: normalizeReviewExecutionProfiles(template.review.executionProfiles)
    },
    exportProfile: {
      markdown: template.exportProfile.markdown,
      text: template.exportProfile.text,
      pdf: template.exportProfile.pdf,
      openspec: template.exportProfile.openspec,
      custom: template.exportProfile.custom ?? false
    },
    stageContracts: normalizeStageContracts(template),
    exportMapping: resolveRuntimeExportMapping(template)
  };
}

export function validateRuntimeTemplateContracts(
  template: RuntimeTemplateAsset,
  promptProfileIds: Set<string>,
  validatorIds: Set<string>,
  schemaMap?: Map<string, ArtifactSchemaAsset>
) {
  const issues: Array<{ severity: 'warning' | 'error'; message: string }> = [];
  const normalized = normalizeRuntimeTemplate(template);
  const allArtifactPaths = Object.values(normalized.stageDocuments).flat().map((document) => document.path.trim());
  const duplicatePaths = allArtifactPaths.filter((value, index) => value && allArtifactPaths.indexOf(value) !== index);
  if (duplicatePaths.length) {
    issues.push({ severity: 'error', message: `工件路径重复：${Array.from(new Set(duplicatePaths)).join('、')}` });
  }

  for (const stage of STAGE_ORDER) {
    const documents = normalized.stageDocuments[stage] ?? [];
    if (!documents.length) {
      issues.push({ severity: 'warning', message: `${stage} 阶段当前没有声明工件。` });
    }
    for (const document of documents) {
      if (!document.path.trim()) issues.push({ severity: 'error', message: `${stage} 阶段存在空工件路径。` });
      if (!document.title.trim()) issues.push({ severity: 'error', message: `${document.path || stage} 缺少标题。` });
      if (!document.purpose.trim()) issues.push({ severity: 'error', message: `${document.path || stage} 缺少用途说明。` });
      if (!promptProfileIds.has(document.promptProfileId)) {
        issues.push({ severity: 'error', message: `${document.path || stage} 引用了不存在的 Prompt Profile：${document.promptProfileId}` });
      }
      if (!validatorIds.has(document.validatorId)) {
        issues.push({ severity: 'error', message: `${document.path || stage} 引用了不存在的校验器：${document.validatorId}` });
      }
    }
    const contract = normalized.stageContracts?.[stage];
    if (!contract) {
      issues.push({ severity: 'error', message: `${stage} 阶段缺少输出契约。` });
      continue;
    }
    for (const artifactPath of contract.requiredArtifactPaths) {
      if (!allArtifactPaths.includes(artifactPath)) {
        issues.push({ severity: 'error', message: `${stage} 阶段契约引用了不存在的工件：${artifactPath}` });
      }
    }
    for (const validatorId of contract.validatorIds) {
      if (!validatorIds.has(validatorId)) {
        issues.push({ severity: 'error', message: `${stage} 阶段契约引用了不存在的校验器：${validatorId}` });
      }
      if (schemaMap && validatorIds.has(validatorId) && !schemaMap.has(validatorId)) {
        issues.push({ severity: 'warning', message: `${stage} 阶段契约未能解析校验器元数据：${validatorId}` });
      }
    }
  }

  const exportMapping = normalized.exportMapping ?? resolveRuntimeExportMapping(normalized);
  for (const [format, mapping] of Object.entries(exportMapping)) {
    if (!mapping.enabled) continue;
    if (!mapping.artifactPaths.length) {
      issues.push({ severity: 'warning', message: `${format} 导出当前没有映射任何工件。` });
    }
    if (!mapping.outputPathPattern?.trim()) {
      issues.push({ severity: 'error', message: `${format} 导出缺少输出目录模式。` });
    }
    if (!mapping.fileNamePattern?.trim()) {
      issues.push({ severity: 'error', message: `${format} 导出缺少文件名模式。` });
    }
    for (const artifactPath of mapping.artifactPaths) {
      if (!allArtifactPaths.includes(artifactPath)) {
        issues.push({ severity: 'error', message: `${format} 导出映射引用了不存在的工件：${artifactPath}` });
      }
    }
  }

  return issues;
}
