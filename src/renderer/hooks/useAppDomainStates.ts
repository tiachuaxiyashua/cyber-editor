import { useRef, useState } from 'react';
import type {
  AiSession,
  AppSettings,
  AuditEntry,
  ArtifactInvalidationRecord,
  ArtifactRevisionRecord,
  ConsistencyReport,
  ConversationTargetContext,
  ControlledScriptTool,
  DocumentChangeRecord,
  DocumentSnapshotInfo,
  ContextPack,
  KnowledgeIndexState,
  NoteReferenceGraph,
  PendingDocumentWrite,
  PlatformAssets,
  RulesDistillationSnapshot,
  ProjectCreateValidation,
  ProjectSearchResult,
  ProjectSummary,
  ProjectTemplateDefinition,
  ProjectTemplatePackage,
  ProjectTemplateSaveInput,
  RemoteSkillCatalogItem,
  ResourceKind,
  ReviewRound,
  RuntimeCapabilityDefinition,
  RuntimeEvent,
  RuntimeGovernorStatus,
  RuntimeRun,
  RuntimeTemplateAsset,
  SessionSkillMap,
  SidebarLayout,
  SnapshotInfo,
  StageGuardStatus
} from '../../shared/types';
import type { ConflictDialogState } from '../components/ConflictDialog';
import type { ProjectTemplateDraft } from '../components/ProjectTemplateDialog';
import type { SettingsDraft, LandingView, FlowConversationPreviewState, OpenDocumentState, ResourceCenterSource, TextRange, TopbarMenuKey, ViewMode } from './app-domain-types';

export function useSettingsState() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(null);
  const [settingsSelectedProfileId, setSettingsSelectedProfileId] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsTesting, setSettingsTesting] = useState(false);

  return {
    settings,
    setSettings,
    settingsDraft,
    setSettingsDraft,
    settingsSelectedProfileId,
    setSettingsSelectedProfileId,
    settingsOpen,
    setSettingsOpen,
    settingsStatus,
    setSettingsStatus,
    settingsBusy,
    setSettingsBusy,
    settingsTesting,
    setSettingsTesting
  };
}

export function useShellState(defaultSidebar: SidebarLayout, initialViewportWidth = globalThis.window?.innerWidth ?? 1440) {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [templates, setTemplates] = useState<ProjectTemplateDefinition[]>([]);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogBusy, setProjectDialogBusy] = useState(false);
  const [projectDialogStatus, setProjectDialogStatus] = useState('');
  const [projectCreateValidation, setProjectCreateValidation] = useState<ProjectCreateValidation | null>(null);
  const [projectDraft, setProjectDraft] = useState<ProjectTemplateDraft>({
    name: '',
    locationPath: '',
    directoryMode: 'create-in-parent',
    templateId: ''
  });
  const [topbarMenuOpen, setTopbarMenuOpen] = useState<TopbarMenuKey | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [status, setStatus] = useState('正在加载应用…');
  const [dragTarget, setDragTarget] = useState<'left' | 'right' | 'document-split' | null>(null);
  const [viewportWidth, setViewportWidth] = useState(initialViewportWidth);
  const sidebarRef = useRef<SidebarLayout>(defaultSidebar);
  const pendingAutoSessionTargetRef = useRef<string | null>(null);

  return {
    project,
    setProject,
    templates,
    setTemplates,
    projectDialogOpen,
    setProjectDialogOpen,
    projectDialogBusy,
    setProjectDialogBusy,
    projectDialogStatus,
    setProjectDialogStatus,
    projectCreateValidation,
    setProjectCreateValidation,
    projectDraft,
    setProjectDraft,
    topbarMenuOpen,
    setTopbarMenuOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
    commandQuery,
    setCommandQuery,
    status,
    setStatus,
    dragTarget,
    setDragTarget,
    viewportWidth,
    setViewportWidth,
    sidebarRef,
    pendingAutoSessionTargetRef
  };
}

export function useOrchestrationState() {
  const [platform, setPlatform] = useState<PlatformAssets | null>(null);
  const [runtimeTemplate, setRuntimeTemplate] = useState<RuntimeTemplateAsset | null>(null);
  const [rulesDistillation, setRulesDistillation] = useState<RulesDistillationSnapshot | null>(null);
  const [flowHistories, setFlowHistories] = useState<Record<string, import('../../shared/types').FlowHistoryEntry[]>>({});
  const [draftPlatform, setDraftPlatform] = useState<PlatformAssets | null>(null);
  const [draftRuntimeTemplate, setDraftRuntimeTemplate] = useState<RuntimeTemplateAsset | null>(null);
  const [draftFlowHistories, setDraftFlowHistories] = useState<Record<string, import('../../shared/types').FlowHistoryEntry[]>>({});
  const [draftTemplatePackage, setDraftTemplatePackage] = useState<ProjectTemplatePackage | null>(null);
  const [draftSnapshotId, setDraftSnapshotId] = useState('');
  const [draftDirty, setDraftDirty] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState('');
  const lastSavedDraftSignatureRef = useRef('');

  return {
    platform,
    setPlatform,
    runtimeTemplate,
    setRuntimeTemplate,
    rulesDistillation,
    setRulesDistillation,
    flowHistories,
    setFlowHistories,
    draftPlatform,
    setDraftPlatform,
    draftRuntimeTemplate,
    setDraftRuntimeTemplate,
    draftFlowHistories,
    setDraftFlowHistories,
    draftTemplatePackage,
    setDraftTemplatePackage,
    draftSnapshotId,
    setDraftSnapshotId,
    draftDirty,
    setDraftDirty,
    draftSaving,
    setDraftSaving,
    draftSaveError,
    setDraftSaveError,
    lastSavedDraftSignatureRef
  };
}

export function useResourceCenterState() {
  const [landingView, setLandingView] = useState<LandingView>('welcome');
  const [resourceCenterOpen, setResourceCenterOpen] = useState(false);
  const [resourceCenterSource, setResourceCenterSource] = useState<ResourceCenterSource>('welcome');
  const [resourceCenterQuery, setResourceCenterQuery] = useState('');
  const [resourceCenterKind, setResourceCenterKind] = useState<ResourceKind | 'all'>('all');
  const [resourceCenterSourceFilter, setResourceCenterSourceFilter] = useState<'all' | 'builtin' | 'local' | 'remote'>('all');
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [resourceInstallDialogOpen, setResourceInstallDialogOpen] = useState(false);
  const [resourceInstallKind, setResourceInstallKind] = useState<ResourceKind | 'all'>('template');
  const [resourcePackageUrl, setResourcePackageUrl] = useState('');
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateBusy, setSaveTemplateBusy] = useState(false);
  const [saveTemplateStatus, setSaveTemplateStatus] = useState('');
  const [saveTemplateDraft, setSaveTemplateDraft] = useState<ProjectTemplateSaveInput>({
    id: '',
    name: '',
    shortDescription: '',
    description: '',
    category: 'product',
    icon: 'workflow',
    starterPrompt: ''
  });
  const [projectTemplateOverride, setProjectTemplateOverride] = useState<ProjectTemplateDefinition | null>(null);
  const [projectTemplatePackageOverride, setProjectTemplatePackageOverride] = useState<ProjectTemplatePackage | null>(null);
  const [catalogUrl, setCatalogUrl] = useState('');
  const [skillCatalog, setSkillCatalog] = useState<RemoteSkillCatalogItem[]>([]);

  return {
    landingView,
    setLandingView,
    resourceCenterOpen,
    setResourceCenterOpen,
    resourceCenterSource,
    setResourceCenterSource,
    resourceCenterQuery,
    setResourceCenterQuery,
    resourceCenterKind,
    setResourceCenterKind,
    resourceCenterSourceFilter,
    setResourceCenterSourceFilter,
    selectedResourceId,
    setSelectedResourceId,
    resourceInstallDialogOpen,
    setResourceInstallDialogOpen,
    resourceInstallKind,
    setResourceInstallKind,
    resourcePackageUrl,
    setResourcePackageUrl,
    saveTemplateOpen,
    setSaveTemplateOpen,
    saveTemplateBusy,
    setSaveTemplateBusy,
    saveTemplateStatus,
    setSaveTemplateStatus,
    saveTemplateDraft,
    setSaveTemplateDraft,
    projectTemplateOverride,
    setProjectTemplateOverride,
    projectTemplatePackageOverride,
    setProjectTemplatePackageOverride,
    catalogUrl,
    setCatalogUrl,
    skillCatalog,
    setSkillCatalog
  };
}

export function useConversationRuntimeState() {
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [conversationTarget, setConversationTarget] = useState<ConversationTargetContext | null>(null);
  const [orchestrationConversationFlow, setOrchestrationConversationFlow] = useState<import('../../shared/types').PlatformFlowAsset | null>(null);
  const [flowConversationPreview, setFlowConversationPreview] = useState<FlowConversationPreviewState | null>(null);
  const [reviewRounds, setReviewRounds] = useState<ReviewRound[]>([]);
  const [installedSkills, setInstalledSkills] = useState<import('../../shared/types').InstalledSkill[]>([]);
  const [installedRolePackages, setInstalledRolePackages] = useState<import('../../shared/types').InstalledRolePackage[]>([]);
  const [projectSkillIds, setProjectSkillIds] = useState<string[]>([]);
  const [sessionSkillIds, setSessionSkillIds] = useState<SessionSkillMap>({});
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [consistencyReport, setConsistencyReport] = useState<ConsistencyReport | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [recentDocumentChanges, setRecentDocumentChanges] = useState<DocumentChangeRecord[]>([]);
  const [artifactRevisions, setArtifactRevisions] = useState<ArtifactRevisionRecord[]>([]);
  const [artifactInvalidations, setArtifactInvalidations] = useState<ArtifactInvalidationRecord[]>([]);
  const [runtimeRuns, setRuntimeRuns] = useState<RuntimeRun[]>([]);
  const [runtimeEvents, setRuntimeEvents] = useState<RuntimeEvent[]>([]);
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<RuntimeCapabilityDefinition[]>([]);
  const [contextPacks, setContextPacks] = useState<ContextPack[]>([]);
  const [knowledgeIndexState, setKnowledgeIndexState] = useState<KnowledgeIndexState | null>(null);
  const [runtimeGovernorStatus, setRuntimeGovernorStatus] = useState<RuntimeGovernorStatus | null>(null);
  const [noteReferenceGraph, setNoteReferenceGraph] = useState<NoteReferenceGraph | null>(null);
  const [noteComparePath, setNoteComparePath] = useState('');
  const [activeSessionId, setActiveSessionId] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [stageInstructions, setStageInstructions] = useState('');
  const [stageGuard, setStageGuard] = useState<StageGuardStatus | null>(null);

  return {
    sessions,
    setSessions,
    conversationTarget,
    setConversationTarget,
    orchestrationConversationFlow,
    setOrchestrationConversationFlow,
    flowConversationPreview,
    setFlowConversationPreview,
    reviewRounds,
    setReviewRounds,
    installedSkills,
    setInstalledSkills,
    installedRolePackages,
    setInstalledRolePackages,
    projectSkillIds,
    setProjectSkillIds,
    sessionSkillIds,
    setSessionSkillIds,
    snapshots,
    setSnapshots,
    consistencyReport,
    setConsistencyReport,
    auditEntries,
    setAuditEntries,
    recentDocumentChanges,
    setRecentDocumentChanges,
    artifactRevisions,
    setArtifactRevisions,
    artifactInvalidations,
    setArtifactInvalidations,
    runtimeRuns,
    setRuntimeRuns,
    runtimeEvents,
    setRuntimeEvents,
    runtimeCapabilities,
    setRuntimeCapabilities,
    contextPacks,
    setContextPacks,
    knowledgeIndexState,
    setKnowledgeIndexState,
    runtimeGovernorStatus,
    setRuntimeGovernorStatus,
    noteReferenceGraph,
    setNoteReferenceGraph,
    noteComparePath,
    setNoteComparePath,
    activeSessionId,
    setActiveSessionId,
    chatInput,
    setChatInput,
    sending,
    setSending,
    stageInstructions,
    setStageInstructions,
    stageGuard,
    setStageGuard
  };
}

export function useWorkbenchState() {
  const [activeDocumentPath, setActiveDocumentPath] = useState('');
  const [openDocuments, setOpenDocuments] = useState<Record<string, OpenDocumentState>>({});
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [recentlyClosedTabs, setRecentlyClosedTabs] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('read');
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [findIndex, setFindIndex] = useState(0);
  const [pendingSelection, setPendingSelection] = useState<{ path: string; range: TextRange } | null>(null);
  const [conflictState, setConflictState] = useState<ConflictDialogState | null>(null);
  const [documentProtectionOpen, setDocumentProtectionOpen] = useState(false);
  const [documentProtectionBusy, setDocumentProtectionBusy] = useState(false);
  const [documentSnapshots, setDocumentSnapshots] = useState<DocumentSnapshotInfo[]>([]);
  const [pendingDocumentWrites, setPendingDocumentWrites] = useState<PendingDocumentWrite[]>([]);
  const [treeFilter, setTreeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [projectSearchResults, setProjectSearchResults] = useState<ProjectSearchResult[]>([]);
  const [projectSearching, setProjectSearching] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const openDocumentsRef = useRef<Record<string, OpenDocumentState>>({});
  const activeDocumentPathRef = useRef('');

  return {
    activeDocumentPath,
    setActiveDocumentPath,
    openDocuments,
    setOpenDocuments,
    openTabs,
    setOpenTabs,
    recentlyClosedTabs,
    setRecentlyClosedTabs,
    viewMode,
    setViewMode,
    findOpen,
    setFindOpen,
    findQuery,
    setFindQuery,
    replaceText,
    setReplaceText,
    findIndex,
    setFindIndex,
    pendingSelection,
    setPendingSelection,
    conflictState,
    setConflictState,
    documentProtectionOpen,
    setDocumentProtectionOpen,
    documentProtectionBusy,
    setDocumentProtectionBusy,
    documentSnapshots,
    setDocumentSnapshots,
    pendingDocumentWrites,
    setPendingDocumentWrites,
    treeFilter,
    setTreeFilter,
    searchQuery,
    setSearchQuery,
    projectSearchResults,
    setProjectSearchResults,
    projectSearching,
    setProjectSearching,
    editorRef,
    openDocumentsRef,
    activeDocumentPathRef
  };
}
