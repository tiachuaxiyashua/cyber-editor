import path from 'node:path';
import type {
  FlowValidationIssue,
  ProjectTemplatePackage,
  ProjectTemplateSaveInput,
  RuntimeTemplateAsset,
  RuntimeTemplateExportMappingEntry
} from '../../shared/types';
import { normalizeRuntimeTemplate, validateRuntimeTemplateContracts } from '../../shared/runtime-template';
import { ProjectService } from './project-service';
import { RuntimeAssetService } from './runtime-asset-service';

function slugifyTemplateId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export class TemplateAuthoringService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly runtimeAssets: RuntimeAssetService
  ) {}

  buildTemplatePackage(rootPath: string, input: ProjectTemplateSaveInput): ProjectTemplatePackage {
    const project = this.projectService.openProject(rootPath);
    const platformAssets = this.projectService.loadPlatformAssets(rootPath);
    const promptProfiles = this.runtimeAssets.loadPromptProfiles(rootPath);
    const artifactSchemas = this.runtimeAssets.loadArtifactSchemas(rootPath);
    const currentTemplate = this.getTemplate(rootPath);
    const discoverDocument = currentTemplate.stageDocuments.discover[0];
    const generatedId = slugifyTemplateId(input.id || input.name || project.manifest.name);
    if (!generatedId) {
      throw new Error('Template id cannot be empty.');
    }

    const templateAsset: RuntimeTemplateAsset = {
      ...currentTemplate,
      id: generatedId,
      name: input.name.trim(),
      description: input.description.trim()
    };

    return {
      definition: {
        id: generatedId,
        name: input.name.trim(),
        shortDescription: input.shortDescription.trim(),
        description: input.description.trim(),
        icon: input.icon.trim() || platformAssets.template?.icon || 'workflow',
        category: input.category,
        source: 'local',
        starterPrompt: input.starterPrompt?.trim() || `Please describe the goal you want to achieve with "${input.name.trim()}".`,
        requirementDocName: discoverDocument ? path.basename(discoverDocument.path) : 'discover.md'
      },
      platform: {
        flows: platformAssets.flows,
        subflows: platformAssets.subflows,
        roles: platformAssets.roles,
        taskTemplates: platformAssets.taskTemplates,
        agentProfiles: platformAssets.agentProfiles,
        connectors: platformAssets.connectors,
        tools: platformAssets.tools
      },
      runtime: {
        promptProfiles,
        artifactSchemas,
        template: templateAsset
      }
    };
  }

  saveRuntimeTemplate(rootPath: string, template: RuntimeTemplateAsset) {
    const platformAssets = this.projectService.loadPlatformAssets(rootPath);
    const issues = this.validateRuntimeTemplate(rootPath, template);
    const blocking = issues.filter((item) => item.severity === 'error');
    if (blocking.length) {
      throw new Error(blocking[0].message);
    }
    const saved = this.runtimeAssets.saveTemplate(rootPath, normalizeRuntimeTemplate(template), platformAssets);
    return {
      template: saved,
      issues
    };
  }

  validateRuntimeTemplate(rootPath: string, template: RuntimeTemplateAsset) {
    const artifactSchemas = this.runtimeAssets.loadArtifactSchemas(rootPath);
    const normalized = normalizeRuntimeTemplate(template);
    const issues = validateRuntimeTemplateContracts(
      normalized,
      new Set(this.runtimeAssets.loadPromptProfiles(rootPath).map((item) => item.id)),
      new Set(artifactSchemas.map((item) => item.id)),
      new Map(artifactSchemas.map((item) => [item.id, item]))
    );

    for (const [format, mapping] of Object.entries(normalized.exportMapping ?? {})) {
      this.validateExportMappingEntry(format, mapping, issues);
    }

    return issues;
  }

  private validateExportMappingEntry(
    format: string,
    mapping: RuntimeTemplateExportMappingEntry,
    issues: Array<{ severity: 'warning' | 'error'; message: string }>
  ) {
    if (!mapping.enabled) return;
    if (mapping.outputPathPattern?.includes('..')) {
      issues.push({ severity: 'error', message: `${format} export output path cannot contain ..` });
    }
    if (mapping.fileNamePattern?.includes('/') || mapping.fileNamePattern?.includes('\\')) {
      issues.push({ severity: 'error', message: `${format} export file name pattern cannot contain path separators` });
    }
    if (!mapping.transformProfile?.trim()) {
      issues.push({ severity: 'warning', message: `${format} export transform profile is empty; default copy behavior will be used` });
    }
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
