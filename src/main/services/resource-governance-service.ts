import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ActionableErrorRecord,
  ProjectTemplatePackage,
  ResourceCompatibilityState,
  ResourceHealthState,
  ResourceKind,
  ResourceTrustState,
  ResourceVerificationRecord,
  ReviewGateIssue,
  ReviewGateReport,
  RolePackage,
  SkillPackage
} from '../../shared/types';
import { parseRolePackage } from '../../shared/role-package';
import { parseSkillPackage } from '../../shared/skill-package';
import { parseTemplatePackage } from '../../shared/template-package';

export type GovernedImport<T> = {
  packageValue: T | null;
  review: ReviewGateReport;
  verification: ResourceVerificationRecord;
  actionableError?: ActionableErrorRecord;
};

const BLOCKED_EXTENSIONS = new Set(['.exe', '.dll', '.bat', '.cmd', '.ps1', '.sh', '.com', '.msi', '.jar']);

function collectBlockedFiles(rootPath: string, currentPath = rootPath, acc: string[] = []) {
  const stat = fs.statSync(currentPath);
  if (stat.isFile()) {
    const ext = path.extname(currentPath).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      acc.push(currentPath);
    }
    return acc;
  }
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    collectBlockedFiles(rootPath, path.join(currentPath, entry.name), acc);
  }
  return acc;
}

function buildReview(
  kind: ResourceKind,
  targetId: string,
  sourceLabel: string,
  issues: ReviewGateIssue[],
  defaults?: {
    trust?: ResourceTrustState;
    compatibility?: ResourceCompatibilityState;
    health?: ResourceHealthState;
  }
) {
  const trust = defaults?.trust
    ?? (issues.some((item) => item.severity === 'error') ? 'blocked' : issues.length ? 'review' : 'trusted');
  const compatibility = defaults?.compatibility ?? 'current';
  const health = defaults?.health ?? (issues.some((item) => item.severity === 'error') ? 'corrupt' : issues.length ? 'warning' : 'healthy');
  const recommendedAction = trust === 'blocked'
    ? 'block'
    : trust === 'review'
      ? 'approve'
      : 'install';
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    scope: 'resource-import' as const,
    targetKind: kind,
    targetId,
    sourceLabel,
    trust,
    compatibility,
    health,
    summary: issues.length ? issues.map((item) => item.message).join(' ') : 'Import verified.',
    issues,
    recommendedAction: recommendedAction as ReviewGateReport['recommendedAction']
  };
}

function buildVerification(
  kind: ResourceKind,
  resourceId: string,
  sourceLabel: string,
  sourcePath: string,
  review: ReviewGateReport
): ResourceVerificationRecord {
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    kind,
    resourceId,
    sourceLabel,
    sourcePath,
    trust: review.trust,
    compatibility: review.compatibility,
    health: review.health,
    issueMessage: review.issues.map((item) => item.message).join(' '),
    reviewGateId: review.id
  };
}

export class ResourceGovernanceService {
  verifyTemplateImportFromPath(targetPath: string): GovernedImport<ProjectTemplatePackage> {
    const resolvedPath = path.resolve(targetPath);
    const blockedFiles = fs.existsSync(resolvedPath) ? collectBlockedFiles(resolvedPath) : [];
    if (blockedFiles.length) {
      return this.buildBlockedImport(
        'template',
        resolvedPath,
        path.basename(resolvedPath, path.extname(resolvedPath)) || 'template-import',
        `Blocked executable files detected: ${blockedFiles.map((item) => path.basename(item)).join(', ')}`
      );
    }
    try {
      const filePath = this.resolveTemplateFile(resolvedPath);
      const packageValue = parseTemplatePackage(fs.readFileSync(filePath, 'utf8'));
      return this.verifyTemplateImportFromPackage(packageValue, `local:${resolvedPath}`, resolvedPath);
    } catch (error) {
      return this.buildMalformedImport(
        'template',
        resolvedPath,
        path.basename(resolvedPath, path.extname(resolvedPath)) || 'template-import',
        error
      );
    }
  }

  verifySkillImportFromPath(targetPath: string): GovernedImport<SkillPackage> {
    const resolvedPath = path.resolve(targetPath);
    const blockedFiles = fs.existsSync(resolvedPath) ? collectBlockedFiles(resolvedPath) : [];
    if (blockedFiles.length) {
      return this.buildBlockedImport(
        'skill',
        resolvedPath,
        path.basename(resolvedPath, path.extname(resolvedPath)) || 'skill-import',
        `Blocked executable files detected: ${blockedFiles.map((item) => path.basename(item)).join(', ')}`
      );
    }
    try {
      const stat = fs.statSync(resolvedPath);
      const packageValue = stat.isDirectory()
        ? this.inferSkillPackageFromDirectory(resolvedPath)
        : parseSkillPackage(fs.readFileSync(resolvedPath, 'utf8'));
      return this.verifySkillImportFromPackage(packageValue, `local:${resolvedPath}`, resolvedPath);
    } catch (error) {
      return this.buildMalformedImport(
        'skill',
        resolvedPath,
        path.basename(resolvedPath, path.extname(resolvedPath)) || 'skill-import',
        error
      );
    }
  }

  verifyRolePackageImportFromPath(targetPath: string): GovernedImport<RolePackage> {
    const resolvedPath = path.resolve(targetPath);
    const blockedFiles = fs.existsSync(resolvedPath) ? collectBlockedFiles(resolvedPath) : [];
    if (blockedFiles.length) {
      return this.buildBlockedImport(
        'role-package',
        resolvedPath,
        path.basename(resolvedPath, path.extname(resolvedPath)) || 'role-package-import',
        `Blocked executable files detected: ${blockedFiles.map((item) => path.basename(item)).join(', ')}`
      );
    }
    try {
      const stat = fs.statSync(resolvedPath);
      const packageValue = stat.isDirectory()
        ? this.inferRolePackageFromDirectory(resolvedPath)
        : parseRolePackage(fs.readFileSync(resolvedPath, 'utf8'));
      return this.verifyRolePackageImportFromPackage(packageValue, `local:${resolvedPath}`, resolvedPath);
    } catch (error) {
      return this.buildMalformedImport(
        'role-package',
        resolvedPath,
        path.basename(resolvedPath, path.extname(resolvedPath)) || 'role-package-import',
        error
      );
    }
  }

  createBlockedImportError(
    kind: ResourceKind,
    targetPath: string,
    message: string,
    code = 'LOCAL_IMPORT_TRUST_BLOCKED',
    suggestedActions = ['Remove the blocked executable content from the package.', 'Retry the import after verification.']
  ): ActionableErrorRecord {
    return {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      scope: 'resource-import',
      code,
      severity: 'critical',
      message,
      targetId: targetPath,
      retryable: false,
      recoverable: true,
      suggestedActions
    };
  }

  verifyTemplateImportFromPackage(
    packageValue: ProjectTemplatePackage,
    sourceLabel: string,
    sourcePath = sourceLabel
  ): GovernedImport<ProjectTemplatePackage> {
    const issues: ReviewGateIssue[] = [];
    const defaults = this.buildRemoteDefaults(sourceLabel);
    if (defaults) {
      issues.push({
        code: 'template.remote-source',
        severity: 'warning',
        message: 'Remote template package requires explicit review approval before installation.'
      });
    }
    if (packageValue.platform.tools.length > 0) {
      issues.push({ code: 'template.tools.present', severity: 'warning', message: 'Template contains script tools and requires review.' });
    }
    if (packageValue.platform.connectors.length > 0) {
      issues.push({ code: 'template.connectors.present', severity: 'warning', message: 'Template contains connectors and requires review.' });
    }
    return this.finalizeImport('template', packageValue.definition.id, packageValue, sourceLabel, sourcePath, issues, defaults);
  }

  verifySkillImportFromPackage(
    packageValue: SkillPackage,
    sourceLabel: string,
    sourcePath = sourceLabel
  ): GovernedImport<SkillPackage> {
    const issues: ReviewGateIssue[] = [];
    const defaults = this.buildRemoteDefaults(sourceLabel);
    if (defaults) {
      issues.push({
        code: 'skill.remote-source',
        severity: 'warning',
        message: 'Remote skill package requires explicit review approval before installation.'
      });
    }
    if (!packageValue.files.some((item) => item.path.toLowerCase() === 'skill.md')) {
      issues.push({ code: 'skill.missing-root-skill-md', severity: 'warning', message: 'Skill package is missing a root SKILL.md and requires review.' });
    }
    return this.finalizeImport('skill', packageValue.id, packageValue, sourceLabel, sourcePath, issues, defaults);
  }

  verifyRolePackageImportFromPackage(
    packageValue: RolePackage,
    sourceLabel: string,
    sourcePath = sourceLabel
  ): GovernedImport<RolePackage> {
    const issues: ReviewGateIssue[] = [];
    const defaults = this.buildRemoteDefaults(sourceLabel);
    if (defaults) {
      issues.push({
        code: 'role-package.remote-source',
        severity: 'warning',
        message: 'Remote role package requires explicit review approval before installation.'
      });
    }
    const lowerPaths = new Set(packageValue.files.map((item) => item.path.toLowerCase()));
    for (const requiredPath of ['identity.md', 'soul.md', 'agents.md', 'user.md']) {
      if (!lowerPaths.has(requiredPath)) {
        issues.push({ code: `role.missing-${requiredPath}`, severity: 'warning', message: `Role package is missing ${requiredPath}.` });
      }
    }
    return this.finalizeImport('role-package', packageValue.id, packageValue, sourceLabel, sourcePath, issues, defaults);
  }

  createMalformedImportFromSource<T>(
    kind: ResourceKind,
    sourceLabel: string,
    sourcePath: string,
    resourceId: string,
    error: unknown
  ): GovernedImport<T> {
    return this.buildMalformedImport(kind, sourcePath, resourceId, error, sourceLabel);
  }

  private buildBlockedImport<T>(kind: ResourceKind, resolvedPath: string, resourceId: string, message: string): GovernedImport<T> {
    const sourceLabel = `local:${resolvedPath}`;
    const review = buildReview(
      kind,
      resourceId,
      sourceLabel,
      [{ code: `${kind}.blocked-content`, severity: 'error', message }],
      { trust: 'blocked', compatibility: 'incompatible', health: 'corrupt' }
    );
    return {
      packageValue: null,
      review,
      verification: buildVerification(kind, resourceId, sourceLabel, resolvedPath, review),
      actionableError: this.createBlockedImportError(kind, resolvedPath, message)
    };
  }

  private buildMalformedImport<T>(
    kind: ResourceKind,
    resolvedPath: string,
    resourceId: string,
    error: unknown,
    sourceLabel = `local:${resolvedPath}`
  ): GovernedImport<T> {
    const message = error instanceof Error ? error.message : String(error);
    const sourceKind = /^https?:\/\//i.test(sourceLabel) ? 'remote' : 'local';
    const summary = `Failed to parse ${sourceKind} ${kind} package: ${message}`;
    const review = buildReview(
      kind,
      resourceId,
      sourceLabel,
      [{ code: `${kind}.malformed-package`, severity: 'error', message: summary }],
      { trust: 'blocked', compatibility: 'incompatible', health: 'corrupt' }
    );
    return {
      packageValue: null,
      review,
      verification: buildVerification(kind, resourceId, sourceLabel, resolvedPath, review),
      actionableError: this.createBlockedImportError(
        kind,
        sourceLabel,
        summary,
        sourceKind === 'remote' ? 'REMOTE_IMPORT_PARSE_FAILED' : 'LOCAL_IMPORT_PARSE_FAILED',
        sourceKind === 'remote'
          ? ['Verify the remote package URL points to a valid package manifest.', 'Retry the import after fixing the remote package.']
          : ['Fix the package manifest or schema errors.', 'Retry the import with a valid package.']
      )
    };
  }

  private finalizeImport<T>(
    kind: ResourceKind,
    resourceId: string,
    packageValue: T,
    sourceLabel: string,
    sourcePath: string,
    issues: ReviewGateIssue[],
    defaults?: {
      trust?: ResourceTrustState;
      compatibility?: ResourceCompatibilityState;
      health?: ResourceHealthState;
    }
  ): GovernedImport<T> {
    const review = buildReview(kind, resourceId, sourceLabel, issues, defaults);
    return {
      packageValue,
      review,
      verification: buildVerification(kind, resourceId, sourceLabel, sourcePath, review)
    };
  }

  private buildRemoteDefaults(sourceLabel: string) {
    if (!/^https?:\/\//i.test(sourceLabel)) {
      return undefined;
    }
    return {
      trust: 'review' as const,
      compatibility: 'current' as const,
      health: 'warning' as const
    };
  }

  private resolveTemplateFile(resolvedPath: string) {
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Template path not found: ${resolvedPath}`);
    }
    const stat = fs.statSync(resolvedPath);
    const filePath = stat.isDirectory() ? path.join(resolvedPath, 'template-package.json') : resolvedPath;
    if (!fs.existsSync(filePath)) {
      throw new Error('Template directory is missing template-package.json.');
    }
    return filePath;
  }

  private inferSkillPackageFromDirectory(dirPath: string) {
    const manifestPath = path.join(dirPath, 'manifest.json');
    const files = this.collectPackageFiles(dirPath);
    const manifest = fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
      : {};
    const directoryName = path.basename(dirPath);
    return parseSkillPackage(JSON.stringify({
      id: typeof manifest.id === 'string' && manifest.id.trim() ? manifest.id : directoryName,
      name: typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name : directoryName,
      version: typeof manifest.version === 'string' && manifest.version.trim() ? manifest.version : '1.0.0',
      description: typeof manifest.description === 'string' ? manifest.description : `Imported from ${directoryName}.`,
      source: typeof manifest.source === 'string' && manifest.source.trim() ? manifest.source : `local:${dirPath}`,
      applicableStages: Array.isArray(manifest.applicableStages) ? manifest.applicableStages : ['discover', 'clarify', 'plan', 'draft', 'review', 'finalize'],
      files
    }));
  }

  private inferRolePackageFromDirectory(dirPath: string) {
    const manifestPath = path.join(dirPath, 'role-package.json');
    const files = this.collectPackageFiles(dirPath);
    const manifest = fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
      : {};
    const directoryName = path.basename(dirPath);
    return parseRolePackage(JSON.stringify({
      id: typeof manifest.id === 'string' && manifest.id.trim() ? manifest.id : directoryName,
      name: typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name : directoryName,
      version: typeof manifest.version === 'string' && manifest.version.trim() ? manifest.version : '1.0.0',
      description: typeof manifest.description === 'string' ? manifest.description : `Imported from ${directoryName}.`,
      source: typeof manifest.source === 'string' && manifest.source.trim() ? manifest.source : `local:${dirPath}`,
      icon: typeof manifest.icon === 'string' ? manifest.icon : undefined,
      domain: typeof manifest.domain === 'string' ? manifest.domain : undefined,
      tags: Array.isArray(manifest.tags) ? manifest.tags : [],
      files
    }));
  }

  private collectPackageFiles(rootPath: string, currentPath = rootPath, acc: Array<{ path: string; content: string }> = []) {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        this.collectPackageFiles(rootPath, entryPath, acc);
        continue;
      }
      if (!/\.(md|txt|json|ya?ml)$/i.test(entry.name)) continue;
      acc.push({
        path: path.relative(rootPath, entryPath).replace(/\\/g, '/'),
        content: fs.readFileSync(entryPath, 'utf8')
      });
    }
    return acc;
  }
}
