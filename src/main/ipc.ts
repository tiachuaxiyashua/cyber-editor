import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { BrowserWindow, ipcMain } from 'electron';
import type {
  ActionableErrorRecord,
  BootstrapData,
  LocalResourceInstallResult,
  ProviderProfileInput,
  ResourceKind,
  WindowBootstrapContext
} from '../shared/types';
import { AiService, type ProviderSettings } from './services/ai-service';
import { ConversationFlowService } from './services/conversation-flow-service';
import { EvidenceStoreService } from './services/evidence-store-service';
import { PlatformService } from './services/platform-service';
import { ProjectService } from './services/project-service';
import { ResourceGovernanceService } from './services/resource-governance-service';
import { RulesDistillationService } from './services/rules-distillation-service';
import { RuntimeService } from './services/runtime-service';
import { RolePackageRegistryService } from './services/role-package-registry-service';
import { SideEffectGovernanceService } from './services/side-effect-governance-service';
import { SkillRegistryService } from './services/skill-registry-service';
import { SettingsStore } from './services/store';
import { WorkspaceOrchestrator } from './services/workspace-orchestrator';
import { AppLogService } from './services/app-log-service';
import { summarizeIpcArgsForLogging, summarizeIpcValueForLogging } from './ipc-log-sanitizer';
import type { IpcRegistrationContext } from './ipc/context';
import { registerProjectDocumentIpc } from './ipc/register-project-document-ipc';
import { registerRecentSystemIpc } from './ipc/register-recent-system-ipc';
import { registerResourceIpc } from './ipc/register-resource-ipc';
import { registerRuntimePlatformIpc } from './ipc/register-runtime-platform-ipc';
import { registerSettingsSessionAiIpc } from './ipc/register-settings-session-ai-ipc';

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow,
  settingsStore: SettingsStore,
  projectService: ProjectService,
  aiService: AiService,
  skillRegistry: SkillRegistryService,
  rolePackageRegistry: RolePackageRegistryService,
  orchestrator: WorkspaceOrchestrator,
  conversationFlowService: ConversationFlowService,
  runtimeService: RuntimeService,
  platformService: PlatformService,
  appLogService: AppLogService,
  refreshMenu: () => void,
  windowIntegration: {
    getWindowBootstrapContext: (webContentsId: number) => WindowBootstrapContext;
    openDocumentWindow: (input: { rootPath: string; filePath: string; sourceWebContentsId?: number }) => Promise<void>;
  },
  onSettingsSaved: (settings: ReturnType<SettingsStore['getSettings']>) => void
) {
  const summarizeValue = (value: unknown, depth = 0): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      return value.length > 240 ? `${value.slice(0, 240)}…` : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value)) {
      if (depth >= 2) {
        return `[Array(${value.length})]`;
      }
      return value.slice(0, 10).map((item) => summarizeValue(item, depth + 1));
    }
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message
      };
    }
    if (typeof value === 'object') {
      if (depth >= 2) {
        return '[Object]';
      }
      const entries = Object.entries(value as Record<string, unknown>).slice(0, 10);
      return Object.fromEntries(entries.map(([key, entry]) => [key, summarizeValue(entry, depth + 1)]));
    }
    return String(value);
  };

  let activeProjectRoot: string | null = null;
  const documentWatchers = new Map<number, fs.FSWatcher>();
  const documentWatchTimers = new Map<number, NodeJS.Timeout>();
  const evidenceStore = new EvidenceStoreService();
  const resourceGovernance = new ResourceGovernanceService();
  const rulesDistillationService = new RulesDistillationService();
  const sideEffectGovernance = new SideEffectGovernanceService(projectService, evidenceStore);

  const clearDocumentWatcher = (webContentsId: number) => {
    documentWatchers.get(webContentsId)?.close();
    documentWatchers.delete(webContentsId);
    const timer = documentWatchTimers.get(webContentsId);
    if (timer) {
      clearTimeout(timer);
      documentWatchTimers.delete(webContentsId);
    }
  };

  const requireActiveRoot = () => {
    if (!activeProjectRoot) {
      throw new Error('当前没有打开工程。');
    }
    return activeProjectRoot;
  };

  const recordGovernedImport = (governed: {
    review: import('../shared/types').ReviewGateReport;
    verification: import('../shared/types').ResourceVerificationRecord;
    actionableError?: ActionableErrorRecord;
  }) => {
    if (!activeProjectRoot) return;
    evidenceStore.persistReview(activeProjectRoot, governed.review);
    evidenceStore.persistResourceVerification(activeProjectRoot, governed.verification);
    if (governed.actionableError) {
      evidenceStore.persistActionableError(activeProjectRoot, governed.actionableError);
    }
  };

  const completeGovernedInstall = <T>(
    kind: ResourceKind,
    targetPath: string,
    approved: boolean,
    governed: {
      packageValue: T | null;
      review: import('../shared/types').ReviewGateReport;
      verification: import('../shared/types').ResourceVerificationRecord;
      actionableError?: ActionableErrorRecord;
    },
    install: (packageValue: T) => void
  ): LocalResourceInstallResult => {
    recordGovernedImport(governed);

    if (!governed.packageValue || governed.review.trust === 'blocked') {
      if (activeProjectRoot) {
        projectService.appendAudit(activeProjectRoot, {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          type: 'resource.install.blocked',
          message: `${kind} install blocked`,
          metadata: { kind, targetPath, reviewId: governed.review.id, verificationId: governed.verification.id }
        });
      }
      return {
        status: 'blocked',
        kind,
        targetPath,
        review: governed.review,
        verification: governed.verification,
        actionableError: governed.actionableError
      };
    }

    if (governed.review.trust === 'review' && !approved) {
      if (activeProjectRoot) {
        projectService.appendAudit(activeProjectRoot, {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          type: 'resource.install.review-required',
          message: `${kind} install requires review`,
          metadata: { kind, targetPath, reviewId: governed.review.id, verificationId: governed.verification.id }
        });
      }
      return {
        status: 'review-required',
        kind,
        targetPath,
        review: governed.review,
        verification: governed.verification
      };
    }

    install(governed.packageValue);

    if (activeProjectRoot) {
      projectService.appendAudit(activeProjectRoot, {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        type: 'resource.install.completed',
        message: `${kind} installed`,
        metadata: { kind, targetPath, reviewId: governed.review.id, verificationId: governed.verification.id }
      });
    }

    return {
      status: 'installed',
      kind,
      targetPath,
      bootstrap: buildBootstrap(activeProjectRoot),
      review: governed.review,
      verification: governed.verification
    };
  };

  const buildBootstrap = (rootPath: string | null): BootstrapData => {
    const settings = settingsStore.getSettings();
    const templates = platformService.listTemplates();
    if (!rootPath) {
      return {
        settings,
        project: null,
        templates,
        runtimeTemplate: null,
        platform: null,
        flowHistories: {},
        sessions: [],
        agentMemory: null,
        reviewRounds: [],
        installedSkills: skillRegistry.listInstalled(),
        installedRolePackages: rolePackageRegistry.listInstalled(),
        projectSkillIds: [],
        sessionSkillIds: {},
        snapshots: [],
        consistencyReport: null,
        auditEntries: [],
        recentDocumentChanges: [],
        artifactRevisions: [],
        artifactInvalidations: [],
        runtimeRuns: [],
        runtimeEvents: [],
        runtimeCapabilities: [],
        contextPacks: [],
        knowledgeIndexState: null,
        runtimeGovernorStatus: null,
        noteReferenceGraph: null,
        rulesDistillation: rulesDistillationService.getSnapshot(null)
      };
    }

    runtimeService.ensureProjectRuntime(rootPath);
    projectService.recomputeArtifactGovernance(rootPath);
    const project = projectService.openProject(rootPath);
    const runtimeTemplate = project.manifest.templateId
      ? runtimeService.getRuntimeTemplate(rootPath, project.manifest.templateId)
      : null;
    const platform = projectService.loadPlatformAssets(rootPath);
    const flowHistories = Object.fromEntries(
      [...platform.flows, ...platform.subflows].map((flow) => [
        `${flow.kind}:${flow.id}`,
        platformService.listFlowHistory(rootPath, flow.kind, flow.id)
      ])
    );
    return {
      settings,
      project,
      templates,
      runtimeTemplate,
      platform,
      flowHistories,
      sessions: projectService.loadSessions(rootPath),
      agentMemory: projectService.loadAgentMemory(rootPath),
      reviewRounds: projectService.loadReviewRounds(rootPath),
      installedSkills: skillRegistry.listInstalled(),
      installedRolePackages: rolePackageRegistry.listInstalled(),
      projectSkillIds: projectService.loadProjectSkillIds(rootPath),
      sessionSkillIds: projectService.loadSessionSkillIds(rootPath),
      snapshots: projectService.listSnapshots(rootPath),
      consistencyReport: projectService.loadConsistencyReport(rootPath),
      auditEntries: projectService.getAuditEntries(rootPath),
      recentDocumentChanges: projectService.listRecentDocumentChanges(rootPath),
      artifactRevisions: projectService.listArtifactRevisions(rootPath),
      artifactInvalidations: projectService.listArtifactInvalidations(rootPath),
      runtimeRuns: runtimeService.listRuns(rootPath),
      runtimeEvents: runtimeService.listEvents(rootPath),
      runtimeCapabilities: runtimeService.listCapabilities(rootPath),
      contextPacks: runtimeService.listContextPacks(rootPath),
      knowledgeIndexState: runtimeService.getKnowledgeIndexState(rootPath),
      runtimeGovernorStatus: runtimeService.getRuntimeGovernorStatus(rootPath),
      noteReferenceGraph: projectService.buildNoteReferenceGraph(rootPath),
      rulesDistillation: rulesDistillationService.getSnapshot(rootPath)
    };
  };

  const getProviderSettings = (payload?: { profileId?: string; draft?: ProviderProfileInput }): ProviderSettings => {
    if (payload?.draft) {
      return {
        profileId: payload.draft.id,
        provider: payload.draft.provider,
        baseUrl: payload.draft.baseUrl,
        model: payload.draft.model,
        apiKey: payload.draft.apiKey ?? ''
      };
    }
    const profile = settingsStore.getProviderProfile(payload?.profileId);
    if (!profile) {
      throw new Error('未找到可用的模型配置。');
    }
    return {
      profileId: profile.id,
      provider: profile.provider,
      baseUrl: profile.baseUrl,
      model: profile.model,
      apiKey: profile.apiKey
    };
  };

  const getProviderProfiles = () => settingsStore.getProviderProfilesWithSecrets();

  const setProjectWorkbenchLayout = () => {
    const settings = settingsStore.getSettings();
    settingsStore.saveSettings({
      theme: settings.theme,
      activeProviderProfileId: settings.activeProviderProfileId,
      sidebar: {
        ...settings.sidebar,
        activityView: 'project',
        leftCollapsed: false,
        rightCollapsed: false
      }
    });
  };

  const updateProfileDiagnostic = (profileId: string, result: Awaited<ReturnType<AiService['testConnection']>>) => {
    const settings = settingsStore.getSettings();
    settingsStore.saveSettings({
      theme: settings.theme,
      sidebar: settings.sidebar,
      activeProviderProfileId: settings.activeProviderProfileId,
      recentProjects: settings.recentProjects,
      providerProfiles: settings.providerProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        provider: profile.provider,
        baseUrl: profile.baseUrl,
        model: profile.model,
        enabled: profile.enabled,
        capabilities: profile.capabilities,
        diagnostics: profile.id === profileId
          ? {
              checkedAt: new Date().toISOString(),
              status: result.ok ? 'healthy' : 'error',
              message: result.message,
              latencyMs: result.latencyMs
            }
          : profile.diagnostics
      }))
    });
  };

  const registrationContext: IpcRegistrationContext = {
    getMainWindow,
    settingsStore,
    projectService,
    aiService,
    skillRegistry,
    rolePackageRegistry,
    orchestrator,
    conversationFlowService,
    runtimeService,
    platformService,
    evidenceStore,
    resourceGovernance,
    rulesDistillationService,
    sideEffectGovernance,
    getActiveProjectRoot: () => activeProjectRoot,
    setActiveProjectRoot: (rootPath) => {
      activeProjectRoot = rootPath;
    },
    requireActiveRoot,
    clearDocumentWatcher,
    documentWatchers,
    documentWatchTimers,
    buildBootstrap,
    getProviderSettings,
    getProviderProfiles,
    setProjectWorkbenchLayout,
    updateProfileDiagnostic,
    refreshMenu,
    onSettingsSaved,
    appLogService,
    getWindowBootstrapContext: windowIntegration.getWindowBootstrapContext,
    openDocumentWindow: windowIntegration.openDocumentWindow,
    completeGovernedInstall
  };

  const originalHandle = ipcMain.handle.bind(ipcMain);
  const mutableIpcMain = ipcMain as typeof ipcMain & { handle: typeof ipcMain.handle };
  mutableIpcMain.handle = ((channel, listener) => originalHandle(channel, async (event, ...args) => {
    try {
      return await listener(event, ...args);
    } catch (error) {
      appLogService.error({
        source: 'ipc',
        event: 'ipc.handler.failed',
        message: `IPC handler failed: ${channel}`,
        metadata: {
          channel,
          webContentsId: event.sender.id,
          activeProjectRoot: summarizeIpcValueForLogging(activeProjectRoot),
          args: summarizeIpcArgsForLogging(args)
        },
        error
      });
      throw error;
    }
  })) as typeof ipcMain.handle;

  try {
    registerProjectDocumentIpc(registrationContext);
    registerSettingsSessionAiIpc(registrationContext);
    registerRuntimePlatformIpc(registrationContext);
    registerResourceIpc(registrationContext);
    registerRecentSystemIpc(registrationContext);
  } finally {
    mutableIpcMain.handle = originalHandle;
  }
}
