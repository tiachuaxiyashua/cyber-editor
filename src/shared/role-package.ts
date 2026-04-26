import fs from 'node:fs';
import path from 'node:path';
import type {
  PlatformModelPolicy,
  PlatformRole,
  RemoteRoleCatalogItem,
  RolePackage,
  RolePackageManifest,
  RolePackageValidationIssue
} from './types';
import type { DependencyInstallMode, DependencyKind, DependencySpecItem } from './orchestration-contracts';
import { computeRolePackageStatus, ensureRolePackageSections } from './platform-bindings';
import { assertSafeFilePathSegment, normalizeSafeRelativePackagePath } from './resource-path-guard';

const BLOCKED_SEGMENTS = new Set([
  '..',
  '.exe',
  '.dll',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.com',
  '.msi',
  '.jar'
]);

const ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml']);

const OPTIONAL_ROLE_FILES = ['SOUL.md', 'USER.md', 'MEMORY/MEMORY.md', 'Skills/skills.json'] as const;
const REQUIRED_ROLE_FILES = ['role.json', 'IDENTITY.md', 'AGENTS.md'] as const;

export type RolePackageDirectorySnapshot = {
  rootPath: string;
  manifestPath: string;
  rolePackage: RolePackage;
  defaultSkillIds: string[];
  allowedCapabilities: string[];
  dependencySpec: DependencySpecItem[];
  modelPolicy?: PlatformModelPolicy;
  sections: Required<NonNullable<PlatformRole['packageSections']>>;
  issues: RolePackageValidationIssue[];
};

function parseDependencySpec(raw: unknown): DependencySpecItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id.trim() : '',
      kind: (item.kind === 'plugin' || item.kind === 'connector' || item.kind === 'mcp_server'
        ? item.kind
        : 'skill') as DependencyKind,
      required: Boolean(item.required),
      installMode: (item.installMode === 'embedded' || item.installMode === 'registry' || item.installMode === 'url'
        ? item.installMode
        : 'builtin') as DependencyInstallMode,
      source: typeof item.source === 'string' ? item.source : undefined,
      version: typeof item.version === 'string' ? item.version : undefined
    }))
    .filter((item) => item.id.length > 0);
}

function hasBlockedSegment(filePath: string) {
  const lowered = filePath.toLowerCase();
  if (lowered.includes('..')) return true;
  for (const segment of BLOCKED_SEGMENTS) {
    if (lowered.includes(segment)) return true;
  }
  return false;
}

function extensionOf(filePath: string) {
  const match = /\.[^.\\/]+$/.exec(filePath.toLowerCase());
  return match?.[0] ?? '';
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function collectRoleFiles(rootPath: string, currentPath = rootPath) {
  const files: RolePackage['files'] = [];
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRoleFiles(rootPath, entryPath));
      continue;
    }
    const relativePath = path.relative(rootPath, entryPath).replace(/\\/g, '/');
    if (!ALLOWED_EXTENSIONS.has(extensionOf(relativePath))) continue;
    files.push({
      path: relativePath,
      content: fs.readFileSync(entryPath, 'utf8')
    });
  }
  return files.sort((left, right) => left.path.localeCompare(right.path, 'en'));
}

function issue(
  code: string,
  severity: RolePackageValidationIssue['severity'],
  message: string,
  filePath?: string
): RolePackageValidationIssue {
  return {
    code,
    severity,
    message,
    path: filePath
  };
}

function parseRoleManifest(raw: Record<string, unknown>, fallback: RolePackageManifest): RolePackageManifest {
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : fallback.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : fallback.name,
    version: typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim() : fallback.version,
    description: typeof raw.description === 'string' ? raw.description : fallback.description,
    source: typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : fallback.source,
    icon: typeof raw.icon === 'string' ? raw.icon : fallback.icon,
    domain: typeof raw.domain === 'string' ? raw.domain : fallback.domain,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((item): item is string => typeof item === 'string') : fallback.tags,
    defaultSkillIds: Array.isArray(raw.defaultSkillIds)
      ? raw.defaultSkillIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : fallback.defaultSkillIds,
    allowedCapabilities: Array.isArray(raw.allowedCapabilities)
      ? raw.allowedCapabilities.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : fallback.allowedCapabilities,
    modelPolicy: raw.modelPolicy && typeof raw.modelPolicy === 'object'
      ? raw.modelPolicy as PlatformModelPolicy
      : fallback.modelPolicy,
    dependencySpec: parseDependencySpec(raw.dependencySpec ?? fallback.dependencySpec)
  };
}

export function parseRolePackage(raw: string) {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Role package must be a JSON object.');
  }

  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
    throw new Error('Role package is missing a valid id.');
  }
  const roleId = assertSafeFilePathSegment(candidate.id.trim(), 'Role package id');
  if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
    throw new Error('Role package is missing a valid name.');
  }
  if (typeof candidate.version !== 'string' || !candidate.version.trim()) {
    throw new Error('Role package is missing a valid version.');
  }
  if (typeof candidate.description !== 'string') {
    throw new Error('Role package is missing a valid description.');
  }
  if (typeof candidate.source !== 'string' || !candidate.source.trim()) {
    throw new Error('Role package is missing a valid source.');
  }
  if (!Array.isArray(candidate.files) || candidate.files.length === 0) {
    throw new Error('Role package must contain at least one file.');
  }

  const files = candidate.files.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Role package file entry is invalid.');
    }
    const file = entry as Record<string, unknown>;
    if (typeof file.path !== 'string' || typeof file.content !== 'string') {
      throw new Error('Role package file entry must include path and content.');
    }
    const normalizedPath = normalizeSafeRelativePackagePath(file.path, 'Role package file path');
    if (hasBlockedSegment(normalizedPath)) {
      throw new Error(`Role package file path is not safe: ${file.path}`);
    }
    if (!ALLOWED_EXTENSIONS.has(extensionOf(normalizedPath))) {
      throw new Error(`Role package file type is not allowed: ${file.path}`);
    }
    return {
      path: normalizedPath,
      content: file.content
    };
  });

  return {
    id: roleId,
    name: candidate.name,
    version: candidate.version,
    description: candidate.description,
    source: candidate.source,
    icon: typeof candidate.icon === 'string' ? candidate.icon : undefined,
    domain: typeof candidate.domain === 'string' ? candidate.domain : undefined,
    tags: Array.isArray(candidate.tags)
      ? candidate.tags.filter((item): item is string => typeof item === 'string')
      : [],
    files
  } satisfies RolePackage;
}

export function buildRolePackageFromPlatformRole(role: PlatformRole, source = 'project'): RolePackage {
  const sections = ensureRolePackageSections(role);
  const promptHint = [sections.identity, sections.soul, sections.agents].filter(Boolean).join('\n\n');
  const manifest = {
    id: role.id,
    name: role.name,
    version: role.packageVersion ?? '1.0.0',
    description: role.description,
    source,
    domain: role.domain,
    defaultSkillIds: role.allowedSkillIds ?? [],
    allowedCapabilities: role.allowedCapabilities,
    modelPolicy: role.modelPolicy,
    dependencySpec: []
  };

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    source: manifest.source,
    domain: manifest.domain,
    tags: [],
    files: [
      { path: 'role.json', content: JSON.stringify(manifest, null, 2) },
      { path: 'IDENTITY.md', content: sections.identity },
      { path: 'SOUL.md', content: sections.soul },
      { path: 'AGENTS.md', content: sections.agents },
      { path: 'USER.md', content: sections.user },
      { path: 'MEMORY/MEMORY.md', content: sections.memory },
      { path: 'Skills/skills.json', content: JSON.stringify({ skillIds: role.allowedSkillIds ?? [] }, null, 2) },
      { path: 'prompt-hint.md', content: promptHint }
    ]
  };
}

export function loadRolePackageDirectory(dirPath: string): RolePackageDirectorySnapshot {
  const resolvedPath = path.resolve(dirPath);
  const roleJsonPath = path.join(resolvedPath, 'role.json');
  const legacyManifestPath = path.join(resolvedPath, 'role-package.json');
  const manifestPath = fs.existsSync(roleJsonPath) ? roleJsonPath : legacyManifestPath;
  const issues: RolePackageValidationIssue[] = [];
  const files = collectRoleFiles(resolvedPath);
  const fileSet = new Set(files.map((file) => file.path));

  for (const requiredFile of REQUIRED_ROLE_FILES) {
    if (!fileSet.has(requiredFile)) {
      issues.push(issue('ROLE_PACKAGE_REQUIRED_FILE_MISSING', 'error', `Missing required role file: ${requiredFile}`, requiredFile));
    }
  }
  for (const optionalFile of OPTIONAL_ROLE_FILES) {
    if (!fileSet.has(optionalFile)) {
      issues.push(issue('ROLE_PACKAGE_OPTIONAL_FILE_MISSING', 'warning', `Missing optional role file: ${optionalFile}`, optionalFile));
    }
  }

  const manifestRaw = fs.existsSync(manifestPath)
    ? readJsonSafe<Record<string, unknown>>(manifestPath, {})
    : {};
  if (!fs.existsSync(manifestPath)) {
    issues.push(issue('ROLE_PACKAGE_MANIFEST_MISSING', 'error', 'Missing role.json manifest.', 'role.json'));
  }

  const fallbackManifest: RolePackageManifest = {
    id: path.basename(resolvedPath),
    name: path.basename(resolvedPath),
    version: '1.0.0',
    description: '',
    source: `local:${resolvedPath}`,
    tags: []
  };
  const manifest = parseRoleManifest(manifestRaw, fallbackManifest);
  const skillPayload = readJsonSafe<{ skillIds?: string[] }>(
    path.join(resolvedPath, 'Skills', 'skills.json'),
    { skillIds: [] }
  );
  const defaultSkillIds = Array.isArray(skillPayload.skillIds)
    ? skillPayload.skillIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : Array.isArray(manifestRaw.defaultSkillIds)
      ? (manifestRaw.defaultSkillIds as unknown[]).filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  const allowedCapabilities = Array.isArray(manifestRaw.allowedCapabilities)
    ? (manifestRaw.allowedCapabilities as unknown[]).filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const dependencySpec = parseDependencySpec(manifestRaw.dependencySpec);

  const modelPolicy = manifestRaw.modelPolicy && typeof manifestRaw.modelPolicy === 'object'
    ? manifestRaw.modelPolicy as PlatformModelPolicy
    : undefined;

  const sections = {
    identity: fs.existsSync(path.join(resolvedPath, 'IDENTITY.md')) ? fs.readFileSync(path.join(resolvedPath, 'IDENTITY.md'), 'utf8') : '',
    soul: fs.existsSync(path.join(resolvedPath, 'SOUL.md')) ? fs.readFileSync(path.join(resolvedPath, 'SOUL.md'), 'utf8') : '',
    agents: fs.existsSync(path.join(resolvedPath, 'AGENTS.md')) ? fs.readFileSync(path.join(resolvedPath, 'AGENTS.md'), 'utf8') : '',
    user: fs.existsSync(path.join(resolvedPath, 'USER.md')) ? fs.readFileSync(path.join(resolvedPath, 'USER.md'), 'utf8') : '',
    memory: fs.existsSync(path.join(resolvedPath, 'MEMORY', 'MEMORY.md')) ? fs.readFileSync(path.join(resolvedPath, 'MEMORY', 'MEMORY.md'), 'utf8') : ''
  };
  if (!sections.identity.trim()) {
    issues.push(issue('ROLE_PACKAGE_IDENTITY_EMPTY', 'error', 'IDENTITY.md must not be empty.', 'IDENTITY.md'));
  }
  if (!sections.agents.trim()) {
    issues.push(issue('ROLE_PACKAGE_AGENTS_EMPTY', 'error', 'AGENTS.md must not be empty.', 'AGENTS.md'));
  }

  return {
    rootPath: resolvedPath,
    manifestPath,
    rolePackage: {
      ...manifest,
      files
    },
    defaultSkillIds,
    allowedCapabilities,
    dependencySpec,
    modelPolicy,
    sections,
    issues
  };
}

export function rolePackageToPlatformRole(snapshot: RolePackageDirectorySnapshot): PlatformRole {
  const promptHint = [snapshot.sections.identity, snapshot.sections.soul, snapshot.sections.agents]
    .filter((item) => item.trim().length > 0)
    .join('\n\n');
  return {
    id: snapshot.rolePackage.id,
    name: snapshot.rolePackage.name,
    domain: snapshot.rolePackage.domain,
    description: snapshot.rolePackage.description,
    packageSections: snapshot.sections,
    packageStatus: computeRolePackageStatus({
      name: snapshot.rolePackage.name,
      description: snapshot.rolePackage.description,
      promptHint,
      packageSections: snapshot.sections
    }),
    packageVersion: snapshot.rolePackage.version,
    promptHint,
    allowedSkillIds: snapshot.defaultSkillIds,
    allowedCapabilities: snapshot.allowedCapabilities,
    outputSchema: 'markdown',
    outputFormat: 'markdown',
    modelPolicy: snapshot.modelPolicy ?? {
      mode: 'fallback_to_active',
      preferredProfileIds: [],
      fallbackToActive: true
    }
  };
}

export function rolePackageToCatalogItem(input: RolePackage, packageUrl: string, sourceLabel: string): RemoteRoleCatalogItem {
  return {
    id: input.id,
    name: input.name,
    version: input.version,
    description: input.description,
    source: sourceLabel,
    packageUrl,
    icon: input.icon,
    domain: input.domain,
    tags: input.tags ?? []
  };
}
