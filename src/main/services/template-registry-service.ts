import fs from 'node:fs';
import path from 'node:path';
import type { ProjectTemplateDefinition, ProjectTemplatePackage } from '../../shared/types';
import { assertSafeFilePathSegment } from '../../shared/resource-path-guard';
import { parseTemplatePackage } from '../../shared/template-package';
import { resolveElectronAppRoot, resolveElectronUserDataRoot } from './electron-paths';
import { ResourceGovernanceService, type GovernedImport } from './resource-governance-service';
import { fetchRemoteTextWithLimits } from './remote-fetch-guard';

type InstalledTemplateRecord = {
  id: string;
  name: string;
  packageFile: string;
  installedAt: string;
  packageUrl?: string;
  version?: string;
  availableVersion?: string;
  lastCheckedAt?: string;
  trust?: ProjectTemplateDefinition['trust'];
  compatibility?: ProjectTemplateDefinition['compatibility'];
  issueMessage?: string;
  verificationId?: string;
};

type InstalledTemplateEntry = {
  record: InstalledTemplateRecord;
  templatePackage: ProjectTemplatePackage | null;
  parseError: string | null;
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

function normalizeTemplateVersion(version?: string) {
  const normalized = version?.trim();
  return normalized || '1.0.0';
}

function compareTemplateVersions(left?: string, right?: string) {
  const leftParts = normalizeTemplateVersion(left).split('.').map((value) => Number.parseInt(value, 10) || 0);
  const rightParts = normalizeTemplateVersion(right).split('.').map((value) => Number.parseInt(value, 10) || 0);
  const max = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < max; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }
  return 0;
}

function inferInstalledSource(packageUrl?: string): ProjectTemplateDefinition['source'] {
  if (!packageUrl) return 'local';
  if (/^https?:\/\//i.test(packageUrl)) return 'remote';
  return 'local';
}

function enrichTemplateDefinition(
  templatePackage: ProjectTemplatePackage,
  options?: {
    installedAt?: string;
    packageUrl?: string;
    trust?: ProjectTemplateDefinition['trust'];
    compatibility?: ProjectTemplateDefinition['compatibility'];
    health?: ProjectTemplateDefinition['health'];
    issueMessage?: string;
    repairable?: boolean;
    updatable?: boolean;
    availableVersion?: string;
  }
): ProjectTemplateDefinition {
  const definition = templatePackage.definition;
  const artifactPreview = Array.from(
    new Set(
      Object.values(templatePackage.runtime.template.stageDocuments)
        .flat()
        .map((document) => document.title)
        .filter(Boolean)
    )
  ).slice(0, 4);

  return {
    ...definition,
    version: normalizeTemplateVersion(definition.version),
    installedAt: options?.installedAt,
    packageUrl: options?.packageUrl,
    defaultFlowName: templatePackage.platform.flows[0]?.name,
    flowCount: templatePackage.platform.flows.length,
    subflowCount: templatePackage.platform.subflows.length,
    roleCount: templatePackage.platform.roles.length,
    connectorCount: templatePackage.platform.connectors.length,
    toolCount: templatePackage.platform.tools.length,
    artifactCount: Object.values(templatePackage.runtime.template.stageDocuments).reduce((count, documents) => count + documents.length, 0),
    artifactPreview,
    trust: options?.trust ?? (definition.source === 'builtin' ? 'trusted' : 'review'),
    compatibility: options?.compatibility ?? 'current',
    health: options?.health ?? (
      options?.availableVersion && compareTemplateVersions(options.availableVersion, definition.version) > 0
        ? 'update-available'
        : 'healthy'
    ),
    issueMessage: options?.issueMessage,
    repairable: options?.repairable ?? false,
    updatable: options?.updatable ?? false
  };
}

function buildCorruptTemplateDefinition(record: InstalledTemplateRecord, errorMessage: string): ProjectTemplateDefinition {
  const source = inferInstalledSource(record.packageUrl);
  return {
    id: record.id,
    name: record.name,
    version: normalizeTemplateVersion(record.version),
    shortDescription: 'Template package is corrupt and requires repair or reinstall.',
    description: 'This template package can no longer be parsed and has been blocked from use. Repair the recorded source or reinstall the package before using it again.',
    icon: 'workflow',
    category: 'product',
    source,
    starterPrompt: '',
    requirementDocName: 'discover.md',
    packageUrl: record.packageUrl,
    installedAt: record.installedAt,
    trust: 'blocked',
    compatibility: 'unknown',
    health: 'corrupt',
    issueMessage: errorMessage,
    repairable: Boolean(record.packageUrl && !record.packageUrl.startsWith('project:')),
    updatable: Boolean(record.packageUrl && /^https?:\/\//i.test(record.packageUrl))
  };
}

export class TemplateRegistryService {
  constructor(private readonly resourceGovernance = new ResourceGovernanceService()) {}

  private readonly registryRoot = path.join(resolveElectronUserDataRoot(), 'templates');
  private readonly indexFile = path.join(this.registryRoot, 'index.json');
  private readonly builtInTemplateCandidates = Array.from(new Set([
    path.join(resolveElectronAppRoot(), 'src', 'shared', 'template-packages'),
    path.join(process.cwd(), 'src', 'shared', 'template-packages')
  ]));

  private listBuiltInPackages() {
    const merged = new Map<string, ProjectTemplatePackage>();
    for (const candidate of this.builtInTemplateCandidates) {
      if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) continue;
      const packages = fs.readdirSync(candidate)
        .filter((entry) => entry.endsWith('.json'))
        .map((entry) => {
          try {
            return parseTemplatePackage(fs.readFileSync(path.join(candidate, entry), 'utf8'));
          } catch {
            return null;
          }
        })
        .filter((entry): entry is ProjectTemplatePackage => Boolean(entry));
      for (const templatePackage of packages) {
        merged.set(templatePackage.definition.id, templatePackage);
      }
    }
    return Array.from(merged.values()).sort((left, right) => left.definition.name.localeCompare(right.definition.name, 'zh-CN'));
  }

  listTemplates() {
    const installed = this.readInstalledPackages();
    const merged = new Map<string, ProjectTemplateDefinition>();

    for (const templatePackage of this.listBuiltInPackages()) {
      merged.set(templatePackage.definition.id, enrichTemplateDefinition(templatePackage, {
        trust: 'trusted',
        compatibility: 'current',
        health: 'healthy'
      }));
    }

    for (const entry of installed) {
      if (!entry.templatePackage) {
        merged.set(entry.record.id, buildCorruptTemplateDefinition(entry.record, entry.parseError || 'Template package parsing failed.'));
        continue;
      }

      const inferredSource = inferInstalledSource(entry.record.packageUrl);
      merged.set(entry.templatePackage.definition.id, {
        ...enrichTemplateDefinition(entry.templatePackage, {
          installedAt: entry.record.installedAt,
          packageUrl: entry.record.packageUrl,
          trust: entry.record.trust ?? (inferredSource === 'remote' ? 'review' : 'review'),
          compatibility: entry.record.compatibility ?? 'current',
          health: entry.record.availableVersion && compareTemplateVersions(entry.record.availableVersion, entry.templatePackage.definition.version) > 0
            ? 'update-available'
            : 'healthy',
          issueMessage: entry.record.issueMessage,
          repairable: Boolean(entry.record.packageUrl && !entry.record.packageUrl.startsWith('project:')),
          updatable: Boolean(entry.record.packageUrl && /^https?:\/\//i.test(entry.record.packageUrl)),
          availableVersion: entry.record.availableVersion
        }),
        source: inferredSource
      });
    }

    return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

  getTemplateDefinition(templateId?: string) {
    const templates = this.listTemplates();
    return templates.find((item) => item.id === templateId) ?? templates[0];
  }

  getTemplatePackage(templateId: string) {
    return this.listBuiltInPackages().find((item) => item.definition.id === templateId)
      ?? this.readInstalledPackages().find((entry) => entry.templatePackage?.definition.id === templateId)?.templatePackage
      ?? null;
  }

  installFromPath(targetPath: string, options?: { approved?: boolean }) {
    const resolved = path.resolve(targetPath);
    const governed = this.resourceGovernance.verifyTemplateImportFromPath(resolved);
    if (!governed.packageValue || governed.review.trust === 'blocked') {
      throw new Error(governed.actionableError?.message || governed.review.summary);
    }
    if (governed.review.trust === 'review' && !options?.approved) {
      throw new Error('Template import requires explicit review approval before installation.');
    }
    return this.installPackage(governed.packageValue, `local:${resolved}`, {
      trust: governed.review.trust,
      compatibility: governed.review.compatibility,
      issueMessage: governed.review.summary,
      verificationId: governed.verification.id
    });
  }

  async inspectTemplatePackageFromUrl(packageUrl: string): Promise<GovernedImport<ProjectTemplatePackage>> {
    if (!packageUrl.trim()) {
      throw new Error('Template package URL is required.');
    }
    try {
      const raw = await fetchRemoteTextWithLimits(packageUrl, {
        label: 'Template package',
        maxBytes: 2 * 1024 * 1024,
        timeoutMs: 15_000
      });
      const templatePackage = parseTemplatePackage(raw);
      return this.resourceGovernance.verifyTemplateImportFromPackage(templatePackage, packageUrl, packageUrl);
    } catch (error) {
      if (error instanceof Error && /download failed|timed out|allowed size/i.test(error.message)) {
        throw error;
      }
      return this.resourceGovernance.createMalformedImportFromSource(
        'template',
        packageUrl,
        packageUrl,
        path.basename(packageUrl, path.extname(packageUrl)) || 'template-import',
        error
      );
    }
  }

  async installFromUrl(packageUrl: string, options?: { approved?: boolean }) {
    const governed = await this.inspectTemplatePackageFromUrl(packageUrl);
    if (!governed.packageValue || governed.review.trust === 'blocked') {
      throw new Error(governed.actionableError?.message || governed.review.summary);
    }
    if (governed.review.trust === 'review' && !options?.approved) {
      throw new Error('Template import requires explicit review approval before installation.');
    }
    return this.installPackage(governed.packageValue, packageUrl, {
      trust: governed.review.trust,
      compatibility: governed.review.compatibility,
      issueMessage: governed.review.summary,
      verificationId: governed.verification.id
    });
  }

  async checkForUpdate(templateId: string) {
    const index = this.readIndex();
    const record = index.find((item) => item.id === templateId);
    if (!record?.packageUrl || !/^https?:\/\//i.test(record.packageUrl)) {
      return this.getTemplateDefinition(templateId) ?? null;
    }

    const remotePackage = parseTemplatePackage(await fetchRemoteTextWithLimits(record.packageUrl, {
      label: 'Template package',
      maxBytes: 2 * 1024 * 1024,
      timeoutMs: 15_000
    }));
    record.availableVersion = normalizeTemplateVersion(remotePackage.definition.version);
    record.lastCheckedAt = new Date().toISOString();
    writeJson(this.indexFile, index);
    return this.getTemplateDefinition(templateId) ?? null;
  }

  async repairTemplate(templateId: string) {
    const record = this.readIndex().find((item) => item.id === templateId);
    if (!record?.packageUrl) {
      throw new Error('The current template does not have a repairable source.');
    }

    if (/^https?:\/\//i.test(record.packageUrl)) {
      await this.installFromUrl(record.packageUrl, { approved: true });
      return this.getTemplateDefinition(templateId);
    }

    if (record.packageUrl.startsWith('local:')) {
      this.installFromPath(record.packageUrl.slice('local:'.length), { approved: true });
      return this.getTemplateDefinition(templateId);
    }

    throw new Error('The current template source does not support automatic repair.');
  }

  async updateTemplate(templateId: string) {
    const record = this.readIndex().find((item) => item.id === templateId);
    if (!record?.packageUrl || !/^https?:\/\//i.test(record.packageUrl)) {
      throw new Error('The current template does not have an updatable remote source.');
    }
    await this.installFromUrl(record.packageUrl, { approved: true });
    return this.getTemplateDefinition(templateId);
  }

  installPackageObject(
    templatePackage: ProjectTemplatePackage,
    packageUrl?: string,
    metadata?: {
      trust?: ProjectTemplateDefinition['trust'];
      compatibility?: ProjectTemplateDefinition['compatibility'];
      issueMessage?: string;
      verificationId?: string;
    }
  ) {
    return this.installPackage(templatePackage, packageUrl, metadata);
  }

  private installPackage(
    templatePackage: ProjectTemplatePackage,
    packageUrl?: string,
    metadata?: {
      trust?: ProjectTemplateDefinition['trust'];
      compatibility?: ProjectTemplateDefinition['compatibility'];
      issueMessage?: string;
      verificationId?: string;
    }
  ) {
    const installedAt = new Date().toISOString();
    const templateId = assertSafeFilePathSegment(templatePackage.definition.id, 'Template id');
    const targetRoot = path.join(this.registryRoot, 'installed', templateId);
    fs.rmSync(targetRoot, { recursive: true, force: true });
    ensureDir(targetRoot);
    const packageFile = path.join(targetRoot, 'template-package.json');
    writeJson(packageFile, templatePackage);

    const index = this.readIndex().filter((item) => item.id !== templateId);
    index.push({
      id: templateId,
      name: templatePackage.definition.name,
      packageFile,
      installedAt,
      packageUrl,
      version: normalizeTemplateVersion(templatePackage.definition.version),
      trust: metadata?.trust,
      compatibility: metadata?.compatibility,
      issueMessage: metadata?.issueMessage,
      verificationId: metadata?.verificationId
    });
    writeJson(this.indexFile, index);
    return templatePackage.definition;
  }

  private readIndex() {
    return readJsonSafe<InstalledTemplateRecord[]>(this.indexFile, []);
  }

  private readInstalledPackages(): InstalledTemplateEntry[] {
    const entries: Array<InstalledTemplateEntry | null> = this.readIndex()
      .map((record): InstalledTemplateEntry | null => {
        if (!fs.existsSync(record.packageFile)) return null;
        try {
          const templatePackage = parseTemplatePackage(fs.readFileSync(record.packageFile, 'utf8'));
          return { record, templatePackage, parseError: null };
        } catch (error) {
          return {
            record,
            templatePackage: null,
            parseError: error instanceof Error ? error.message : 'Template package parsing failed.'
          };
        }
      });
    return entries.filter((entry): entry is InstalledTemplateEntry => entry !== null);
  }
}

