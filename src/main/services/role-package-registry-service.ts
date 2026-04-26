import fs from 'node:fs';
import path from 'node:path';
import type {
  InstalledRolePackage,
  RemoteRoleCatalogItem,
  ResourceCompatibilityState,
  ResourceTrustState,
  RolePackage
} from '../../shared/types';
import {
  createEmptyDependencySummary,
  hasRequiredDependencyFailure,
  summarizeDependencyInstallResults
} from '../../shared/orchestration-contracts';
import { resolveElectronUserDataRoot } from './electron-paths';
import {
  loadRolePackageDirectory,
  parseRolePackage,
  rolePackageToCatalogItem
} from '../../shared/role-package';
import { assertSafeFilePathSegment, normalizeSafeRelativePackagePath } from '../../shared/resource-path-guard';
import { DependencyInstallerService } from './dependency-installer-service';
import { fetchRemoteJsonWithLimits, fetchRemoteTextWithLimits, isRetryableRemoteFetchError } from './remote-fetch-guard';
import { ResourceGovernanceService, type GovernedImport } from './resource-governance-service';
import { retryWithBackoff } from './runtime-errors';

const BUILT_IN_PACKAGES: Record<string, RolePackage> = {
  'general-writer': {
    id: 'general-writer',
    name: 'General Writer',
    version: '1.0.0',
    description: 'Drafts and refines general delivery artifacts.',
    source: 'builtin',
    icon: 'pen-square',
    domain: 'general',
    tags: ['writing', 'drafting'],
    files: [
      {
        path: 'role.json',
        content: JSON.stringify({
          id: 'general-writer',
          name: 'General Writer',
          version: '1.0.0',
          description: 'Drafts and refines general delivery artifacts.',
          source: 'builtin',
          defaultSkillIds: [],
          allowedCapabilities: ['read_artifact', 'write_artifact'],
          modelPolicy: {
            mode: 'fallback_to_active',
            preferredProfileIds: [],
            fallbackToActive: true
          }
        }, null, 2)
      },
      { path: 'IDENTITY.md', content: '# General Writer\nProduce clear, grounded drafts.' },
      { path: 'SOUL.md', content: 'Stay concise, structured, and delivery-oriented.' },
      { path: 'AGENTS.md', content: 'Collaborate with other roles without duplicating work.' },
      { path: 'USER.md', content: 'Default writer for proposal, plan, and review output.' },
      { path: 'MEMORY/MEMORY.md', content: 'Track recurring writing decisions and formatting norms.' },
      { path: 'Skills/skills.json', content: JSON.stringify({ skillIds: [] }, null, 2) }
    ]
  },
  'review-judge': {
    id: 'review-judge',
    name: 'Review Judge',
    version: '1.0.0',
    description: 'Evaluates output quality, risk, and adoption readiness.',
    source: 'builtin',
    icon: 'scale',
    domain: 'review',
    tags: ['review', 'judge'],
    files: [
      {
        path: 'role.json',
        content: JSON.stringify({
          id: 'review-judge',
          name: 'Review Judge',
          version: '1.0.0',
          description: 'Evaluates output quality, risk, and adoption readiness.',
          source: 'builtin',
          defaultSkillIds: [],
          allowedCapabilities: ['read_artifact'],
          modelPolicy: {
            mode: 'fallback_to_active',
            preferredProfileIds: [],
            fallbackToActive: true
          }
        }, null, 2)
      },
      { path: 'IDENTITY.md', content: '# Review Judge\nScore output quality and identify adoption blockers.' },
      { path: 'SOUL.md', content: 'Be critical, evidence-based, and explicit about risks.' },
      { path: 'AGENTS.md', content: 'Review the work of other agents and surface concrete findings.' },
      { path: 'USER.md', content: 'Default reviewer for quality, risk, and acceptance decisions.' },
      { path: 'MEMORY/MEMORY.md', content: 'Capture recurring review standards and known failure modes.' },
      { path: 'Skills/skills.json', content: JSON.stringify({ skillIds: [] }, null, 2) }
    ]
  }
};

const FALLBACK_CATALOG: RemoteRoleCatalogItem[] = Object.values(BUILT_IN_PACKAGES).map((item) =>
  rolePackageToCatalogItem(item, `builtin://${item.id}`, 'Built-in role package')
);

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

export class RolePackageRegistryService {
  constructor(
    private readonly resourceGovernance = new ResourceGovernanceService(),
    private readonly dependencyInstaller = new DependencyInstallerService()
  ) {}

  private readonly registryRoot = path.join(resolveElectronUserDataRoot(), 'role-packages');
  private readonly indexFile = path.join(this.registryRoot, 'index.json');

  private collectLocalCatalogEntries(targetPath: string) {
    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return [targetPath];
    }
    return fs.readdirSync(targetPath, { withFileTypes: true })
      .map((entry) => path.join(targetPath, entry.name))
      .filter((entryPath) => {
        try {
          const entryStat = fs.statSync(entryPath);
          return entryStat.isDirectory() || entryPath.endsWith('.json');
        } catch {
          return false;
        }
      });
  }

  private validateInstalledPackage(item: InstalledRolePackage): InstalledRolePackage {
    const packageRoot = item.packageRoot;
    if (!fs.existsSync(packageRoot)) {
      return {
        ...item,
        health: 'corrupt',
        lastValidatedAt: new Date().toISOString(),
        validationIssues: [{
          code: 'ROLE_PACKAGE_ROOT_MISSING',
          severity: 'error',
          message: 'Installed role package root is missing.',
          path: packageRoot
        }],
        issueMessage: 'Installed role package root is missing.'
      };
    }
    const snapshot = loadRolePackageDirectory(packageRoot);
    const dependencyResults = this.dependencyInstaller.installDependencies(snapshot.dependencySpec);
    const dependencySummary = snapshot.dependencySpec.length
      ? summarizeDependencyInstallResults(dependencyResults)
      : createEmptyDependencySummary();
    const hasDependencyWarning = hasRequiredDependencyFailure(dependencyResults);
    return {
      ...item,
      name: snapshot.rolePackage.name,
      version: snapshot.rolePackage.version,
      description: snapshot.rolePackage.description,
      manifestPath: snapshot.manifestPath,
      fileCount: snapshot.rolePackage.files.length,
      health: snapshot.issues.some((issue) => issue.severity === 'error')
        ? 'corrupt'
        : snapshot.issues.length || hasDependencyWarning
          ? 'warning'
          : 'healthy',
      lastValidatedAt: new Date().toISOString(),
      validationIssues: snapshot.issues,
      defaultSkillIds: snapshot.defaultSkillIds,
      allowedCapabilities: snapshot.allowedCapabilities,
      dependencySummary,
      issueMessage: snapshot.issues[0]?.message ?? dependencyResults.find((result) => result.state === 'failed')?.message,
      compatibility: item.compatibility ?? 'current'
    };
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

  listInstalled() {
    const current = readJson<InstalledRolePackage[]>(this.indexFile, []);
    const validated = current.map((item) => this.validateInstalledPackage(item));
    writeJson(this.indexFile, validated);
    return validated.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

  async loadCatalog(catalogUrl?: string) {
    if (!catalogUrl) {
      return FALLBACK_CATALOG;
    }

    const resolvedPath = path.resolve(catalogUrl);
    if (fs.existsSync(resolvedPath)) {
      return this.collectLocalCatalogEntries(resolvedPath).map((entryPath) => {
        const stat = fs.statSync(entryPath);
        const rolePackage = stat.isDirectory()
          ? loadRolePackageDirectory(entryPath).rolePackage
          : parseRolePackage(fs.readFileSync(entryPath, 'utf8'));
        return rolePackageToCatalogItem(rolePackage, entryPath, `Local catalog: ${path.basename(entryPath)}`);
      }).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
    }

    const payload = await this.fetchRemoteJson<RemoteRoleCatalogItem[]>(catalogUrl, 'Role catalog');
    if (!Array.isArray(payload)) {
      throw new Error('Role catalog payload is invalid.');
    }
    return payload;
  }

  async inspectPackageFromUrl(packageUrl: string): Promise<GovernedImport<RolePackage>> {
    if (!packageUrl.trim()) {
      throw new Error('Role package URL is required.');
    }
    if (packageUrl.startsWith('builtin://')) {
      const roleId = packageUrl.replace('builtin://', '').trim();
      const rolePackage = BUILT_IN_PACKAGES[roleId];
      if (!rolePackage) {
        throw new Error(`Built-in role package not found: ${roleId}`);
      }
      return this.resourceGovernance.verifyRolePackageImportFromPackage(rolePackage, packageUrl, packageUrl);
    }

    const raw = await this.fetchRemoteText(packageUrl, 'Role package');
    try {
      const rolePackage = parseRolePackage(raw);
      return this.resourceGovernance.verifyRolePackageImportFromPackage(rolePackage, packageUrl, packageUrl);
    } catch (error) {
      return this.resourceGovernance.createMalformedImportFromSource(
        'role-package',
        packageUrl,
        packageUrl,
        path.basename(packageUrl, path.extname(packageUrl)) || 'role-package-import',
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
      throw new Error('Role package import requires explicit review approval before installation.');
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
      throw new Error(`Role package path not found: ${resolvedPath}`);
    }
    const governed = this.resourceGovernance.verifyRolePackageImportFromPath(resolvedPath);
    if (!governed.packageValue || governed.review.trust === 'blocked') {
      throw new Error(governed.actionableError?.message || governed.review.summary);
    }
    if (governed.review.trust === 'review' && !options?.approved) {
      throw new Error('Role package import requires explicit review approval before installation.');
    }
    return this.installPackage(governed.packageValue, `local:${resolvedPath}`, {
      trust: governed.review.trust,
      compatibility: governed.review.compatibility,
      issueMessage: governed.review.summary,
      verificationId: governed.verification.id
    });
  }

  installPackage(
    rolePackage: RolePackage,
    sourceUrl?: string,
    metadata?: {
      trust?: ResourceTrustState;
      compatibility?: ResourceCompatibilityState;
      issueMessage?: string;
      verificationId?: string;
    }
  ) {
    const roleId = assertSafeFilePathSegment(rolePackage.id, 'Role package id');
    const targetRoot = path.join(this.registryRoot, 'installed', roleId);
    fs.rmSync(targetRoot, { recursive: true, force: true });
    ensureDir(targetRoot);

    for (const file of rolePackage.files) {
      const targetPath = path.join(targetRoot, normalizeSafeRelativePackagePath(file.path, 'Role package file path'));
      ensureDir(path.dirname(targetPath));
      fs.writeFileSync(targetPath, file.content, 'utf8');
    }

    const snapshot = loadRolePackageDirectory(targetRoot);
    const dependencyResults = this.dependencyInstaller.installDependencies(snapshot.dependencySpec);
    const dependencySummary = snapshot.dependencySpec.length
      ? summarizeDependencyInstallResults(dependencyResults)
      : createEmptyDependencySummary();
    const hasDependencyWarning = hasRequiredDependencyFailure(dependencyResults);
    const installed: InstalledRolePackage = {
      id: roleId,
      name: snapshot.rolePackage.name,
      version: snapshot.rolePackage.version,
      description: snapshot.rolePackage.description,
      source: sourceUrl || rolePackage.source,
      icon: rolePackage.icon,
      domain: rolePackage.domain,
      tags: rolePackage.tags ?? [],
      installedAt: new Date().toISOString(),
      fileCount: snapshot.rolePackage.files.length,
      packageRoot: targetRoot,
      manifestPath: snapshot.manifestPath,
      health: snapshot.issues.some((issue) => issue.severity === 'error')
        ? 'corrupt'
        : snapshot.issues.length || hasDependencyWarning
          ? 'warning'
          : 'healthy',
      lastValidatedAt: new Date().toISOString(),
      validationIssues: snapshot.issues,
      defaultSkillIds: snapshot.defaultSkillIds,
      allowedCapabilities: snapshot.allowedCapabilities,
      dependencySummary,
      trust: metadata?.trust,
      compatibility: metadata?.compatibility ?? 'current',
      issueMessage: snapshot.issues[0]?.message ?? dependencyResults.find((result) => result.state === 'failed')?.message ?? metadata?.issueMessage,
      verificationId: metadata?.verificationId
    };

    const current = this.listInstalled().filter((item) => item.id !== installed.id);
    current.push(installed);
    writeJson(this.indexFile, current);
    writeJson(path.join(targetRoot, 'manifest.json'), installed);
    return installed;
  }
}
