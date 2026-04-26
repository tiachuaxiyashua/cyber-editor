import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AiSession,
  AppDebugSettings,
  AppSettings,
  AppSettingsInput,
  DraftOrchestrationSnapshot,
  ProviderCapabilityMetadata,
  ProviderDiagnostic,
  ProviderKind,
  ProviderProfile,
  ProviderProfileInput,
  RecentDraftEntry,
  RecentProjectEntry,
  SidebarLayout
} from '../../shared/types';
import {
  createProviderSeed,
  defaultProviderCapabilities,
  defaultProviderDiagnostic,
  listProviderDefinitions
} from '../../shared/provider-registry';
import type { AppLogService } from './app-log-service';

type PersistedProviderProfile = {
  id: string;
  name: string;
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  encryptedApiKey: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  capabilities: ProviderCapabilityMetadata;
  diagnostics: ProviderDiagnostic;
};

type PersistedSettings = {
  theme: AppSettings['theme'];
  sidebar: SidebarLayout;
  debug: AppDebugSettings;
  provider: string;
  baseUrl: string;
  model: string;
  encryptedApiKey: string;
  providerProfiles: PersistedProviderProfile[];
  activeProviderProfileId: string;
  recentProjects: Array<string | Omit<RecentProjectEntry, 'available'>>;
  recentTemplates: string[];
  recentResources: string[];
  recentDrafts: Array<Omit<RecentDraftEntry, 'available'>>;
  lastProjectPath: string;
};

const DEFAULT_SIDEBAR: SidebarLayout = {
  leftWidth: 280,
  rightWidth: 380,
  leftCollapsed: false,
  rightCollapsed: false,
  activityView: 'project',
  processPanelOpen: false,
  processPanelTab: 'stage',
  documentSplitOpen: false,
  documentSplitRatio: 0.5,
  secondaryDocumentPath: ''
};

function nowIso() {
  return new Date().toISOString();
}

function createDefaultProfiles(): PersistedProviderProfile[] {
  const now = nowIso();
  return listProviderDefinitions().map((definition) => ({
    ...createProviderSeed(definition.kind),
    encryptedApiKey: '',
    createdAt: now,
    updatedAt: now
  }));
}

const DEFAULT_ACTIVE_PROVIDER = createProviderSeed('mock');

const DEFAULT_SETTINGS: PersistedSettings = {
  theme: 'system',
  sidebar: DEFAULT_SIDEBAR,
  debug: {
    liveLogConsoleEnabled: false
  },
  provider: DEFAULT_ACTIVE_PROVIDER.provider,
  baseUrl: DEFAULT_ACTIVE_PROVIDER.baseUrl,
  model: DEFAULT_ACTIVE_PROVIDER.model,
  encryptedApiKey: '',
  providerProfiles: createDefaultProfiles(),
  activeProviderProfileId: DEFAULT_ACTIVE_PROVIDER.id,
  recentProjects: [],
  recentTemplates: [],
  recentResources: [],
  recentDrafts: [],
  lastProjectPath: ''
};

function userDataPath(...segments: string[]) {
  return path.join(app.getPath('userData'), ...segments);
}

function ensureParent(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as T;
    if (Array.isArray(fallback)) {
      return (Array.isArray(parsed) ? parsed : fallback) as T;
    }
    if (fallback && typeof fallback === 'object' && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...fallback, ...parsed } as T;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

function writeJson<T>(filePath: string, value: T) {
  ensureParent(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function encryptSecret(value: string): string {
  if (!value) return '';
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64');
  }
  return Buffer.from(value, 'utf8').toString('base64');
}

function decryptSecret(value: string): string {
  if (!value) return '';
  const bytes = Buffer.from(value, 'base64');
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(bytes);
  }
  return bytes.toString('utf8');
}

function normalizeSidebarLayout(value?: Partial<SidebarLayout>): SidebarLayout {
  return {
    ...DEFAULT_SIDEBAR,
    ...value
  };
}

function isValidProjectDirectory(rootPath: string) {
  if (!rootPath) return false;
  return fs.existsSync(path.join(rootPath, '.project', 'manifest.json'))
    && fs.existsSync(path.join(rootPath, '.project', 'workflow-state.json'));
}

function normalizeRecentProjects(
  recentProjects: PersistedSettings['recentProjects']
): RecentProjectEntry[] {
  const seen = new Set<string>();
  const normalized: RecentProjectEntry[] = [];
  for (const entry of recentProjects) {
    const rootPath = path.resolve(typeof entry === 'string' ? entry : entry.rootPath);
    if (seen.has(rootPath)) continue;
    seen.add(rootPath);
    normalized.push({
      rootPath,
      name: typeof entry === 'string' ? path.basename(rootPath) || rootPath : entry.name || path.basename(rootPath) || rootPath,
      alias: typeof entry === 'string' ? undefined : entry.alias?.trim() || undefined,
      lastOpenedAt: typeof entry === 'string' ? new Date(0).toISOString() : entry.lastOpenedAt || new Date(0).toISOString(),
      available: isValidProjectDirectory(rootPath)
    });
  }
  return normalized
    .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt))
    .slice(0, 8);
}

function draftSnapshotPath(id: string) {
  return userDataPath('draft-orchestration', `${id}.json`);
}

function isValidDraftSnapshot(id?: string) {
  if (!id?.trim()) return false;
  try {
    const filePath = draftSnapshotPath(id.trim());
    if (!fs.existsSync(filePath)) return false;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as DraftOrchestrationSnapshot;
    return Boolean(parsed?.id && parsed.platform && parsed.runtimeTemplate && parsed.templatePackage);
  } catch {
    return false;
  }
}

function normalizeRecentDrafts(
  recentDrafts: PersistedSettings['recentDrafts']
): RecentDraftEntry[] {
  const seen = new Set<string>();
  const normalized: RecentDraftEntry[] = [];
  for (const entry of recentDrafts ?? []) {
    const id = entry.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      id,
      name: entry.name?.trim() || '编排草稿',
      templateId: entry.templateId?.trim() || undefined,
      templateName: entry.templateName?.trim() || undefined,
      updatedAt: entry.updatedAt || new Date(0).toISOString(),
      available: isValidDraftSnapshot(id)
    });
  }
  return normalized
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 8);
}

function toProfileView(profile: PersistedProviderProfile): ProviderProfile {
  const apiKey = decryptSecret(profile.encryptedApiKey);
  return {
    id: profile.id,
    name: profile.name,
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    model: profile.model,
    hasApiKey: Boolean(apiKey),
    apiKeyMasked: apiKey ? `••••••${apiKey.slice(-4)}` : '',
    enabled: profile.enabled,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    capabilities: profile.capabilities,
    diagnostics: profile.diagnostics
  };
}

function normalizeProfiles(stored: PersistedSettings): PersistedProviderProfile[] {
  const existing = stored.providerProfiles?.length ? stored.providerProfiles : [];
  const defaults = createDefaultProfiles();
  const merged = defaults.map((defaultProfile) => {
    const found = existing.find((item) => item.id === defaultProfile.id || item.provider === defaultProfile.provider);
    return {
      ...defaultProfile,
      ...found
    };
  });

  const extras = existing.filter((item) => !merged.some((mergedItem) => mergedItem.id === item.id));
  return [...merged, ...extras].map((profile) => ({
    ...profile,
    id: profile.id || randomUUID(),
    name: profile.name || profile.provider,
    createdAt: profile.createdAt || nowIso(),
    updatedAt: profile.updatedAt || nowIso(),
    enabled: profile.enabled !== false,
    capabilities: profile.capabilities ?? defaultProviderCapabilities(profile.provider),
    diagnostics: profile.diagnostics ?? defaultProviderDiagnostic()
  }));
}

function buildPersistedSettings(raw: PersistedSettings): PersistedSettings {
  const profiles = normalizeProfiles(raw);
  const activeProfile = profiles.find((item) => item.id === raw.activeProviderProfileId)
    ?? profiles.find((item) => item.enabled)
    ?? profiles[0];

  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    sidebar: normalizeSidebarLayout(raw.sidebar),
    providerProfiles: profiles,
    activeProviderProfileId: activeProfile.id,
    provider: activeProfile.provider,
    baseUrl: activeProfile.baseUrl,
    model: activeProfile.model,
    encryptedApiKey: activeProfile.encryptedApiKey
  };
}

function applyProfileInputs(
  current: PersistedSettings,
  inputs?: ProviderProfileInput[]
): PersistedProviderProfile[] {
  if (!inputs?.length) {
    return normalizeProfiles(current);
  }

  return inputs.map((input) => {
    const existing = normalizeProfiles(current).find((item) => item.id === input.id);
    const createdAt = existing?.createdAt ?? nowIso();
    const updatedAt = nowIso();
    return {
      id: input.id || existing?.id || randomUUID(),
      name: input.name.trim() || existing?.name || input.provider,
      provider: input.provider,
      baseUrl: input.baseUrl.trim(),
      model: input.model.trim(),
      encryptedApiKey:
        input.apiKey === undefined
          ? existing?.encryptedApiKey ?? ''
          : encryptSecret(input.apiKey),
      enabled: input.enabled !== false,
      createdAt,
      updatedAt,
      capabilities: input.capabilities ?? existing?.capabilities ?? defaultProviderCapabilities(input.provider),
      diagnostics: input.diagnostics ?? existing?.diagnostics ?? defaultProviderDiagnostic()
    };
  });
}

function updateLegacyActiveProfile(current: PersistedSettings, input: AppSettingsInput) {
  const profiles = normalizeProfiles(current);
  const active = profiles.find((item) => item.id === current.activeProviderProfileId) ?? profiles[0];
  const nextActive: PersistedProviderProfile = {
    ...active,
    provider: (input.provider as ProviderKind | undefined) ?? active.provider,
    baseUrl: input.baseUrl ?? active.baseUrl,
    model: input.model ?? active.model,
    encryptedApiKey: input.apiKey === undefined ? active.encryptedApiKey : encryptSecret(input.apiKey),
    updatedAt: nowIso(),
    capabilities: active.capabilities,
    diagnostics: active.diagnostics
  };
  return profiles.map((item) => (item.id === nextActive.id ? nextActive : item));
}

export class SettingsStore {
  private readonly settingsFile = userDataPath('settings.json');
  private readonly failedReadWarnings = new Set<string>();

  constructor(private readonly appLogService?: Pick<AppLogService, 'error'>) {}

  private readJsonWithFallback<T>(filePath: string, fallback: T, event: string, message: string) {
    try {
      if (!fs.existsSync(filePath)) {
        this.failedReadWarnings.delete(event);
        return fallback;
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as T;
      const value = Array.isArray(fallback)
        ? (Array.isArray(parsed) ? parsed : fallback)
        : (fallback
          && typeof fallback === 'object'
          && parsed
          && typeof parsed === 'object'
          && !Array.isArray(parsed)
          ? { ...fallback, ...parsed } as T
          : parsed);
      this.failedReadWarnings.delete(event);
      return value;
    } catch (error) {
      if (!this.failedReadWarnings.has(event)) {
        this.appLogService?.error({
          source: 'settings-store',
          event,
          message,
          metadata: { filePath },
          error
        });
        this.failedReadWarnings.add(event);
      }
      return fallback;
    }
  }

  private readPersisted() {
    const stored = this.readJsonWithFallback(
      this.settingsFile,
      DEFAULT_SETTINGS,
      'settings.read.failed',
      'Failed to read settings.json. Falling back to defaults.'
    );
    return buildPersistedSettings(stored);
  }

  private writePersisted(next: PersistedSettings) {
    writeJson(this.settingsFile, buildPersistedSettings(next));
  }

  private getActiveProfile(stored: PersistedSettings) {
    return stored.providerProfiles.find((item) => item.id === stored.activeProviderProfileId) ?? stored.providerProfiles[0];
  }

  getSettings(): AppSettings {
    const stored = this.readPersisted();
    const active = this.getActiveProfile(stored);
    const apiKey = decryptSecret(active.encryptedApiKey);
    return {
      theme: stored.theme,
      sidebar: normalizeSidebarLayout(stored.sidebar),
      debug: {
        ...DEFAULT_SETTINGS.debug,
        ...stored.debug
      },
      provider: active.provider,
      baseUrl: active.baseUrl,
      model: active.model,
      hasApiKey: Boolean(apiKey),
      apiKeyMasked: apiKey ? `••••••${apiKey.slice(-4)}` : '',
      activeProviderProfileId: active.id,
      providerProfiles: stored.providerProfiles.map(toProfileView),
      recentProjects: normalizeRecentProjects(stored.recentProjects),
      recentTemplates: stored.recentTemplates ?? [],
      recentResources: stored.recentResources ?? [],
      recentDrafts: normalizeRecentDrafts(stored.recentDrafts)
    };
  }

  getLastProjectPath() {
    const stored = this.readPersisted();
    return stored.lastProjectPath ? path.resolve(stored.lastProjectPath) : '';
  }

  getApiKey(profileId?: string) {
    const stored = this.readPersisted();
    const target = profileId
      ? stored.providerProfiles.find((item) => item.id === profileId)
      : this.getActiveProfile(stored);
    return target ? decryptSecret(target.encryptedApiKey) : '';
  }

  getProviderProfile(profileId?: string) {
    const stored = this.readPersisted();
    const target = profileId
      ? stored.providerProfiles.find((item) => item.id === profileId)
      : this.getActiveProfile(stored);
    if (!target) return null;
    return {
      id: target.id,
      name: target.name,
      provider: target.provider,
      baseUrl: target.baseUrl,
      model: target.model,
      apiKey: decryptSecret(target.encryptedApiKey),
      enabled: target.enabled,
      capabilities: target.capabilities,
      diagnostics: target.diagnostics
    };
  }

  getProviderProfilesWithSecrets() {
    const stored = this.readPersisted();
    return stored.providerProfiles.map((profile) => {
      const apiKey = decryptSecret(profile.encryptedApiKey);
      return {
        id: profile.id,
        name: profile.name,
        provider: profile.provider,
        baseUrl: profile.baseUrl,
        model: profile.model,
        apiKey,
        hasApiKey: Boolean(apiKey),
        apiKeyMasked: apiKey ? `••••••${apiKey.slice(-4)}` : '',
        enabled: profile.enabled,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        capabilities: profile.capabilities,
        diagnostics: profile.diagnostics
      };
    });
  }

  saveSettings(input: AppSettingsInput) {
    const current = this.readPersisted();
    const providerProfiles = input.providerProfiles?.length
      ? applyProfileInputs(current, input.providerProfiles)
      : updateLegacyActiveProfile(current, input);
    const activeProviderProfileId =
      input.activeProviderProfileId && providerProfiles.some((item) => item.id === input.activeProviderProfileId)
        ? input.activeProviderProfileId
        : current.activeProviderProfileId && providerProfiles.some((item) => item.id === current.activeProviderProfileId)
          ? current.activeProviderProfileId
          : providerProfiles.find((item) => item.enabled)?.id ?? providerProfiles[0].id;

    this.writePersisted({
      ...current,
      theme: input.theme,
      sidebar: normalizeSidebarLayout(input.sidebar),
      debug: {
        ...current.debug,
        ...(input.debug ?? {})
      },
      providerProfiles,
      activeProviderProfileId,
      recentProjects: (input.recentProjects ?? normalizeRecentProjects(current.recentProjects)).map((entry) => ({
        rootPath: entry.rootPath,
        name: entry.name,
        alias: entry.alias,
        lastOpenedAt: entry.lastOpenedAt
      })),
      recentTemplates: input.recentTemplates ?? current.recentTemplates ?? [],
      recentResources: input.recentResources ?? current.recentResources ?? [],
      recentDrafts: (input.recentDrafts ?? normalizeRecentDrafts(current.recentDrafts)).map((entry) => ({
        id: entry.id,
        name: entry.name,
        templateId: entry.templateId,
        templateName: entry.templateName,
        updatedAt: entry.updatedAt
      }))
    });
    return this.getSettings();
  }

  markRecentTemplate(templateId: string) {
    const normalizedId = templateId.trim();
    if (!normalizedId) return this.getSettings();
    const current = this.readPersisted();
    this.writePersisted({
      ...current,
      recentTemplates: [normalizedId, ...(current.recentTemplates ?? []).filter((item) => item !== normalizedId)].slice(0, 12),
      recentResources: [`template:${normalizedId}`, ...(current.recentResources ?? []).filter((item) => item !== `template:${normalizedId}`)].slice(0, 20)
    });
    return this.getSettings();
  }

  setActiveProject(rootPath: string, name: string, templateId?: string) {
    const current = this.readPersisted();
    const resolvedPath = path.resolve(rootPath);
    const now = nowIso();
    const existing = normalizeRecentProjects(current.recentProjects).find((entry) => entry.rootPath === resolvedPath);
    const recent = [
      {
        rootPath: resolvedPath,
        name,
        alias: existing?.alias,
        lastOpenedAt: now
      },
      ...current.recentProjects
        .map((entry) => ({
          rootPath: path.resolve(typeof entry === 'string' ? entry : entry.rootPath),
          name: typeof entry === 'string' ? path.basename(path.resolve(entry)) || path.resolve(entry) : entry.name,
          alias: typeof entry === 'string' ? undefined : entry.alias,
          lastOpenedAt: typeof entry === 'string' ? new Date(0).toISOString() : entry.lastOpenedAt
        }))
        .filter((entry) => entry.rootPath !== resolvedPath)
    ].slice(0, 8);

    const nextRecentTemplates = templateId
      ? [templateId, ...(current.recentTemplates ?? []).filter((item) => item !== templateId)].slice(0, 12)
      : current.recentTemplates ?? [];
    const nextRecentResources = templateId
      ? [`template:${templateId}`, ...(current.recentResources ?? []).filter((item) => item !== `template:${templateId}`)].slice(0, 20)
      : current.recentResources ?? [];

    this.writePersisted({
      ...current,
      recentProjects: recent,
      recentTemplates: nextRecentTemplates,
      recentResources: nextRecentResources,
      lastProjectPath: resolvedPath
    });
  }

  markRecentResource(resourceKey: string) {
    if (!resourceKey.trim()) return this.getSettings();
    const current = this.readPersisted();
    this.writePersisted({
      ...current,
      recentResources: [resourceKey, ...(current.recentResources ?? []).filter((item) => item !== resourceKey)].slice(0, 20)
    });
    return this.getSettings();
  }

  saveDraftSnapshot(snapshot: DraftOrchestrationSnapshot) {
    const normalizedId = snapshot.id.trim();
    const nextSnapshot: DraftOrchestrationSnapshot = {
      ...snapshot,
      id: normalizedId,
      name: snapshot.name.trim() || snapshot.runtimeTemplate.name || snapshot.platform.template?.name || '编排草稿',
      updatedAt: snapshot.updatedAt || nowIso()
    };
    writeJson(draftSnapshotPath(normalizedId), nextSnapshot);
    const current = this.readPersisted();
    this.writePersisted({
      ...current,
      recentDrafts: [
        {
          id: normalizedId,
          name: nextSnapshot.name,
          templateId: nextSnapshot.templatePackage.definition.id,
          templateName: nextSnapshot.templatePackage.definition.name,
          updatedAt: nextSnapshot.updatedAt
        },
        ...(current.recentDrafts ?? []).filter((entry) => entry.id !== normalizedId)
      ].slice(0, 8)
    });
    return this.getSettings();
  }

  getDraftSnapshot(id: string) {
    const normalizedId = id.trim();
    if (!isValidDraftSnapshot(normalizedId)) return null;
    return this.readJsonWithFallback<DraftOrchestrationSnapshot | null>(
      draftSnapshotPath(normalizedId),
      null,
      `draft.read.failed:${normalizedId}`,
      'Failed to read draft orchestration snapshot.'
    );
  }

  removeDraftSnapshot(id: string) {
    const normalizedId = id.trim();
    const filePath = draftSnapshotPath(normalizedId);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
    const current = this.readPersisted();
    this.writePersisted({
      ...current,
      recentDrafts: (current.recentDrafts ?? []).filter((entry) => entry.id !== normalizedId)
    });
    return this.getSettings();
  }

  clearActiveProject() {
    const current = this.readPersisted();
    this.writePersisted({ ...current, lastProjectPath: '' });
  }

  renameRecentProject(rootPath: string, alias: string) {
    const current = this.readPersisted();
    const resolvedPath = path.resolve(rootPath);
    const nextAlias = alias.trim();
    const recentProjects = current.recentProjects.map((entry) =>
      path.resolve(typeof entry === 'string' ? entry : entry.rootPath) === resolvedPath
        ? {
            rootPath: resolvedPath,
            name: typeof entry === 'string' ? path.basename(resolvedPath) || resolvedPath : entry.name,
            alias: nextAlias || undefined,
            lastOpenedAt: typeof entry === 'string' ? new Date(0).toISOString() : entry.lastOpenedAt
          }
        : entry
    );
    this.writePersisted({ ...current, recentProjects });
    return this.getSettings();
  }

  removeRecentProject(rootPath: string) {
    const current = this.readPersisted();
    const resolvedPath = path.resolve(rootPath);
    const recentProjects = current.recentProjects.filter((entry) => path.resolve(typeof entry === 'string' ? entry : entry.rootPath) !== resolvedPath);
    this.writePersisted({
      ...current,
      recentProjects,
      lastProjectPath: current.lastProjectPath && path.resolve(current.lastProjectPath) === resolvedPath ? '' : current.lastProjectPath
    });
    return this.getSettings();
  }

  clearInvalidRecentProjects() {
    const current = this.readPersisted();
    const recentProjects = normalizeRecentProjects(current.recentProjects)
      .filter((entry) => entry.available)
      .map((entry) => ({
        rootPath: entry.rootPath,
        name: entry.name,
        alias: entry.alias,
        lastOpenedAt: entry.lastOpenedAt
      }));
    const lastProjectPath = isValidProjectDirectory(current.lastProjectPath) ? current.lastProjectPath : '';
    this.writePersisted({ ...current, recentProjects, lastProjectPath });
    return this.getSettings();
  }

  clearAllRecentProjects() {
    const current = this.readPersisted();
    this.writePersisted({ ...current, recentProjects: [], lastProjectPath: '' });
    return this.getSettings();
  }
}

export class SessionStore {
  private readonly sessionsFile: string;

  constructor(projectRoot: string) {
    this.sessionsFile = path.join(projectRoot, '.project', 'sessions.json');
  }

  getSessions() {
    return readJson<AiSession[]>(this.sessionsFile, [
      {
        id: randomUUID(),
        title: '初始需求会话',
        stage: 'discover',
        summary: '新建工程后的默认引导会话',
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
            content: '请先用一句话描述你的目标，我会帮你逐步整理成可交付的文档集合。',
            createdAt: new Date().toISOString()
          }
        ]
      }
    ]);
  }

  saveSessions(sessions: AiSession[]) {
    writeJson(this.sessionsFile, sessions);
  }
}
