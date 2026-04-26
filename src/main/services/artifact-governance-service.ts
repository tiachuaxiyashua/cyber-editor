import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AppStage,
  ArtifactQualityTier,
  ArtifactGovernanceEvidence,
  ArtifactInvalidationCause,
  ArtifactInvalidationRecord,
  ArtifactInvalidationSeverity,
  ArtifactRevisionRecord,
  ArtifactRevisionWriteMode,
  ArtifactSchemaAsset,
  DocumentChangeSource,
  PlatformFlowAsset,
  PlatformFlowNode,
  RuntimeExportFormat,
  RuntimeTemplateAsset
} from '../../shared/types';
import { validateArtifact } from '../../shared/artifact-validators';
import { normalizeRuntimeTemplate } from '../../shared/runtime-template';
import { EvidenceStoreService } from './evidence-store-service';

type ArtifactCatalogItem = {
  path: string;
  title: string;
  purpose: string;
  stage: AppStage;
  validatorId: string;
  qualityTier?: ArtifactQualityTier;
  minimumQualityScore?: number;
  requiredForExport: boolean;
  blockedExportFormats: RuntimeExportFormat[];
};

type NodeArtifactRef = {
  flowId: string;
  flowKind: PlatformFlowAsset['kind'];
  nodeId: string;
  label: string;
  inputs: string[];
  outputs: string[];
  signature: string;
};

type DependencyModel = {
  template: RuntimeTemplateAsset | null;
  catalog: Map<string, ArtifactCatalogItem>;
  schemas: Map<string, ArtifactSchemaAsset>;
  producers: Map<string, NodeArtifactRef[]>;
  consumers: Map<string, NodeArtifactRef[]>;
};

type RecomputeResult = {
  revisions: ArtifactRevisionRecord[];
  invalidations: ArtifactInvalidationRecord[];
};

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

function listJsonDir<T>(dirPath: string) {
  if (!fs.existsSync(dirPath)) return [] as T[];
  return fs.readdirSync(dirPath)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => readJsonSafe<T | null>(path.join(dirPath, entry), null))
    .filter((entry): entry is T => Boolean(entry));
}

function syncJsonCollection<T extends { id: string }>(dirPath: string, items: T[]) {
  ensureDir(dirPath);
  const keep = new Set(items.map((item) => `${item.id}.json`));
  for (const entry of fs.existsSync(dirPath) ? fs.readdirSync(dirPath) : []) {
    if (entry.endsWith('.json') && !keep.has(entry)) {
      fs.rmSync(path.join(dirPath, entry), { force: true });
    }
  }
  for (const item of items) {
    writeJson(path.join(dirPath, `${item.id}.json`), item);
  }
}

function governancePaths(rootPath: string) {
  const root = path.join(rootPath, '.project', 'runtime', 'artifact-governance');
  return {
    root,
    revisionsDir: path.join(root, 'revisions'),
    invalidationsDir: path.join(root, 'invalidations')
  };
}

function runtimePaths(rootPath: string) {
  return {
    templatesDir: path.join(rootPath, '.project', 'runtime', 'templates'),
    schemasDir: path.join(rootPath, '.project', 'runtime', 'artifact-schemas'),
    flowsDir: path.join(rootPath, '.project', 'platform', 'flows'),
    subflowsDir: path.join(rootPath, '.project', 'platform', 'subflows')
  };
}

function normalizeArtifactPath(rootPath: string, value: string) {
  const resolved = path.isAbsolute(value) ? value : path.resolve(rootPath, value);
  return path.relative(rootPath, resolved).replace(/\\/g, '/');
}

function contentHash(contents: string) {
  return createHash('sha256').update(contents).digest('hex');
}

function contentSummary(contents: string) {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' / ')
    .slice(0, 240);
}

function nodeSignature(node: PlatformFlowNode) {
  return JSON.stringify({
    type: node.type,
    roleId: node.data.roleId ?? '',
    skillIds: [...(node.data.skillIds ?? [])].sort(),
    toolId: node.data.toolId ?? '',
    toolIds: [...(node.data.toolIds ?? [])].sort(),
    connectorId: node.data.connectorId ?? '',
    subflowId: node.data.subflowId ?? '',
    artifactPath: node.data.artifactPath ?? '',
    inputArtifactPaths: [...(node.data.inputArtifactPaths ?? [])].sort(),
    outputArtifactPaths: [...(node.data.outputArtifactPaths ?? [])].sort(),
    inputMessageKeys: [...(node.data.inputMessageKeys ?? [])].sort(),
    outputMessageKeys: [...(node.data.outputMessageKeys ?? [])].sort(),
    outputSignalKeys: [...(node.data.outputSignalKeys ?? [])].sort(),
    inputRequirement: node.data.inputRequirement ?? '',
    outputRequirement: node.data.outputRequirement ?? '',
    outputFormat: node.data.outputFormat ?? 'markdown',
    conditionExpression: node.data.conditionExpression ?? '',
    trueTargetId: node.data.trueTargetId ?? '',
    falseTargetId: node.data.falseTargetId ?? '',
    loopExpression: node.data.loopExpression ?? '',
    exitExpression: node.data.exitExpression ?? '',
    maxIterations: node.data.maxIterations ?? 0,
    loopTimeoutMs: node.data.loopTimeoutMs ?? 0,
    loopFailurePolicy: node.data.loopFailurePolicy ?? 'guard_fail',
    loopBackTargetId: node.data.loopBackTargetId ?? '',
    exitTargetId: node.data.exitTargetId ?? '',
    approvalPrompt: node.data.approvalPrompt ?? '',
    approvalRollbackNodeId: node.data.approvalRollbackNodeId ?? '',
    parallelMode: node.data.parallelMode ?? '',
    parallelFailureStrategy: node.data.parallelFailureStrategy ?? '',
    parallelCancellationPolicy: node.data.parallelCancellationPolicy ?? 'wait_all',
    mergeStrategy: node.data.mergeStrategy ?? '',
    sharedBoardArtifactPath: node.data.sharedBoardArtifactPath ?? '',
    subflowInputBindings: [...(node.data.subflowInputBindings ?? [])].sort(),
    subflowOutputBindings: [...(node.data.subflowOutputBindings ?? [])].sort()
  });
}

function invalidationKey(input: { artifactPath: string; cause: ArtifactInvalidationCause; sourceArtifactPath?: string; currentRevisionId?: string }) {
  return [
    input.artifactPath,
    input.cause,
    input.sourceArtifactPath ?? '',
    input.currentRevisionId ?? ''
  ].join('::');
}

export class ArtifactGovernanceService {
  constructor(private readonly evidenceStore = new EvidenceStoreService()) {}

  ensureProjectState(rootPath: string) {
    const paths = governancePaths(rootPath);
    ensureDir(paths.root);
    ensureDir(paths.revisionsDir);
    ensureDir(paths.invalidationsDir);
  }

  listArtifactRevisions(rootPath: string, limit = 100) {
    this.ensureProjectState(rootPath);
    return listJsonDir<ArtifactRevisionRecord>(governancePaths(rootPath).revisionsDir)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  listArtifactInvalidations(rootPath: string, options?: { activeOnly?: boolean; artifactPath?: string; limit?: number }) {
    this.ensureProjectState(rootPath);
    const artifactPath = options?.artifactPath ? normalizeArtifactPath(rootPath, options.artifactPath) : undefined;
    const items = listJsonDir<ArtifactInvalidationRecord>(governancePaths(rootPath).invalidationsDir)
      .filter((item) => (options?.activeOnly ? item.status === 'active' : true))
      .filter((item) => (artifactPath ? item.artifactPath === artifactPath : true))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return typeof options?.limit === 'number' ? items.slice(0, options.limit) : items;
  }

  recompute(rootPath: string): RecomputeResult {
    this.ensureProjectState(rootPath);
    const model = this.loadDependencyModel(rootPath);
    const revisions = this.listArtifactRevisions(rootPath, 10_000);
    const latestRevisionMap = new Map<string, ArtifactRevisionRecord>();
    for (const revision of [...revisions].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
      latestRevisionMap.set(revision.artifactPath, revision);
    }

    const predicted = new Map<string, Omit<ArtifactInvalidationRecord, 'id' | 'createdAt' | 'updatedAt' | 'status'>>();
    const latestActiveByArtifact = new Map<string, ArtifactInvalidationRecord>();
    let changed = true;
    let guard = 0;
    const catalogItems = Array.from(model.catalog.values());

    while (changed && guard < Math.max(4, catalogItems.length * 2)) {
      changed = false;
      guard += 1;
      latestActiveByArtifact.clear();
      for (const item of predicted.values()) {
        latestActiveByArtifact.set(item.artifactPath, {
          ...item,
          id: '',
          createdAt: '',
          updatedAt: '',
          status: 'active'
        });
      }

      for (const item of catalogItems) {
        const currentRevision = latestRevisionMap.get(item.path);
        const currentContractSignature = this.buildArtifactContractSignature(item.path, model);
        const producerRefs = model.producers.get(item.path) ?? [];
        const inputPaths = Array.from(new Set(producerRefs.flatMap((ref) => ref.inputs)));
        const downstreamArtifactPaths = this.collectDownstreamArtifacts(item.path, model);

        let cause: ArtifactInvalidationCause | null = null;
        let sourceArtifactPath: string | undefined;
        let sourceRevisionId: string | undefined;
        let message = '';

        if (currentRevision && currentRevision.contractSignature !== currentContractSignature) {
          cause = 'contract-changed';
          message = `${item.title} 的契约或节点绑定已变更，当前结果需要重新确认。`;
        }

        if (!cause) {
          const upstreamInvalidated = inputPaths
            .map((inputPath) => latestActiveByArtifact.get(inputPath))
            .find((record) => Boolean(record));
          if (upstreamInvalidated) {
            cause = 'upstream-invalidated';
            sourceArtifactPath = upstreamInvalidated.sourceArtifactPath ?? upstreamInvalidated.artifactPath;
            sourceRevisionId = upstreamInvalidated.sourceRevisionId ?? upstreamInvalidated.currentRevisionId;
            message = `${item.title} 依赖的上游工件仍处于失效状态，需要先修复上游或重跑当前节点。`;
          }
        }

        if (!cause) {
          const newerUpstream = inputPaths
            .map((inputPath) => latestRevisionMap.get(inputPath))
            .filter((revision): revision is ArtifactRevisionRecord => Boolean(revision))
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
          if (newerUpstream && (!currentRevision || newerUpstream.createdAt > currentRevision.createdAt)) {
            cause = 'upstream-revision';
            sourceArtifactPath = newerUpstream.artifactPath;
            sourceRevisionId = newerUpstream.id;
            message = `${item.title} 的上游工件 ${sourceArtifactPath} 已更新，建议重跑下游结果。`;
          }
        }

        const nextKey = cause
          ? invalidationKey({
              artifactPath: item.path,
              cause,
              sourceArtifactPath,
              currentRevisionId: currentRevision?.id
            })
          : null;
        const prevKey = Array.from(predicted.keys()).find((key) => predicted.get(key)?.artifactPath === item.path);

        if (!cause) {
          if (prevKey) {
            predicted.delete(prevKey);
            changed = true;
          }
          continue;
        }

        const producerNodeIds = Array.from(new Set(producerRefs.map((ref) => ref.nodeId)));
        const flowIds = Array.from(new Set(producerRefs.map((ref) => ref.flowId)));
        const severity: ArtifactInvalidationSeverity = cause === 'contract-changed' || item.requiredForExport ? 'hard' : 'soft';
        const nextValue = {
          artifactPath: item.path,
          title: item.title,
          purpose: item.purpose,
          stage: item.stage,
          cause,
          severity,
          sourceArtifactPath,
          sourceRevisionId,
          currentRevisionId: currentRevision?.id,
          flowIds,
          nodeIds: Array.from(new Set([...producerNodeIds, ...(model.consumers.get(item.path) ?? []).map((ref) => ref.nodeId)])),
          downstreamArtifactPaths,
          recommendedNodeIds: producerNodeIds,
          requiredForExport: item.requiredForExport,
          blockedExportFormats: item.blockedExportFormats,
          message
        } satisfies Omit<ArtifactInvalidationRecord, 'id' | 'createdAt' | 'updatedAt' | 'status'>;

        if (!nextKey) {
          continue;
        }
        const current = predicted.get(nextKey);
        if (!current || JSON.stringify(current) !== JSON.stringify(nextValue) || prevKey !== nextKey) {
          if (prevKey && prevKey !== nextKey) {
            predicted.delete(prevKey);
          }
          predicted.set(nextKey, nextValue);
          changed = true;
        }
      }
    }

    const existing = this.listArtifactInvalidations(rootPath, { limit: 10_000 });
    const existingActiveByKey = new Map(
      existing
        .filter((item) => item.status === 'active')
        .map((item) => [invalidationKey(item), item] as const)
    );
    const nextRecords: ArtifactInvalidationRecord[] = [];
    const now = new Date().toISOString();

    for (const [key, value] of predicted.entries()) {
      const previous = existingActiveByKey.get(key);
      const nextRecord: ArtifactInvalidationRecord = previous
        ? {
            ...previous,
            ...value,
            updatedAt: now,
            status: 'active'
          }
        : {
            ...value,
            id: randomUUID(),
            createdAt: now,
            updatedAt: now,
            status: 'active'
          };
      nextRecords.push(nextRecord);
      this.evidenceStore.persistArtifactGovernance(rootPath, {
        id: `invalidation-${nextRecord.id}`,
        createdAt: nextRecord.updatedAt,
        kind: 'invalidation',
        status: nextRecord.status === 'active' ? 'invalidated' : 'resolved',
        artifactPath: nextRecord.artifactPath,
        sourceArtifactPath: nextRecord.sourceArtifactPath,
        invalidationId: nextRecord.id,
        flowId: nextRecord.flowIds[0],
        nodeIds: nextRecord.recommendedNodeIds,
        message: nextRecord.message
      });
    }

    for (const item of existing.filter((record) => record.status === 'resolved')) {
      if (!nextRecords.some((record) => record.id === item.id)) {
        nextRecords.push(item);
      }
    }

    for (const active of existing.filter((record) => record.status === 'active')) {
      const key = invalidationKey(active);
      if (predicted.has(key)) continue;
      nextRecords.push({
        ...active,
        status: 'resolved',
        updatedAt: now,
        resolvedAt: now,
        resolvedByRevisionId: latestRevisionMap.get(active.artifactPath)?.id
      });
      this.evidenceStore.persistArtifactGovernance(rootPath, {
        id: `invalidation-resolved-${active.id}`,
        createdAt: now,
        kind: 'invalidation',
        status: 'resolved',
        artifactPath: active.artifactPath,
        sourceArtifactPath: active.sourceArtifactPath,
        invalidationId: active.id,
        flowId: active.flowIds[0],
        nodeIds: active.recommendedNodeIds,
        message: `${active.title ?? active.artifactPath} 的失效状态已解除。`
      });
    }

    syncJsonCollection(governancePaths(rootPath).invalidationsDir, nextRecords);
    return {
      revisions,
      invalidations: nextRecords
    };
  }

  recordTrackedArtifactWrite(input: {
    rootPath: string;
    filePath: string;
    previousContents: string;
    nextContents: string;
    source: DocumentChangeSource;
    changeRecordId?: string;
    runId?: string;
    flowId?: string;
    nodeId?: string;
    stage?: AppStage;
    writeMode?: ArtifactRevisionWriteMode;
  }) {
    this.ensureProjectState(input.rootPath);
    const artifactPath = normalizeArtifactPath(input.rootPath, input.filePath);
    const model = this.loadDependencyModel(input.rootPath);
    const catalog = model.catalog.get(artifactPath);
    if (!catalog) {
      return null;
    }

    const schema = model.schemas.get(catalog.validatorId);
    const validation = schema
      ? validateArtifact(input.nextContents, schema, {
          qualityTier: catalog.qualityTier ?? schema.qualityTier,
          minimumQualityScore: catalog.minimumQualityScore ?? schema.minimumQualityScore
        })
      : {
          ok: true as const,
          structuralOk: true as const,
          message: undefined,
          qualityTier: 'assistive' as const,
          qualityVerdict: 'accepted' as const,
          qualityScore: 75,
          qualityReasons: []
        };
    const latestRevision = this.listArtifactRevisions(input.rootPath, 10_000)
      .find((record) => record.artifactPath === artifactPath);
    const producerRefs = model.producers.get(artifactPath) ?? [];
    const nodeIds = Array.from(new Set([
      ...(input.nodeId ? [input.nodeId] : []),
      ...producerRefs.map((ref) => ref.nodeId)
    ]));
    const contractSignature = this.buildArtifactContractSignature(artifactPath, model);
    const revision: ArtifactRevisionRecord = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      artifactPath,
      absolutePath: path.resolve(input.filePath),
      title: catalog.title,
      purpose: catalog.purpose,
      stage: input.stage ?? catalog.stage,
      source: input.source,
      previousRevisionId: latestRevision?.id,
      changeRecordId: input.changeRecordId,
      runId: input.runId,
      flowId: input.flowId ?? producerRefs[0]?.flowId,
      nodeIds,
      writeMode: input.writeMode ?? 'replace',
      contentHash: contentHash(input.nextContents),
      exists: fs.existsSync(path.resolve(input.filePath)),
      valid: Boolean(validation.ok && input.nextContents.trim()),
      schemaId: catalog.validatorId,
      validationMessage: validation.ok ? undefined : validation.message,
      qualityTier: validation.qualityTier,
      qualityVerdict: validation.qualityVerdict,
      qualityScore: validation.qualityScore,
      qualityReasons: validation.qualityReasons,
      contractSignature,
      contentSummary: contentSummary(input.nextContents)
    };

    writeJson(path.join(governancePaths(input.rootPath).revisionsDir, `${revision.id}.json`), revision);
    this.evidenceStore.persistArtifactGovernance(input.rootPath, {
      id: `revision-${revision.id}`,
      createdAt: revision.createdAt,
      kind: 'revision',
      status: 'written',
      artifactPath: revision.artifactPath,
      revisionId: revision.id,
      runId: revision.runId,
      flowId: revision.flowId,
      nodeIds: revision.nodeIds,
      message: `已记录工件修订：${revision.title ?? revision.artifactPath}`
    });
    const recomputed = this.recompute(input.rootPath);
    return {
      revision,
      invalidations: recomputed.invalidations.filter((item) => item.status === 'active')
    };
  }

  validateNodeContracts(rootPath: string, flow: PlatformFlowAsset, node: PlatformFlowNode) {
    const model = this.loadDependencyModel(rootPath);
    const activeInvalidations = new Map(
      this.recompute(rootPath).invalidations
        .filter((item) => item.status === 'active')
        .map((item) => [item.artifactPath, item] as const)
    );
    const errors: string[] = [];

    for (const artifactPath of node.data.inputArtifactPaths ?? []) {
      const normalized = normalizeArtifactPath(rootPath, artifactPath);
      const catalog = model.catalog.get(normalized);
      if (!catalog) {
        errors.push(`节点 ${node.data.label} 引用了未声明的输入工件：${artifactPath}`);
        continue;
      }
      const absolutePath = path.join(rootPath, normalized);
      if (!fs.existsSync(absolutePath)) {
        errors.push(`节点 ${node.data.label} 的输入工件不存在：${artifactPath}`);
        continue;
      }
      const schema = model.schemas.get(catalog.validatorId);
      if (schema) {
        const validation = validateArtifact(fs.readFileSync(absolutePath, 'utf8'), schema, {
          qualityTier: catalog.qualityTier ?? schema.qualityTier,
          minimumQualityScore: catalog.minimumQualityScore ?? schema.minimumQualityScore
        });
        if (!validation.ok) {
          errors.push(`节点 ${node.data.label} 的输入工件校验失败：${artifactPath} (${validation.message})`);
        }
      }
      const invalidation = activeInvalidations.get(normalized);
      if (invalidation) {
        errors.push(`节点 ${node.data.label} 的输入工件已失效：${artifactPath} (${invalidation.message})`);
      }
    }

    for (const artifactPath of node.data.outputArtifactPaths ?? []) {
      const normalized = normalizeArtifactPath(rootPath, artifactPath);
      if (!model.catalog.has(normalized)) {
        errors.push(`节点 ${node.data.label} 引用了未声明的输出工件：${artifactPath}`);
      }
    }

    return {
      ok: errors.length === 0,
      errors
    };
  }

  validateNodeOutputs(rootPath: string, node: PlatformFlowNode, content: string) {
    const model = this.loadDependencyModel(rootPath);
    const errors: string[] = [];
    for (const artifactPath of node.data.outputArtifactPaths ?? []) {
      const normalized = normalizeArtifactPath(rootPath, artifactPath);
      const catalog = model.catalog.get(normalized);
      if (!catalog) {
        errors.push(`节点 ${node.data.label} 引用了未声明的输出工件：${artifactPath}`);
        continue;
      }
      const schema = model.schemas.get(catalog.validatorId);
      if (!schema) continue;
      const validation = validateArtifact(content, schema, {
        qualityTier: catalog.qualityTier ?? schema.qualityTier,
        minimumQualityScore: catalog.minimumQualityScore ?? schema.minimumQualityScore
      });
      if (!validation.ok) {
        errors.push(`节点 ${node.data.label} 的输出工件校验失败：${artifactPath} (${validation.message})`);
      }
    }
    return {
      ok: errors.length === 0,
      errors
    };
  }

  listExportBlockers(rootPath: string) {
    return this.recompute(rootPath).invalidations.filter((item) => item.status === 'active' && item.requiredForExport);
  }

  persistExportBlock(rootPath: string, blockers: ArtifactInvalidationRecord[]) {
    const now = new Date().toISOString();
    for (const blocker of blockers) {
      this.evidenceStore.persistArtifactGovernance(rootPath, {
        id: `export-block-${blocker.id}-${now.replace(/[:.]/g, '-')}`,
        createdAt: now,
        kind: 'export-block',
        status: 'blocked',
        artifactPath: blocker.artifactPath,
        sourceArtifactPath: blocker.sourceArtifactPath,
        invalidationId: blocker.id,
        flowId: blocker.flowIds[0],
        nodeIds: blocker.recommendedNodeIds,
        message: blocker.message
      });
    }
  }

  private buildArtifactContractSignature(artifactPath: string, model: DependencyModel) {
    const item = model.catalog.get(artifactPath);
    const producers = (model.producers.get(artifactPath) ?? [])
      .map((producer) => ({
        flowId: producer.flowId,
        flowKind: producer.flowKind,
        nodeId: producer.nodeId,
        signature: producer.signature
      }))
      .sort((left, right) => `${left.flowKind}:${left.flowId}:${left.nodeId}`.localeCompare(`${right.flowKind}:${right.flowId}:${right.nodeId}`));
    return JSON.stringify({
      artifactPath,
      stage: item?.stage ?? '',
      validatorId: item?.validatorId ?? '',
      qualityTier: item?.qualityTier ?? 'assistive',
      minimumQualityScore: item?.minimumQualityScore ?? null,
      requiredForExport: item?.requiredForExport ?? false,
      blockedExportFormats: [...(item?.blockedExportFormats ?? [])].sort(),
      producers
    });
  }

  private collectDownstreamArtifacts(startArtifactPath: string, model: DependencyModel) {
    const visited = new Set<string>();
    const queue = [startArtifactPath];
    while (queue.length) {
      const currentPath = queue.shift()!;
      for (const consumer of model.consumers.get(currentPath) ?? []) {
        for (const outputPath of consumer.outputs) {
          if (outputPath === startArtifactPath || visited.has(outputPath)) continue;
          visited.add(outputPath);
          queue.push(outputPath);
        }
      }
    }
    return Array.from(visited);
  }

  private loadDependencyModel(rootPath: string): DependencyModel {
    const runtime = runtimePaths(rootPath);
    const template = this.loadRuntimeTemplate(runtime.templatesDir);
    const normalizedTemplate = template ? normalizeRuntimeTemplate(template) : null;
    const schemas = new Map(
      listJsonDir<ArtifactSchemaAsset>(runtime.schemasDir).map((schema) => [schema.id, schema] as const)
    );
    const producers = new Map<string, NodeArtifactRef[]>();
    const consumers = new Map<string, NodeArtifactRef[]>();
    const catalog = new Map<string, ArtifactCatalogItem>();

    if (normalizedTemplate) {
      const exportFormatsByArtifact = new Map<string, RuntimeExportFormat[]>();
      for (const [format, mapping] of Object.entries(normalizedTemplate.exportMapping ?? {})) {
        if (!mapping?.enabled) continue;
        for (const artifactPath of mapping.artifactPaths) {
          const list = exportFormatsByArtifact.get(artifactPath) ?? [];
          list.push(format as RuntimeExportFormat);
          exportFormatsByArtifact.set(artifactPath, Array.from(new Set(list)));
        }
      }
      const requiredPaths = new Set(
        Object.values(normalizedTemplate.stageContracts ?? {})
          .flatMap((contract) => contract.requiredArtifactPaths)
      );
      for (const [stage, documents] of Object.entries(normalizedTemplate.stageDocuments) as Array<[AppStage, RuntimeTemplateAsset['stageDocuments'][AppStage]]>) {
        for (const document of documents) {
          catalog.set(document.path, {
            path: document.path,
            title: document.title,
            purpose: document.purpose,
            stage,
            validatorId: document.validatorId,
            qualityTier: document.qualityTier,
            minimumQualityScore: document.minimumQualityScore,
            requiredForExport: requiredPaths.has(document.path),
            blockedExportFormats: exportFormatsByArtifact.get(document.path) ?? []
          });
        }
      }
    }

    const flows = [
      ...listJsonDir<PlatformFlowAsset>(runtime.flowsDir),
      ...listJsonDir<PlatformFlowAsset>(runtime.subflowsDir)
    ];
    for (const flow of flows) {
      for (const node of flow.nodes) {
        const inputs = Array.from(new Set((node.data.inputArtifactPaths ?? []).map((item) => normalizeArtifactPath(rootPath, item))));
        const outputs = Array.from(new Set((node.data.outputArtifactPaths ?? []).map((item) => normalizeArtifactPath(rootPath, item))));
        if (!inputs.length && !outputs.length) continue;
        const ref: NodeArtifactRef = {
          flowId: flow.id,
          flowKind: flow.kind,
          nodeId: node.id,
          label: node.data.label,
          inputs,
          outputs,
          signature: nodeSignature(node)
        };
        for (const inputPath of inputs) {
          consumers.set(inputPath, [...(consumers.get(inputPath) ?? []), ref]);
        }
        for (const outputPath of outputs) {
          producers.set(outputPath, [...(producers.get(outputPath) ?? []), ref]);
        }
      }
    }

    return {
      template: normalizedTemplate,
      catalog,
      schemas,
      producers,
      consumers
    };
  }

  private loadRuntimeTemplate(templatesDir: string) {
    const templateFile = fs.existsSync(templatesDir)
      ? fs.readdirSync(templatesDir).find((entry) => entry.endsWith('.json'))
      : undefined;
    if (!templateFile) return null;
    return readJsonSafe<RuntimeTemplateAsset | null>(path.join(templatesDir, templateFile), null);
  }
}
