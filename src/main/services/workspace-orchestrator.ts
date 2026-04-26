import type { AppStage, ConsistencyReport, ReviewIssueState } from '../../shared/types';
import { runConsistencyCheck } from '../../shared/consistency';
import { normalizeRuntimeTemplate, STAGE_ORDER } from '../../shared/runtime-template';
import { ProjectService } from './project-service';
import { RuntimeAssetService } from './runtime-asset-service';
import { SkillRegistryService } from './skill-registry-service';
import { buildConsistencyRequiredPaths } from './runtime-template-contracts';

function nextStage(stage: AppStage): AppStage {
  const index = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[Math.min(index + 1, STAGE_ORDER.length - 1)];
}

export class WorkspaceOrchestrator {
  constructor(
    private readonly projectService: ProjectService,
    private readonly runtimeAssets: RuntimeAssetService,
    private readonly skillRegistry: SkillRegistryService
  ) {}

  confirmStage(rootPath: string, stage: AppStage) {
    const workflow = this.projectService.loadWorkflow(rootPath);
    const confirmedStages = Array.from(new Set([...workflow.confirmedStages, stage]));
    const next = nextStage(stage);
    const updated = {
      ...workflow,
      stage: next,
      confirmedStages
    };
    this.projectService.saveWorkflow(rootPath, updated);
    return updated;
  }

  revisitStage(rootPath: string, stage: AppStage) {
    const workflow = this.projectService.loadWorkflow(rootPath);
    const confirmedStages = workflow.confirmedStages.filter((item) => STAGE_ORDER.indexOf(item) < STAGE_ORDER.indexOf(stage));
    const updated = {
      ...workflow,
      stage,
      confirmedStages
    };
    this.projectService.saveWorkflow(rootPath, updated);
    return updated;
  }

  updateReviewIssueState(rootPath: string, roundId: string, issueId: string, state: ReviewIssueState) {
    const updated = this.projectService.loadReviewRounds(rootPath).map((round) =>
      round.id === roundId
        ? {
            ...round,
            issues: round.issues.map((issue) => (issue.id === issueId ? { ...issue, state } : issue))
          }
        : round
    );
    this.projectService.saveReviewRounds(rootPath, updated);
    return updated;
  }

  runConsistency(rootPath: string): ConsistencyReport {
    const project = this.projectService.openProject(rootPath);
    const workflow = this.projectService.loadWorkflow(rootPath);
    const template = this.getTemplate(rootPath);
    const requiredPaths = buildConsistencyRequiredPaths(rootPath, template, workflow);
    const findings = runConsistencyCheck({
      project,
      requiredPaths,
      projectSkillIds: this.projectService.loadProjectSkillIds(rootPath),
      sessionSkillIds: this.projectService.loadSessionSkillIds(rootPath),
      installedSkillIds: this.skillRegistry.listInstalled().map((item) => item.id)
    });
    const report = {
      createdAt: new Date().toISOString(),
      findings
    };
    this.projectService.saveConsistencyReport(rootPath, report);
    return report;
  }

  private getTemplate(rootPath: string) {
    const project = this.projectService.openProject(rootPath);
    const templateId = project.manifest.templateId ?? this.projectService.loadPlatformAssets(rootPath).template?.id;
    if (!templateId) {
      throw new Error('Current project is missing a template id.');
    }
    const template = this.runtimeAssets.loadTemplate(rootPath, templateId);
    if (!template) {
      throw new Error(`Runtime template asset not found: ${templateId}`);
    }
    return normalizeRuntimeTemplate(template);
  }
}
