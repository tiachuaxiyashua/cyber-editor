import fs from 'node:fs';
import path from 'node:path';
import type {
  ArtifactSchemaAsset,
  PlatformAssets,
  PromptProfileAsset,
  RuntimeEvent,
  RuntimeRunHistoryRecord,
  RuntimeRunRecovery,
  RuntimeRun,
  RuntimeTemplateAsset
} from '../../shared/types';
import { assertSafeFilePathSegment } from '../../shared/resource-path-guard';
import { defaultFlowPathConfig, normalizeRuntimeTemplate } from '../../shared/runtime-template';
import { normalizeFlowAssetPaths } from './runtime-template-paths';
import { TemplateRegistryService } from './template-registry-service';
import type { AppLogService } from './app-log-service';

const RUNTIME_ROOT = '.project/runtime';

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(filePath: string, value: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, 'utf8');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function listJsonDir<T>(dirPath: string) {
  if (!fs.existsSync(dirPath)) return [] as T[];
  return fs.readdirSync(dirPath)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => readJsonSafe<T | null>(path.join(dirPath, entry), null))
    .filter((entry): entry is T => Boolean(entry));
}

function paths(rootPath: string) {
  const runtimeRoot = path.join(rootPath, RUNTIME_ROOT);
  return {
    runtimeRoot,
    flowsDir: path.join(runtimeRoot, 'flows'),
    subflowsDir: path.join(runtimeRoot, 'subflows'),
    rolesDir: path.join(runtimeRoot, 'roles'),
    promptProfilesDir: path.join(runtimeRoot, 'prompt-profiles'),
    artifactSchemasDir: path.join(runtimeRoot, 'artifact-schemas'),
    templatesDir: path.join(runtimeRoot, 'templates'),
    runsDir: path.join(runtimeRoot, 'runs'),
    runHistoryDir: path.join(runtimeRoot, 'run-history'),
    runRecoveryDir: path.join(runtimeRoot, 'run-recoveries'),
    exportsDir: path.join(runtimeRoot, 'exports'),
    eventsFile: path.join(runtimeRoot, 'events.jsonl')
  };
}

function runtimeAssetFilePath(dirPath: string, id: string, label: string) {
  return path.join(dirPath, `${assertSafeFilePathSegment(id, label)}.json`);
}

function writeRuntimeCollection(dirPath: string, items: Array<{ id: string }>) {
  ensureDir(dirPath);
  const keep = new Set(items.map((item) => `${assertSafeFilePathSegment(item.id, 'Runtime asset id')}.json`));
  for (const entry of fs.existsSync(dirPath) ? fs.readdirSync(dirPath) : []) {
    if (entry.endsWith('.json') && !keep.has(entry)) {
      fs.rmSync(path.join(dirPath, entry), { force: true });
    }
  }
  for (const item of items) {
    writeJson(runtimeAssetFilePath(dirPath, item.id, 'Runtime asset id'), item);
  }
}

function reconcileTemplateAsset(template: RuntimeTemplateAsset, platformAssets: PlatformAssets) {
  const flowIds = new Set(platformAssets.flows.map((item) => item.id));
  const roleIds = new Set(platformAssets.roles.map((item) => item.id));
  const fallbackFlowId = platformAssets.flows[0]?.id;
  const fallbackRoleId = platformAssets.roles[0]?.id ?? '';
  const normalized = normalizeRuntimeTemplate(template);

  return {
    ...normalized,
    defaultFlowId: normalized.defaultFlowId && flowIds.has(normalized.defaultFlowId)
      ? normalized.defaultFlowId
      : fallbackFlowId,
    stageRoleIds: {
      discover: roleIds.has(normalized.stageRoleIds.discover) ? normalized.stageRoleIds.discover : fallbackRoleId,
      clarify: roleIds.has(normalized.stageRoleIds.clarify) ? normalized.stageRoleIds.clarify : fallbackRoleId,
      plan: roleIds.has(normalized.stageRoleIds.plan) ? normalized.stageRoleIds.plan : fallbackRoleId,
      draft: roleIds.has(normalized.stageRoleIds.draft) ? normalized.stageRoleIds.draft : fallbackRoleId,
      review: roleIds.has(normalized.stageRoleIds.review) ? normalized.stageRoleIds.review : fallbackRoleId,
      finalize: roleIds.has(normalized.stageRoleIds.finalize) ? normalized.stageRoleIds.finalize : fallbackRoleId
    }
  };
}

export class RuntimeAssetService {
  private readonly malformedEventCounts = new Map<string, number>();

  constructor(
    private readonly templateRegistry = new TemplateRegistryService(),
    private readonly appLogService?: Pick<AppLogService, 'warn'>
  ) {}

  ensureProjectRuntime(rootPath: string, templateId: string, _templateName: string, platformAssets: PlatformAssets) {
    const runtimePaths = paths(rootPath);
    for (const dirPath of [
      runtimePaths.runtimeRoot,
      runtimePaths.flowsDir,
      runtimePaths.subflowsDir,
      runtimePaths.rolesDir,
      runtimePaths.promptProfilesDir,
      runtimePaths.artifactSchemasDir,
      runtimePaths.templatesDir,
      runtimePaths.runsDir,
      runtimePaths.runHistoryDir,
      runtimePaths.runRecoveryDir,
      runtimePaths.exportsDir
    ]) {
      ensureDir(dirPath);
    }

    const templatePackage = this.templateRegistry.getTemplatePackage(templateId);
    if (!templatePackage) {
      throw new Error(`未找到模板运行时资产：${templateId}`);
    }

    const normalizedFlowAssets = platformAssets.flows.map((flow) => normalizeFlowAssetPaths(rootPath, {
      ...flow,
      pathConfig: flow.pathConfig ?? defaultFlowPathConfig()
    }));
    const normalizedSubflowAssets = platformAssets.subflows.map((flow) => normalizeFlowAssetPaths(rootPath, {
      ...flow,
      pathConfig: flow.pathConfig ?? defaultFlowPathConfig()
    }));

    writeRuntimeCollection(runtimePaths.flowsDir, normalizedFlowAssets);
    writeRuntimeCollection(runtimePaths.subflowsDir, normalizedSubflowAssets);
    writeRuntimeCollection(runtimePaths.rolesDir, platformAssets.roles);

    const promptProfiles = clone(templatePackage.runtime.promptProfiles);
    const artifactSchemas = clone(templatePackage.runtime.artifactSchemas);
    const templateAsset = reconcileTemplateAsset(clone(templatePackage.runtime.template), {
      ...platformAssets,
      flows: normalizedFlowAssets,
      subflows: normalizedSubflowAssets
    });

    writeRuntimeCollection(runtimePaths.promptProfilesDir, promptProfiles);
    writeRuntimeCollection(runtimePaths.artifactSchemasDir, artifactSchemas);
    writeJson(runtimeAssetFilePath(runtimePaths.templatesDir, templateAsset.id, 'Runtime template id'), templateAsset);

    if (!fs.existsSync(runtimePaths.eventsFile)) {
      writeText(runtimePaths.eventsFile, '');
    }
  }

  loadPromptProfiles(rootPath: string) {
    return listJsonDir<PromptProfileAsset>(paths(rootPath).promptProfilesDir);
  }

  loadArtifactSchemas(rootPath: string) {
    return listJsonDir<ArtifactSchemaAsset>(paths(rootPath).artifactSchemasDir);
  }

  loadTemplate(rootPath: string, templateId: string) {
    return readJsonSafe<RuntimeTemplateAsset | null>(runtimeAssetFilePath(paths(rootPath).templatesDir, templateId, 'Runtime template id'), null);
  }

  saveTemplate(rootPath: string, template: RuntimeTemplateAsset, platformAssets: PlatformAssets) {
    const normalized = reconcileTemplateAsset(clone(template), platformAssets);
    writeJson(runtimeAssetFilePath(paths(rootPath).templatesDir, normalized.id, 'Runtime template id'), normalized);
    return normalized;
  }

  saveRun(rootPath: string, run: RuntimeRun) {
    writeJson(runtimeAssetFilePath(paths(rootPath).runsDir, run.id, 'Runtime run id'), run);
  }

  saveRunHistory(rootPath: string, history: RuntimeRunHistoryRecord) {
    writeJson(runtimeAssetFilePath(paths(rootPath).runHistoryDir, history.runId, 'Runtime run id'), history);
  }

  saveRunRecovery(rootPath: string, runId: string, recovery: RuntimeRunRecovery) {
    writeJson(runtimeAssetFilePath(paths(rootPath).runRecoveryDir, runId, 'Runtime run id'), {
      runId,
      ...recovery
    });
  }

  getRun(rootPath: string, runId: string) {
    return readJsonSafe<RuntimeRun | null>(runtimeAssetFilePath(paths(rootPath).runsDir, runId, 'Runtime run id'), null);
  }

  listRuns(rootPath: string, limit = 25) {
    return listJsonDir<RuntimeRun>(paths(rootPath).runsDir)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
  }

  appendEvent(rootPath: string, event: RuntimeEvent) {
    const filePath = paths(rootPath).eventsFile;
    ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, 'utf8');
  }

  listEvents(rootPath: string, limit = 200) {
    const filePath = paths(rootPath).eventsFile;
    if (!fs.existsSync(filePath)) return [] as RuntimeEvent[];
    let malformedLineCount = 0;
    const events = fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as RuntimeEvent;
        } catch {
          malformedLineCount += 1;
          return null;
        }
      })
      .filter((event): event is RuntimeEvent => Boolean(event));
    const previousMalformedLineCount = this.malformedEventCounts.get(filePath) ?? 0;
    if (malformedLineCount > 0 && malformedLineCount !== previousMalformedLineCount) {
      this.appLogService?.warn({
        source: 'runtime-asset-service',
        event: 'runtime.events.partial-read',
        message: 'Ignored malformed runtime events while reading events.jsonl.',
        metadata: {
          filePath,
          malformedLineCount,
          rootPath
        }
      });
    }
    if (malformedLineCount > 0) {
      this.malformedEventCounts.set(filePath, malformedLineCount);
    } else {
      this.malformedEventCounts.delete(filePath);
    }
    return events;
  }

  listEventsForRun(rootPath: string, runId: string, limit = 200) {
    return this.listEvents(rootPath, limit * 4)
      .filter((event) => event.runId === runId)
      .slice(-limit);
  }
}
