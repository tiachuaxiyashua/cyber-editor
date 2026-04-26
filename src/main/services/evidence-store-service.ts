import fs from 'node:fs';
import path from 'node:path';
import type {
  ActionableErrorRecord,
  ArtifactGovernanceEvidence,
  CapabilityExecutionEvidence,
  ContextPack,
  EvidencePackage,
  ResourceVerificationRecord,
  ReviewGateReport,
  SideEffectApprovalRecord,
  SideEffectPreview
} from '../../shared/types';

type EvidenceCategory = 'reviews' | 'runs' | 'capabilities' | 'errors' | 'resources' | 'side-effects' | 'approvals' | 'context-packs' | 'artifacts';

type EvidenceIndexEntry = {
  id: string;
  category: EvidenceCategory;
  createdAt: string;
  filePath: string;
  runId?: string;
  targetId?: string;
  status?: string;
};

type EvidenceIndex = {
  version: 1;
  entries: EvidenceIndexEntry[];
};

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function evidencePaths(rootPath: string) {
  const evidenceRoot = path.join(rootPath, '.project', 'evidence');
  return {
    root: evidenceRoot,
    indexFile: path.join(evidenceRoot, 'index.json'),
    reviews: path.join(evidenceRoot, 'reviews'),
    runs: path.join(evidenceRoot, 'runs'),
    capabilities: path.join(evidenceRoot, 'capabilities'),
    errors: path.join(evidenceRoot, 'errors'),
    resources: path.join(evidenceRoot, 'resources'),
    sideEffects: path.join(evidenceRoot, 'side-effects'),
    approvals: path.join(evidenceRoot, 'approvals'),
    contextPacks: path.join(evidenceRoot, 'context-packs'),
    artifacts: path.join(evidenceRoot, 'artifacts')
  };
}

function categoryDirectory(rootPath: string, category: EvidenceCategory) {
  const paths = evidencePaths(rootPath);
  switch (category) {
    case 'reviews':
      return paths.reviews;
    case 'runs':
      return paths.runs;
    case 'errors':
      return paths.errors;
    case 'capabilities':
      return paths.capabilities;
    case 'resources':
      return paths.resources;
    case 'side-effects':
      return paths.sideEffects;
    case 'approvals':
      return paths.approvals;
    case 'context-packs':
      return paths.contextPacks;
    case 'artifacts':
      return paths.artifacts;
  }
}

export class EvidenceStoreService {
  ensureProjectEvidence(rootPath: string) {
    const paths = evidencePaths(rootPath);
    ensureDir(paths.root);
    ensureDir(paths.reviews);
    ensureDir(paths.runs);
    ensureDir(paths.capabilities);
    ensureDir(paths.errors);
    ensureDir(paths.resources);
    ensureDir(paths.sideEffects);
    ensureDir(paths.approvals);
    ensureDir(paths.contextPacks);
    ensureDir(paths.artifacts);
    if (!fs.existsSync(paths.indexFile)) {
      writeJson(paths.indexFile, {
        version: 1,
        entries: []
      } satisfies EvidenceIndex);
    }
  }

  persistReview(rootPath: string, review: ReviewGateReport) {
    return this.persist(rootPath, 'reviews', review.id, review, {
      targetId: review.targetId,
      status: review.trust
    });
  }

  persistRunEvidence(rootPath: string, evidencePackage: EvidencePackage) {
    return this.persist(rootPath, 'runs', evidencePackage.id, evidencePackage, {
      runId: evidencePackage.runId,
      targetId: evidencePackage.roleId,
      status: evidencePackage.status
    });
  }

  persistCapabilityExecution(rootPath: string, record: CapabilityExecutionEvidence) {
    return this.persist(rootPath, 'capabilities', record.id, record, {
      runId: record.runId,
      targetId: record.targetId,
      status: record.status
    });
  }

  persistActionableError(rootPath: string, errorRecord: ActionableErrorRecord) {
    return this.persist(rootPath, 'errors', errorRecord.id, errorRecord, {
      runId: errorRecord.runId,
      targetId: errorRecord.targetId,
      status: errorRecord.severity
    });
  }

  persistResourceVerification(rootPath: string, record: ResourceVerificationRecord) {
    return this.persist(rootPath, 'resources', record.id, record, {
      targetId: record.resourceId,
      status: record.trust
    });
  }

  persistSideEffectPreview(rootPath: string, preview: SideEffectPreview) {
    return this.persist(rootPath, 'side-effects', preview.id, preview, {
      runId: preview.runId,
      targetId: preview.capabilityId,
      status: preview.status
    });
  }

  persistSideEffectApproval(rootPath: string, approval: SideEffectApprovalRecord) {
    return this.persist(rootPath, 'approvals', approval.id, approval, {
      targetId: approval.previewId,
      status: approval.approved ? 'approved' : 'rejected'
    });
  }

  persistContextPack(rootPath: string, contextPack: ContextPack) {
    return this.persist(rootPath, 'context-packs', contextPack.id, contextPack, {
      runId: contextPack.runId,
      targetId: contextPack.roleId,
      status: contextPack.compacted ? 'compacted' : 'full'
    });
  }

  persistArtifactGovernance(rootPath: string, record: ArtifactGovernanceEvidence) {
    return this.persist(rootPath, 'artifacts', record.id, record, {
      runId: record.runId,
      targetId: record.artifactPath,
      status: record.status
    });
  }

  listEntries(rootPath: string, category?: EvidenceCategory) {
    this.ensureProjectEvidence(rootPath);
    const index = readJsonSafe<EvidenceIndex>(evidencePaths(rootPath).indexFile, { version: 1, entries: [] });
    const entries = category ? index.entries.filter((entry) => entry.category === category) : index.entries;
    return entries.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  readRunEvidence(rootPath: string, id: string) {
    return this.read<EvidencePackage>(rootPath, 'runs', id);
  }

  readCapabilityExecution(rootPath: string, id: string) {
    return this.read<CapabilityExecutionEvidence>(rootPath, 'capabilities', id);
  }

  readContextPack(rootPath: string, id: string) {
    return this.read<ContextPack>(rootPath, 'context-packs', id);
  }

  readActionableError(rootPath: string, id: string) {
    return this.read<ActionableErrorRecord>(rootPath, 'errors', id);
  }

  readSideEffectPreview(rootPath: string, id: string) {
    return this.read<SideEffectPreview>(rootPath, 'side-effects', id);
  }

  readSideEffectApproval(rootPath: string, id: string) {
    return this.read<SideEffectApprovalRecord>(rootPath, 'approvals', id);
  }

  private persist<T extends { createdAt: string }>(
    rootPath: string,
    category: EvidenceCategory,
    id: string,
    value: T,
    metadata: Pick<EvidenceIndexEntry, 'runId' | 'targetId' | 'status'>
  ) {
    this.ensureProjectEvidence(rootPath);
    const filePath = path.join(categoryDirectory(rootPath, category), `${id}.json`);
    writeJson(filePath, value);
    const relativeFilePath = path.relative(rootPath, filePath).replace(/\\/g, '/');
    const index = readJsonSafe<EvidenceIndex>(evidencePaths(rootPath).indexFile, { version: 1, entries: [] });
    const nextEntry: EvidenceIndexEntry = {
      id,
      category,
      createdAt: value.createdAt,
      filePath: relativeFilePath,
      runId: metadata.runId,
      targetId: metadata.targetId,
      status: metadata.status
    };
    index.entries = [nextEntry, ...index.entries.filter((entry) => !(entry.category === category && entry.id === id))];
    writeJson(evidencePaths(rootPath).indexFile, index);
    return value;
  }

  private read<T>(rootPath: string, category: EvidenceCategory, id: string) {
    const filePath = path.join(categoryDirectory(rootPath, category), `${id}.json`);
    return readJsonSafe<T | null>(filePath, null);
  }
}
