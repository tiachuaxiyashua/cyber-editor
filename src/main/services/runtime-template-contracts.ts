import path from 'node:path';
import type { AppStage, RuntimeTemplateAsset, RuntimeTemplateStageDocument, WorkflowState } from '../../shared/types';
import { resolveRuntimeExportMapping, STAGE_ORDER } from '../../shared/runtime-template';

export type RuntimeTemplateStageDocumentRef = RuntimeTemplateStageDocument & {
  stage: AppStage;
};

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeStageSet(stages: AppStage[]) {
  return Array.from(new Set(stages.filter((stage): stage is AppStage => STAGE_ORDER.includes(stage))));
}

export function stagesForCurrentWorkflow(workflow: Pick<WorkflowState, 'stage' | 'confirmedStages'>): AppStage[] {
  return normalizeStageSet([...workflow.confirmedStages, workflow.stage as AppStage]);
}

export function collectStageDocumentRefs(
  template: RuntimeTemplateAsset,
  stages: AppStage[]
): RuntimeTemplateStageDocumentRef[] {
  const stageSet = new Set(stages);
  return STAGE_ORDER.flatMap((stage) =>
    stageSet.has(stage)
      ? (template.stageDocuments[stage] ?? []).map((document) => ({ ...document, stage }))
      : []
  );
}

export function buildConsistencyRequiredPaths(
  rootPath: string,
  template: RuntimeTemplateAsset,
  workflow: Pick<WorkflowState, 'stage' | 'confirmedStages'>
) {
  const stages = stagesForCurrentWorkflow(workflow);
  const requiredArtifactPaths = uniqueStrings(
    stages.flatMap((stage) => {
      const contractPaths = template.stageContracts?.[stage]?.requiredArtifactPaths ?? [];
      if (contractPaths.length) {
        return contractPaths;
      }
      return (template.stageDocuments[stage] ?? []).map((document) => document.path);
    })
  );

  const requiredDirectories = uniqueStrings(
    requiredArtifactPaths
      .map((artifactPath) => path.dirname(artifactPath))
      .filter((directory) => directory !== '.' && directory !== '')
  );

  return uniqueStrings([
    ...requiredDirectories.map((directory) => path.join(rootPath, directory)),
    ...requiredArtifactPaths.map((artifactPath) => path.join(rootPath, artifactPath))
  ]);
}

export function collectOpenSpecSourceDocuments(
  template: RuntimeTemplateAsset,
  workflow: Pick<WorkflowState, 'confirmedStages'>
) {
  const confirmedStages = normalizeStageSet(workflow.confirmedStages);
  const confirmedDocs = collectStageDocumentRefs(template, confirmedStages);
  const openspecMapping = resolveRuntimeExportMapping(template).openspec;
  if (!openspecMapping.enabled) {
    return [];
  }
  if (!openspecMapping.artifactPaths.length) {
    return confirmedDocs;
  }
  const allowedPaths = new Set(openspecMapping.artifactPaths);
  return confirmedDocs.filter((document) => allowedPaths.has(document.path));
}

export function resolveOpenSpecWorkspaceRoot(template: RuntimeTemplateAsset) {
  const mapping = resolveRuntimeExportMapping(template).openspec;
  const normalizedPattern = (mapping.outputPathPattern ?? 'exports/openspec').replace(/\\/g, '/').replace(/\/+$/, '');
  const parent = normalizedPattern.includes('/') ? normalizedPattern.slice(0, normalizedPattern.lastIndexOf('/')) : '';
  if (!parent || parent.includes('{')) {
    return 'exports';
  }
  return parent;
}
