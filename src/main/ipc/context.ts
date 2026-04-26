import type fs from 'node:fs';
import type { BrowserWindow } from 'electron';
import type {
  ActionableErrorRecord,
  AppSettings,
  BootstrapData,
  LocalResourceInstallResult,
  ProjectCreateInput,
  ProviderProfileInput,
  ResourceKind,
  WindowBootstrapContext
} from '../../shared/types';
import type { AiService, ProviderSettings } from '../services/ai-service';
import type { ConversationFlowService } from '../services/conversation-flow-service';
import type { EvidenceStoreService } from '../services/evidence-store-service';
import type { PlatformService } from '../services/platform-service';
import type { ProjectService } from '../services/project-service';
import type { ResourceGovernanceService } from '../services/resource-governance-service';
import type { RulesDistillationService } from '../services/rules-distillation-service';
import type { RuntimeService } from '../services/runtime-service';
import type { RolePackageRegistryService } from '../services/role-package-registry-service';
import type { SideEffectGovernanceService } from '../services/side-effect-governance-service';
import type { SkillRegistryService } from '../services/skill-registry-service';
import type { SettingsStore } from '../services/store';
import type { WorkspaceOrchestrator } from '../services/workspace-orchestrator';
import type { AppLogService } from '../services/app-log-service';

export type IpcRegistrationContext = {
  getMainWindow: () => BrowserWindow;
  settingsStore: SettingsStore;
  projectService: ProjectService;
  aiService: AiService;
  skillRegistry: SkillRegistryService;
  rolePackageRegistry: RolePackageRegistryService;
  orchestrator: WorkspaceOrchestrator;
  conversationFlowService: ConversationFlowService;
  runtimeService: RuntimeService;
  platformService: PlatformService;
  evidenceStore: EvidenceStoreService;
  resourceGovernance: ResourceGovernanceService;
  rulesDistillationService: RulesDistillationService;
  sideEffectGovernance: SideEffectGovernanceService;
  getActiveProjectRoot: () => string | null;
  setActiveProjectRoot: (rootPath: string | null) => void;
  requireActiveRoot: () => string;
  clearDocumentWatcher: (webContentsId: number) => void;
  documentWatchers: Map<number, fs.FSWatcher>;
  documentWatchTimers: Map<number, NodeJS.Timeout>;
  buildBootstrap: (rootPath: string | null) => BootstrapData;
  getProviderSettings: (payload?: { profileId?: string; draft?: ProviderProfileInput }) => ProviderSettings;
  getProviderProfiles: () => ReturnType<SettingsStore['getProviderProfilesWithSecrets']>;
  setProjectWorkbenchLayout: () => void;
  updateProfileDiagnostic: (profileId: string, result: Awaited<ReturnType<AiService['testConnection']>>) => void;
  refreshMenu: () => void;
  onSettingsSaved: (settings: AppSettings) => void;
  appLogService: AppLogService;
  getWindowBootstrapContext: (webContentsId: number) => WindowBootstrapContext;
  openDocumentWindow: (input: { rootPath: string; filePath: string; sourceWebContentsId?: number }) => Promise<void>;
  completeGovernedInstall: <T>(
    kind: ResourceKind,
    targetPath: string,
    approved: boolean,
    governed: {
      packageValue: T | null;
      review: import('../../shared/types').ReviewGateReport;
      verification: import('../../shared/types').ResourceVerificationRecord;
      actionableError?: ActionableErrorRecord;
    },
    install: (packageValue: T) => void
  ) => LocalResourceInstallResult;
};

export type ProjectCreateHandlerInput = ProjectCreateInput;
