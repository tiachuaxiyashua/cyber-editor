import fs from 'node:fs';
import path from 'node:path';
import type {
  AppStage,
  InstalledSkill,
  RemoteSkillCatalogItem,
  ResourceCompatibilityState,
  ResourceTrustState,
  SkillPackage
} from '../../shared/types';
import { getBuiltinSkillCatalog, getBuiltinSkillPackage } from '../../shared/builtin-skill-packages';
import { assertSafeFilePathSegment, normalizeSafeRelativePackagePath } from '../../shared/resource-path-guard';
import { parseSkillPackage } from '../../shared/skill-package';
import { resolveElectronUserDataRoot } from './electron-paths';
import { fetchRemoteJsonWithLimits, fetchRemoteTextWithLimits, isRetryableRemoteFetchError } from './remote-fetch-guard';
import { ResourceGovernanceService, type GovernedImport } from './resource-governance-service';
import { retryWithBackoff } from './runtime-errors';

const ALL_STAGES: AppStage[] = ['discover', 'clarify', 'plan', 'draft', 'review', 'finalize'];

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
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

function collectSkillFiles(rootPath: string, currentPath = rootPath) {
  const files: SkillPackage['files'] = [];
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSkillFiles(rootPath, entryPath));
      continue;
    }
    if (!/\.(md|txt|json|ya?ml)$/i.test(entry.name)) continue;
    files.push({
      path: path.relative(rootPath, entryPath).replace(/\\/g, '/'),
      content: fs.readFileSync(entryPath, 'utf8')
    });
  }
  return files;
}

function inferPackageFromDirectory(dirPath: string): SkillPackage {
  const manifestPath = path.join(dirPath, 'manifest.json');
  const files = collectSkillFiles(dirPath);
  if (!files.length) {
    throw new Error('Skill directory does not contain importable markdown/json content.');
  }
  const manifest = fs.existsSync(manifestPath)
    ? readJson<Record<string, unknown>>(manifestPath, {})
    : {};
  const directoryName = path.basename(dirPath);
  const applicableStages = Array.isArray(manifest.applicableStages)
    ? manifest.applicableStages.filter((item): item is AppStage => typeof item === 'string')
    : ALL_STAGES;
  return parseSkillPackage(JSON.stringify({
    id: typeof manifest.id === 'string' && manifest.id.trim() ? manifest.id : directoryName,
    name: typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name : directoryName,
    version: typeof manifest.version === 'string' && manifest.version.trim() ? manifest.version : '1.0.0',
    description: typeof manifest.description === 'string' ? manifest.description : `Imported from ${directoryName}.`,
    source: typeof manifest.source === 'string' && manifest.source.trim() ? manifest.source : `local:${dirPath}`,
    applicableStages: applicableStages.length ? applicableStages : ALL_STAGES,
    files
  }));
}

export class SkillRegistryService {
  constructor(private readonly resourceGovernance = new ResourceGovernanceService()) {}

  private readonly registryRoot = path.join(resolveElectronUserDataRoot(), 'skills');
  private readonly indexFile = path.join(this.registryRoot, 'index.json');

  listInstalled() {
    return readJson<InstalledSkill[]>(this.indexFile, []).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

  private async fetchRemoteJson<T>(url: string, label: string) {
    try {
      return await retryWithBackoff(
        async () => fetchRemoteJsonWithLimits<T>(url, {
          label,
          maxBytes: 1024 * 1024,
          timeoutMs: 12_000
        }),
        3,
        250,
        (error) => isRetryableRemoteFetchError(error)
      );
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : `${label} download failed.`);
    }
  }

  private async fetchRemoteText(url: string, label: string) {
    try {
      return await retryWithBackoff(
        async () => fetchRemoteTextWithLimits(url, {
          label,
          maxBytes: 1024 * 1024,
          timeoutMs: 12_000
        }),
        3,
        250,
        (error) => isRetryableRemoteFetchError(error)
      );
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : `${label} download failed.`);
    }
  }

  async loadCatalog(catalogUrl?: string) {
    if (!catalogUrl) {
      return getBuiltinSkillCatalog();
    }

    const resolvedPath = path.resolve(catalogUrl);
    if (fs.existsSync(resolvedPath)) {
      return this.loadLocalCatalog(resolvedPath);
    }

    const payload = await this.fetchRemoteJson<RemoteSkillCatalogItem[]>(catalogUrl, 'Skill catalog');
    if (!Array.isArray(payload)) {
      throw new Error('Skill catalog payload is invalid.');
    }
    return payload;
  }

  async inspectPackageFromUrl(packageUrl: string): Promise<GovernedImport<SkillPackage>> {
    if (!packageUrl.trim()) {
      throw new Error('Skill package URL is required.');
    }

    if (packageUrl.startsWith('builtin://')) {
      const skillId = packageUrl.replace('builtin://', '').trim();
      const skillPackage = getBuiltinSkillPackage(skillId);
      if (!skillPackage) {
        throw new Error(`Built-in skill not found: ${skillId}`);
      }
      return this.resourceGovernance.verifySkillImportFromPackage(skillPackage, packageUrl, packageUrl);
    }

    const raw = await this.fetchRemoteText(packageUrl, 'Skill package');
    try {
      const skillPackage = parseSkillPackage(raw);
      return this.resourceGovernance.verifySkillImportFromPackage(skillPackage, packageUrl, packageUrl);
    } catch (error) {
      return this.resourceGovernance.createMalformedImportFromSource(
        'skill',
        packageUrl,
        packageUrl,
        path.basename(packageUrl, path.extname(packageUrl)) || 'skill-import',
        error
      );
    }
  }

  async installFromUrl(packageUrl: string, options?: { approved?: boolean }) {
    const governed = await this.inspectPackageFromUrl(packageUrl);
    if (!governed.packageValue || governed.review.trust === 'blocked') {
      throw new Error(governed.actionableError?.message || governed.review.summary);
    }
    if (governed.review.trust === 'review' && !options?.approved) {
      throw new Error('Skill import requires explicit review approval before installation.');
    }
    return this.installPackage(governed.packageValue, packageUrl, {
      trust: governed.review.trust,
      compatibility: governed.review.compatibility,
      issueMessage: governed.review.summary,
      verificationId: governed.verification.id
    });
  }

  installFromPath(targetPath: string, options?: { approved?: boolean }) {
    const resolvedPath = path.resolve(targetPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Skill path not found: ${resolvedPath}`);
    }
    const governed = this.resourceGovernance.verifySkillImportFromPath(resolvedPath);
    if (!governed.packageValue || governed.review.trust === 'blocked') {
      throw new Error(governed.actionableError?.message || governed.review.summary);
    }
    if (governed.review.trust === 'review' && !options?.approved) {
      throw new Error('Skill import requires explicit review approval before installation.');
    }
    return this.installPackage(governed.packageValue, `local:${resolvedPath}`, {
      trust: governed.review.trust,
      compatibility: governed.review.compatibility,
      issueMessage: governed.review.summary,
      verificationId: governed.verification.id
    });
  }

  installPackage(
    skillPackage: SkillPackage,
    sourceUrl?: string,
    metadata?: {
      trust?: ResourceTrustState;
      compatibility?: ResourceCompatibilityState;
      issueMessage?: string;
      verificationId?: string;
      provenance?: InstalledSkill['provenance'];
    }
  ) {
    const skillId = assertSafeFilePathSegment(skillPackage.id, 'Skill id');
    const installedSkill: InstalledSkill = {
      id: skillId,
      name: skillPackage.name,
      version: skillPackage.version,
      description: skillPackage.description,
      source: sourceUrl || skillPackage.source,
      applicableStages: skillPackage.applicableStages,
      installedAt: new Date().toISOString(),
      fileCount: skillPackage.files.length,
      trust: metadata?.trust,
      compatibility: metadata?.compatibility,
      issueMessage: metadata?.issueMessage,
      verificationId: metadata?.verificationId,
      provenance: metadata?.provenance
    };
    const installedRoot = path.join(this.registryRoot, 'installed');
    const targetRoot = path.join(installedRoot, skillId);
    const stagingRoot = path.join(installedRoot, '.staging', `${skillId}-${Date.now()}`);
    const backupRoot = path.join(installedRoot, '.backup', `${skillId}-${Date.now()}`);
    const current = this.listInstalled().filter((item) => item.id !== installedSkill.id);
    const previousEntry = this.listInstalled().find((item) => item.id === installedSkill.id) ?? null;
    let promoted = false;

    try {
      fs.rmSync(stagingRoot, { recursive: true, force: true });
      ensureDir(stagingRoot);
      for (const file of skillPackage.files) {
        const targetPath = path.join(stagingRoot, normalizeSafeRelativePackagePath(file.path, 'Skill file path'));
        ensureDir(path.dirname(targetPath));
        fs.writeFileSync(targetPath, file.content, 'utf8');
      }
      if (fs.existsSync(targetRoot)) {
        fs.rmSync(backupRoot, { recursive: true, force: true });
        ensureDir(path.dirname(backupRoot));
        fs.renameSync(targetRoot, backupRoot);
      }
      ensureDir(path.dirname(targetRoot));
      fs.renameSync(stagingRoot, targetRoot);
      promoted = true;
      current.push(installedSkill);
      writeJson(this.indexFile, current);
      writeJson(path.join(targetRoot, 'manifest.json'), installedSkill);
      fs.rmSync(backupRoot, { recursive: true, force: true });
      return installedSkill;
    } catch (error) {
      fs.rmSync(stagingRoot, { recursive: true, force: true });
      if (promoted) {
        fs.rmSync(targetRoot, { recursive: true, force: true });
      }
      if (fs.existsSync(backupRoot)) {
        ensureDir(path.dirname(targetRoot));
        fs.renameSync(backupRoot, targetRoot);
        if (previousEntry) {
          const restored = this.listInstalled().filter((item) => item.id !== previousEntry.id);
          restored.push(previousEntry);
          writeJson(this.indexFile, restored);
        }
      }
      throw error;
    }
  }

  removeSkill(skillId: string, references: string[]) {
    if (references.length) {
      throw new Error(`Skill is still referenced and cannot be removed: ${references.join(', ')}`);
    }
    const safeSkillId = assertSafeFilePathSegment(skillId, 'Skill id');
    const targetRoot = path.join(this.registryRoot, 'installed', safeSkillId);
    fs.rmSync(targetRoot, { recursive: true, force: true });
    const current = this.listInstalled().filter((item) => item.id !== safeSkillId);
    writeJson(this.indexFile, current);
    return true;
  }

  readSkillInstructions(skillIds: string[]) {
    return skillIds.flatMap((skillId) => {
      const safeSkillId = assertSafeFilePathSegment(skillId, 'Skill id');
      const targetRoot = path.join(this.registryRoot, 'installed', safeSkillId);
      if (!fs.existsSync(targetRoot)) return [];
      const segments: string[] = [];
      const visit = (dirPath: string) => {
        for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
          const entryPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            visit(entryPath);
          } else if (entry.name.toLowerCase().endsWith('.md')) {
            segments.push(fs.readFileSync(entryPath, 'utf8'));
          }
        }
      };
      visit(targetRoot);
      return segments.map((segment, index) => `# Skill ${safeSkillId} / ${index + 1}\n${segment}`);
    }).join('\n\n');
  }

  private loadLocalCatalog(targetPath: string) {
    const stat = fs.statSync(targetPath);
    const packageEntries = stat.isDirectory()
      ? this.collectCatalogEntries(targetPath)
      : [targetPath];

    return packageEntries.map((entryPath) => {
      const entryStat = fs.statSync(entryPath);
      const skillPackage = entryStat.isDirectory()
        ? inferPackageFromDirectory(entryPath)
        : parseSkillPackage(fs.readFileSync(entryPath, 'utf8'));
      return {
        id: skillPackage.id,
        name: skillPackage.name,
        version: skillPackage.version,
        description: skillPackage.description,
        source: `Local catalog: ${path.basename(entryPath)}`,
        packageUrl: entryPath,
        applicableStages: skillPackage.applicableStages
      } satisfies RemoteSkillCatalogItem;
    }).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

  private collectCatalogEntries(directoryPath: string) {
    const manifestPath = path.join(directoryPath, 'manifest.json');
    const skillFile = path.join(directoryPath, 'skill-package.json');
    const skillMarkdown = path.join(directoryPath, 'SKILL.md');
    if (fs.existsSync(manifestPath) || fs.existsSync(skillFile) || fs.existsSync(skillMarkdown)) {
      return [directoryPath];
    }

    return fs.readdirSync(directoryPath, { withFileTypes: true })
      .map((entry) => path.join(directoryPath, entry.name))
      .filter((entryPath) => {
        try {
          const entryStat = fs.statSync(entryPath);
          if (entryStat.isDirectory()) return true;
          return /\.(json)$/i.test(entryPath);
        } catch {
          return false;
        }
      });
  }
}
