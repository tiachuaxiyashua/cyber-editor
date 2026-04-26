import { dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ArtifactOpenPayload,
  AgentMemory,
  AppStage,
  AiSession,
  AuditEntry,
  ConsistencyReport,
  ArtifactInvalidationRecord,
  ArtifactRevisionRecord,
  DocumentSnapshotSource,
  DocumentChangeRecord,
  DocumentChangeSource,
  DocumentWriteResolutionInput,
  DocumentMeta,
  FileNode,
  NoteReferenceComparison,
  NoteReferenceDocument,
  NoteReferenceEdge,
  NoteReferenceGraph,
  NoteReferenceKind,
  ProjectSearchResult,
  ProjectCreateInput,
  ProjectCreateValidation,
  ProjectCreateValidationIssue,
  ProjectManifest,
  ProjectTemplatePackage,
  ProjectSummary,
  ActionableErrorRecord,
  ReviewRound,
  SessionSkillMap,
  SnapshotInfo,
  TableArtifactModel,
  UnresolvedNoteReference,
  WorkflowState
} from '../../shared/types';
import { ArtifactGovernanceService } from './artifact-governance-service';
import { DocumentChangeService } from './document-change-service';
import { DocumentSnapshotService } from './document-snapshot-service';
import { EvidenceStoreService } from './evidence-store-service';
import { HumanAiMergeService } from './human-ai-merge-service';
import { PlatformService } from './platform-service';
import { SessionStore } from './store';
import { TableArtifactService } from './table-artifact-service';

const PROJECT_VERSION = '0.1.0';
const PROJECT_RUNTIME_DIRS = ['platform', 'runtime', 'evidence'] as const;
const METADATA_FILES = [
  'manifest.json',
  'workflow-state.json',
  'agent-memory.json',
  'enabled-skills.json',
  'session-skills.json',
  'review-rounds.json',
  'consistency-report.json',
  'sessions.json',
  'recent-document-changes.json'
] as const;

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isEffectivelyEmptyDirectory(dirPath: string) {
  if (!fs.existsSync(dirPath)) return true;
  return fs.readdirSync(dirPath).filter((entry) => !['.DS_Store', 'Thumbs.db'].includes(entry)).length === 0;
}

function hasInvalidProjectNameCharacters(name: string) {
  return /[<>:"/\\|?*\u0000-\u001F]/.test(name) || /[.\s]$/.test(name);
}

function canWriteDirectory(dirPath: string) {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function mapSnapshotSource(source: DocumentChangeSource): DocumentSnapshotSource {
  if (source === 'editor-save') return 'editor-save';
  if (source === 'runtime-write') return 'runtime-write';
  return 'restore';
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    return readJson<T>(filePath);
  } catch {
    return fallback;
  }
}

function appendJsonLine(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

function compactTimestampToken(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1Z');
}

function slugifyImportName(name: string) {
  return name.replace(/\s+/g, '-');
}

function uniquePath(candidatePath: string) {
  if (!fs.existsSync(candidatePath)) return candidatePath;
  const ext = path.extname(candidatePath);
  const base = candidatePath.slice(0, ext ? -ext.length : candidatePath.length);
  let index = 1;
  while (true) {
    const next = `${base}-${index}${ext}`;
    if (!fs.existsSync(next)) return next;
    index += 1;
  }
}

function copyRecursive(sourcePath: string, targetPath: string) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    ensureDir(targetPath);
    for (const entry of fs.readdirSync(sourcePath)) {
      copyRecursive(path.join(sourcePath, entry), path.join(targetPath, entry));
    }
    return;
  }
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function removePathIfExists(targetPath: string) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function tryRealPath(targetPath: string) {
  try {
    return fs.realpathSync.native(targetPath);
  } catch {
    return null;
  }
}

function findNearestExistingAncestor(targetPath: string) {
  let current = path.resolve(targetPath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
  return current;
}

function isPathInsideRoot(rootPath: string, candidatePath: string) {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedCandidate = path.resolve(candidatePath);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function isNestedPath(parentPath: string, candidatePath: string) {
  const normalizedParent = path.resolve(parentPath);
  const normalizedCandidate = path.resolve(candidatePath);
  if (normalizedParent === normalizedCandidate) return true;
  return normalizedCandidate.startsWith(`${normalizedParent}${path.sep}`);
}

function listManagedRootEntries(rootPath: string) {
  if (!fs.existsSync(rootPath)) {
    return [] as string[];
  }
  return fs.readdirSync(rootPath, { withFileTypes: true })
    .map((entry) => entry.name)
    .filter((name) => !['.DS_Store', 'Thumbs.db'].includes(name));
}

function listManagedContentEntries(rootPath: string) {
  return listManagedRootEntries(rootPath).filter((name) => name !== '.project');
}

function bootstrapDocumentPath(templatePackage: ProjectTemplatePackage) {
  return templatePackage.runtime.template.stageDocuments.discover[0]?.path
    || templatePackage.definition.requirementDocName
    || 'discover.md';
}

function bootstrapDocumentHeading(templatePackage: ProjectTemplatePackage) {
  return templatePackage.runtime.template.stageDocuments.discover[0]?.title?.trim()
    || '开始文档';
}

function bootstrapProjectDirectories(templatePackage: ProjectTemplatePackage) {
  const directories = new Set<string>([
    'assets',
    path.join('assets', 'images'),
    path.join('assets', 'diagrams')
  ]);

  for (const documents of Object.values(templatePackage.runtime.template.stageDocuments)) {
    for (const document of documents) {
      const relativeDir = path.dirname(document.path);
      if (relativeDir && relativeDir !== '.') {
        directories.add(relativeDir);
      }
    }
  }

  for (const mapping of Object.values(templatePackage.runtime.template.exportMapping ?? {})) {
    if (!mapping.enabled) continue;
    const relativeDir = mapping.outputPathPattern?.trim();
    if (relativeDir && relativeDir !== '.') {
      directories.add(relativeDir);
    }
  }

  return Array.from(directories);
}

function copyManagedProjectSubset(sourceRoot: string, targetRoot: string) {
  for (const dirName of listManagedContentEntries(sourceRoot)) {
    const sourcePath = path.join(sourceRoot, dirName);
    if (!fs.existsSync(sourcePath)) continue;
    const targetPath = path.join(targetRoot, dirName);
    copyRecursive(sourcePath, targetPath);
  }
  const sourceProjectRoot = path.join(sourceRoot, '.project');
  if (!fs.existsSync(sourceProjectRoot)) {
    return;
  }
  const targetProjectRoot = path.join(targetRoot, '.project');
  ensureDir(targetProjectRoot);
  for (const fileName of METADATA_FILES) {
    const snapshotFile = path.join(sourceProjectRoot, fileName);
    if (fs.existsSync(snapshotFile)) {
      copyRecursive(snapshotFile, path.join(targetProjectRoot, fileName));
    }
  }
  for (const runtimeDir of PROJECT_RUNTIME_DIRS) {
    const sourceRuntimePath = path.join(sourceProjectRoot, runtimeDir);
    if (fs.existsSync(sourceRuntimePath)) {
      copyRecursive(sourceRuntimePath, path.join(targetProjectRoot, runtimeDir));
    }
  }
}

function replaceManagedProjectSubset(sourceRoot: string, targetRoot: string) {
  const entryNames = new Set([
    ...listManagedContentEntries(sourceRoot),
    ...listManagedContentEntries(targetRoot)
  ]);
  for (const dirName of entryNames) {
    const sourcePath = path.join(sourceRoot, dirName);
    const targetPath = path.join(targetRoot, dirName);
    removePathIfExists(targetPath);
    if (fs.existsSync(sourcePath)) {
      copyRecursive(sourcePath, targetPath);
    }
  }
  const sourceProjectRoot = path.join(sourceRoot, '.project');
  const targetProjectRoot = path.join(targetRoot, '.project');
  ensureDir(targetProjectRoot);
  for (const fileName of METADATA_FILES) {
    const sourceFile = path.join(sourceProjectRoot, fileName);
    const targetFile = path.join(targetProjectRoot, fileName);
    if (fs.existsSync(sourceFile)) {
      copyRecursive(sourceFile, targetFile);
    } else if (fs.existsSync(targetFile)) {
      fs.rmSync(targetFile, { force: true });
    }
  }
  for (const runtimeDir of PROJECT_RUNTIME_DIRS) {
    const sourceRuntimePath = path.join(sourceProjectRoot, runtimeDir);
    const targetRuntimePath = path.join(targetProjectRoot, runtimeDir);
    removePathIfExists(targetRuntimePath);
    if (fs.existsSync(sourceRuntimePath)) {
      copyRecursive(sourceRuntimePath, targetRuntimePath);
    }
  }
}

function rollbackManagedProjectSubset(backupRoot: string, targetRoot: string) {
  const entryNames = new Set([
    ...listManagedContentEntries(backupRoot),
    ...listManagedContentEntries(targetRoot)
  ]);
  for (const dirName of entryNames) {
    const backupPath = path.join(backupRoot, dirName);
    const targetPath = path.join(targetRoot, dirName);
    removePathIfExists(targetPath);
    if (fs.existsSync(backupPath)) {
      copyRecursive(backupPath, targetPath);
    }
  }
  const backupProjectRoot = path.join(backupRoot, '.project');
  const targetProjectRoot = path.join(targetRoot, '.project');
  ensureDir(targetProjectRoot);
  for (const fileName of METADATA_FILES) {
    const backupFile = path.join(backupProjectRoot, fileName);
    const targetFile = path.join(targetProjectRoot, fileName);
    if (fs.existsSync(backupFile)) {
      copyRecursive(backupFile, targetFile);
    } else if (fs.existsSync(targetFile)) {
      fs.rmSync(targetFile, { force: true });
    }
  }
  for (const runtimeDir of PROJECT_RUNTIME_DIRS) {
    const backupRuntimePath = path.join(backupProjectRoot, runtimeDir);
    const targetRuntimePath = path.join(targetProjectRoot, runtimeDir);
    removePathIfExists(targetRuntimePath);
    if (fs.existsSync(backupRuntimePath)) {
      copyRecursive(backupRuntimePath, targetRuntimePath);
    }
  }
}

function validateRestoreStage(stageRoot: string) {
  const manifestPath = path.join(stageRoot, '.project', 'manifest.json');
  const workflowStatePath = path.join(stageRoot, '.project', 'workflow-state.json');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(workflowStatePath)) {
    throw new Error('Restore stage is missing required project metadata.');
  }
}

function sortNodes(nodes: FileNode[]) {
  return nodes.sort((left, right) => {
    if (left.type !== right.type) return left.type === 'directory' ? -1 : 1;
    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

function noteTitle(filePath: string) {
  return path.basename(filePath, path.extname(filePath));
}

function normalizeRelativePath(rootPath: string, targetPath: string) {
  return path.relative(rootPath, targetPath).replace(/\\/g, '/');
}

function stripAnchor(target: string) {
  return target.split('#')[0]?.trim() ?? '';
}

function normalizeMarkdownTarget(target: string) {
  const trimmed = target.trim().replace(/^<|>$/g, '');
  if (!trimmed || trimmed.startsWith('#')) return '';
  if (/^(https?:|mailto:|data:)/i.test(trimmed)) return '';
  return stripAnchor(trimmed.split(/\s+/)[0] ?? '');
}

function resolveMarkdownTarget(rootPath: string, sourcePath: string, rawTarget: string, notePaths: string[]) {
  const normalized = normalizeMarkdownTarget(rawTarget);
  if (!normalized) return null;

  const candidates: string[] = [];
  const directCandidate = normalized.startsWith('/')
    ? path.resolve(rootPath, normalized.slice(1))
    : path.resolve(path.dirname(sourcePath), normalized);
  candidates.push(directCandidate);

  if (!path.extname(directCandidate)) {
    for (const ext of ['.md', '.markdown', '.txt']) {
      candidates.push(`${directCandidate}${ext}`);
    }
  }

  return candidates.find((candidate) => notePaths.includes(candidate)) ?? null;
}

function normalizeWikiTarget(target: string) {
  const raw = target.split('|')[0]?.split('#')[0]?.trim() ?? '';
  return raw.replace(/\\/g, '/');
}

function resolveWikiTarget(rootPath: string, sourcePath: string, rawTarget: string, notePaths: string[]) {
  const normalized = normalizeWikiTarget(rawTarget);
  if (!normalized) return null;

  const directCandidates: string[] = [];
  const normalizedPath = normalized.replace(/^\/+/, '');
  directCandidates.push(path.resolve(rootPath, normalizedPath));
  directCandidates.push(path.resolve(path.dirname(sourcePath), normalized));
  if (!path.extname(normalized)) {
    for (const base of [...directCandidates]) {
      for (const ext of ['.md', '.markdown', '.txt']) {
        directCandidates.push(`${base}${ext}`);
      }
    }
  }

  const directMatch = directCandidates.find((candidate) => notePaths.includes(candidate));
  if (directMatch) return directMatch;

  const normalizedName = normalized.toLowerCase();
  const basenameMatches = notePaths.filter((candidate) => {
    const candidateName = noteTitle(candidate).toLowerCase();
    const relativeName = normalizeRelativePath(rootPath, candidate).replace(/\.[^.]+$/, '').toLowerCase();
    return candidateName === normalizedName || relativeName === normalizedName;
  });
  return basenameMatches.length === 1 ? basenameMatches[0] : null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function firstNonEmptyLine(contents: string) {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? '';
}

function diffLineStats(previousContents: string, nextContents: string) {
  const previousLines = previousContents.split(/\r?\n/);
  const nextLines = nextContents.split(/\r?\n/);
  let start = 0;

  while (
    start < previousLines.length
    && start < nextLines.length
    && previousLines[start] === nextLines[start]
  ) {
    start += 1;
  }

  let previousEnd = previousLines.length - 1;
  let nextEnd = nextLines.length - 1;
  while (
    previousEnd >= start
    && nextEnd >= start
    && previousLines[previousEnd] === nextLines[nextEnd]
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  const removedBlock = previousEnd >= start ? previousLines.slice(start, previousEnd + 1) : [];
  const addedBlock = nextEnd >= start ? nextLines.slice(start, nextEnd + 1) : [];
  const removedLineCount = removedBlock.length;
  const addedLineCount = addedBlock.length;
  const changedLineCount = Math.max(removedLineCount, addedLineCount);
  const excerptBefore = removedBlock.map((line) => line.trim()).filter(Boolean).slice(0, 3).join(' / ');
  const excerptAfter = addedBlock.map((line) => line.trim()).filter(Boolean).slice(0, 3).join(' / ');

  return {
    addedLineCount,
    removedLineCount,
    changedLineCount,
    excerptBefore: excerptBefore || undefined,
    excerptAfter: excerptAfter || undefined
  };
}

function summarizeDocumentChange(
  title: string,
  stats: ReturnType<typeof diffLineStats>,
  impact: {
    inboundAffectedPaths: string[];
    outboundAddedPaths: string[];
    outboundRemovedPaths: string[];
    artifactPaths: string[];
  }
) {
  const changeBits = [
    stats.changedLineCount ? `变更 ${stats.changedLineCount} 行` : '',
    stats.addedLineCount ? `新增 ${stats.addedLineCount} 行` : '',
    stats.removedLineCount ? `删除 ${stats.removedLineCount} 行` : ''
  ].filter(Boolean);
  const impactBits = [
    impact.outboundAddedPaths.length ? `新增引用 ${impact.outboundAddedPaths.length} 项` : '',
    impact.outboundRemovedPaths.length ? `移除引用 ${impact.outboundRemovedPaths.length} 项` : '',
    impact.inboundAffectedPaths.length ? `影响上游 ${impact.inboundAffectedPaths.length} 篇文档` : '',
    impact.artifactPaths.length ? `命中 ${impact.artifactPaths.length} 个流程工件` : ''
  ].filter(Boolean);
  const excerpt = stats.excerptAfter || stats.excerptBefore || title;
  return [changeBits.join('，'), impactBits.join('，'), `摘要：${excerpt}`].filter(Boolean).join('；');
}

function collectReferenceTargets(rootPath: string, sourcePath: string, contents: string, notePaths: string[]) {
  const targets: string[] = [];
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    const markdownRegex = /(!)?\[[^\]]*]\(([^)]+)\)/g;
    let markdownMatch: RegExpExecArray | null;
    while ((markdownMatch = markdownRegex.exec(line))) {
      if (markdownMatch[1] === '!') continue;
      const rawTarget = markdownMatch[2]?.trim() ?? '';
      const targetPath = resolveMarkdownTarget(rootPath, sourcePath, rawTarget, notePaths);
      if (targetPath) {
        targets.push(targetPath);
      }
    }

    const wikiRegex = /\[\[([^\]]+)\]\]/g;
    let wikiMatch: RegExpExecArray | null;
    while ((wikiMatch = wikiRegex.exec(line))) {
      const rawTarget = wikiMatch[1]?.trim() ?? '';
      const targetPath = resolveWikiTarget(rootPath, sourcePath, rawTarget, notePaths);
      if (targetPath) {
        targets.push(targetPath);
      }
    }
  }
  return uniqueStrings(targets);
}

function sortReferenceDocuments(documents: NoteReferenceDocument[]) {
  return documents.sort((left, right) => left.title.localeCompare(right.title, 'zh-CN') || left.path.localeCompare(right.path));
}

export class ProjectService {
  constructor(
    private readonly platformService = new PlatformService(),
    private readonly evidenceStore = new EvidenceStoreService(),
    private readonly documentChangeService = new DocumentChangeService(),
    private readonly documentSnapshotService = new DocumentSnapshotService(),
    private readonly humanAiMergeService = new HumanAiMergeService(),
    private readonly artifactGovernanceService = new ArtifactGovernanceService(),
    private readonly tableArtifactService = new TableArtifactService()
  ) {}

  resolveProjectPath(rootPath: string, targetPath: string) {
    const candidate = path.isAbsolute(targetPath) ? targetPath : path.join(rootPath, targetPath);
    const resolved = path.resolve(candidate);
    const rootRealPath = tryRealPath(path.resolve(rootPath)) ?? path.resolve(rootPath);
    const resolvedRealPath = tryRealPath(resolved);
    if (resolvedRealPath) {
      if (!isPathInsideRoot(rootRealPath, resolvedRealPath)) {
        throw new Error('路径超出当前工程范围。');
      }
      return resolvedRealPath;
    }
    const nearestAncestor = findNearestExistingAncestor(resolved);
    if (!nearestAncestor) {
      throw new Error('目标路径不存在，且无法定位到工程内的有效父级目录。');
    }
    const ancestorRealPath = tryRealPath(nearestAncestor) ?? path.resolve(nearestAncestor);
    const candidateRealPath = path.resolve(ancestorRealPath, path.relative(nearestAncestor, resolved));
    if (!isPathInsideRoot(rootRealPath, candidateRealPath)) {
      throw new Error('路径超出当前工程范围。');
    }
    return candidateRealPath;
  }

  async pickProjectDirectory() {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  }

  validateProject(rootPath: string) {
    return fs.existsSync(path.join(rootPath, '.project', 'manifest.json'))
      && fs.existsSync(path.join(rootPath, '.project', 'workflow-state.json'));
  }

  validateProjectCreateInput(input: ProjectCreateInput): ProjectCreateValidation {
    const issues: ProjectCreateValidationIssue[] = [];
    const trimmedName = input.name.trim();
    const trimmedLocation = input.locationPath.trim();
    const finalPath = !trimmedLocation
      ? ''
      : input.directoryMode === 'use-existing-directory'
        ? path.resolve(trimmedLocation)
        : path.resolve(trimmedLocation, trimmedName || 'untitled-project');

    if (!trimmedName) {
      issues.push({
        code: 'name.empty',
        field: 'name',
        message: '请输入工程名称。'
      });
    } else if (hasInvalidProjectNameCharacters(trimmedName)) {
      issues.push({
        code: 'name.invalid-chars',
        field: 'name',
        message: '工程名称包含不支持的字符，或以空格 / 句点结尾。'
      });
    }

    if (!trimmedLocation) {
      issues.push({
        code: 'path.empty',
        field: 'locationPath',
        message: input.directoryMode === 'create-in-parent' ? '请选择父目录。' : '请选择空目录。'
      });
      return { ok: false, finalPath, issues };
    }

    const resolvedLocation = path.resolve(trimmedLocation);
    if (input.directoryMode === 'create-in-parent') {
      if (!fs.existsSync(resolvedLocation) || !fs.statSync(resolvedLocation).isDirectory()) {
        issues.push({
          code: 'path.missing-parent',
          field: 'locationPath',
          message: '所选父目录不存在，或不是一个目录。'
        });
      } else if (!canWriteDirectory(resolvedLocation)) {
        issues.push({
          code: 'path.parent-not-writable',
          field: 'locationPath',
          message: `鐖剁洰褰曚笉鍙啓锛氭棤娉曞湪 ${resolvedLocation} 鍒涘缓鏂板伐绋嬨€?`
        });
      } else if (trimmedName) {
        const targetPath = path.resolve(resolvedLocation, trimmedName);
        if (fs.existsSync(targetPath)) {
          issues.push({
            code: 'path.target-conflict',
            field: 'locationPath',
            message: `目标目录已存在：${targetPath}`
          });
        }
      }
    } else {
      if (!fs.existsSync(resolvedLocation)) {
        issues.push({
          code: 'path.target-missing',
          field: 'locationPath',
          message: `未找到目录：${resolvedLocation}`
        });
      } else if (!fs.statSync(resolvedLocation).isDirectory()) {
        issues.push({
          code: 'path.target-not-directory',
          field: 'locationPath',
          message: '目标路径不是目录。'
        });
      } else if (!canWriteDirectory(resolvedLocation)) {
        issues.push({
          code: 'path.target-not-writable',
          field: 'locationPath',
          message: `鐩爣鐩綍涓嶅彲鍐欙細${resolvedLocation}`
        });
      } else if (!isEffectivelyEmptyDirectory(resolvedLocation)) {
        issues.push({
          code: 'path.target-exists-nonempty',
          field: 'locationPath',
          message: '只能在空目录中初始化新工程。'
        });
      }
    }

    return {
      ok: issues.length === 0,
      finalPath,
      issues
    };
  }

  createProject(input: ProjectCreateInput): ProjectSummary {
    const validation = this.validateProjectCreateInput(input);
    if (!validation.ok) {
      throw new Error(validation.issues[0]?.message || '工程创建校验失败。');
    }

    const rootPath = validation.finalPath;
    const template = this.platformService.getTemplateDefinition(input.templateId);
    const templatePackage = this.platformService.getTemplatePackage(template.id);
    if (!templatePackage) {
      throw new Error(`未找到模板包：${template.id}`);
    }
    const starterDocumentPath = bootstrapDocumentPath(templatePackage);
    const requirementDocPath = path.join(rootPath, starterDocumentPath);
    const starterHeading = bootstrapDocumentHeading(templatePackage);
    const now = new Date().toISOString();

    ensureDir(rootPath);
    for (const relativeDir of bootstrapProjectDirectories(templatePackage)) {
      ensureDir(path.join(rootPath, relativeDir));
    }
    ensureDir(path.join(rootPath, '.project'));
    ensureDir(path.join(rootPath, '.project', 'snapshots'));
    this.evidenceStore.ensureProjectEvidence(rootPath);

    fs.writeFileSync(
      requirementDocPath,
      `# ${starterHeading}\n\n${template.starterPrompt}\n`,
      'utf8'
    );

    const manifest: ProjectManifest = {
      name: input.name || path.basename(rootPath),
      rootPath,
      createdAt: now,
      updatedAt: now,
      version: PROJECT_VERSION,
      templateId: template.id
    };
    const workflow: WorkflowState = {
      stage: 'discover',
      confirmedStages: [],
      activeDocumentPath: requirementDocPath
    };

    writeJson(path.join(rootPath, '.project', 'manifest.json'), manifest);
    writeJson(path.join(rootPath, '.project', 'workflow-state.json'), workflow);
    writeJson(path.join(rootPath, '.project', 'agent-memory.json'), {
      productIntent: '',
      constraints: [],
      decisions: [],
      openQuestions: [],
      updatedAt: now
    });
    writeJson(path.join(rootPath, '.project', 'enabled-skills.json'), []);
    writeJson(path.join(rootPath, '.project', 'session-skills.json'), {});
    writeJson(path.join(rootPath, '.project', 'review-rounds.json'), []);
    writeJson(path.join(rootPath, '.project', 'consistency-report.json'), {
      createdAt: now,
      findings: []
    });
    fs.writeFileSync(path.join(rootPath, '.project', 'conversation-log.jsonl'), '', 'utf8');
    fs.writeFileSync(path.join(rootPath, '.project', 'audit-log.jsonl'), '', 'utf8');

    this.platformService.initializeProjectPlatform(rootPath, template.id);

    const sessions = this.createDefaultSessions(template.name, template.starterPrompt);
    new SessionStore(rootPath).saveSessions(sessions);

    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: now,
      type: 'project.created',
      message: `创建工程 ${input.name || path.basename(rootPath)}`,
      metadata: { rootPath, templateId: template.id }
    });

    return this.openProject(rootPath);
  }

  openProject(rootPath: string): ProjectSummary {
    if (!this.validateProject(rootPath)) {
      throw new Error('所选目录不是有效工程。');
    }
    this.evidenceStore.ensureProjectEvidence(rootPath);
    const manifest = readJson<ProjectManifest>(path.join(rootPath, '.project', 'manifest.json'));
    const workflow = readJson<WorkflowState>(path.join(rootPath, '.project', 'workflow-state.json'));
    const tree = this.scanTree(rootPath);
    const template = this.platformService.loadAssets(rootPath).template;
    return { rootPath, manifest, workflow, tree, template };
  }

  loadPlatformAssets(rootPath: string) {
    return this.platformService.loadAssets(rootPath);
  }

  loadSessions(rootPath: string) {
    return new SessionStore(rootPath).getSessions();
  }

  saveSessions(rootPath: string, sessions: AiSession[]) {
    new SessionStore(rootPath).saveSessions(sessions);
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'session.updated',
      message: '已更新工程会话列表。',
      metadata: { sessionCount: sessions.length }
    });
  }

  readFile(filePath: string) {
    return fs.readFileSync(filePath, 'utf8');
  }

  resolveArtifactPath(targetPath: string, sourcePath?: string) {
    if (path.isAbsolute(targetPath)) {
      return path.resolve(targetPath);
    }
    if (sourcePath) {
      const rootPath = this.inferProjectRoot(sourcePath);
      const candidate = path.resolve(path.dirname(sourcePath), targetPath);
      return rootPath ? this.resolveProjectPath(rootPath, candidate) : candidate;
    }
    const rootPath = this.inferProjectRoot(targetPath);
    if (rootPath) {
      return this.resolveProjectPath(rootPath, path.resolve(rootPath, targetPath));
    }
    return path.resolve(targetPath);
  }

  async openArtifact(targetPath: string, sourcePath?: string): Promise<ArtifactOpenPayload> {
    const resolvedPath = this.resolveArtifactPath(targetPath, sourcePath);
    return this.tableArtifactService.openArtifact(resolvedPath);
  }

  async saveArtifact(filePath: string, payload: ArtifactOpenPayload) {
    if (payload.kind !== 'table' || !payload.table) {
      throw new Error('Only table artifacts are currently writable through artifact.save.');
    }

    const rootPath = this.inferProjectRoot(filePath);
    const previousContents = payload.binary || !fs.existsSync(filePath) ? '' : fs.readFileSync(filePath, 'utf8');
    if (rootPath) {
      this.createSnapshot(rootPath, `save-${path.basename(filePath)}`);
      if (!payload.binary) {
        this.documentSnapshotService.createSnapshot(rootPath, filePath, previousContents, {
          label: `淇濆瓨鍓?${path.basename(filePath)}`,
          source: 'editor-save',
          previousContents: ''
        });
      }
    }

    await this.tableArtifactService.save(filePath, payload.table);

    if (rootPath) {
      if (!payload.binary) {
        const nextContents = fs.readFileSync(filePath, 'utf8');
        this.recordDocumentChange(filePath, previousContents, nextContents, 'editor-save');
      }
      this.appendAudit(rootPath, {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        type: 'artifact.saved',
        message: `淇濆瓨琛ㄦ牸宸ヤ欢 ${path.basename(filePath)}`,
        metadata: {
          filePath,
          format: payload.table.format,
          sheetCount: payload.table.sheets.length
        }
      });
    }

    return this.openArtifact(filePath);
  }

  async saveTableArtifact(filePath: string, table: TableArtifactModel) {
    return this.saveArtifact(filePath, {
      kind: 'table',
      filePath,
      title: table.title,
      editable: true,
      binary: table.format === 'xlsx',
      table
    });
  }

  saveFile(filePath: string, contents: string, options?: {
    source?: DocumentChangeSource;
    skipDocumentSnapshot?: boolean;
    artifactContext?: {
      runId?: string;
      flowId?: string;
      nodeId?: string;
      stage?: AppStage;
      writeMode?: 'replace' | 'merge' | 'patch';
    };
  }) {
    const rootPath = this.inferProjectRoot(filePath);
    const previousContents = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    if (rootPath && previousContents !== contents) {
      this.createSnapshot(rootPath, `save-${path.basename(filePath)}`);
      if (options?.skipDocumentSnapshot !== true) {
        this.documentSnapshotService.createSnapshot(rootPath, filePath, previousContents, {
          label: `保存前 ${path.basename(filePath)}`,
          source: mapSnapshotSource(options?.source ?? 'runtime-write'),
          previousContents: ''
        });
      }
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents, 'utf8');
    if (rootPath) {
      this.recordDocumentChange(filePath, previousContents, contents, options?.source ?? 'runtime-write', options?.artifactContext);
      this.appendAudit(rootPath, {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        type: 'document.saved',
        message: `保存文档 ${path.basename(filePath)}`,
        metadata: { filePath }
      });
    }
  }

  getDocumentMeta(filePath: string): DocumentMeta {
    const stat = fs.statSync(filePath);
    return {
      path: filePath,
      modifiedAt: stat.mtimeMs,
      size: stat.size
    };
  }

  saveWorkflow(rootPath: string, workflow: WorkflowState) {
    writeJson(path.join(rootPath, '.project', 'workflow-state.json'), workflow);
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'workflow.updated',
      message: `工作流阶段更新为 ${workflow.stage}`,
      metadata: { stage: workflow.stage, activeDocumentPath: workflow.activeDocumentPath ?? null }
    });
  }

  loadWorkflow(rootPath: string) {
    return readJsonSafe<WorkflowState>(path.join(rootPath, '.project', 'workflow-state.json'), {
      stage: 'discover',
      confirmedStages: []
    });
  }

  loadAgentMemory(rootPath: string) {
    return readJsonSafe<AgentMemory>(path.join(rootPath, '.project', 'agent-memory.json'), {
      productIntent: '',
      constraints: [],
      decisions: [],
      openQuestions: [],
      updatedAt: new Date().toISOString()
    });
  }

  saveAgentMemory(rootPath: string, memory: AgentMemory) {
    writeJson(path.join(rootPath, '.project', 'agent-memory.json'), memory);
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'memory.updated',
      message: '项目记忆已更新。'
    });
  }

  appendConversationLog(rootPath: string, entry: Record<string, unknown>) {
    appendJsonLine(path.join(rootPath, '.project', 'conversation-log.jsonl'), entry);
  }

  loadProjectSkillIds(rootPath: string) {
    return readJsonSafe<string[]>(path.join(rootPath, '.project', 'enabled-skills.json'), []);
  }

  saveProjectSkillIds(rootPath: string, skillIds: string[]) {
    writeJson(path.join(rootPath, '.project', 'enabled-skills.json'), skillIds);
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'skills.project-scope.updated',
      message: '工程默认 Skills 已更新。',
      metadata: { count: skillIds.length }
    });
  }

  loadSessionSkillIds(rootPath: string) {
    return readJsonSafe<SessionSkillMap>(path.join(rootPath, '.project', 'session-skills.json'), {});
  }

  saveSessionSkillIds(rootPath: string, value: SessionSkillMap) {
    writeJson(path.join(rootPath, '.project', 'session-skills.json'), value);
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'skills.session-scope.updated',
      message: '会话 Skills 覆盖已更新。'
    });
  }

  loadReviewRounds(rootPath: string) {
    return readJsonSafe<ReviewRound[]>(path.join(rootPath, '.project', 'review-rounds.json'), []);
  }

  saveReviewRounds(rootPath: string, rounds: ReviewRound[]) {
    writeJson(path.join(rootPath, '.project', 'review-rounds.json'), rounds);
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'review.updated',
      message: '审查轮次已更新。',
      metadata: { count: rounds.length }
    });
  }

  loadConsistencyReport(rootPath: string) {
    return readJsonSafe<ConsistencyReport | null>(path.join(rootPath, '.project', 'consistency-report.json'), null);
  }

  saveConsistencyReport(rootPath: string, report: ConsistencyReport) {
    writeJson(path.join(rootPath, '.project', 'consistency-report.json'), report);
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'consistency.updated',
      message: '一致性报告已更新。',
      metadata: { findingCount: report.findings.length }
    });
  }

  getAuditEntries(rootPath: string, limit = 50) {
    const filePath = path.join(rootPath, '.project', 'audit-log.jsonl');
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean);
    return lines.slice(-limit).reverse().map((line) => JSON.parse(line) as AuditEntry);
  }

  appendAudit(rootPath: string, entry: AuditEntry) {
    appendJsonLine(path.join(rootPath, '.project', 'audit-log.jsonl'), entry);
  }

  listRecentDocumentChanges(rootPath: string, limit = 20) {
    return this.documentChangeService.listRecentDocumentChanges(rootPath, limit);
  }

  listDocumentSnapshots(rootPath: string, filePath: string, limit = 20) {
    return this.documentSnapshotService.listSnapshots(rootPath, filePath, limit);
  }

  createDocumentSnapshot(rootPath: string, filePath: string, label?: string) {
    const contents = this.readFile(filePath);
    const snapshot = this.documentSnapshotService.createSnapshot(rootPath, filePath, contents, {
      label: label?.trim() || `手动快照 ${path.basename(filePath)}`,
      source: 'manual',
      previousContents: ''
    });
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: snapshot.createdAt,
      type: 'document.snapshot.created',
      message: `创建文档快照 ${snapshot.label}`,
      metadata: { filePath, snapshotId: snapshot.id }
    });
    return snapshot;
  }

  restoreDocumentSnapshot(rootPath: string, filePath: string, snapshotId: string) {
    const { snapshot, contents } = this.documentSnapshotService.readSnapshotContents(rootPath, filePath, snapshotId);
    this.saveFile(filePath, contents, { source: 'runtime-write' });
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'document.snapshot.restored',
      message: `恢复文档快照 ${snapshot.label}`,
      metadata: { filePath, snapshotId }
    });
    return snapshot;
  }

  listPendingDocumentWrites(rootPath: string, filePath?: string) {
    return this.humanAiMergeService.listPendingWrites(rootPath, filePath);
  }

  getPendingDocumentWrite(rootPath: string, proposalId: string) {
    return this.humanAiMergeService.getPendingWrite(rootPath, proposalId);
  }

  previewRuntimeDocumentWrite(
    rootPath: string,
    filePath: string,
    proposedContents: string,
    options: {
      sourceRunId?: string;
      sourceLabel: string;
      baseRevisionId?: string;
      baseContentHash?: string;
    }
  ) {
    const currentContents = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    const normalizedArtifactPath = path.relative(rootPath, path.resolve(filePath)).replace(/\\/g, '/');
    const currentRevisionId = this.listArtifactRevisions(rootPath, 10_000)
      .find((revision) => revision.artifactPath === normalizedArtifactPath)
      ?.id;
    return this.humanAiMergeService.createPendingWrite({
      rootPath,
      filePath,
      currentContents,
      proposedContents,
      recentChanges: this.listRecentDocumentChanges(rootPath, 50),
      sourceRunId: options.sourceRunId,
      sourceLabel: options.sourceLabel,
      baseRevisionId: options.baseRevisionId,
      currentRevisionId,
      baseContentHash: options.baseContentHash
    });
  }

  resolvePendingDocumentWrite(rootPath: string, proposalId: string, input: DocumentWriteResolutionInput) {
    const proposal = this.humanAiMergeService.getPendingWrite(rootPath, proposalId);
    const currentContents = fs.existsSync(proposal.filePath) ? fs.readFileSync(proposal.filePath, 'utf8') : '';
    const resolution = this.humanAiMergeService.resolvePendingWrite(rootPath, proposalId, currentContents, input);
    if (resolution.shouldWrite) {
      this.saveFile(proposal.filePath, resolution.nextContents, {
        source: 'runtime-write',
        artifactContext: {
          runId: proposal.sourceRunId,
          writeMode: input.decision === 'manual-merge' ? 'merge' : 'replace'
        }
      });
    }
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'document.write.resolved',
      message: `已处理 AI 写入提案 ${proposal.title}`,
      metadata: {
        filePath: proposal.filePath,
        proposalId,
        decision: input.decision
      }
    });
    return resolution.proposal;
  }

  recordDocumentChange(
    filePath: string,
    previousContents: string,
    nextContents: string,
    source: DocumentChangeSource,
    artifactContext?: {
      runId?: string;
      flowId?: string;
      nodeId?: string;
      stage?: AppStage;
      writeMode?: 'replace' | 'merge' | 'patch';
    }
  ) {
    const record = this.documentChangeService.recordDocumentChange(filePath, previousContents, nextContents, source, {
      inferProjectRoot: (targetPath) => this.inferProjectRoot(targetPath),
      buildNoteReferenceGraph: (rootPath) => this.buildNoteReferenceGraph(rootPath)
    });
    const rootPath = this.inferProjectRoot(filePath);
    if (rootPath && record) {
      this.artifactGovernanceService.recordTrackedArtifactWrite({
        rootPath,
        filePath,
        previousContents,
        nextContents,
        source,
        changeRecordId: record.id,
        runId: artifactContext?.runId,
        flowId: artifactContext?.flowId,
        nodeId: artifactContext?.nodeId,
        stage: artifactContext?.stage,
        writeMode: artifactContext?.writeMode
      });
    }
    return record;
  }

  recomputeArtifactGovernance(rootPath: string) {
    return this.artifactGovernanceService.recompute(rootPath);
  }

  listArtifactRevisions(rootPath: string, limit = 100): ArtifactRevisionRecord[] {
    return this.artifactGovernanceService.listArtifactRevisions(rootPath, limit);
  }

  listArtifactInvalidations(
    rootPath: string,
    options?: { activeOnly?: boolean; artifactPath?: string; limit?: number }
  ): ArtifactInvalidationRecord[] {
    return this.artifactGovernanceService.listArtifactInvalidations(rootPath, options);
  }

  listExportBlockers(rootPath: string) {
    return this.artifactGovernanceService.listExportBlockers(rootPath);
  }

  persistExportBlockers(rootPath: string, blockers: ArtifactInvalidationRecord[]) {
    return this.artifactGovernanceService.persistExportBlock(rootPath, blockers);
  }

  validateNodeArtifactContracts(rootPath: string, flow: import('../../shared/types').PlatformFlowAsset, node: import('../../shared/types').PlatformFlowNode) {
    return this.artifactGovernanceService.validateNodeContracts(rootPath, flow, node);
  }

  validateNodeArtifactOutputs(rootPath: string, node: import('../../shared/types').PlatformFlowNode, content: string) {
    return this.artifactGovernanceService.validateNodeOutputs(rootPath, node, content);
  }

  createFile(rootPath: string, parentPath: string, name: string, initialContent = '') {
    const directory = this.resolveProjectPath(rootPath, parentPath);
    const targetPath = this.resolveProjectPath(rootPath, path.join(directory, name));
    if (fs.existsSync(targetPath)) {
      throw new Error('文件已存在。');
    }
    fs.writeFileSync(targetPath, initialContent, 'utf8');
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'file.created',
      message: `创建文件 ${name}`,
      metadata: { targetPath }
    });
    return targetPath;
  }

  createDirectory(rootPath: string, parentPath: string, name: string) {
    const directory = this.resolveProjectPath(rootPath, parentPath);
    const targetPath = this.resolveProjectPath(rootPath, path.join(directory, name));
    if (fs.existsSync(targetPath)) {
      throw new Error('目录已存在。');
    }
    ensureDir(targetPath);
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'directory.created',
      message: `创建目录 ${name}`,
      metadata: { targetPath }
    });
    return targetPath;
  }

  renameEntry(rootPath: string, targetPath: string, nextName: string) {
    const source = this.resolveProjectPath(rootPath, targetPath);
    const destination = this.resolveProjectPath(rootPath, path.join(path.dirname(source), nextName));
    if (!fs.existsSync(source)) {
      throw new Error('目标不存在。');
    }
    if (fs.existsSync(destination)) {
      throw new Error('同名目标已存在。');
    }
    this.createSnapshot(rootPath, `rename-${path.basename(source)}`);
    fs.renameSync(source, destination);
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'entry.renamed',
      message: `重命名 ${path.basename(source)} -> ${nextName}`,
      metadata: { source, destination }
    });
    return destination;
  }

  moveEntry(rootPath: string, targetPath: string, destinationDirectoryPath: string) {
    const source = this.resolveProjectPath(rootPath, targetPath);
    const destinationDirectory = this.resolveProjectPath(rootPath, destinationDirectoryPath);
    if (!fs.existsSync(source)) {
      throw new Error('目标不存在。');
    }
    if (!fs.existsSync(destinationDirectory) || !fs.statSync(destinationDirectory).isDirectory()) {
      throw new Error('目标目录不存在或不是目录。');
    }
    if (isNestedPath(source, destinationDirectory)) {
      throw new Error('不能将目录移动到其自身或子目录下。');
    }
    const destination = this.resolveProjectPath(rootPath, path.join(destinationDirectory, path.basename(source)));
    if (destination === source) {
      return destination;
    }
    if (fs.existsSync(destination)) {
      throw new Error('目标位置已存在同名条目。');
    }
    this.createSnapshot(rootPath, `move-${path.basename(source)}`);
    fs.renameSync(source, destination);
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'entry.moved',
      message: `绉诲姩 ${path.basename(source)} -> ${path.relative(rootPath, destination).replace(/\\/g, '/')}`,
      metadata: { source, destination, destinationDirectory }
    });
    return destination;
  }

  deleteEntry(rootPath: string, targetPath: string) {
    const resolved = this.resolveProjectPath(rootPath, targetPath);
    if (!fs.existsSync(resolved)) {
      throw new Error('目标不存在。');
    }
    this.createSnapshot(rootPath, `delete-${path.basename(resolved)}`);
    fs.rmSync(resolved, { recursive: true, force: true });
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'entry.deleted',
      message: `删除 ${path.basename(resolved)}`,
      metadata: { targetPath: resolved }
    });
  }

  listSnapshots(rootPath: string) {
    const snapshotsRoot = path.join(rootPath, '.project', 'snapshots');
    if (!fs.existsSync(snapshotsRoot)) return [];
    return fs.readdirSync(snapshotsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => readJsonSafe<SnapshotInfo>(path.join(snapshotsRoot, entry.name, 'metadata.json'), {
        id: entry.name,
        label: entry.name,
        createdAt: new Date(0).toISOString()
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  createSnapshot(rootPath: string, label: string) {
    const snapshotId = `${compactTimestampToken()}-${randomUUID().slice(0, 8)}`;
    const snapshotRoot = path.join(rootPath, '.project', 'snapshots', snapshotId);
    ensureDir(snapshotRoot);

    const metadata: SnapshotInfo = {
      id: snapshotId,
      label,
      createdAt: new Date().toISOString()
    };

    for (const dirName of listManagedContentEntries(rootPath)) {
      const sourcePath = path.join(rootPath, dirName);
      if (!fs.existsSync(sourcePath)) continue;
      copyRecursive(sourcePath, path.join(snapshotRoot, dirName));
    }
    const projectRoot = path.join(rootPath, '.project');
    if (fs.existsSync(projectRoot)) {
      ensureDir(path.join(snapshotRoot, '.project'));
      for (const fileName of METADATA_FILES) {
        const filePath = path.join(projectRoot, fileName);
        if (fs.existsSync(filePath)) {
          copyRecursive(filePath, path.join(snapshotRoot, '.project', fileName));
        }
      }
      for (const runtimeDir of PROJECT_RUNTIME_DIRS) {
        const sourceRuntimePath = path.join(projectRoot, runtimeDir);
        if (fs.existsSync(sourceRuntimePath)) {
          copyRecursive(sourceRuntimePath, path.join(snapshotRoot, '.project', runtimeDir));
        }
      }
    }

    writeJson(path.join(snapshotRoot, 'metadata.json'), metadata);
    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: metadata.createdAt,
      type: 'snapshot.created',
      message: `创建快照 ${label}`,
      metadata: { snapshotId }
    });
    return metadata;
  }

  restoreSnapshot(rootPath: string, snapshotId: string) {
    const snapshotRoot = path.join(rootPath, '.project', 'snapshots', snapshotId);
    if (!fs.existsSync(snapshotRoot)) {
      throw new Error('快照不存在。');
    }

    const operationId = `${compactTimestampToken()}-${randomUUID().slice(0, 8)}`;
    const restoreRoot = path.join(rootPath, '.project', 'snapshots', '.restore', operationId);
    const backupRoot = path.join(restoreRoot, 'backup');
    const stageRoot = path.join(restoreRoot, 'stage');
    const relativeRestoreRoot = path.relative(rootPath, restoreRoot).replace(/\\/g, '/');
    let replaceStarted = false;

    try {
      copyManagedProjectSubset(rootPath, backupRoot);
      copyManagedProjectSubset(snapshotRoot, stageRoot);
      validateRestoreStage(stageRoot);
      replaceStarted = true;
      replaceManagedProjectSubset(stageRoot, rootPath);
      removePathIfExists(restoreRoot);
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : String(error);
      let rollbackMessage = '';

      if (replaceStarted) {
        try {
          rollbackManagedProjectSubset(backupRoot, rootPath);
        } catch (rollbackError) {
          rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        }
      }

      const actionableError: ActionableErrorRecord = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        scope: 'project-migration',
        code: rollbackMessage ? 'SNAPSHOT_RESTORE_ROLLBACK_FAILED' : 'SNAPSHOT_RESTORE_FAILED',
        severity: 'critical',
        message: rollbackMessage
          ? `Snapshot restore failed and rollback also failed. ${failureMessage} Rollback error: ${rollbackMessage}`
          : replaceStarted
            ? `Snapshot restore failed after replacement started. ${failureMessage}`
            : `Snapshot restore failed before replacement started. ${failureMessage}`,
        targetId: snapshotId,
        retryable: !rollbackMessage,
        recoverable: true,
        suggestedActions: [
          'Inspect the preserved restore workspace for staged and backup contents.',
          'Retry the restore after fixing the underlying filesystem or permission issue.'
        ]
      };
      this.evidenceStore.persistActionableError(rootPath, actionableError);
      this.appendAudit(rootPath, {
        id: randomUUID(),
        createdAt: actionableError.createdAt,
        type: 'snapshot.restore.failed',
        message: actionableError.message,
        metadata: {
          snapshotId,
          restoreRoot: relativeRestoreRoot,
          actionableErrorId: actionableError.id,
          rollbackError: rollbackMessage || null
        }
      });
      throw new Error(`${actionableError.message} Recovery material kept at ${relativeRestoreRoot}.`);
    }

    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'snapshot.restored',
      message: `恢复快照 ${snapshotId}`,
      metadata: { snapshotId }
    });
    return this.openProject(rootPath);
  }

  listMarkdownFiles(rootPath: string) {
    const files: string[] = [];
    const visit = (dirPath: string) => {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.vite' || entry.name === '.project') continue;
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          visit(entryPath);
        } else if (entry.name.toLowerCase().endsWith('.md')) {
          files.push(entryPath);
        }
      }
    };
    visit(rootPath);
    return files.sort((left, right) => left.localeCompare(right));
  }

  listKnowledgeFiles(rootPath: string) {
    return this.listSearchableFiles(rootPath);
  }

  buildNoteReferenceGraph(rootPath: string): NoteReferenceGraph {
    const notePaths = this.listSearchableFiles(rootPath);
    const edges: NoteReferenceEdge[] = [];
    const unresolved: UnresolvedNoteReference[] = [];

    for (const sourcePath of notePaths) {
      const contents = fs.readFileSync(sourcePath, 'utf8');
      const lines = contents.split(/\r?\n/);

      lines.forEach((line, lineIndex) => {
        const markdownRegex = /(!)?\[[^\]]*]\(([^)]+)\)/g;
        let markdownMatch: RegExpExecArray | null;
        while ((markdownMatch = markdownRegex.exec(line))) {
          if (markdownMatch[1] === '!') continue;
          const rawTarget = markdownMatch[2]?.trim() ?? '';
          const targetPath = resolveMarkdownTarget(rootPath, sourcePath, rawTarget, notePaths);
          if (targetPath) {
            edges.push({
              id: randomUUID(),
              sourcePath,
              targetPath,
              targetTitle: noteTitle(targetPath),
              kind: 'markdown',
              rawTarget,
              line: lineIndex + 1
            });
          } else if (normalizeMarkdownTarget(rawTarget)) {
            unresolved.push({
              id: randomUUID(),
              sourcePath,
              sourceTitle: noteTitle(sourcePath),
              rawTarget,
              kind: 'markdown',
              line: lineIndex + 1
            });
          }
        }

        const wikiRegex = /\[\[([^\]]+)\]\]/g;
        let wikiMatch: RegExpExecArray | null;
        while ((wikiMatch = wikiRegex.exec(line))) {
          const rawTarget = wikiMatch[1]?.trim() ?? '';
          const targetPath = resolveWikiTarget(rootPath, sourcePath, rawTarget, notePaths);
          if (targetPath) {
            edges.push({
              id: randomUUID(),
              sourcePath,
              targetPath,
              targetTitle: noteTitle(targetPath),
              kind: 'wiki',
              rawTarget,
              line: lineIndex + 1
            });
          } else if (normalizeWikiTarget(rawTarget)) {
            unresolved.push({
              id: randomUUID(),
              sourcePath,
              sourceTitle: noteTitle(sourcePath),
              rawTarget,
              kind: 'wiki',
              line: lineIndex + 1
            });
          }
        }
      });
    }

    const documents = notePaths.map<NoteReferenceDocument>((filePath) => ({
      path: filePath,
      title: noteTitle(filePath),
      outbound: edges.filter((edge) => edge.sourcePath === filePath),
      inbound: edges.filter((edge) => edge.targetPath === filePath)
    }));

    return {
      generatedAt: new Date().toISOString(),
      documents: sortReferenceDocuments(documents),
      edges: edges.sort((left, right) =>
        left.sourcePath.localeCompare(right.sourcePath)
        || left.targetPath.localeCompare(right.targetPath)
        || left.line - right.line
      ),
      unresolved: unresolved.sort((left, right) =>
        left.sourcePath.localeCompare(right.sourcePath)
        || left.rawTarget.localeCompare(right.rawTarget)
        || left.line - right.line
      )
    };
  }

  compareNoteReferences(rootPath: string, basePath: string, comparePath: string): NoteReferenceComparison {
    const graph = this.buildNoteReferenceGraph(rootPath);
    const base = graph.documents.find((document) => document.path === basePath);
    const compare = graph.documents.find((document) => document.path === comparePath);
    if (!base || !compare) {
      throw new Error('无法比较引用关系：目标笔记不存在。');
    }

    const graphMap = new Map(graph.documents.map((document) => [document.path, document]));
    const buildList = (paths: string[]) =>
      sortReferenceDocuments(paths.map((itemPath) => graphMap.get(itemPath)).filter(Boolean) as NoteReferenceDocument[]);
    const splitSets = (left: string[], right: string[]) => {
      const leftSet = new Set(left);
      const rightSet = new Set(right);
      return {
        shared: [...leftSet].filter((item) => rightSet.has(item)),
        leftOnly: [...leftSet].filter((item) => !rightSet.has(item)),
        rightOnly: [...rightSet].filter((item) => !leftSet.has(item))
      };
    };

    const outboundSplit = splitSets(
      base.outbound.map((edge) => edge.targetPath),
      compare.outbound.map((edge) => edge.targetPath)
    );
    const inboundSplit = splitSets(
      base.inbound.map((edge) => edge.sourcePath),
      compare.inbound.map((edge) => edge.sourcePath)
    );

    return {
      basePath,
      comparePath,
      sharedOutbound: buildList(outboundSplit.shared),
      baseOnlyOutbound: buildList(outboundSplit.leftOnly),
      compareOnlyOutbound: buildList(outboundSplit.rightOnly),
      sharedInbound: buildList(inboundSplit.shared),
      baseOnlyInbound: buildList(inboundSplit.leftOnly),
      compareOnlyInbound: buildList(inboundSplit.rightOnly)
    };
  }

  searchProjectContent(rootPath: string, query: string): ProjectSearchResult[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    const results: ProjectSearchResult[] = [];
    for (const filePath of this.listSearchableFiles(rootPath)) {
      const contents = fs.readFileSync(filePath, 'utf8');
      const lines = contents.split(/\r?\n/);
      let matchCount = 0;
      const matchesInFile: ProjectSearchResult[] = [];

      lines.forEach((line, lineIndex) => {
        const lower = line.toLowerCase();
        let startIndex = 0;
        let firstColumn = -1;
        while (startIndex < lower.length) {
          const foundAt = lower.indexOf(normalizedQuery, startIndex);
          if (foundAt === -1) break;
          if (firstColumn === -1) {
            firstColumn = foundAt + 1;
          }
          matchCount += 1;
          startIndex = foundAt + normalizedQuery.length;
        }

        if (firstColumn !== -1 && matchesInFile.length < 6) {
          matchesInFile.push({
            path: filePath,
            name: path.basename(filePath),
            line: lineIndex + 1,
            column: firstColumn,
            preview: line.trim() || '(空行)',
            matchCount: 0
          });
        }
      });

      if (!matchCount) continue;
      for (const result of matchesInFile) {
        results.push({ ...result, matchCount });
      }
    }

    return results
      .sort((left, right) => right.matchCount - left.matchCount || left.path.localeCompare(right.path) || left.line - right.line)
      .slice(0, 80);
  }

  getRelevantDocumentChanges(rootPath: string, anchorPaths: string[], limit = 5) {
    return this.documentChangeService.getRelevantDocumentChanges(rootPath, anchorPaths, limit);
  }

  buildRecentChangeContext(rootPath: string, anchorPaths: string[], limit = 4) {
    return this.documentChangeService.buildRecentChangeContext(rootPath, anchorPaths, limit);
  }

  buildDocumentContext(rootPath: string, documentPaths: string[], maxCharsPerDocument = 800) {
    return this.documentChangeService.buildDocumentContext(rootPath, documentPaths, maxCharsPerDocument);
  }

  importTextFiles(rootPath: string, parentPath: string, sourcePaths: string[]) {
    const targetDirectory = this.resolveProjectPath(rootPath, parentPath);
    ensureDir(targetDirectory);
    const importedPaths: string[] = [];

    for (const sourcePath of sourcePaths) {
      const ext = path.extname(sourcePath).toLowerCase();
      if (!['.md', '.markdown', '.txt'].includes(ext)) continue;
      const targetPath = uniquePath(path.join(targetDirectory, slugifyImportName(path.basename(sourcePath))));
      fs.copyFileSync(sourcePath, targetPath);
      importedPaths.push(targetPath);
    }

    if (importedPaths.length) {
      this.appendAudit(rootPath, {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        type: 'document.imported',
        message: `导入 ${importedPaths.length} 个外部文档`,
        metadata: { parentPath: targetDirectory }
      });
    }

    return importedPaths;
  }

  importImageAsset(rootPath: string, documentPath: string, fileName: string, bytes: Buffer) {
    const safeName = slugifyImportName(fileName || `image-${Date.now()}.png`);
    const ext = path.extname(safeName) || '.png';
    const normalizedName = safeName.endsWith(ext) ? safeName : `${safeName}${ext}`;
    const assetPath = uniquePath(path.join(rootPath, 'assets', 'images', normalizedName));
    ensureDir(path.dirname(assetPath));
    fs.writeFileSync(assetPath, bytes);

    const relativePath = path.relative(path.dirname(documentPath), assetPath).replace(/\\/g, '/');
    const markdown = `![${path.basename(assetPath, path.extname(assetPath))}](${relativePath})`;

    this.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: 'image.imported',
      message: `导入图片 ${path.basename(assetPath)}`,
      metadata: { documentPath, assetPath }
    });

    return { assetPath, markdown };
  }

  private inferProjectRoot(targetPath: string) {
    let current = path.dirname(path.resolve(targetPath));
    while (true) {
      if (this.validateProject(current)) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  }

  private listSearchableFiles(rootPath: string) {
    const files: string[] = [];
    const visit = (dirPath: string) => {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.vite' || entry.name === '.git' || entry.name === '.project') continue;
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'assets' && dirPath === rootPath) continue;
          visit(entryPath);
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (['.md', '.markdown', '.txt'].includes(ext)) {
          files.push(entryPath);
        }
      }
    };
    visit(rootPath);
    return files.sort((left, right) => left.localeCompare(right));
  }

  private scanTree(rootPath: string, currentPath = rootPath): FileNode[] {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    const nodes = entries
      .filter((entry) => !(currentPath === rootPath && (entry.name === 'node_modules' || entry.name === '.vite' || entry.name === '.project')))
      .map((entry) => {
        const entryPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: entryPath,
            type: 'directory' as const,
            children: this.scanTree(rootPath, entryPath)
          };
        }
        return {
          name: entry.name,
          path: entryPath,
          type: 'file' as const
        };
      });
    return sortNodes(nodes);
  }

  private createDefaultSessions(templateName: string, starterPrompt: string): AiSession[] {
    return [
      {
        id: randomUUID(),
        title: '初始需求会话',
        stage: 'discover',
        summary: `用于收集 ${templateName} 的一句话目标并完成第一轮澄清。`,
        pinned: true,
        archived: false,
        contextControls: {
          pinnedDocumentPaths: [],
          excludedDocumentPaths: [],
          updatedAt: new Date().toISOString()
        },
        messages: [
          {
            id: randomUUID(),
            role: 'assistant',
            content: starterPrompt,
            createdAt: new Date().toISOString()
          }
        ]
      }
    ];
  }
}
