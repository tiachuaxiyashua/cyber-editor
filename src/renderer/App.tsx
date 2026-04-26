import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type SyntheticEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  Code2,
  CircleDot,
  Columns2,
  Command,
  Eye,
  FileSearch,
  FolderOpen,
  GitBranch,
  History,
  LayoutGrid,
  Layers3,
  MessagesSquare,
  BookMarked,
  Menu,
  MoonStar,
  Network,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Paperclip,
  Pencil,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  SquareArrowOutUpRight,
  SunMedium,
  Workflow,
  Save,
  Share2,
  SlidersHorizontal,
  Link2,
  House
} from 'lucide-react';
import type {
  ActivityView,
  AgentProfile,
  ArtifactOpenPayload,
  AiMessage,
  AiSession,
  AppCommand,
  AppSettings,
  AppStage,
  BootstrapData,
  ControlledScriptTool,
  ConversationTargetContext,
  ConsistencyReport,
  DraftOrchestrationSnapshot,
  DocumentMeta,
  FlowPatch,
  FlowHistoryEntry,
  FlowPlan,
  InstalledRolePackage,
  KnowledgeLinkNode,
  LocalResourceInstallResult,
  NoteReferenceComparison,
  NoteReferenceDocument,
  NoteReferenceGraph,
  PlatformAssets,
  PlatformConnector,
  PlatformFlowAsset,
  PlatformRole,
  ProjectSearchResult,
  ProjectSummary,
  ProjectCreateValidation,
  ProjectTemplateDefinition,
  ProjectTemplatePackage,
  ProjectTemplateSaveInput,
  RecentDraftEntry,
  RecentProjectEntry,
  ResourceDescriptor,
  ResourceKind,
  RemoteSkillCatalogItem,
  ReviewIssueState,
  RuleDefinition,
  RuleScope,
  RulesDistillationSnapshot,
  ThinkingChainEvidenceRef,
  ThinkingChainSnapshot,
  RuntimeEvent,
  RuntimeRerunPlan,
  RuntimeRun,
  RuntimeTemplateAsset,
  SessionContextControls,
  StageGuardStatus,
  SessionSkillMap,
  SidebarLayout,
  TableArtifactModel,
  TaskTemplate,
  WindowBootstrapContext
} from '../shared/types';
import { CommandPalette, type CommandPaletteItem } from './components/CommandPalette';
import { ConflictDialog, type ConflictDialogState } from './components/ConflictDialog';
import { DocumentProtectionDialog } from './components/DocumentProtectionDialog';
import { DocumentTabs, type DocumentTabItem } from './components/DocumentTabs';
import { FindReplaceBar } from './components/FindReplaceBar';
import { ArtifactReferenceDialog } from './components/ArtifactReferenceDialog';
import { MarkdownContent } from './components/MarkdownContent';
import { PackageUrlDialog } from './components/PackageUrlDialog';
import { ProjectTemplateDialog, type ProjectTemplateDraft } from './components/ProjectTemplateDialog';
import { ProviderProfilesDialog, type ProviderProfileDraft } from './components/ProviderProfilesDialog';
import { SaveTemplateDialog } from './components/SaveTemplateDialog';
import { TableArtifactView } from './components/TableArtifactView';
import {
  ContextPane,
  ProcessPanel,
  SidebarView,
  TopbarMenuButton
} from './components/AppShellSections';
import {
  ActivityButton,
  IconButton,
  ProjectWelcomeCard,
  WelcomeScreen
} from './components/ShellPrimitives';
import { StageBadge } from './components/StageBadge';
import {
  useConversationRuntimeState,
  useOrchestrationState,
  useResourceCenterState,
  useSettingsState,
  useShellState,
  useWorkbenchState
} from './hooks/useAppDomainStates';
import type {
  FlowConversationPreviewState,
  LandingView,
  OpenDocumentState,
  ResourceCenterSource,
  SettingsDraft,
  TextRange,
  TopbarMenuKey,
  ViewMode
} from './hooks/app-domain-types';
import { validatePlatformFlow } from '../shared/flow-validator';
import { getProviderLabel } from '../shared/provider-registry';
import { createProviderProfileDraftSeed, toProviderProfileDrafts, toProviderProfileInputs } from './lib/provider-profile-drafts';
import {
  applyMarkdownBlockCommand,
  detectMarkdownSlashCommand,
  listMarkdownBlockCommands,
  type MarkdownBlockCommandId
} from './lib/markdown-editor-adapter';
import { templateUnavailableReason } from './lib/project-template-utils';

// lazy(() => import('./components/OrchestrationWorkspace'))
const OrchestrationWorkspace = lazy(() =>
  import('./components/OrchestrationWorkspace.js').then((module) => ({ default: module.OrchestrationWorkspace }))
) as typeof import('./components/OrchestrationWorkspace.js').OrchestrationWorkspace;
// lazy(() => import('./components/ResourceCenterPage'))
const ResourceCenterPage = lazy(() =>
  import('./components/ResourceCenterPage.js').then((module) => ({ default: module.ResourceCenterPage }))
) as typeof import('./components/ResourceCenterPage.js').ResourceCenterPage;
// lazy(() => import('./components/RulesWorkspacePage'))
const RulesWorkspacePage = lazy(() =>
  import('./components/RulesWorkspacePage.js').then((module) => ({ default: module.RulesWorkspacePage }))
) as typeof import('./components/RulesWorkspacePage.js').RulesWorkspacePage;
// lazy(() => import('./components/SettingsWorkspacePage'))
const SettingsWorkspacePage = lazy(() =>
  import('./components/SettingsWorkspacePage.js').then((module) => ({ default: module.SettingsWorkspacePage }))
) as typeof import('./components/SettingsWorkspacePage.js').SettingsWorkspacePage;
// lazy(() => import('./components/ThinkingChainPage'))
const ThinkingChainPage = lazy(() =>
  import('./components/ThinkingChainPage.js').then((module) => ({ default: module.ThinkingChainPage }))
) as typeof import('./components/ThinkingChainPage.js').ThinkingChainPage;

type TopbarMenuItem = {
  id: string;
  label: string;
  description: string;
  disabled?: boolean;
  run: () => void;
};

type RuntimeBootstrapEnvelope = BootstrapData | {
  bootstrap: BootstrapData;
  paused?: boolean;
  pausedRunId?: string;
};

type RuntimeActionEnvelope = {
  bootstrap: BootstrapData;
  result?: {
    run?: RuntimeRun;
    events?: RuntimeEvent[];
    paused?: boolean;
  };
};

type MarkdownSlashMenuState = {
  path: string;
  query: string;
  triggerStart: number;
  triggerEnd: number;
  selectedIndex: number;
};

const defaultSidebar: SidebarLayout = {
  leftWidth: 252,
  rightWidth: 292,
  leftCollapsed: false,
  rightCollapsed: false,
  activityView: 'project',
  processPanelOpen: false,
  processPanelTab: 'stage',
  documentSplitOpen: false,
  documentSplitRatio: 0.5,
  secondaryDocumentPath: ''
};

const ACTIVITY_BAR_WIDTH = 52;
const RESIZER_WIDTH = 6;
const MIN_LEFT_SIDEBAR_WIDTH = 232;
const MAX_LEFT_SIDEBAR_WIDTH = 300;
const MIN_RIGHT_SIDEBAR_WIDTH = 272;
const MAX_RIGHT_SIDEBAR_WIDTH = 332;
const MIN_CENTER_PANE_WIDTH = 320;
const COMPACT_LEFT_SIDEBAR_WIDTH = 208;
const COMPACT_RIGHT_SIDEBAR_WIDTH = 244;
const COMPACT_CENTER_PANE_WIDTH = 260;

const stageOrder: AppStage[] = ['discover', 'clarify', 'plan', 'draft', 'review', 'finalize'];
const stageLabels: Record<AppStage, string> = {
  discover: '发现',
  clarify: '澄清',
  plan: '规划',
  draft: '草拟',
  review: '审查',
  finalize: '定稿'
};

const markdownToolbarCommandIds: MarkdownBlockCommandId[] = [
  'heading-1',
  'heading-2',
  'heading-3',
  'heading-4',
  'bullet-list',
  'ordered-list',
  'task-list',
  'quote',
  'code-block',
  'mermaid',
  'mindmap'
];

function conversationTargetKey(target: ConversationTargetContext | null | undefined) {
  return target ? `${target.targetType}:${target.targetId}` : '';
}

function sameConversationTarget(
  left: ConversationTargetContext | null | undefined,
  right: ConversationTargetContext | null | undefined
) {
  return conversationTargetKey(left) !== '' && conversationTargetKey(left) === conversationTargetKey(right);
}

function isBootstrapMinimalFlow(flow: PlatformFlowAsset | null | undefined) {
  if (!flow) return true;
  const meaningfulNodes = flow.nodes.filter((node) => node.type !== 'start' && node.type !== 'end');
  return meaningfulNodes.length === 0;
}

function normalizeSessionContextControls(value?: Partial<SessionContextControls> | null): SessionContextControls {
  const pinnedDocumentPaths = Array.from(new Set((value?.pinnedDocumentPaths ?? []).filter(Boolean)));
  const excludedDocumentPaths = Array.from(new Set((value?.excludedDocumentPaths ?? []).filter(Boolean)))
    .filter((documentPath) => !pinnedDocumentPaths.includes(documentPath));
  return {
    pinnedDocumentPaths,
    excludedDocumentPaths,
    updatedAt: value?.updatedAt ?? new Date().toISOString()
  };
}

function isTextDocumentKind(kind: string) {
  return kind === 'text' || kind === 'diagram' || kind === 'mindmap';
}

function artifactSignature(artifact?: ArtifactOpenPayload) {
  if (!artifact) return '';
  if (artifact.kind === 'table' && artifact.table) {
    return JSON.stringify({
      activeSheetId: artifact.table.activeSheetId,
      sheets: artifact.table.sheets
    });
  }
  return artifact.content ?? '';
}

function LazyPanelFallback({ label }: { label: string }) {
  return (
    <div style={{ padding: '24px 28px', color: 'var(--text-muted)' }}>
      {label}
    </div>
  );
}

export function App() {
  const {
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
  } = useSettingsState();
  const {
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
  } = useShellState(defaultSidebar);
  const {
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
  } = useOrchestrationState();
  const {
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
  } = useResourceCenterState();
  const {
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
  } = useConversationRuntimeState();
  const {
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
  } = useWorkbenchState();
  const documentSurfaceRef = useRef<HTMLDivElement | null>(null);
  const windowContextRef = useRef<WindowBootstrapContext>({ mode: 'main' });
  const [artifactReferenceDialogOpen, setArtifactReferenceDialogOpen] = useState(false);
  const [artifactReferenceMode, setArtifactReferenceMode] = useState<'link' | 'embed'>('link');
  const [markdownSlashMenu, setMarkdownSlashMenu] = useState<MarkdownSlashMenuState | null>(null);
  const [thinkingChainSnapshot, setThinkingChainSnapshot] = useState<ThinkingChainSnapshot | null>(null);
  const [thinkingChainLoading, setThinkingChainLoading] = useState(false);
  const [thinkingChainHideRejected, setThinkingChainHideRejected] = useState(false);
  const [thinkingChainZoom, setThinkingChainZoom] = useState(1);
  const [selectedThinkingNodeId, setSelectedThinkingNodeId] = useState('');
  const [orchestrationFocusRequest, setOrchestrationFocusRequest] = useState<{
    token: string;
    kind: PlatformFlowAsset['kind'];
    flowId: string;
    nodeId?: string;
  } | null>(null);
  const layout = settings?.sidebar ?? defaultSidebar;
  const activeSession = useMemo(() => sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null, [sessions, activeSessionId]);
  const activeSessionSkillIds = useMemo(() => activeSession ? sessionSkillIds[activeSession.id] ?? [] : [], [activeSession, sessionSkillIds]);
  const effectiveSkillIds = useMemo(() => Array.from(new Set([...projectSkillIds, ...activeSessionSkillIds])), [projectSkillIds, activeSessionSkillIds]);
  const activeReviewRounds = useMemo(() => {
    const sessionRounds = activeSession ? reviewRounds.filter((round) => round.sessionId === activeSession.id) : [];
    const blockingStageRounds = project?.workflow.stage
      ? reviewRounds.filter((round) => round.stage === project.workflow.stage && (round.issues ?? []).some((issue) => issue.state === 'pending'))
      : [];
    if (!blockingStageRounds.length) {
      return sessionRounds;
    }

    const merged = [...sessionRounds];
    for (const round of blockingStageRounds) {
      if (!merged.some((item) => item.id === round.id)) {
        merged.push(round);
      }
    }
    return merged;
  }, [reviewRounds, activeSession, project?.workflow.stage]);
  const visibleSessions = useMemo(() => sortSessions(sessions.filter((session) => !session.archived)), [sessions]);
  const archivedSessions = useMemo(() => sortSessions(sessions.filter((session) => session.archived)), [sessions]);
  const filteredTree = useMemo(() => filterTree(project?.tree ?? [], treeFilter), [project?.tree, treeFilter]);
  const activeDocument = useMemo(() => activeDocumentPath ? openDocuments[activeDocumentPath] ?? null : null, [activeDocumentPath, openDocuments]);
  const secondaryDocumentPath = layout.secondaryDocumentPath ?? '';
  const secondaryDocument = useMemo(
    () => secondaryDocumentPath ? openDocuments[secondaryDocumentPath] ?? null : null,
    [openDocuments, secondaryDocumentPath]
  );
  const documentSplitOpen = Boolean(
    layout.documentSplitOpen
    && secondaryDocumentPath
    && secondaryDocument
    && secondaryDocumentPath !== activeDocumentPath
  );
  const activeDocumentName = activeDocument?.title ?? (fileName(activeDocumentPath) || '未选择文档');
  const documentValue = activeDocument?.value ?? '';
  const documentLoading = Boolean(activeDocument?.loading);
  const activeDocumentIsText = Boolean(activeDocument && !activeDocument.loading && isTextDocumentKind(activeDocument.kind));
  const activeMarkdownSlashMenu = markdownSlashMenu && markdownSlashMenu.path === activeDocumentPath
    ? markdownSlashMenu
    : null;
  const markdownSlashCommands = useMemo(
    () => listMarkdownBlockCommands(activeMarkdownSlashMenu?.query ?? ''),
    [activeMarkdownSlashMenu]
  );
  const markdownToolbarCommands = useMemo(
    () => markdownToolbarCommandIds.flatMap((commandId) => {
      const command = listMarkdownBlockCommands().find((item) => item.id === commandId);
      return command ? [command] : [];
    }),
    []
  );
  const activeDocumentIsTable = Boolean(activeDocument && !activeDocument.loading && activeDocument.kind === 'table');
  const activeDocumentSupportsExternalSync = Boolean(activeDocument && !activeDocument.loading && (activeDocumentIsText || activeDocumentIsTable));
  const activeDocumentSupportsProtection = Boolean(activeDocument && !activeDocument.loading && !activeDocument.artifact?.binary && activeDocument.kind !== 'image' && activeDocument.kind !== 'unsupported');
  const documentDirty = Boolean(activeDocument && !activeDocument.loading && (
    activeDocumentIsTable
      ? artifactSignature(activeDocument.artifact) !== (activeDocument.lastSavedArtifactSignature ?? '')
      : activeDocument.value !== activeDocument.lastSavedValue
  ));
  const activePendingDocumentWrite = useMemo(
    () => pendingDocumentWrites.find((item) => item.filePath === activeDocumentPath) ?? pendingDocumentWrites[0] ?? null,
    [pendingDocumentWrites, activeDocumentPath]
  );
  const activeNoteDocument = useMemo(
    () => noteReferenceGraph?.documents.find((document) => document.path === activeDocumentPath) ?? null,
    [noteReferenceGraph, activeDocumentPath]
  );
  const noteComparisonCandidates = useMemo(
    () => noteReferenceGraph?.documents.filter((document) => document.path !== activeDocumentPath) ?? [],
    [noteReferenceGraph, activeDocumentPath]
  );
  const activeNoteComparison = useMemo<NoteReferenceComparison | null>(() => {
    if (!activeNoteDocument || !noteComparePath || !noteReferenceGraph) return null;
    const compareDocument = noteReferenceGraph.documents.find((document) => document.path === noteComparePath);
    if (!compareDocument) return null;
    return compareNoteDocuments(activeNoteDocument, compareDocument, noteReferenceGraph.documents);
  }, [activeNoteDocument, noteComparePath, noteReferenceGraph]);
  const relevantRecentDocumentChanges = useMemo(() => {
    if (!recentDocumentChanges.length) return [];
    if (!activeDocumentPath) return recentDocumentChanges.slice(0, 4);
    const relevant = recentDocumentChanges.filter((record) =>
      record.filePath === activeDocumentPath
      || record.impact.inboundAffectedPaths.includes(activeDocumentPath)
      || record.impact.outboundAddedPaths.includes(activeDocumentPath)
      || record.impact.outboundRemovedPaths.includes(activeDocumentPath)
    );
    return (relevant.length ? relevant : recentDocumentChanges).slice(0, 4);
  }, [recentDocumentChanges, activeDocumentPath]);

  const refreshThinkingChainSnapshot = useCallback(async (sessionId = activeSession?.id) => {
    if (layout.activityView !== 'thinking-chain' || !project) {
      setThinkingChainLoading(false);
      setThinkingChainSnapshot(null);
      setSelectedThinkingNodeId('');
      return null;
    }
    setThinkingChainLoading(true);
    try {
      const snapshot = await window.api.getThinkingChain(sessionId);
      setThinkingChainSnapshot(snapshot);
      setThinkingChainZoom(snapshot?.layoutState?.view.zoom ?? 1);
      setSelectedThinkingNodeId((current) =>
        snapshot?.nodes.find((node) => node.id === current)?.id
          ?? snapshot?.nodes[0]?.id
          ?? ''
      );
      return snapshot;
    } finally {
      setThinkingChainLoading(false);
    }
  }, [activeSession?.id, layout.activityView, project]);

  useEffect(() => {
    void refreshThinkingChainSnapshot(activeSession?.id);
  }, [
    activeSession?.id,
    artifactRevisions,
    refreshThinkingChainSnapshot,
    layout.activityView,
    project,
    recentDocumentChanges,
    reviewRounds,
    runtimeEvents,
    runtimeRuns,
    sessions
  ]);
  const resourcePlatform = project ? platform : draftPlatform;
  const resourceDescriptors = useMemo<ResourceDescriptor[]>(() => {
    const templateResources: ResourceDescriptor[] = templates.map((template) => ({
      id: template.id,
      kind: 'template',
      name: template.name,
      version: template.version,
      description: template.shortDescription || template.description,
      source: template.source,
      sourceLabel: template.source === 'builtin' ? '内置' : template.source === 'remote' ? '远程' : '本地',
      trust: template.trust ?? (template.source === 'builtin' ? 'trusted' : 'review'),
      compatibility: template.compatibility ?? 'current',
      health: template.health,
      issueMessage: template.issueMessage,
      repairable: template.repairable,
      updatable: template.updatable,
      installed: true,
      tags: [template.category, ...(template.artifactPreview ?? [])].filter(Boolean),
      metadata: [
        { label: '分类', value: template.category },
        { label: '版本', value: template.version || '1.0.0' },
        ...(template.defaultFlowName ? [{ label: '默认流程', value: template.defaultFlowName }] : []),
        ...(template.issueMessage ? [{ label: '状态说明', value: template.issueMessage }] : [])
      ]
    }));
    const skillResources: ResourceDescriptor[] = installedSkills.map((skill) => ({
      id: skill.id,
      kind: 'skill',
      name: skill.name,
      description: skill.description,
      source: 'local',
      sourceLabel: '本地',
      version: skill.version,
      trust: skill.trust ?? 'review',
      compatibility: skill.compatibility ?? 'current',
      issueMessage: skill.issueMessage,
      installed: true,
      tags: skill.applicableStages,
      metadata: [
        { label: '适用阶段', value: skill.applicableStages.join(' / ') || '通用' },
        { label: '安装时间', value: skill.installedAt || '未知' },
        ...(skill.provenance ? [
          { label: '来源草案', value: skill.provenance.promotionDraftId },
          { label: '来源沉淀', value: skill.provenance.accumulationEntryId },
          ...(skill.provenance.packagePath ? [{ label: '包路径', value: skill.provenance.packagePath }] : [])
        ] : [])
      ]
    }));
    const roleResources: ResourceDescriptor[] = installedRolePackages.map((rolePackage) => ({
      id: rolePackage.id,
      kind: 'role-package',
      name: rolePackage.name,
      description: rolePackage.description,
      source: rolePackage.source === 'builtin' ? 'builtin' : rolePackage.source.startsWith('http') ? 'remote' : 'local',
      sourceLabel: rolePackage.source === 'builtin' ? '内置' : rolePackage.source.startsWith('http') ? '远程' : '本地',
      version: rolePackage.version,
      trust: rolePackage.trust ?? (rolePackage.source === 'builtin' ? 'trusted' : 'review'),
      compatibility: rolePackage.compatibility ?? 'current',
      issueMessage: rolePackage.issueMessage,
      installed: true,
      tags: [...rolePackage.tags, ...(rolePackage.domain ? [rolePackage.domain] : [])],
      metadata: [
        ...(rolePackage.domain ? [{ label: '领域', value: rolePackage.domain }] : []),
        { label: '来源', value: rolePackage.source }
      ]
    }));
    const connectorResources: ResourceDescriptor[] = (resourcePlatform?.connectors ?? []).map((connector) => ({
      id: connector.id,
      kind: 'connector',
      name: connector.name,
      description: connector.description || '工程连接能力',
      source: connector.scope === 'remote' ? 'remote' : 'local',
      sourceLabel: connector.scope === 'remote' ? '远程' : '本地',
      installed: true,
      trust: connector.scope === 'remote' ? 'review' : 'trusted',
      compatibility: connector.compatibility ?? 'unknown',
      health: connector.health === 'unknown' ? 'warning' : connector.health,
      issueMessage: connector.lastError || connector.diagnostic?.summary,
      tags: [
        connector.transport,
        ...(connector.capabilitySummary ?? []),
        connector.authStatus ? `auth:${connector.authStatus}` : ''
      ].filter(Boolean),
      metadata: [
        { label: '类型', value: connector.transport === 'http' ? 'HTTP Connector' : 'STDIO Connector' },
        { label: '健康状态', value: connector.health },
        { label: '授权状态', value: connector.authStatus ?? 'unknown' },
        { label: '最近检查', value: connector.lastCheckedAt ? new Date(connector.lastCheckedAt).toLocaleString() : '未检查' },
        ...(connector.endpoint ? [{ label: 'Endpoint', value: connector.endpoint }] : []),
        ...(connector.command ? [{ label: '命令', value: connector.command }] : []),
        ...(connector.diagnostic?.code ? [{ label: '诊断代码', value: connector.diagnostic.code }] : []),
        ...(connector.lastError ? [{ label: '最近错误', value: connector.lastError }] : [])
      ]
    }));
    return [...templateResources, ...skillResources, ...roleResources, ...connectorResources];
  }, [templates, installedSkills, installedRolePackages, resourcePlatform?.connectors]);
  const recentTemplateEntries = useMemo(
    () => (settings?.recentTemplates ?? [])
      .map((templateId) => templates.find((template) => template.id === templateId) ?? null)
      .filter((template): template is ProjectTemplateDefinition => Boolean(template)),
    [settings?.recentTemplates, templates]
  );
  const templateIds = useMemo(() => templates.map((template) => template.id), [templates]);
  const recentDraftEntries = settings?.recentDrafts ?? [];
  const draftSnapshot = useMemo(() => {
    if (project || !draftSnapshotId) return null;
    return buildDraftSnapshot(draftSnapshotId);
  }, [project, draftSnapshotId, draftPlatform, draftRuntimeTemplate, draftFlowHistories, draftTemplatePackage, sessions, activeSessionId]);
  const draftSnapshotSignature = useMemo(
    () => draftSnapshot ? serializeDraftSnapshot(draftSnapshot) : '',
    [draftSnapshot]
  );
  const draftStatusLabel = project
    ? ''
    : draftSaveError
      ? '保存失败'
      : draftSaving
        ? '自动保存中…'
        : draftDirty
          ? '未保存'
          : draftPlatform
            ? '已保存草稿'
            : '';
  const activePlatform = project ? platform : draftPlatform;
  const activeRuntimeTemplate = project ? runtimeTemplate : draftRuntimeTemplate;
  const activeFlowHistories = project ? flowHistories : draftFlowHistories;
  const documentTabs = useMemo<DocumentTabItem[]>(
    () => openTabs.map((tabPath) => ({
      path: tabPath,
      title: openDocuments[tabPath]?.title ?? (fileName(tabPath) || '未命名文档'),
      dirty: Boolean(openDocuments[tabPath] && (
        openDocuments[tabPath].kind === 'table'
          ? artifactSignature(openDocuments[tabPath].artifact) !== (openDocuments[tabPath].lastSavedArtifactSignature ?? '')
          : openDocuments[tabPath].value !== openDocuments[tabPath].lastSavedValue
      ))
    })),
    [openDocuments, openTabs]
  );
  const projectArtifactCandidates = useMemo(
    () => project ? collectProjectArtifactFiles(project.tree, activeDocumentPath, project.rootPath) : [],
    [project, activeDocumentPath]
  );
  const activeDocumentMatches = useMemo(() => findTextRanges(documentValue, findQuery), [documentValue, findQuery]);
  const activeMatch = activeDocumentMatches[findIndex] ?? null;
  const activeConversationTargetLabel = useMemo(() => {
    if (!conversationTarget) {
      return activeDocumentPath ? activeDocumentName : (orchestrationConversationFlow?.name ?? '当前上下文');
    }
    if (conversationTarget.targetType === 'project-doc') return activeDocumentName;
    if (conversationTarget.targetType === 'settings') return '设置';
    return orchestrationConversationFlow?.name ?? '当前流程';
  }, [activeDocumentName, activeDocumentPath, conversationTarget, orchestrationConversationFlow]);
  const refreshDocumentProtectionState = useCallback(async (targetPath?: string) => {
    if (!project) {
      setDocumentSnapshots([]);
      setPendingDocumentWrites([]);
      return;
    }
    const [nextSnapshots, nextPendingWrites] = await Promise.all([
      targetPath ? window.api.listDocumentSnapshots(targetPath) : Promise.resolve([]),
      window.api.listPendingDocumentWrites()
    ]);
    setDocumentSnapshots(nextSnapshots);
    setPendingDocumentWrites(nextPendingWrites);
  }, [project, setDocumentSnapshots, setPendingDocumentWrites]);

  useEffect(() => {
    if (!projectDialogOpen) {
      setProjectCreateValidation(null);
      return;
    }
    let cancelled = false;
    void window.api.validateProjectCreate(projectDraft).then((validation) => {
      if (!cancelled) {
        setProjectCreateValidation(validation as ProjectCreateValidation);
      }
    }).catch((error) => {
      if (!cancelled) {
        setProjectCreateValidation(null);
        setProjectDialogStatus(error instanceof Error ? error.message : '工程创建校验失败');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectDialogOpen, projectDraft]);

  useEffect(() => {
    openDocumentsRef.current = openDocuments;
  }, [openDocuments]);

  useEffect(() => {
    activeDocumentPathRef.current = activeDocumentPath;
  }, [activeDocumentPath]);

  useEffect(() => {
    if (!project || !layout.documentSplitOpen || !secondaryDocumentPath) return;
    if (secondaryDocumentPath === activeDocumentPath) {
      patchSidebar({ documentSplitOpen: false, secondaryDocumentPath: '' });
      return;
    }
    if (!existsInTree(project.tree, secondaryDocumentPath)) {
      patchSidebar({ documentSplitOpen: false, secondaryDocumentPath: '' });
      return;
    }
    if (!openDocumentsRef.current[secondaryDocumentPath]) {
      void openDocument(secondaryDocumentPath, { pane: 'secondary' });
    }
  }, [activeDocumentPath, layout.documentSplitOpen, openDocument, project, secondaryDocumentPath]);

  useEffect(() => {
    void refreshDocumentProtectionState(activeDocumentPath || undefined);
  }, [activeDocumentPath, project?.rootPath, refreshDocumentProtectionState]);

  useEffect(() => {
    if (!noteComparePath) return;
    if (noteComparisonCandidates.some((document) => document.path === noteComparePath)) return;
    setNoteComparePath(noteComparisonCandidates[0]?.path ?? '');
  }, [noteComparePath, noteComparisonCandidates]);

  useEffect(() => {
    if (layout.activityView === 'orchestration' && orchestrationConversationFlow) {
      setConversationTarget({
        targetType: 'orchestration-flow',
        targetId: orchestrationConversationFlow.id
      });
      return;
    }
    if (layout.activityView === 'settings') {
      setConversationTarget({
        targetType: 'settings',
        targetId: 'settings'
      });
      return;
    }
    if (project && activeDocumentPath) {
      setConversationTarget({
        targetType: 'project-doc',
        targetId: activeDocumentPath
      });
      return;
    }
    setConversationTarget(null);
  }, [activeDocumentPath, layout.activityView, orchestrationConversationFlow, project]);

  useEffect(() => {
    if (!conversationTarget) {
      pendingAutoSessionTargetRef.current = null;
      return;
    }
    const targetKey = conversationTargetKey(conversationTarget);
    const matching = sessions.find((session) => !session.archived && sameConversationTarget(session.target, conversationTarget)) ?? null;
    if (matching) {
      pendingAutoSessionTargetRef.current = null;
      if (matching.id !== activeSessionId) {
        setActiveSessionId(matching.id);
      }
      return;
    }
    if (pendingAutoSessionTargetRef.current === targetKey) return;
    pendingAutoSessionTargetRef.current = targetKey;
    createSession(conversationTarget, { silent: true });
  }, [activeSessionId, conversationTarget, sessions]);

  useEffect(() => {
    void Promise.all([
      window.api.bootstrapLoad(),
      window.api.getWindowBootstrapContext()
    ]).then(([data, windowContext]) => {
      windowContextRef.current = windowContext;
      hydrateBootstrap(data as BootstrapData, {
        preserveSidebar: windowContext.mode === 'document',
        preferredDocumentPath: windowContext.documentPath
      });
      setStatus('就绪');
    }).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '应用加载失败');
    });
  }, []);

  useEffect(() => {
    sidebarRef.current = settings?.sidebar ?? defaultSidebar;
    if (!settings) return;
    const effectiveTheme =
      settings.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        : settings.theme;
    document.documentElement.dataset.theme = effectiveTheme;
  }, [settings]);

  useEffect(() => {
    if (!draftSnapshot || !draftSnapshotSignature) {
      setDraftDirty(false);
      setDraftSaving(false);
      if (!draftPlatform) {
        setDraftSaveError('');
      }
      return;
    }
    if (draftSnapshotSignature === lastSavedDraftSignatureRef.current) {
      setDraftDirty(false);
      return;
    }
    setDraftDirty(true);
    const timer = window.setTimeout(() => {
      setDraftSaving(true);
      void window.api.saveDraftOrchestration(draftSnapshot)
        .then((saved) => {
          lastSavedDraftSignatureRef.current = draftSnapshotSignature;
          setDraftDirty(false);
          setDraftSaveError('');
          mergeRecentSettings(saved as AppSettings);
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : '编排草稿保存失败';
          setDraftSaveError(message);
          setStatus(message);
        })
        .finally(() => {
          setDraftSaving(false);
        });
    }, 600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [draftPlatform, draftSnapshot, draftSnapshotSignature]);

  useEffect(() => {
    if (!settingsDraft) {
      setSettingsSelectedProfileId('');
      return;
    }
    if (settingsDraft.providerProfiles.some((profile) => profile.id === settingsSelectedProfileId)) {
      return;
    }
    setSettingsSelectedProfileId(settingsDraft.activeProviderProfileId || settingsDraft.providerProfiles[0]?.id || '');
  }, [settingsDraft, settingsSelectedProfileId]);

  useEffect(() => {
    if (!dragTarget || !settings) return;
    const onMove = (event: MouseEvent) => {
      const width = window.innerWidth;
      if (dragTarget === 'document-split') {
        const surface = documentSurfaceRef.current;
        if (!surface) return;
        const bounds = surface.getBoundingClientRect();
        const rawRatio = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
        setSettings((current) => {
          if (!current) return current;
          const nextSidebar = {
            ...current.sidebar,
            documentSplitRatio: clamp(Number(rawRatio.toFixed(3)), 0.25, 0.75)
          };
          sidebarRef.current = nextSidebar;
          return { ...current, sidebar: nextSidebar };
        });
        return;
      }
      setSettings((current) => {
        if (!current) return current;
        const currentShowPrimarySidebar = !current.sidebar.leftCollapsed
          && current.sidebar.activityView !== 'orchestration'
          && current.sidebar.activityView !== 'thinking-chain'
          && current.sidebar.activityView !== 'rules'
          && current.sidebar.activityView !== 'resources'
          && (Boolean(project) || current.sidebar.activityView === 'settings');
        const currentShowContextPane = Boolean(project || draftPlatform)
          && !current.sidebar.rightCollapsed
          && current.sidebar.activityView !== 'rules'
          && current.sidebar.activityView !== 'resources'
          && current.sidebar.activityView !== 'settings';
        const fitted = fitSidebarWidths(current.sidebar, width, currentShowPrimarySidebar, currentShowContextPane);
        const centerMin = minCenterPaneWidth(width);
        const maxLeftWidth = Math.max(
          minLeftSidebarWidth(width),
          width - ACTIVITY_BAR_WIDTH - (currentShowContextPane ? fitted.right + RESIZER_WIDTH : 0) - (currentShowPrimarySidebar && currentShowContextPane ? RESIZER_WIDTH : 0) - centerMin
        );
        const maxRightWidth = Math.max(
          minRightSidebarWidth(width),
          width - ACTIVITY_BAR_WIDTH - (currentShowPrimarySidebar ? fitted.left + RESIZER_WIDTH : 0) - (currentShowPrimarySidebar && currentShowContextPane ? RESIZER_WIDTH : 0) - centerMin
        );
        const nextSidebar = {
          ...current.sidebar,
          leftWidth: dragTarget === 'left'
            ? clamp(event.clientX - ACTIVITY_BAR_WIDTH, minLeftSidebarWidth(width), Math.min(MAX_LEFT_SIDEBAR_WIDTH, maxLeftWidth))
            : current.sidebar.leftWidth,
          rightWidth: dragTarget === 'right'
            ? clamp(width - event.clientX, minRightSidebarWidth(width), Math.min(MAX_RIGHT_SIDEBAR_WIDTH, maxRightWidth))
            : current.sidebar.rightWidth
        };
        sidebarRef.current = nextSidebar;
        return { ...current, sidebar: nextSidebar };
      });
    };
    const onUp = () => {
      setDragTarget(null);
      void window.api.updateLayout(sidebarRef.current);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragTarget, settings]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!topbarMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.topbar-menu-group')) return;
      setTopbarMenuOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTopbarMenuOpen(null);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [topbarMenuOpen]);

  useEffect(() => {
    if (!project) {
      setProjectSearchResults([]);
      return;
    }
    const normalizedQuery = searchQuery.trim();
    if (!normalizedQuery) {
      setProjectSearchResults([]);
      setProjectSearching(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setProjectSearching(true);
      void window.api.searchProjectContent(normalizedQuery).then((results) => {
        if (cancelled) return;
        setProjectSearchResults(results);
      }).finally(() => {
        if (!cancelled) {
          setProjectSearching(false);
        }
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [project, searchQuery]);

  const refreshStageGuard = useCallback(async (
    session = activeSession,
    isCancelled?: () => boolean
  ) => {
    if (!project || !session) {
      if (!isCancelled?.()) {
        setStageGuard(null);
      }
      return;
    }
    try {
      const guard = await window.api.getStageGuard(session.id, session.stage) as StageGuardStatus;
      if (!isCancelled?.()) {
        setStageGuard(guard);
      }
    } catch {
      if (!isCancelled?.()) {
        setStageGuard(null);
      }
    }
  }, [project, activeSession]);

  useEffect(() => {
    if (!project || !activeSession) {
      setStageGuard(null);
      return;
    }
    let cancelled = false;
    void refreshStageGuard(activeSession, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [project, activeSession?.id, activeSession?.stage, runtimeRuns.length, reviewRounds.length, refreshStageGuard]);

  useEffect(() => {
    if (!pendingSelection || pendingSelection.path !== activeDocumentPath) return;
    const textarea = editorRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(pendingSelection.range.start, pendingSelection.range.end);
    setPendingSelection(null);
  }, [activeDocumentPath, pendingSelection, viewMode]);

  useEffect(() => {
    if (!activeDocumentPath || !activeDocumentIsText || viewMode === 'read') {
      setMarkdownSlashMenu(null);
      return;
    }
    if (markdownSlashMenu && markdownSlashMenu.path !== activeDocumentPath) {
      setMarkdownSlashMenu(null);
    }
  }, [activeDocumentIsText, activeDocumentPath, markdownSlashMenu, viewMode]);

  useEffect(() => {
    if (findIndex >= activeDocumentMatches.length) {
      setFindIndex(activeDocumentMatches.length ? 0 : 0);
    }
  }, [activeDocumentMatches.length, findIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = navigator.platform.toLowerCase().includes('mac') ? event.metaKey : event.ctrlKey;
      if (!modifier) return;

      if (event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        openProjectSearch();
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === 't') {
        event.preventDefault();
        void reopenLastClosedDocument();
        return;
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveDocument();
        return;
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        openFindReplace(false);
        return;
      }

      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        openFindReplace(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeDocumentPath, project, recentlyClosedTabs.length, documentValue]);

  const commandItems = useMemo<CommandPaletteItem[]>(() => [
    { id: 'project-new', label: '新建工程', description: '创建一个全新的工程目录', run: () => void createProject() },
    { id: 'draft-start', label: '开始编排', description: '直接创建一个未绑定工程的编排草稿', run: () => void startDraftOrchestration() },
    { id: 'project-open', label: '打开工程', description: '打开或切换到其他工程', run: () => void openProject() },
    { id: 'project-close', label: '关闭工程', description: '返回欢迎页并保留最近工程入口', disabled: !project, run: () => void closeProject() },
    { id: 'resource-center', label: '打开资源中心', description: '统一查看模板、Skill 和角色包', run: () => openResourceCenter() },
    { id: 'project-import', label: '导入文本文档', description: '把外部 Markdown 或 txt 导入当前工程', disabled: !project, run: () => void importDocumentsIntoProject() },
    { id: 'view-orchestration', label: '打开编排工作台', description: '进入独立的编排页面，管理流程、角色、连接和工具', run: () => patchSidebar({ activityView: 'orchestration', leftCollapsed: false }) },
    { id: 'view-thinking-chain', label: '打开思路地图', description: '查看当前会话的思路结构、探索方向与产物落点', disabled: !(project || draftPlatform), run: () => patchSidebar({ activityView: 'thinking-chain', leftCollapsed: false }) },
    { id: 'view-rules', label: '打开规则与沉淀中心', description: '查看全局规则、工程规则、沉淀条目与提升草案', run: () => patchSidebar({ activityView: 'rules', leftCollapsed: false }) },
    { id: 'session-new', label: '新建会话', description: '为当前工程创建新的 AI 会话', disabled: !project, run: () => createSession() },
    { id: 'doc-save', label: '保存文档', description: '保存当前活动文档', disabled: !activeDocumentPath, run: () => void saveDocument() },
    { id: 'doc-open-window', label: '在新窗口打开文档', description: '把当前文档作为独立窗口打开，便于并排查看与编辑', disabled: !activeDocumentPath, run: () => void openDocumentInWindow() },
    { id: 'doc-check-external', label: '检查外部变更', description: '读取磁盘版本并检查是否存在外部修改冲突', disabled: !activeDocumentPath, run: () => void checkActiveDocumentExternalChange(true) },
    { id: 'doc-find', label: '文档内查找', description: '在当前文档内查找内容', disabled: !activeDocumentPath, run: () => openFindReplace(false) },
    { id: 'doc-replace', label: '文档内替换', description: '在当前文档内执行替换', disabled: !activeDocumentPath, run: () => openFindReplace(true) },
    { id: 'doc-reopen', label: '恢复已关闭文档', description: '重新打开最近关闭的文档标签', disabled: !recentlyClosedTabs.length, run: () => void reopenLastClosedDocument() },
    { id: 'search-project', label: '工程搜索', description: '搜索全文并跳转到命中文档', disabled: !project, run: () => openProjectSearch() },
    { id: 'view-command', label: '打开设置', description: '调整主题、模型和 API 配置', run: () => setSettingsOpen(true) },
    { id: 'ai-stage', label: '生成阶段草稿', description: '让 AI 生成当前阶段对应文档', disabled: !activeSession, run: () => void generateStageDraft() },
    { id: 'ai-confirm', label: '确认当前阶段', description: '确认当前阶段并推进工作流', disabled: !activeSession, run: () => void confirmStage() },
    { id: 'ai-review', label: '执行红蓝审查', description: '针对当前文档运行一轮审查', disabled: !activeSession || !activeDocumentPath, run: () => void runReviewRound() },
    { id: 'ai-openspec', label: '生成 OpenSpec', description: '根据当前文档输出 OpenSpec 交付', disabled: !project, run: () => void generateOpenSpec() }
  ], [activeDocumentPath, activeSession, project, recentlyClosedTabs.length]);
  const filteredCommandItems = useMemo(() => {
    const normalizedQuery = commandQuery.trim().toLowerCase();
    if (!normalizedQuery) return commandItems;
    return commandItems.filter((item) =>
      item.label.toLowerCase().includes(normalizedQuery) ||
      item.description.toLowerCase().includes(normalizedQuery) ||
      item.id.includes(normalizedQuery)
    );
  }, [commandItems, commandQuery]);
  const showActivityBar = !projectDialogOpen;
  const showPrimarySidebar = !projectDialogOpen
    && !layout.leftCollapsed
    && layout.activityView !== 'orchestration'
    && layout.activityView !== 'thinking-chain'
    && layout.activityView !== 'rules'
    && layout.activityView !== 'resources'
    && layout.activityView !== 'settings'
    && Boolean(project);
  const showContextPane = Boolean(project || draftPlatform)
    && !projectDialogOpen
    && !layout.rightCollapsed
    && layout.activityView !== 'orchestration'
    && layout.activityView !== 'thinking-chain'
    && layout.activityView !== 'rules'
    && layout.activityView !== 'resources'
    && layout.activityView !== 'settings';
  const fittedSidebarWidths = useMemo(
    () => fitSidebarWidths(layout, viewportWidth, showPrimarySidebar, showContextPane),
    [layout, viewportWidth, showPrimarySidebar, showContextPane]
  );
  useEffect(() => {
    if (!settings || dragTarget) return;
    const nextSidebar = {
      ...settings.sidebar,
      leftWidth: showPrimarySidebar ? fittedSidebarWidths.left : settings.sidebar.leftWidth,
      rightWidth: showContextPane ? fittedSidebarWidths.right : settings.sidebar.rightWidth,
      documentSplitRatio: clamp(settings.sidebar.documentSplitRatio ?? 0.5, 0.25, 0.75)
    };
    const changed = nextSidebar.leftWidth !== settings.sidebar.leftWidth
      || nextSidebar.rightWidth !== settings.sidebar.rightWidth
      || nextSidebar.documentSplitRatio !== settings.sidebar.documentSplitRatio;
    if (!changed) return;
    sidebarRef.current = nextSidebar;
    setSettings((current) => current ? { ...current, sidebar: nextSidebar } : current);
    const timeoutId = window.setTimeout(() => {
      void window.api.updateLayout(nextSidebar);
    }, 80);
    return () => window.clearTimeout(timeoutId);
  }, [dragTarget, fittedSidebarWidths.left, fittedSidebarWidths.right, settings, showContextPane, showPrimarySidebar, sidebarRef]);
  const topbarMenus: Record<TopbarMenuKey, TopbarMenuItem[][]> = {
    file: [
      [
        { id: 'file-new', label: '新建工程', description: '从模板开始一个新的工程', run: () => void createProject() },
        { id: 'file-open', label: project ? '切换工程' : '打开工程', description: '选择已有工程目录', run: () => void openProject() },
        { id: 'file-close', label: '关闭工程', description: '返回欢迎页并保留最近工程', disabled: !project, run: () => void closeProject() }
      ],
      [
        { id: 'file-import', label: '导入文本文档', description: '导入 Markdown 或 txt 到当前工程', disabled: !project, run: () => void importDocumentsIntoProject() },
        { id: 'file-reveal', label: '打开工程目录', description: '在系统文件管理器中显示当前工程', disabled: !project, run: () => void window.api.openProjectFolder() }
      ]
    ],
    edit: [
      [
        { id: 'edit-save', label: '保存文档', description: '保存当前活动文档', disabled: !activeDocumentPath, run: () => void saveDocument() },
        { id: 'edit-reopen', label: '恢复已关闭文档', description: '重新打开最近关闭的标签页', disabled: !recentlyClosedTabs.length, run: () => void reopenLastClosedDocument() }
      ],
      [
        { id: 'edit-find', label: '查找', description: '在当前文档内查找内容', disabled: !activeDocumentPath, run: () => openFindReplace(false) },
        { id: 'edit-replace', label: '替换', description: '在当前文档内替换内容', disabled: !activeDocumentPath, run: () => openFindReplace(true) }
      ]
    ],
    view: [
      [
        { id: 'view-project', label: '工程视图', description: '显示工程文件与目录结构', disabled: !project, run: () => patchSidebar({ activityView: 'project', leftCollapsed: false }) },
        { id: 'view-orchestration', label: '编排视图', description: '进入角色、流程、连接与工具编排页', run: () => patchSidebar({ activityView: 'orchestration', leftCollapsed: false }) },
        { id: 'view-sessions', label: '会话视图', description: '查看当前工程的会话列表', disabled: !project, run: () => patchSidebar({ activityView: 'sessions', leftCollapsed: false }) },
        { id: 'view-thinking-chain', label: '思路地图视图', description: '查看当前会话的思路结构、探索方向与产物落点', disabled: !(project || draftPlatform), run: () => patchSidebar({ activityView: 'thinking-chain', leftCollapsed: false }) },
        { id: 'view-rules', label: '规则视图', description: '查看规则、沉淀与知识链接网络', run: () => patchSidebar({ activityView: 'rules', leftCollapsed: false }) },
        { id: 'view-resources', label: '资源视图', description: '查看模板、Skill 和角色包', run: () => patchSidebar({ activityView: 'resources', leftCollapsed: false }) },
        { id: 'view-search', label: '搜索视图', description: '切换到工程全文搜索', disabled: !project, run: () => patchSidebar({ activityView: 'search', leftCollapsed: false }) },
        { id: 'view-settings', label: '设置视图', description: '切换到设置侧栏', run: () => patchSidebar({ activityView: 'settings', leftCollapsed: false }) }
      ],
      [
        { id: 'view-left', label: layout.leftCollapsed ? '展开主侧栏' : '收起主侧栏', description: '切换左侧导航与资产栏', run: () => patchSidebar({ leftCollapsed: !layout.leftCollapsed }) },
        { id: 'view-process', label: layout.processPanelOpen ? '收起流程面板' : '展开流程面板', description: '切换底部流程与审查面板', disabled: !project, run: () => patchSidebar({ processPanelOpen: !layout.processPanelOpen }) },
        { id: 'view-right', label: layout.rightCollapsed ? '展开 AI 侧栏' : '收起 AI 侧栏', description: '切换右侧当前会话面板', disabled: !(project || draftPlatform), run: () => patchSidebar({ rightCollapsed: !layout.rightCollapsed }) }
      ]
    ]
  };

  function resetDocumentWorkspace() {
    setActiveDocumentPath('');
    setOpenDocuments({});
    setOpenTabs([]);
    setRecentlyClosedTabs([]);
    setFindOpen(false);
    setFindQuery('');
    setReplaceText('');
    setFindIndex(0);
    setPendingSelection(null);
    setConflictState(null);
  }

  function confirmDiscardUnsavedDocuments() {
    const dirtyCount = Object.values(openDocuments).filter((item) => item.value !== item.lastSavedValue).length;
    if (!dirtyCount) return true;
    return window.confirm(`当前有 ${dirtyCount} 个文档尚未保存，确认继续吗？`);
  }

  function mergeRecentSettings(nextSettings: AppSettings) {
    setSettings((current) => current ? {
      ...current,
      recentProjects: nextSettings.recentProjects,
      recentTemplates: nextSettings.recentTemplates,
      recentResources: nextSettings.recentResources,
      recentDrafts: nextSettings.recentDrafts
    } : nextSettings);
  }

  function buildDraftSnapshot(nextId: string): DraftOrchestrationSnapshot | null {
    if (!draftPlatform || !draftRuntimeTemplate || !draftTemplatePackage || !nextId.trim()) return null;
    return {
      id: nextId.trim(),
      name: draftRuntimeTemplate.name?.trim() || draftPlatform.template?.name || '编排草稿',
      updatedAt: new Date().toISOString(),
      platform: draftPlatform,
      runtimeTemplate: draftRuntimeTemplate,
      flowHistories: draftFlowHistories,
      sessions,
      activeSessionId: activeSessionId || undefined,
      templatePackage: draftTemplatePackage
    };
  }

  function applyDraftSnapshot(snapshot: DraftOrchestrationSnapshot) {
    resetDocumentWorkspace();
    setProject(null);
    setSessions(snapshot.sessions ?? []);
    setReviewRounds([]);
    setProjectSkillIds([]);
    setSessionSkillIds({});
    setDraftSnapshotId(snapshot.id);
    setDraftPlatform(snapshot.platform);
    setDraftRuntimeTemplate(snapshot.runtimeTemplate);
    setDraftFlowHistories(snapshot.flowHistories ?? {});
    setDraftTemplatePackage(snapshot.templatePackage);
    setActiveSessionId(snapshot.activeSessionId ?? snapshot.sessions?.[0]?.id ?? '');
    setDraftDirty(false);
    setDraftSaveError('');
    setDraftSaving(false);
    lastSavedDraftSignatureRef.current = serializeDraftSnapshot(snapshot);
    setResourceCenterOpen(false);
    setProjectDialogOpen(false);
    setLandingView('welcome');
    patchSidebar({ activityView: 'orchestration', leftCollapsed: true, rightCollapsed: true, processPanelOpen: false });
  }

  function confirmDiscardUnsavedWorkspace() {
    const dirtyDocuments = Object.values(openDocuments).filter((item) => item.value !== item.lastSavedValue).length;
    const dirtyDraft = Boolean(!project && draftPlatform && (draftDirty || draftSaving || draftSaveError));
    if (!dirtyDocuments && !dirtyDraft) return true;
    if (dirtyDocuments && dirtyDraft) {
      return window.confirm(`当前有 ${dirtyDocuments} 个文档尚未保存，且编排草稿尚未完成本地保存，确认继续吗？`);
    }
    if (dirtyDocuments) {
      return confirmDiscardUnsavedDocuments();
    }
    return window.confirm('当前编排草稿尚未完成本地保存，确认继续吗？');
  }

  function hydrateBootstrap(data: BootstrapData, options?: { preserveSidebar?: boolean; preferredDocumentPath?: string }) {
    const shouldPreserveSidebar =
      options?.preserveSidebar
      ?? Boolean(project?.rootPath && data.project?.rootPath && project.rootPath === data.project.rootPath);
    const nextSidebar = shouldPreserveSidebar
      ? { ...defaultSidebar, ...sidebarRef.current }
      : { ...defaultSidebar, ...data.settings.sidebar };

    sidebarRef.current = nextSidebar;
    setSettings({ ...data.settings, sidebar: nextSidebar });
    setSettingsDraft({
      theme: data.settings.theme,
      debug: data.settings.debug,
      activeProviderProfileId: data.settings.activeProviderProfileId,
      providerProfiles: toProviderProfileDrafts(data.settings)
    });
    setSettingsSelectedProfileId((current) =>
      data.settings.providerProfiles.some((profile) => profile.id === current)
        ? current
        : data.settings.activeProviderProfileId || data.settings.providerProfiles[0]?.id || ''
    );
    setTemplates(data.templates);
    setPlatform(data.platform);
    setRuntimeTemplate(data.runtimeTemplate);
    setRulesDistillation(data.rulesDistillation);
    setFlowHistories(data.flowHistories ?? {});
    setProjectDraft((current) => ({
      ...current,
      templateId: data.templates.some((item) => item.id === current.templateId)
        ? current.templateId
        : data.templates[0]?.id ?? ''
    }));
    setProject(data.project);
    setSessions(data.sessions);
    setReviewRounds(data.reviewRounds);
    setInstalledSkills(data.installedSkills);
    setInstalledRolePackages(data.installedRolePackages);
    setProjectSkillIds(data.projectSkillIds);
    setSessionSkillIds(data.sessionSkillIds);
    setSnapshots(data.snapshots);
    setConsistencyReport(data.consistencyReport);
    setAuditEntries(data.auditEntries);
    setRecentDocumentChanges(data.recentDocumentChanges);
    setArtifactRevisions(data.artifactRevisions);
    setArtifactInvalidations(data.artifactInvalidations);
    setRuntimeRuns(data.runtimeRuns);
    setRuntimeEvents(data.runtimeEvents);
    setRuntimeCapabilities(data.runtimeCapabilities);
    setContextPacks(data.contextPacks);
    setKnowledgeIndexState(data.knowledgeIndexState);
    setRuntimeGovernorStatus(data.runtimeGovernorStatus);
    setNoteReferenceGraph(data.noteReferenceGraph);
    setActiveSessionId((current) => data.sessions.find((session) => session.id === current)?.id ?? data.sessions[0]?.id ?? '');
    setNoteComparePath('');
    if (!data.project) {
      setDocumentProtectionOpen(false);
      setDocumentSnapshots([]);
      setPendingDocumentWrites([]);
      resetDocumentWorkspace();
      return;
    }

    const nextPreferredPath =
      options?.preferredDocumentPath && existsInTree(data.project.tree, options.preferredDocumentPath)
        ? options.preferredDocumentPath
        : activeDocumentPathRef.current && existsInTree(data.project.tree, activeDocumentPathRef.current)
        ? activeDocumentPathRef.current
        : data.project.workflow.activeDocumentPath;

    void restoreDocumentWorkspaceFromBootstrap(data.project, nextSidebar, nextPreferredPath);
  }

  function unpackBootstrapEnvelope(payload: RuntimeBootstrapEnvelope) {
    if ('bootstrap' in payload) {
      return {
        bootstrap: payload.bootstrap,
        paused: Boolean(payload.paused),
        pausedRunId: payload.pausedRunId
      };
    }
    return {
      bootstrap: payload,
      paused: false,
      pausedRunId: undefined as string | undefined
    };
  }

  function patchSidebar(patch: Partial<SidebarLayout>, persist = true, fallbackSettings?: AppSettings | null) {
    setSettings((current) => {
      const baseSettings = current ?? fallbackSettings ?? null;
      if (!baseSettings) return current;
      const nextSidebar = { ...baseSettings.sidebar, ...patch };
      sidebarRef.current = nextSidebar;
      if (persist) void window.api.updateLayout(nextSidebar);
      return { ...baseSettings, sidebar: nextSidebar };
    });
  }

  function remapWorkspacePaths(sourcePath: string, destinationPath: string) {
    const remap = (candidate: string) => remapPathPrefix(candidate, sourcePath, destinationPath);
    setOpenDocuments((current) => {
      const nextEntries = Object.entries(current).map(([entryPath, state]) => {
        const nextPath = remap(entryPath);
        if (nextPath === entryPath) return [entryPath, state] as const;
        return [nextPath, {
          ...state,
          path: nextPath,
          title: fileName(nextPath) || state.title,
          artifact: state.artifact ? {
            ...state.artifact,
            filePath: nextPath,
            table: state.artifact.table ? {
              ...state.artifact.table,
              filePath: nextPath,
              title: fileName(nextPath) || state.artifact.table.title
            } : state.artifact.table
          } : state.artifact
        }] as const;
      });
      return Object.fromEntries(nextEntries);
    });
    setOpenTabs((current) => current.map(remap));
    setRecentlyClosedTabs((current) => current.map(remap));
    setPendingDocumentWrites((current) => current.map((item) => {
      const nextPath = remap(item.filePath);
      return nextPath === item.filePath ? item : { ...item, filePath: nextPath };
    }));
    setActiveDocumentPath((current) => remap(current));
    setProject((current) => current ? {
      ...current,
      workflow: {
        ...current.workflow,
        activeDocumentPath: current.workflow.activeDocumentPath ? remap(current.workflow.activeDocumentPath) : current.workflow.activeDocumentPath
      }
    } : current);
    const nextSecondaryPath = remap(layout.secondaryDocumentPath ?? '');
    if (nextSecondaryPath !== (layout.secondaryDocumentPath ?? '')) {
      patchSidebar({ secondaryDocumentPath: nextSecondaryPath }, false);
    }
    return {
      activePath: remap(activeDocumentPathRef.current || ''),
      secondaryPath: nextSecondaryPath
    };
  }

  async function persistSecondaryDocumentLayout(filePath: string) {
    const nextSidebar = {
      ...sidebarRef.current,
      documentSplitOpen: true,
      secondaryDocumentPath: filePath
    };
    patchSidebar(nextSidebar, false);
    await window.api.updateLayout(nextSidebar);
  }

  async function syncWorkflowActiveDocument(filePath?: string) {
    if (!project?.rootPath) return;
    await window.api.setActiveDocument(filePath);
  }

  async function restoreDocumentWorkspaceFromBootstrap(
    projectSummary: ProjectSummary,
    sidebarLayout: SidebarLayout,
    preferredPath?: string
  ) {
    const nextPrimaryPath = preferredPath && existsInTree(projectSummary.tree, preferredPath)
      ? preferredPath
      : '';
    if (nextPrimaryPath) {
      await openDocument(nextPrimaryPath, {
        forceReload: !openDocumentsRef.current[nextPrimaryPath],
        syncWorkflow: nextPrimaryPath !== projectSummary.workflow.activeDocumentPath
      });
    } else {
      setActiveDocumentPath('');
    }

    const nextSecondaryPath = sidebarLayout.documentSplitOpen
      ? sidebarLayout.secondaryDocumentPath ?? ''
      : '';
    if (!nextSecondaryPath || nextSecondaryPath === nextPrimaryPath || !existsInTree(projectSummary.tree, nextSecondaryPath)) {
      return;
    }

    await openDocument(nextSecondaryPath, {
      forceReload: !openDocumentsRef.current[nextSecondaryPath],
      pane: 'secondary',
      syncWorkflow: false
    });
  }

  function focusPrimaryDocument(filePath: string, shouldSyncWorkflow: boolean, options?: { skipActivePathUpdate?: boolean }) {
    if (!options?.skipActivePathUpdate) {
      activeDocumentPathRef.current = filePath;
      setActiveDocumentPath(filePath);
    }
    setProject((current) => current ? { ...current, workflow: { ...current.workflow, activeDocumentPath: filePath } } : current);
    if (shouldSyncWorkflow) {
      void syncWorkflowActiveDocument(filePath).catch((error) => {
        setStatus(error instanceof Error ? error.message : `Failed to sync active document: ${fileName(filePath)}`);
      });
    }
  }

  function createPendingDocumentState(filePath: string, current?: OpenDocumentState): OpenDocumentState {
    if (current) {
      return {
        ...current,
        loading: true
      };
    }

    return {
      path: filePath,
      title: fileName(filePath) || 'Untitled document',
      kind: 'text',
      value: '',
      lastSavedValue: '',
      lastKnownModifiedAt: Date.now(),
      loading: true
    };
  }

  function primePrimaryDocumentFeedback(filePath: string) {
    flushSync(() => {
      activeDocumentPathRef.current = filePath;
      setActiveDocumentPath(filePath);
      setOpenTabs((current) => current.includes(filePath) ? current : [...current, filePath]);
    });
  }

  async function openDocument(
    filePath: string,
    options?: { forceReload?: boolean; selection?: TextRange; pane?: 'primary' | 'secondary'; syncWorkflow?: boolean; immediateFeedback?: boolean }
  ) {
    const shouldSyncWorkflow = options?.syncWorkflow ?? windowContextRef.current.mode !== 'document';
    const immediatePrimaryFeedback = Boolean(options?.immediateFeedback && options?.pane !== 'secondary');
    if (options?.pane === 'secondary' && filePath === activeDocumentPathRef.current) {
      setStatus('当前文档已经在主视图中打开');
      return;
    }
    const existing = openDocumentsRef.current[filePath];
    if (existing && !options?.forceReload) {
      if (immediatePrimaryFeedback) {
        primePrimaryDocumentFeedback(filePath);
      } else {
        setOpenTabs((current) => current.includes(filePath) ? current : [...current, filePath]);
      }
      if (options?.pane === 'secondary') {
        await persistSecondaryDocumentLayout(filePath);
      } else {
        focusPrimaryDocument(filePath, shouldSyncWorkflow, { skipActivePathUpdate: immediatePrimaryFeedback });
      }
      if (options?.selection) {
        setPendingSelection({ path: filePath, range: options.selection });
      }
      return;
    }
    setOpenDocuments((current) => ({
      ...current,
      [filePath]: createPendingDocumentState(filePath, current[filePath] ?? existing)
    }));
    if (immediatePrimaryFeedback) {
      primePrimaryDocumentFeedback(filePath);
    } else {
      setOpenTabs((current) => current.includes(filePath) ? current : [...current, filePath]);
    }
    if (options?.pane === 'secondary') {
      await persistSecondaryDocumentLayout(filePath);
    } else {
      focusPrimaryDocument(filePath, shouldSyncWorkflow, { skipActivePathUpdate: immediatePrimaryFeedback });
    }
    if (options?.selection) {
      setPendingSelection({ path: filePath, range: options.selection });
    }

    try {
      const [artifact, meta] = await Promise.all([
      window.api.openArtifact(filePath),
      window.api.getDocumentMeta(filePath)
      ]);
      const nextValue = artifact.content ?? '';
      const nextArtifactSignature = artifactSignature(artifact);

    setOpenDocuments((current) => ({
      ...current,
      [filePath]: {
        path: filePath,
        title: fileName(filePath) || '未命名文档',
        kind: artifact.kind,
        value: nextValue,
        lastSavedValue: nextValue,
        artifact,
        lastSavedArtifactSignature: nextArtifactSignature,
        lastKnownModifiedAt: meta.modifiedAt
      }
    }));
    } catch (error) {
      setOpenDocuments((current) => ({
        ...current,
        [filePath]: existing
          ? { ...existing, loading: false }
          : {
              path: filePath,
              title: fileName(filePath) || 'Untitled document',
              kind: 'unsupported',
              value: '',
              lastSavedValue: '',
              lastKnownModifiedAt: Date.now(),
              loading: false
            }
      }));
      setStatus(error instanceof Error ? error.message : `Failed to open document: ${fileName(filePath)}`);
      throw error;
    }
  }

  async function openProjectAt(rootPath: string) {
    if (!confirmDiscardUnsavedWorkspace()) return;
    try {
      const result = await window.api.openProject(rootPath);
      resetDraftOrchestration();
      resetDocumentWorkspace();
      const data = result as BootstrapData;
      hydrateBootstrap(data);
      patchSidebar(
        { activityView: 'project', leftCollapsed: false, rightCollapsed: false },
        true,
        { ...data.settings, sidebar: { ...defaultSidebar, ...data.settings.sidebar } }
      );
      setStatus(`已打开工程：${rootPath}`);
    } catch (error) {
      const refreshed = await window.api.bootstrapLoad();
      hydrateBootstrap(refreshed as BootstrapData);
      setStatus(error instanceof Error ? error.message : '打开最近工程失败');
    }
  }

  function createProject() {
    if (!confirmDiscardUnsavedWorkspace()) return;
    setProjectDialogStatus('');
    setProjectCreateValidation(null);
    setProjectTemplateOverride(null);
    setProjectTemplatePackageOverride(null);
    setProjectDraft((current) => ({ ...current, templateId: current.templateId || templates[0]?.id || '' }));
    setLandingView('welcome');
    setProjectDialogOpen(true);
  }

  function resetDraftOrchestration() {
    setDraftSnapshotId('');
    setDraftDirty(false);
    setDraftSaving(false);
    setDraftSaveError('');
    lastSavedDraftSignatureRef.current = '';
    setDraftPlatform(null);
    setDraftRuntimeTemplate(null);
    setDraftFlowHistories({});
    setDraftTemplatePackage(null);
    setProjectTemplateOverride(null);
    setProjectTemplatePackageOverride(null);
  }

  async function openRecentDraft(entry: RecentDraftEntry) {
    if (!entry.available) {
      setStatus(`最近编排草稿已失效：${entry.name}`);
      return;
    }
    if (!confirmDiscardUnsavedWorkspace()) return;
    const snapshot = await window.api.getDraftOrchestration(entry.id);
    if (!snapshot) {
      setStatus(`无法打开最近编排草稿：${entry.name}`);
      return;
    }
    applyDraftSnapshot(snapshot);
    setStatus(`已恢复编排草稿：${snapshot.name}`);
  }

  async function removeRecentDraft(entry: RecentDraftEntry) {
    if (!window.confirm(`确认从最近编排中移除“${entry.name}”吗？`)) return;
    const saved = await window.api.removeDraftOrchestration(entry.id) as AppSettings;
    mergeRecentSettings(saved);
    setStatus('最近编排已移除');
  }

  function closeDraftToWelcome() {
    if (!confirmDiscardUnsavedWorkspace()) return;
    resetDraftOrchestration();
    setLandingView('welcome');
    patchSidebar({ activityView: 'project', leftCollapsed: false, rightCollapsed: false });
  }

  async function resolveDraftBasePackage() {
    const fallbackTemplateId = projectDraft.templateId || templates[0]?.id;
    if (!fallbackTemplateId) return null;
    return window.api.getTemplatePackage(fallbackTemplateId);
  }

  function createBlankDraftFromPackage(templatePackage: ProjectTemplatePackage) {
    const now = new Date().toISOString();
    const roleId = crypto.randomUUID();
    const flowId = crypto.randomUUID();
    const role: PlatformRole = {
      id: roleId,
      name: '默认角色',
      domain: '通用',
      description: '用于起始草稿的默认角色。',
      packageSections: {
        identity: '# IDENTITY\n- 名称: 默认角色\n- 定位: 起始草稿编排角色',
        soul: '',
        agents: '',
        user: '',
        memory: ''
      },
      packageStatus: 'incomplete',
      promptHint: '',
      responsibilities: [],
      allowedSkillIds: [],
      allowedCapabilities: ['read_artifact'],
      outputSchema: 'markdown',
      outputFormat: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };
    const flow: PlatformFlowAsset = {
      id: flowId,
      name: '主流程',
      description: '未绑定工程的起始流程草稿',
      kind: 'flow',
      createdAt: now,
      updatedAt: now,
      roleIds: [roleId],
      nodes: [
        {
          id: crypto.randomUUID(),
          type: 'start',
          position: { x: 96, y: 180 },
          data: { label: '开始' }
        },
        {
          id: crypto.randomUUID(),
          type: 'end',
          position: { x: 432, y: 180 },
          data: { label: '结束' }
        }
      ],
      edges: []
    };

    return {
      platform: {
        template: {
          id: templatePackage.definition.id,
          name: templatePackage.definition.name,
          description: templatePackage.definition.description,
          icon: templatePackage.definition.icon,
          category: templatePackage.definition.category,
          source: templatePackage.definition.source,
          selectedAt: now
        },
        flows: [flow],
        subflows: [],
        roles: [role],
        taskTemplates: [],
        agentProfiles: [],
        connectors: [],
        tools: []
      } satisfies PlatformAssets,
      runtimeTemplate: {
        ...templatePackage.runtime.template,
        name: `${templatePackage.definition.name} 草稿`,
        defaultFlowId: flowId,
        stageRoleIds: {
          discover: roleId,
          clarify: roleId,
          plan: roleId,
          draft: roleId,
          review: roleId,
          finalize: roleId
        }
      } satisfies RuntimeTemplateAsset
    };
  }

  async function startDraftOrchestration(templateId?: string) {
    if (!confirmDiscardUnsavedWorkspace()) return;
    const selectedTemplate = templateId ? templates.find((item) => item.id === templateId) ?? null : null;
    const unavailableReason = templateId ? templateUnavailableReason(selectedTemplate) : '';
    if (unavailableReason) {
      setStatus(unavailableReason);
      return;
    }
    const templatePackage = templateId
      ? await window.api.getTemplatePackage(templateId)
      : await resolveDraftBasePackage();
    if (!templatePackage) {
      setStatus('没有可用模板，无法创建编排草稿');
      return;
    }
    void window.api.markRecentTemplate(templatePackage.definition.id).then((saved) => {
      mergeRecentSettings(saved as AppSettings);
    });
    const seeded = templateId
      ? {
          platform: {
            template: {
              id: templatePackage.definition.id,
              name: templatePackage.definition.name,
              description: templatePackage.definition.description,
              icon: templatePackage.definition.icon,
              category: templatePackage.definition.category,
              source: templatePackage.definition.source,
              selectedAt: new Date().toISOString()
            },
            flows: templatePackage.platform.flows,
            subflows: templatePackage.platform.subflows,
            roles: templatePackage.platform.roles,
            taskTemplates: templatePackage.platform.taskTemplates ?? [],
            agentProfiles: templatePackage.platform.agentProfiles ?? [],
            connectors: templatePackage.platform.connectors,
            tools: templatePackage.platform.tools
          } satisfies PlatformAssets,
          runtimeTemplate: templatePackage.runtime.template
        }
      : createBlankDraftFromPackage(templatePackage);

    resetDocumentWorkspace();
    setProject(null);
    setSessions([]);
    setReviewRounds([]);
    setProjectSkillIds([]);
    setSessionSkillIds({});
    setDraftSnapshotId(crypto.randomUUID());
    setDraftPlatform(seeded.platform);
    setDraftRuntimeTemplate(seeded.runtimeTemplate);
    setDraftFlowHistories({});
    setDraftTemplatePackage(templatePackage);
    setDraftDirty(false);
    setDraftSaving(false);
    setDraftSaveError('');
    lastSavedDraftSignatureRef.current = '';
    setResourceCenterOpen(false);
    setProjectDialogOpen(false);
    setLandingView('welcome');
    patchSidebar({ activityView: 'orchestration', leftCollapsed: true, rightCollapsed: true, processPanelOpen: false });
    setStatus(templateId ? `已从模板启动编排草稿：${templatePackage.definition.name}` : '已创建空白编排草稿');
  }

  async function chooseProjectLocation(mode: ProjectTemplateDraft['directoryMode']) {
    const root = await window.api.chooseProjectBase(mode);
    if (!root) return;
    setProjectDraft((current) => ({ ...current, locationPath: root, directoryMode: mode }));
  }

  function openResourceCenter() {
    if (!project && !draftPlatform && !projectDialogOpen) {
      setResourceCenterOpen(false);
      setLandingView('resources');
      patchSidebar({ activityView: 'resources', leftCollapsed: false, rightCollapsed: true });
      return;
    }
    setResourceCenterSource(projectDialogOpen ? 'project-create' : 'welcome');
    setLandingView('resources');
    setResourceCenterOpen(true);
    setProjectDialogOpen(false);
    setProjectTemplateOverride(null);
    setProjectTemplatePackageOverride(null);
  }

  function openProjectDialogWithTemplate(templateId: string) {
    const selectedTemplate = templates.find((item) => item.id === templateId) ?? null;
    setProjectDraft((current) => ({ ...current, templateId }));
    setProjectTemplateOverride(null);
    setProjectTemplatePackageOverride(null);
    setProjectDialogStatus(templateUnavailableReason(selectedTemplate));
    setResourceCenterOpen(false);
    setLandingView('welcome');
    window.setTimeout(() => {
      setProjectDialogOpen(true);
    }, 0);
  }

  function openSaveTemplateDialog() {
    if (!project && !draftPlatform) return;
    const baseName = project
      ? (platform?.template?.name || project.manifest.name)
      : (draftRuntimeTemplate?.name || draftPlatform?.template?.name || '编排草稿');
    const initialId = ensureUniqueTemplateId(baseName, templateIds);
    setSaveTemplateDraft({
      id: initialId,
      name: baseName,
      shortDescription: project
        ? (platform?.template?.description || `${baseName} 的项目模板`)
        : (draftRuntimeTemplate?.description || `${baseName} 的本地模板`),
      description: project
        ? (platform?.template?.description || `${baseName} 的项目模板`)
        : (draftRuntimeTemplate?.description || `${baseName} 的本地模板`),
      category: project
        ? (platform?.template?.category || 'product')
        : (draftPlatform?.template?.category || 'product'),
      icon: project
        ? (platform?.template?.icon || 'workflow')
        : (draftPlatform?.template?.icon || 'workflow'),
      starterPrompt: `请用一句话描述你想通过“${baseName}”模板完成的目标。`
    });
    setSaveTemplateStatus('');
    setSaveTemplateOpen(true);
  }

  async function saveCurrentAsTemplate() {
    if (!saveTemplateDraft.name.trim() || !saveTemplateDraft.id.trim()) return;
    setSaveTemplateBusy(true);
    try {
      const requestedId = slugifyTemplateId(saveTemplateDraft.id || saveTemplateDraft.name);
      const uniqueId = ensureUniqueTemplateId(requestedId, templateIds);
      const normalizedDraft = {
        ...saveTemplateDraft,
        id: uniqueId
      };
      const result = project
        ? await window.api.saveProjectAsTemplate(normalizedDraft)
        : await window.api.saveDraftAsTemplate(buildDraftTemplatePackage(normalizedDraft), 'draft-orchestration');
      const data = result as BootstrapData;
      hydrateBootstrap(data, { preserveSidebar: true });
      setSaveTemplateOpen(false);
      setSaveTemplateStatus('');
      const suffixNote = uniqueId !== requestedId ? `（模板 ID 已自动调整为 ${uniqueId}）` : '';
      setProjectDialogStatus(`已保存模板：${saveTemplateDraft.name.trim()}${suffixNote}`);
      setStatus(`已将当前工程保存为模板：${saveTemplateDraft.name.trim()}${suffixNote}`);
    } catch (error) {
      setSaveTemplateStatus(error instanceof Error ? error.message : '保存模板失败');
    } finally {
      setSaveTemplateBusy(false);
    }
  }

  function buildDraftTemplatePackage(input: ProjectTemplateSaveInput): ProjectTemplatePackage {
    if (!draftPlatform || !draftRuntimeTemplate || !draftTemplatePackage) {
      throw new Error('当前没有可保存的编排草稿');
    }
    return {
      definition: {
        ...draftTemplatePackage.definition,
        id: slugifyTemplateId(input.id || input.name),
        name: input.name.trim(),
        shortDescription: input.shortDescription.trim(),
        description: input.description.trim(),
        category: input.category,
        icon: input.icon.trim() || draftTemplatePackage.definition.icon,
        starterPrompt: input.starterPrompt?.trim() || draftTemplatePackage.definition.starterPrompt,
        source: 'local'
      },
      platform: {
        flows: draftPlatform.flows,
        subflows: draftPlatform.subflows,
        roles: draftPlatform.roles,
        taskTemplates: draftPlatform.taskTemplates,
        agentProfiles: draftPlatform.agentProfiles,
        connectors: draftPlatform.connectors,
        tools: draftPlatform.tools
      },
      runtime: {
        promptProfiles: draftTemplatePackage.runtime.promptProfiles,
        artifactSchemas: draftTemplatePackage.runtime.artifactSchemas,
        template: {
          ...draftRuntimeTemplate,
          id: slugifyTemplateId(input.id || input.name),
          name: input.name.trim(),
          description: input.description.trim()
        }
      }
    };
  }

  function bindDraftToProject() {
    if (!draftPlatform || !draftRuntimeTemplate || !draftTemplatePackage) {
      setStatus('当前没有可绑定到工程的编排草稿');
      return;
    }
    const baseName = draftRuntimeTemplate.name?.trim() || draftPlatform.template?.name || '编排草稿';
    const bindTemplateId = ensureUniqueTemplateId(`${baseName}-draft-bind`, templateIds);
    const templatePackage = buildDraftTemplatePackage({
      id: bindTemplateId,
      name: baseName,
      shortDescription: draftRuntimeTemplate.description?.trim() || `${baseName} 的绑定模板`,
      description: draftRuntimeTemplate.description?.trim() || `${baseName} 的绑定模板`,
      category: draftPlatform.template?.category || 'product',
      icon: draftPlatform.template?.icon || 'workflow',
      starterPrompt: ''
    });
    setProjectTemplatePackageOverride(templatePackage);
    setProjectTemplateOverride({
      ...templatePackage.definition,
      source: 'local'
    });
    setProjectDraft((current) => ({
      ...current,
      templateId: templatePackage.definition.id
    }));
    setProjectDialogStatus('将按当前草稿内容初始化工程。创建时会先安装临时模板包。');
    setLandingView('welcome');
    setProjectDialogOpen(true);
  }

  function resourceKindLabel(kind: ResourceKind | 'all') {
    return kind === 'role-package' ? '角色包' : kind === 'skill' ? 'Skill' : '模板';
  }

  function normalizeResourceInstallKind(kind: ResourceKind | 'all'): ResourceKind {
    return kind === 'all' ? 'template' : kind;
  }

  async function requestLocalResourceInstall(kind: ResourceKind, targetPath: string, approved = false): Promise<LocalResourceInstallResult> {
    return kind === 'role-package'
      ? window.api.installRoleFromPath(targetPath, approved)
      : kind === 'skill'
        ? window.api.installSkillFromPath(targetPath, approved)
        : window.api.installTemplateFromPath(targetPath, approved);
  }

  async function requestRemoteResourceInstall(kind: ResourceKind, packageUrl: string, approved = false): Promise<LocalResourceInstallResult> {
    return kind === 'role-package'
      ? window.api.installRoleFromUrl(packageUrl, approved)
      : kind === 'skill'
        ? window.api.installSkillFromUrl(packageUrl, approved)
        : window.api.installTemplateFromUrl(packageUrl, approved);
  }

  async function completeLocalResourceInstall(kind: ResourceKind, targetPath: string): Promise<boolean> {
    const label = resourceKindLabel(kind);
    const result = await requestLocalResourceInstall(kind, targetPath);
    if (result.status === 'installed') {
      hydrateBootstrap(result.bootstrap as BootstrapData, { preserveSidebar: true });
      const successMessage = `已导入${label}：${targetPath}`;
      setProjectDialogStatus(successMessage);
      setStatus(successMessage);
      return true;
    }

    if (result.status === 'review-required') {
      const issueSummary = result.review.issues.map((item) => `- ${item.message}`).join('\n');
      const confirmMessage = [
        `${label} 需要确认后才能安装。`,
        result.review.summary,
        issueSummary
      ].filter(Boolean).join('\n\n');
      if (!window.confirm(confirmMessage)) {
        const cancelledMessage = `已取消${label}安装：${targetPath}`;
        setProjectDialogStatus(cancelledMessage);
        setStatus(cancelledMessage);
        return false;
      }
      const approvedResult = await requestLocalResourceInstall(kind, targetPath, true);
      if (approvedResult.status === 'installed') {
        hydrateBootstrap(approvedResult.bootstrap as BootstrapData, { preserveSidebar: true });
        const approvedMessage = `已确认并导入${label}：${targetPath}`;
        setProjectDialogStatus(approvedMessage);
        setStatus(approvedMessage);
        return true;
      }
      const fallbackMessage = approvedResult.status === 'blocked'
        ? approvedResult.actionableError?.message || approvedResult.review.summary
        : approvedResult.review.summary;
      setProjectDialogStatus(fallbackMessage);
      setStatus(fallbackMessage);
      return false;
    }

    const blockedMessage = result.actionableError?.message || result.review.summary || `${label} 导入被阻止`;
    setProjectDialogStatus(blockedMessage);
    setStatus(blockedMessage);
    return false;
  }

  async function completeRemoteResourceInstall(kind: ResourceKind, packageUrl: string): Promise<boolean> {
    const label = resourceKindLabel(kind);
    const result = await requestRemoteResourceInstall(kind, packageUrl);
    if (result.status === 'installed') {
      hydrateBootstrap(result.bootstrap as BootstrapData, { preserveSidebar: true });
      const successMessage = `已导入 ${label}: ${packageUrl}`;
      setProjectDialogStatus(successMessage);
      setStatus(successMessage);
      return true;
    }

    if (result.status === 'review-required') {
      const issueSummary = result.review.issues.map((item) => `- ${item.message}`).join('\n');
      const confirmMessage = [
        `${label} 需要确认后才能安装。`,
        result.review.summary,
        issueSummary
      ].filter(Boolean).join('\n\n');
      if (!window.confirm(confirmMessage)) {
        const cancelledMessage = `已取消 ${label} 安装: ${packageUrl}`;
        setProjectDialogStatus(cancelledMessage);
        setStatus(cancelledMessage);
        return false;
      }
      const approvedResult = await requestRemoteResourceInstall(kind, packageUrl, true);
      if (approvedResult.status === 'installed') {
        hydrateBootstrap(approvedResult.bootstrap as BootstrapData, { preserveSidebar: true });
        const approvedMessage = `已确认并导入 ${label}: ${packageUrl}`;
        setProjectDialogStatus(approvedMessage);
        setStatus(approvedMessage);
        return true;
      }
      const fallbackMessage = approvedResult.status === 'blocked'
        ? approvedResult.actionableError?.message || approvedResult.review.summary
        : approvedResult.review.summary;
      setProjectDialogStatus(fallbackMessage);
      setStatus(fallbackMessage);
      return false;
    }

    const blockedMessage = result.actionableError?.message || result.review.summary || `${label} 导入被阻止`;
    setProjectDialogStatus(blockedMessage);
    setStatus(blockedMessage);
    return false;
  }

  async function importResourcePackage(kind: ResourceKind | 'all') {
    try {
      const effectiveKind = normalizeResourceInstallKind(kind);
      const targetPath = effectiveKind === 'role-package'
        ? await window.api.chooseRoleSource()
        : effectiveKind === 'skill'
          ? await window.api.chooseSkillSource()
          : await window.api.chooseTemplateSource();
      if (!targetPath) return;
      await completeLocalResourceInstall(effectiveKind, targetPath);
      return;
      const result = kind === 'role-package'
        ? await window.api.installRoleFromPath(targetPath as string)
        : kind === 'skill'
          ? await window.api.installSkillFromPath(targetPath as string)
          : await window.api.installTemplateFromPath(targetPath as string);
      const data = result as unknown as BootstrapData;
      hydrateBootstrap(data, { preserveSidebar: true });
      const label = kind === 'role-package' ? '角色包' : kind === 'skill' ? 'Skill' : '模板';
      setProjectDialogStatus(`已导入${label}：${targetPath}`);
    } catch (error) {
      setProjectDialogStatus(error instanceof Error ? error.message : '导入资源失败');
    }
  }

  async function installResourcePackageFromUrl() {
    try {
      const target = resourcePackageUrl.trim();
      if (!target) {
        setProjectDialogStatus('请输入资源包地址');
        return;
      }
      const installed = await completeRemoteResourceInstall(normalizeResourceInstallKind(resourceInstallKind), target);
      if (installed) {
        setResourcePackageUrl('');
        setResourceInstallDialogOpen(false);
      }
    } catch (error) {
      setProjectDialogStatus(error instanceof Error ? error.message : '下载资源失败');
    }
  }

  async function checkTemplateUpdate(templateId: string) {
    try {
      const result = await window.api.checkTemplateUpdate(templateId);
      hydrateBootstrap(result as BootstrapData, { preserveSidebar: true });
      setProjectDialogStatus(`已检查模板更新：${templateId}`);
    } catch (error) {
      setProjectDialogStatus(error instanceof Error ? error.message : '模板更新检查失败');
    }
  }

  async function repairTemplate(templateId: string) {
    try {
      const result = await window.api.repairTemplate(templateId);
      hydrateBootstrap(result as BootstrapData, { preserveSidebar: true });
      setProjectDialogStatus(`已修复模板：${templateId}`);
    } catch (error) {
      setProjectDialogStatus(error instanceof Error ? error.message : '模板修复失败');
    }
  }

  async function updateTemplate(templateId: string) {
    try {
      const result = await window.api.updateTemplate(templateId);
      hydrateBootstrap(result as BootstrapData, { preserveSidebar: true });
      setProjectDialogStatus(`已更新模板：${templateId}`);
    } catch (error) {
      setProjectDialogStatus(error instanceof Error ? error.message : '模板更新失败');
    }
  }

  async function submitCreateProject() {
    const selectedTemplate = templates.find((template) => template.id === projectDraft.templateId) ?? projectTemplateOverride;
    const unavailableReason = templateUnavailableReason(selectedTemplate);
    if (unavailableReason) {
      setProjectDialogStatus(unavailableReason);
      return;
    }
    if (!projectDraft.name.trim() || !projectDraft.locationPath) return;
    const validation = await window.api.validateProjectCreate(projectDraft) as ProjectCreateValidation;
    setProjectCreateValidation(validation);
    if (!validation.ok) {
      setProjectDialogStatus(validation.issues[0]?.message || '工程创建校验失败');
      return;
    }
    setProjectDialogBusy(true);
    try {
      const currentDraftSnapshotId = draftSnapshotId;
      if (!templates.find((template) => template.id === projectDraft.templateId) && projectTemplatePackageOverride && projectTemplatePackageOverride.definition.id === projectDraft.templateId) {
        await window.api.saveDraftAsTemplate(projectTemplatePackageOverride, 'draft-bind');
      }
      const result = await window.api.createProject({
        name: projectDraft.name.trim(),
        locationPath: projectDraft.locationPath,
        directoryMode: projectDraft.directoryMode,
        templateId: projectDraft.templateId
      });
      if (!project && currentDraftSnapshotId) {
        const saved = await window.api.removeDraftOrchestration(currentDraftSnapshotId) as AppSettings;
        mergeRecentSettings(saved);
      }
      resetDraftOrchestration();
      resetDocumentWorkspace();
      const data = result as BootstrapData;
      hydrateBootstrap(data);
      patchSidebar(
        { activityView: 'project', leftCollapsed: false, rightCollapsed: false },
        true,
        { ...data.settings, sidebar: { ...defaultSidebar, ...data.settings.sidebar } }
      );
      setProjectDialogOpen(false);
      setResourceCenterOpen(false);
      setProjectDialogStatus('');
      setProjectTemplateOverride(null);
      setProjectTemplatePackageOverride(null);
      setResourcePackageUrl('');
      setStatus(`已创建工程：${projectDraft.name.trim()}`);
    } finally {
      setProjectDialogBusy(false);
    }
  }

  async function openProject() {
    if (!confirmDiscardUnsavedWorkspace()) return;
    const root = await window.api.pickProjectDirectory();
    if (!root) return;
    await openProjectAt(root);
  }

  async function closeProject() {
    if (!confirmDiscardUnsavedWorkspace()) return;
    const result = await window.api.closeProject();
    resetDocumentWorkspace();
    hydrateBootstrap(result as BootstrapData);
    setStatus('已关闭工程');
  }

  async function renameRecentProject(entry: RecentProjectEntry) {
    const nextAlias = window.prompt('输入最近工程显示名称，留空可恢复为工程名称', entry.alias || entry.name);
    if (nextAlias === null) return;
    const result = await window.api.renameRecentProject(entry.rootPath, nextAlias);
    hydrateBootstrap(result as BootstrapData);
    setStatus('最近工程显示名称已更新');
  }

  async function removeRecentProject(entry: RecentProjectEntry) {
    if (!window.confirm(`确认从最近工程中移除“${entry.alias || entry.name}”吗？`)) return;
    const result = await window.api.removeRecentProject(entry.rootPath);
    hydrateBootstrap(result as BootstrapData);
    setStatus('最近工程已移除');
  }

  async function clearInvalidRecentProjects() {
    const invalidCount = settings?.recentProjects.filter((entry) => !entry.available).length ?? 0;
    if (!invalidCount) return;
    if (!window.confirm(`确认清理 ${invalidCount} 个失效最近工程入口吗？`)) return;
    const result = await window.api.clearInvalidRecentProjects();
    hydrateBootstrap(result as BootstrapData);
    setStatus('失效最近工程已清理');
  }

  async function clearAllRecentProjects() {
    const total = settings?.recentProjects.length ?? 0;
    if (!total) return;
    if (!window.confirm(`确认清空全部 ${total} 个最近工程入口吗？`)) return;
    const result = await window.api.clearAllRecentProjects();
    hydrateBootstrap(result as BootstrapData);
    setStatus('最近工程列表已清空');
  }

  async function revealRecentProject(entry: RecentProjectEntry) {
    const success = await window.api.revealRecentProject(entry.rootPath);
    setStatus(success ? `已在系统中打开：${entry.alias || entry.name}` : '无法在系统中显示该工程');
  }

  async function refreshProject(preferredPath?: string) {
    const result = await window.api.refreshProject();
    const data = result as BootstrapData;
    hydrateBootstrap(data, { preserveSidebar: true });
    if (preferredPath && existsInTree(data.project?.tree, preferredPath)) {
      await openDocument(preferredPath);
    }
    setStatus('工程已刷新');
  }

  async function saveDocument() {
    if (!activeDocumentPath || !activeDocument) return;
    if (activeDocument.kind === 'table' && activeDocument.artifact) {
      const payload = await window.api.saveArtifact(activeDocumentPath, activeDocument.artifact);
      const meta = await window.api.getDocumentMeta(activeDocumentPath);
      applyExternalArtifactVersion(activeDocumentPath, payload.artifact, meta.modifiedAt);
      if (payload.bootstrap) {
        hydrateBootstrap(payload.bootstrap as BootstrapData, { preserveSidebar: true });
      }
      setStatus('Table artifact saved');
      return;
    }
    /*
    if (activeDocument.kind === 'table' && activeDocument.artifact) {
      const payload = await window.api.saveArtifact(activeDocumentPath, activeDocument.artifact);
      const meta = await window.api.getDocumentMeta(activeDocumentPath);
      applyExternalArtifactVersion(activeDocumentPath, payload.artifact, meta.modifiedAt);
      if (payload.bootstrap) {
        hydrateBootstrap(payload.bootstrap as BootstrapData, { preserveSidebar: true });
      }
      setStatus('表格工件已保存');
      return;
      /*
      setStatus('表格工件已保存');
      /*
      setStatus('琛ㄦ牸宸ヤ欢宸蹭繚瀛?);
      return;
    }
    */
    const refreshed = await window.api.saveDocument(activeDocumentPath, documentValue);
    const meta = await window.api.getDocumentMeta(activeDocumentPath);
    applyExternalDocumentVersion(activeDocumentPath, documentValue, meta.modifiedAt);
    if (refreshed) {
      hydrateBootstrap(refreshed as BootstrapData, { preserveSidebar: true });
    }
    await refreshDocumentProtectionState(activeDocumentPath);
    setStatus('Document saved');
    /*
    setStatus('文档已保存');
    */
  }

  async function createActiveDocumentSnapshot(label?: string) {
    if (!project || !activeDocumentPath) return;
    try {
      setDocumentProtectionBusy(true);
      const result = await window.api.createDocumentSnapshot(activeDocumentPath, label);
      hydrateBootstrap(result as BootstrapData, { preserveSidebar: true });
      await refreshDocumentProtectionState(activeDocumentPath);
      setStatus(`已为 ${activeDocumentName} 创建文档快照`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '创建文档快照失败');
    } finally {
      setDocumentProtectionBusy(false);
    }
  }

  async function restoreActiveDocumentSnapshot(snapshotId: string) {
    if (!project || !activeDocumentPath) return;
    try {
      setDocumentProtectionBusy(true);
      const result = await window.api.restoreDocumentSnapshot(activeDocumentPath, snapshotId);
      hydrateBootstrap(result as BootstrapData, { preserveSidebar: true });
      await openDocument(activeDocumentPath, { forceReload: true });
      await refreshDocumentProtectionState(activeDocumentPath);
      setStatus(`已恢复 ${activeDocumentName} 的文档快照`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '恢复文档快照失败');
    } finally {
      setDocumentProtectionBusy(false);
    }
  }

  async function resolvePendingDocumentWrite(
    proposalId: string,
    input: { decision: 'accept-ai' | 'keep-human' | 'manual-merge'; chunkSelections?: Record<string, 'human' | 'ai'> }
  ) {
    try {
      setDocumentProtectionBusy(true);
      const result = await window.api.resolvePendingDocumentWrite(proposalId, input);
      hydrateBootstrap(result.bootstrap as BootstrapData, { preserveSidebar: true });
      const nextPendingWrites = await window.api.listPendingDocumentWrites();
      setPendingDocumentWrites(nextPendingWrites);
      const nextFocus = nextPendingWrites.find((item) => item.filePath === activeDocumentPathRef.current) ?? nextPendingWrites[0] ?? null;
      if (nextFocus?.filePath) {
        await openDocument(nextFocus.filePath, { forceReload: true });
      } else if (activeDocumentPathRef.current) {
        await openDocument(activeDocumentPathRef.current, { forceReload: true });
        setDocumentProtectionOpen(false);
      } else {
        setDocumentProtectionOpen(false);
      }
      await refreshDocumentProtectionState(activeDocumentPathRef.current || undefined);
      setStatus('已处理 AI 写入提案');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '处理 AI 写入提案失败');
    } finally {
      setDocumentProtectionBusy(false);
    }
  }

  async function openRunMergeForReview(runId: string) {
    try {
      const proposals = await window.api.listPendingDocumentWrites();
      setPendingDocumentWrites(proposals);
      const proposal = proposals.find((item) => item.sourceRunId === runId) ?? null;
      if (!proposal) {
        setStatus(`未找到运行 ${runId} 的待确认写入提案`);
        return;
      }
      if (project) {
        patchSidebar({ activityView: 'project' }, false);
      }
      await openDocument(proposal.filePath, { forceReload: true });
      await refreshDocumentProtectionState(proposal.filePath);
      setDocumentProtectionOpen(true);
      setStatus(`已打开待确认写入：${fileName(proposal.filePath)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '打开待确认写入提案失败');
    }
  }

  async function checkActiveDocumentExternalChange(triggeredByUser = false) {
    if (!activeDocumentPath) {
      if (triggeredByUser) {
        setStatus('当前没有活动文档可检查');
      }
      return;
    }
    const currentState = openDocumentsRef.current[activeDocumentPath];
    if (!currentState) {
      if (triggeredByUser) {
        setStatus(`当前文档尚未进入检查状态：${fileName(activeDocumentPath)}`);
      }
      return;
    }
    if (triggeredByUser) {
      setStatus(`正在检查外部变更：${fileName(activeDocumentPath)}`);
    }
    if (currentState.kind === 'table') {
      const [meta, artifact] = await Promise.all([
        window.api.getDocumentMeta(activeDocumentPath),
        window.api.openArtifact(activeDocumentPath)
      ]);
      const timestampChanged =
        meta.modifiedAt !== currentState.lastKnownModifiedAt &&
        meta.modifiedAt !== currentState.ignoredConflictModifiedAt;
      const diskChanged = artifactSignature(artifact) !== (currentState.lastSavedArtifactSignature ?? '');

      if (!timestampChanged && !diskChanged) {
        if (triggeredByUser) {
          setStatus(`宸叉鏌ワ紝褰撳墠娌℃湁澶栭儴鍙樻洿锛?{fileName(activeDocumentPath)}`);
        }
        return;
      }

      const dirty = artifactSignature(currentState.artifact) !== (currentState.lastSavedArtifactSignature ?? '');
      if (dirty) {
        const shouldReload = window.confirm(`琛ㄦ牸 ${fileName(activeDocumentPath)} 宸茶澶栭儴淇敼锛屾槸鍚﹂噸鏂板姞杞藉閮ㄧ増鏈紵`);
        if (shouldReload) {
          applyExternalArtifactVersion(activeDocumentPath, artifact, meta.modifiedAt);
        } else {
          setOpenDocuments((current) => current[activeDocumentPath] ? {
            ...current,
            [activeDocumentPath]: {
              ...current[activeDocumentPath],
              ignoredConflictModifiedAt: meta.modifiedAt
            }
          } : current);
        }
        return;
      }

      applyExternalArtifactVersion(activeDocumentPath, artifact, meta.modifiedAt);
      setStatus(`妫€娴嬪埌澶栭儴鏇存柊锛屽凡鍒锋柊锛?{fileName(activeDocumentPath)}`);
      return;
    }

    const [meta, diskContents] = await Promise.all([
      window.api.getDocumentMeta(activeDocumentPath),
      window.api.readDocument(activeDocumentPath)
    ]);
    const timestampChanged =
      meta.modifiedAt !== currentState.lastKnownModifiedAt &&
      meta.modifiedAt !== currentState.ignoredConflictModifiedAt;
    const diskChanged = diskContents !== currentState.lastSavedValue;

    if (!timestampChanged && !diskChanged) {
      if (triggeredByUser) {
        setStatus(`已检查，当前没有外部变更：${fileName(activeDocumentPath)}`);
      }
      return;
    }

    if (diskChanged) {
      const refreshed = await window.api.recordExternalDocumentChange(
        activeDocumentPath,
        currentState.lastSavedValue,
        diskContents
      );
      if (refreshed) {
        hydrateBootstrap(refreshed as BootstrapData, { preserveSidebar: true });
      }
    }

    const dirty = currentState.value !== currentState.lastSavedValue;
    if (!dirty || diskContents === currentState.value) {
      applyExternalDocumentVersion(activeDocumentPath, diskContents, meta.modifiedAt);
      setStatus(`检测到外部更新，已刷新：${fileName(activeDocumentPath)}`);
      return;
    }

    setConflictState({
      path: activeDocumentPath,
      modifiedAt: meta.modifiedAt,
      externalContents: diskContents
    });
    setStatus(`检测到外部文件变更：${fileName(activeDocumentPath)}`);
  }

  async function createFileAt(parentPath?: string) {
    if (!project) return;
    const name = window.prompt('输入新文件名称', '新文档.md');
    if (!name) return;
    const nextPath = await window.api.createFile(parentPath ?? resolveParentDirectory(project.rootPath, activeDocumentPath), name);
    await refreshProject(nextPath as string);
  }

  async function createFile() {
    await createFileAt();
  }

  async function createDirectoryAt(parentPath?: string) {
    if (!project) return;
    const name = window.prompt('输入新目录名称', '新目录');
    if (!name) return;
    await window.api.createDirectory(parentPath ?? resolveParentDirectory(project.rootPath, activeDocumentPath), name);
    await refreshProject();
  }

  async function createDirectory() {
    await createDirectoryAt();
  }

  async function renameEntryAt(targetPath: string) {
    if (!targetPath) return;
    const nextName = window.prompt('输入新的名称', fileName(targetPath));
    if (!nextName) return;
    const nextPath = await window.api.renameEntry(targetPath, nextName);
    const nextPaths = remapWorkspacePaths(targetPath, nextPath as string);
    await refreshProject(nextPaths.activePath || nextPaths.secondaryPath || (nextPath as string));
  }

  async function renameActiveEntry() {
    if (!activeDocumentPath) return;
    await renameEntryAt(activeDocumentPath);
  }

  async function moveEntryAt(targetPath: string) {
    if (!project || !targetPath) return;
    const relativeParent = normalizeProjectRelativePath(
      project.rootPath,
      resolveParentDirectory(project.rootPath, targetPath)
    );
    const nextDirectory = window.prompt('输入目标目录（相对工程根目录）', relativeParent || '.');
    if (!nextDirectory?.trim()) return;
    const nextPath = await window.api.moveEntry(targetPath, nextDirectory.trim());
    const nextPaths = remapWorkspacePaths(targetPath, nextPath as string);
    await refreshProject(nextPaths.activePath || nextPaths.secondaryPath || (nextPath as string));
  }

  async function deleteEntryAt(targetPath: string) {
    if (!targetPath || !window.confirm(`确认删除 ${fileName(targetPath)} 吗？`)) return;
    const deletingPath = targetPath;
    const result = await window.api.deleteEntry(targetPath);
    if (layout.secondaryDocumentPath && isPathWithinEntry(layout.secondaryDocumentPath, deletingPath)) {
      patchSidebar({ documentSplitOpen: false, secondaryDocumentPath: '' }, false);
    }
    closeDocumentTab(deletingPath, { suppressConfirm: true });
    hydrateBootstrap(result as BootstrapData);
    setStatus('条目已删除');
  }

  async function deleteActiveEntry() {
    if (!activeDocumentPath) return;
    await deleteEntryAt(activeDocumentPath);
  }

  function updateActiveDocumentValue(value: string) {
    if (!activeDocumentPath) return;
    setOpenDocuments((current) => current[activeDocumentPath] ? {
      ...current,
      [activeDocumentPath]: {
        ...current[activeDocumentPath],
        value
      }
    } : current);
  }

  function closeDocumentTab(filePath: string, options?: { suppressConfirm?: boolean }) {
    const documentState = openDocuments[filePath];
    if (!documentState) return;
    const dirty = documentState.kind === 'table'
      ? artifactSignature(documentState.artifact) !== (documentState.lastSavedArtifactSignature ?? '')
      : documentState.value !== documentState.lastSavedValue;
    if (dirty && !options?.suppressConfirm && !window.confirm(`文档 ${documentState.title} 还有未保存内容，确认关闭吗？`)) {
      return;
    }

    setOpenDocuments((current) => {
      const next = { ...current };
      delete next[filePath];
      return next;
    });
    if (layout.secondaryDocumentPath === filePath) {
      patchSidebar({ documentSplitOpen: false, secondaryDocumentPath: '' }, false);
    }
    const nextTabs = openTabs.filter((item) => item !== filePath);
    setOpenTabs(nextTabs);
    if (filePath === activeDocumentPath) {
      const nextActivePath = layout.secondaryDocumentPath && layout.secondaryDocumentPath !== filePath
        ? layout.secondaryDocumentPath
        : nextTabs[nextTabs.length - 1] ?? '';
      setActiveDocumentPath(nextActivePath);
      setProject((currentProject) => currentProject ? {
        ...currentProject,
        workflow: {
          ...currentProject.workflow,
          activeDocumentPath: nextActivePath || undefined
        }
      } : currentProject);
      void syncWorkflowActiveDocument(nextActivePath || undefined);
      if (layout.secondaryDocumentPath && layout.secondaryDocumentPath !== filePath) {
        patchSidebar({ documentSplitOpen: false, secondaryDocumentPath: '' }, false);
      }
    }
    setRecentlyClosedTabs((current) => [filePath, ...current.filter((item) => item !== filePath)].slice(0, 12));
  }

  async function reopenLastClosedDocument() {
    const [nextPath] = recentlyClosedTabs;
    if (!nextPath) return;
    setRecentlyClosedTabs((current) => current.slice(1));
    await openDocument(nextPath);
    setStatus(`已恢复文档：${fileName(nextPath)}`);
  }

  async function toggleDocumentSplit() {
    if (!activeDocumentPath) return;
    if (documentSplitOpen) {
      patchSidebar({ documentSplitOpen: false, secondaryDocumentPath: '' });
      setStatus('已关闭文档分屏');
      return;
    }
    const candidate = openTabs.find((item) => item !== activeDocumentPath) ?? recentlyClosedTabs[0] ?? '';
    if (!candidate) {
      setStatus('请先打开第二个文档，再启用分屏');
      return;
    }
    await openDocument(candidate, { pane: 'secondary' });
    setStatus(`已在分屏中打开：${fileName(candidate)}`);
  }

  async function openDocumentInWindow(filePath?: string) {
    const targetPath = filePath?.trim() || activeDocumentPath;
    if (!targetPath) {
      setStatus('请先打开一个文档');
      return;
    }
    try {
      await window.api.openDocumentWindow(targetPath);
      setStatus(`已在新窗口打开：${fileName(targetPath)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '在新窗口打开文档失败');
    }
  }

  function openProjectSearch() {
    patchSidebar({ activityView: 'search', leftCollapsed: false });
  }

  function openFindReplace(replace = false) {
    if (!activeDocumentPath || !activeDocumentIsText) return;
    setFindOpen(true);
    setViewMode('source');
    if (replace) {
      setStatus('已打开查找与替换');
    } else {
      setStatus('已打开文档查找');
    }
  }

  async function importDocumentsIntoProject() {
    if (!project) return;
    const importedPaths = await window.api.importDocuments(resolveParentDirectory(project.rootPath, activeDocumentPath));
    if (!importedPaths.length) return;
    await refreshProject(importedPaths[0]);
    setStatus(`已导入 ${importedPaths.length} 个文本文档`);
  }

  async function importImageFile(file: File) {
    if (!project || !activeDocumentPath) return;
    const buffer = await file.arrayBuffer();
    const payload = await window.api.importImageIntoDocument(activeDocumentPath, {
      fileName: file.name || `image-${Date.now()}.png`,
      base64: arrayBufferToBase64(buffer)
    });
    insertTextAtCursor(payload.markdown);
    setStatus(`已导入图片：${file.name || fileName(payload.assetPath)}`);
  }

  function openArtifactReferenceDialog(mode: 'link' | 'embed') {
    if (!project || !activeDocumentPath || !activeDocumentIsText) {
      setStatus('请先打开一个可编辑文本文件');
      return;
    }
    if (!projectArtifactCandidates.length) {
      setStatus('当前工程中没有可引用的工件文件');
      return;
    }
    setArtifactReferenceMode(mode);
    setArtifactReferenceDialogOpen(true);
  }

  function insertArtifactReference(targetPath: string, mode: 'link' | 'embed', label?: string) {
    if (!activeDocumentPath) return;
    const relativeTarget = relativeDocumentPath(activeDocumentPath, targetPath);
    const safeLabel = (label?.trim() || fileName(targetPath) || relativeTarget).replace(/[\[\]|]/g, '');
    const reference = mode === 'embed'
      ? `![[${relativeTarget}|${safeLabel}]]`
      : `[[${relativeTarget}|${safeLabel}]]`;
    insertTextAtCursor(reference);
    setArtifactReferenceDialogOpen(false);
    setStatus(mode === 'embed' ? `已插入工件嵌入：${safeLabel}` : `已插入工件链接：${safeLabel}`);
  }

  function insertTextAtCursor(text: string) {
    if (!activeDocumentPath) return;
    const textarea = editorRef.current;
    if (!textarea) {
      updateActiveDocumentValue(`${documentValue}${documentValue.endsWith('\n') ? '' : '\n'}${text}\n`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = `${documentValue.slice(0, start)}${text}${documentValue.slice(end)}`;
    updateActiveDocumentValue(nextValue);
    const nextCursor = start + text.length;
    setPendingSelection({ path: activeDocumentPath, range: { start: nextCursor, end: nextCursor } });
  }

  function syncMarkdownSlashMenu(nextValue: string, selectionStart: number, selectionEnd: number) {
    if (!activeDocumentPath || !activeDocumentIsText || viewMode === 'read') {
      setMarkdownSlashMenu(null);
      return;
    }
    const trigger = detectMarkdownSlashCommand(nextValue, { start: selectionStart, end: selectionEnd });
    if (!trigger) {
      setMarkdownSlashMenu(null);
      return;
    }
    setMarkdownSlashMenu((current) => {
      const nextCommands = listMarkdownBlockCommands(trigger.query);
      const nextSelectedIndex = current
        && current.path === activeDocumentPath
        && current.triggerStart === trigger.start
        ? Math.min(current.selectedIndex, Math.max(nextCommands.length - 1, 0))
        : 0;
      return {
        path: activeDocumentPath,
        query: trigger.query,
        triggerStart: trigger.start,
        triggerEnd: trigger.end,
        selectedIndex: nextSelectedIndex
      };
    });
  }

  function applyMarkdownCommand(commandId: MarkdownBlockCommandId, options?: { fromSlashMenu?: boolean }) {
    if (!activeDocumentPath) return;
    const textarea = editorRef.current;
    const selection = textarea
      ? { start: textarea.selectionStart, end: textarea.selectionEnd }
      : { start: documentValue.length, end: documentValue.length };
    const replaceRange = options?.fromSlashMenu && activeMarkdownSlashMenu
      ? {
          start: activeMarkdownSlashMenu.triggerStart,
          end: activeMarkdownSlashMenu.triggerEnd
        }
      : undefined;
    const result = applyMarkdownBlockCommand(
      documentValue,
      selection,
      commandId,
      replaceRange ? { replaceRange } : undefined
    );
    if (!result.changed) {
      if (result.blockedBy === 'fenced-code-block') {
        setStatus('当前光标位于代码块中，无法使用结构化插入。');
      }
      setMarkdownSlashMenu(null);
      return;
    }
    updateActiveDocumentValue(result.value);
    setPendingSelection({ path: activeDocumentPath, range: result.selection });
    setMarkdownSlashMenu(null);
  }

  function handleEditorChange(event: ChangeEvent<HTMLTextAreaElement>) {
    updateActiveDocumentValue(event.target.value);
    syncMarkdownSlashMenu(event.target.value, event.target.selectionStart, event.target.selectionEnd);
  }

  function handleEditorSelectionChange(event: SyntheticEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget;
    syncMarkdownSlashMenu(target.value, target.selectionStart, target.selectionEnd);
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!activeMarkdownSlashMenu) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      setMarkdownSlashMenu(null);
      return;
    }

    if (!markdownSlashCommands.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMarkdownSlashMenu((current) => current ? {
        ...current,
        selectedIndex: (current.selectedIndex + 1) % markdownSlashCommands.length
      } : current);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setMarkdownSlashMenu((current) => current ? {
        ...current,
        selectedIndex: (current.selectedIndex - 1 + markdownSlashCommands.length) % markdownSlashCommands.length
      } : current);
      return;
    }

    if (event.key === 'Enter') {
      const selectedCommand = markdownSlashCommands[
        Math.min(activeMarkdownSlashMenu.selectedIndex, markdownSlashCommands.length - 1)
      ];
      if (!selectedCommand) return;
      event.preventDefault();
      applyMarkdownCommand(selectedCommand.id, { fromSlashMenu: true });
    }
  }

  function applyExternalDocumentVersion(filePath: string, contents: string, modifiedAt: number) {
    setOpenDocuments((current) => current[filePath] ? {
      ...current,
      [filePath]: {
        ...current[filePath],
        kind: current[filePath].kind || 'text',
        value: contents,
        lastSavedValue: contents,
        artifact: current[filePath].artifact ? {
          ...current[filePath].artifact,
          content: contents
        } : current[filePath].artifact,
        lastSavedArtifactSignature: contents,
        lastKnownModifiedAt: modifiedAt,
        ignoredConflictModifiedAt: undefined
      }
    } : current);
  }

  function updateActiveTableArtifact(table: TableArtifactModel) {
    if (!activeDocumentPath) return;
    setOpenDocuments((current) => current[activeDocumentPath] ? {
      ...current,
      [activeDocumentPath]: {
        ...current[activeDocumentPath],
        kind: 'table',
        artifact: {
          ...(current[activeDocumentPath].artifact ?? {
            kind: 'table',
            filePath: activeDocumentPath,
            title: fileName(activeDocumentPath) || 'table',
            editable: true,
            binary: table.format === 'xlsx'
          }),
          kind: 'table',
          table,
          binary: table.format === 'xlsx'
        }
      }
    } : current);
  }

  function applyExternalArtifactVersion(filePath: string, artifact: ArtifactOpenPayload, modifiedAt: number) {
    const nextValue = artifact.content ?? '';
    const nextSignature = artifactSignature(artifact);
    setOpenDocuments((current) => current[filePath] ? {
      ...current,
      [filePath]: {
        ...current[filePath],
        kind: artifact.kind,
        value: nextValue,
        lastSavedValue: nextValue,
        artifact,
        lastSavedArtifactSignature: nextSignature,
        lastKnownModifiedAt: modifiedAt,
        ignoredConflictModifiedAt: undefined
      }
    } : current);
  }

  async function reloadDocumentFromDisk(filePath: string, knownMeta?: DocumentMeta) {
    const [artifact, meta] = await Promise.all([
      window.api.openArtifact(filePath),
      knownMeta ? Promise.resolve(knownMeta) : window.api.getDocumentMeta(filePath)
    ]);
    if (artifact.kind === 'table') {
      applyExternalArtifactVersion(filePath, artifact, meta.modifiedAt);
      return;
    }
    applyExternalDocumentVersion(filePath, artifact.content ?? '', meta.modifiedAt);
  }

  async function openSearchResult(result: ProjectSearchResult) {
    openProjectSearch();
    const contents = await window.api.readDocument(result.path);
    const lineOffset = offsetForLine(contents, result.line);
    const range = {
      start: lineOffset + Math.max(0, result.column - 1),
      end: lineOffset + Math.max(0, result.column - 1) + searchQuery.length
    };
    setViewMode('source');
    setFindOpen(true);
    setFindQuery(searchQuery);
    await openDocument(result.path, { forceReload: true, selection: range });
    setStatus(`已定位到 ${result.name} 第 ${result.line} 行`);
  }

  function selectFindMatch(index: number) {
    if (!activeDocumentPath || !activeDocumentMatches.length) return;
    const normalizedIndex = (index + activeDocumentMatches.length) % activeDocumentMatches.length;
    setFindIndex(normalizedIndex);
    setPendingSelection({
      path: activeDocumentPath,
      range: activeDocumentMatches[normalizedIndex]
    });
  }

  function replaceCurrentMatch() {
    if (!activeDocumentPath || !activeMatch) return;
    const nextValue = `${documentValue.slice(0, activeMatch.start)}${replaceText}${documentValue.slice(activeMatch.end)}`;
    updateActiveDocumentValue(nextValue);
    const nextStart = activeMatch.start + replaceText.length;
    setPendingSelection({ path: activeDocumentPath, range: { start: nextStart, end: nextStart } });
  }

  function replaceAllMatches() {
    if (!activeDocumentPath || !findQuery) return;
    updateActiveDocumentValue(documentValue.split(findQuery).join(replaceText));
    setStatus('已完成全部替换');
  }

  async function resolveConflictReload() {
    if (!conflictState) return;
    applyExternalDocumentVersion(conflictState.path, conflictState.externalContents, conflictState.modifiedAt);
    setConflictState(null);
    setStatus(`已重新加载外部版本：${fileName(conflictState.path)}`);
  }

  async function resolveConflictOverwrite() {
    if (!conflictState) return;
    await saveDocument();
    setConflictState(null);
    setStatus(`已使用当前内容覆盖外部文件：${fileName(conflictState.path)}`);
  }

  function resolveConflictLater() {
    if (!conflictState) return;
    setOpenDocuments((current) => current[conflictState.path] ? {
      ...current,
      [conflictState.path]: {
        ...current[conflictState.path],
        ignoredConflictModifiedAt: conflictState.modifiedAt
      }
    } : current);
    setConflictState(null);
    setStatus(`已延后处理冲突：${fileName(conflictState.path)}`);
  }

  function persistSessions(next: AiSession[]) {
    setSessions(next);
    void window.api.saveSessions(next);
    setActiveSessionId((current) => next.find((session) => session.id === current)?.id ?? next[0]?.id ?? '');
  }

  function mutateSessions(updater: (current: AiSession[]) => AiSession[]) {
    setSessions((current) => {
      const next = updater(current);
      if (project) {
        void window.api.saveSessions(next);
      }
      queueMicrotask(() => {
        setActiveSessionId((selected) => next.find((session) => session.id === selected)?.id ?? next[0]?.id ?? '');
      });
      return next;
    });
  }

  function buildContextualSessionTitle(stage: AppStage) {
    const documentLabel = stripFileExtension(fileName(activeDocumentPath));
    const titleBase = documentLabel || stageLabels[stage] || '当前任务';
    const duplicateCount = sessions.filter((session) => session.title.startsWith(titleBase)).length + 1;
    return duplicateCount > 1 ? `${titleBase} · ${stageLabels[stage]} ${duplicateCount}` : `${titleBase} · ${stageLabels[stage]}`;
  }

  function buildContextualSessionSummary(stage: AppStage) {
    const documentLabel = fileName(activeDocumentPath);
    if (documentLabel) {
      return `围绕 ${documentLabel} 的${stageLabels[stage]}协作`;
    }
    return `围绕当前目标继续推进${stageLabels[stage]}协作`;
  }

  function createSession(target = conversationTarget, options?: { silent?: boolean }) {
    const stage = activeSession?.stage ?? 'discover';
    const nextSession: AiSession = {
      id: crypto.randomUUID(),
      title: buildContextualSessionTitle(stage),
      stage,
      summary: buildContextualSessionSummary(stage),
      pinned: false,
      archived: false,
      target: target ?? undefined,
      contextControls: normalizeSessionContextControls(),
      messages: []
    };
    mutateSessions((current) => [nextSession, ...current]);
    patchSidebar({ rightCollapsed: false }, false);
    if (!options?.silent) {
      setStatus(`已创建会话：${nextSession.title}`);
    }
    return nextSession;
  }

  function renameSession(sessionId: string, currentTitle: string) {
    const nextTitle = window.prompt('输入新的会话名称', currentTitle);
    if (!nextTitle) return;
    mutateSessions((current) => current.map((session) => session.id === sessionId ? { ...session, title: nextTitle } : session));
  }

  function toggleSessionFlag(sessionId: string, field: 'pinned' | 'archived') {
    mutateSessions((current) => current.map((session) => session.id === sessionId ? { ...session, [field]: !session[field] } : session));
  }

  function deleteSession(sessionId: string) {
    if (!window.confirm('确认删除这个会话吗？')) return;
    mutateSessions((current) => current.filter((session) => session.id !== sessionId));
  }

  function updateSessionStage(stage: AppStage) {
    if (!activeSession) return;
    mutateSessions((current) => current.map((session) => session.id === activeSession.id ? { ...session, stage } : session));
  }

  function applyMessagesToSessions(currentSessions: AiSession[], sessionId: string, ...messagesToAppend: AiMessage[]) {
    return currentSessions.map((session) => session.id === sessionId
      ? {
          ...session,
          summary: messagesToAppend[messagesToAppend.length - 1]?.content.slice(0, 48) || session.summary,
          messages: [...session.messages, ...messagesToAppend]
        }
      : session);
  }

  function mergeBootstrapSessionsWithLocalState(bootstrapSessions: AiSession[], localSessions: AiSession[]) {
    const bootstrapById = new Map(bootstrapSessions.map((session) => [session.id, session] as const));
    const merged = localSessions.map((session) => {
      const bootstrapSession = bootstrapById.get(session.id);
      return bootstrapSession ? { ...bootstrapSession, ...session } : session;
    });
    for (const session of bootstrapSessions) {
      if (!merged.some((item) => item.id === session.id)) {
        merged.push(session);
      }
    }
    return merged;
  }

  async function updateSessionContextControls(
    sessionId: string,
    updater: (current: SessionContextControls) => SessionContextControls
  ) {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;
    const nextControls = normalizeSessionContextControls(updater(normalizeSessionContextControls(session.contextControls)));
    const payload = await window.api.updateSessionContextControls(sessionId, nextControls) as BootstrapData;
    hydrateBootstrap(payload, { preserveSidebar: true });
  }

  async function toggleSessionPinnedDocument(sessionId: string, documentPath: string) {
    await updateSessionContextControls(sessionId, (current) => {
      const pinned = current.pinnedDocumentPaths.includes(documentPath)
        ? current.pinnedDocumentPaths.filter((item) => item !== documentPath)
        : [...current.pinnedDocumentPaths, documentPath];
      return {
        ...current,
        pinnedDocumentPaths: pinned,
        excludedDocumentPaths: current.excludedDocumentPaths.filter((item) => item !== documentPath),
        updatedAt: new Date().toISOString()
      };
    });
    setStatus(`已更新固定上下文：${fileName(documentPath)}`);
  }

  async function toggleSessionExcludedDocument(sessionId: string, documentPath: string) {
    await updateSessionContextControls(sessionId, (current) => {
      const excluded = current.excludedDocumentPaths.includes(documentPath)
        ? current.excludedDocumentPaths.filter((item) => item !== documentPath)
        : [...current.excludedDocumentPaths, documentPath];
      return {
        ...current,
        pinnedDocumentPaths: current.pinnedDocumentPaths.filter((item) => item !== documentPath),
        excludedDocumentPaths: excluded,
        updatedAt: new Date().toISOString()
      };
    });
    setStatus(`已更新排除上下文：${fileName(documentPath)}`);
  }

  async function sendMessage() {
    if (!chatInput.trim()) return;
    const effectiveSession = activeSession && (!conversationTarget || sameConversationTarget(activeSession.target, conversationTarget))
      ? activeSession
      : createSession(conversationTarget, { silent: true });
    if (!effectiveSession) return;
    setSending(true);
    try {
      const prompt = chatInput.trim();
      const userMessage: AiMessage = { id: crypto.randomUUID(), role: 'user', content: prompt, createdAt: new Date().toISOString() };
      let workingSessions = applyMessagesToSessions(sessions, effectiveSession.id, userMessage);
      persistSessions(workingSessions);
      if (conversationTarget?.targetType === 'orchestration-flow' && orchestrationConversationFlow) {
        if (isBootstrapMinimalFlow(orchestrationConversationFlow)) {
          const plan = await window.api.planConversationFlow(prompt);
          const generated = await window.api.buildConversationFlowDraft({
            prompt,
            kind: orchestrationConversationFlow.kind
          });
          setFlowConversationPreview({
            mode: 'draft',
            prompt,
            target: conversationTarget,
            flow: orchestrationConversationFlow,
            plan,
            draft: generated.draft
          });
          workingSessions = applyMessagesToSessions(workingSessions, effectiveSession.id, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `已根据描述生成流程草稿预览：${generated.draft.name}`,
            createdAt: new Date().toISOString()
          });
          persistSessions(workingSessions);
          setStatus('已生成流程草稿预览');
        } else {
          const patch = await window.api.patchConversationFlow({
            flow: orchestrationConversationFlow,
            prompt
          });
          const preview = await window.api.applyConversationFlowPatch({
            flow: orchestrationConversationFlow,
            patch
          });
          setFlowConversationPreview({
            mode: 'patch',
            prompt,
            target: conversationTarget,
            flow: orchestrationConversationFlow,
            patch,
            preview
          });
          workingSessions = applyMessagesToSessions(workingSessions, effectiveSession.id, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `已生成流程修改预览：${patch.summary}`,
            createdAt: new Date().toISOString()
          });
          persistSessions(workingSessions);
          setStatus('已生成流程修改预览');
        }
      } else {
        const response = await window.api.sendAiMessage({
          sessionId: effectiveSession.id,
          stage: effectiveSession.stage,
          content: prompt,
          contextDocuments: activeDocumentPath ? [activeDocumentPath] : []
        }) as {
          message?: AiMessage;
          diagnostics?: string[];
          bootstrap?: BootstrapData;
          paused?: boolean;
          pausedRunId?: string;
        };
        if (response.message) {
          workingSessions = applyMessagesToSessions(workingSessions, effectiveSession.id, response.message);
          persistSessions(workingSessions);
        }
        if (response.bootstrap) {
          hydrateBootstrap({
            ...response.bootstrap,
            sessions: mergeBootstrapSessionsWithLocalState(response.bootstrap.sessions, workingSessions)
          }, { preserveSidebar: true });
        } else {
          const payload = await window.api.refreshProject() as BootstrapData;
          hydrateBootstrap(payload, { preserveSidebar: true });
        }
        setStatus(response.paused
          ? `AI 运行已暂停：${response.pausedRunId ?? 'latest-run'}`
          : response.message
            ? 'AI 回复完成'
            : 'AI 运行状态已更新');
      }
      setChatInput('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'AI 请求失败');
    } finally {
      setSending(false);
    }
  }

  async function generateStageDraft() {
    if (!activeSession) return;
    try {
      setStatus('正在生成阶段草稿…');
      const result = await window.api.generateStageDraft(activeSession.id, stageInstructions) as RuntimeBootstrapEnvelope;
      const payload = unpackBootstrapEnvelope(result);
      hydrateBootstrap(payload.bootstrap);
      if (payload.paused) {
        patchSidebar({ processPanelOpen: true, processPanelTab: 'history' }, false);
        setStatus(`阶段草稿运行已暂停：${payload.pausedRunId ?? 'latest-run'}`);
        return;
      }
      const nextPendingWrites = await window.api.listPendingDocumentWrites();
      setPendingDocumentWrites(nextPendingWrites);
      if (nextPendingWrites.length) {
        await openDocument(nextPendingWrites[0]!.filePath, { forceReload: true });
        setDocumentProtectionOpen(true);
        await refreshDocumentProtectionState(nextPendingWrites[0]!.filePath);
      }
      patchSidebar({ processPanelOpen: true, processPanelTab: 'stage' }, false);
      setStageInstructions('');
      setStatus(nextPendingWrites.length ? '阶段草稿已生成，但存在待确认的 AI 写入' : '阶段草稿已生成');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '阶段草稿生成失败');
    }
  }

  async function confirmStage() {
    if (!activeSession) return;
    try {
      setStatus(`正在确认${stageLabels[activeSession.stage]}阶段…`);
      const result = await window.api.confirmStage(activeSession.id, activeSession.stage);
      hydrateBootstrap(result as BootstrapData);
      patchSidebar({ processPanelOpen: true, processPanelTab: 'stage' }, false);
      setStatus(`阶段 ${stageLabels[activeSession.stage]} 已确认`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '阶段确认失败');
    }
  }

  async function revisitStage(stage: AppStage) {
    try {
      setStatus(`正在切换到${stageLabels[stage]}阶段…`);
      const result = await window.api.revisitStage(stage);
      hydrateBootstrap(result as BootstrapData);
      patchSidebar({ processPanelOpen: true, processPanelTab: 'stage' }, false);
      setStatus(`已回到${stageLabels[stage]}阶段`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '阶段切换失败');
    }
  }

  async function runReviewRound() {
    const targetDocumentPath = project?.workflow.activeDocumentPath || activeDocumentPath || '';
    if (!activeSession || !targetDocumentPath) return;
    try {
      setStatus('正在执行红蓝审查…');
      const result = await window.api.runReviewRound(activeSession.id, targetDocumentPath) as RuntimeBootstrapEnvelope;
      const payload = unpackBootstrapEnvelope(result);
      hydrateBootstrap(payload.bootstrap);
      patchSidebar({ processPanelOpen: true, processPanelTab: 'review' }, false);
      setStatus(payload.paused
        ? `红蓝审查运行已暂停：${payload.pausedRunId ?? 'latest-run'}`
        : '红蓝审查已完成');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '红蓝审查失败');
    }
  }

  async function updateReviewIssue(roundId: string, issueId: string, state: ReviewIssueState) {
    const result = await window.api.updateReviewIssue(roundId, issueId, state);
    hydrateBootstrap(result as BootstrapData);
  }

  async function runConsistencyCheck() {
    try {
      setStatus('正在执行一致性检查…');
      const result = await window.api.runConsistency();
      hydrateBootstrap(result as BootstrapData);
      patchSidebar({ processPanelOpen: true, processPanelTab: 'history' }, false);
      setStatus('一致性检查已完成');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '一致性检查失败');
    }
  }

  async function restoreSnapshot(snapshotId: string) {
    try {
      setStatus(`正在恢复快照 ${snapshotId}…`);
      const result = await window.api.restoreSnapshot(snapshotId);
      hydrateBootstrap(result as BootstrapData);
      patchSidebar({ processPanelOpen: true, processPanelTab: 'history' }, false);
      setStatus(`已恢复快照 ${snapshotId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '恢复快照失败');
    }
  }

  async function chooseSkillCatalogSource() {
    try {
      const targetPath = await window.api.chooseSkillCatalogSource();
      if (!targetPath) return;
      setCatalogUrl(targetPath);
      const result = await window.api.listSkillCatalog(targetPath);
      setSkillCatalog(result as RemoteSkillCatalogItem[]);
      setStatus(`已加载技能目录：${targetPath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '选择技能目录失败');
    }
  }

  async function loadSkillCatalog(targetSource?: string) {
    try {
      const result = await window.api.listSkillCatalog((targetSource ?? catalogUrl) || undefined);
      setSkillCatalog(result as RemoteSkillCatalogItem[]);
      setStatus(`已加载 ${(result as RemoteSkillCatalogItem[]).length} 个 Skill 目录项`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '加载技能目录失败');
    }
  }

  async function installSkill(packageUrl?: string) {
    const target = (packageUrl ?? resourcePackageUrl).trim();
    if (!target) return setStatus('请输入技能包地址');
    try {
      const looksLikeLocalPath = /^[a-zA-Z]:[\\/]/.test(target) || target.startsWith('/') || target.startsWith('\\\\');
      if (looksLikeLocalPath) {
        await completeLocalResourceInstall('skill', target);
        setResourcePackageUrl('');
        return;
      }
      const installed = await completeRemoteResourceInstall('skill', target);
      if (installed) {
        setResourcePackageUrl('');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Skill 安装失败');
    }
  }

  async function importLocalSkill() {
    try {
      const targetPath = await window.api.chooseSkillSource();
      if (!targetPath) return;
      await completeLocalResourceInstall('skill', targetPath);
      return;
      const result = await window.api.installSkillFromPath(targetPath as string);
      hydrateBootstrap(result as unknown as BootstrapData, { preserveSidebar: true });
      setStatus(`已导入本地 Skill：${targetPath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导入本地 Skill 失败');
    }
  }

  async function deleteSkill(skillId: string) {
    try {
      const result = await window.api.deleteSkill(skillId);
      hydrateBootstrap(result as BootstrapData);
      setStatus(`已删除 Skill ${skillId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Skill 删除失败');
    }
  }

  async function toggleProjectSkill(skillId: string) {
    const next = projectSkillIds.includes(skillId) ? projectSkillIds.filter((id) => id !== skillId) : [...projectSkillIds, skillId];
    const result = await window.api.setProjectSkills(next);
    hydrateBootstrap(result as BootstrapData);
  }

  async function toggleSessionSkill(skillId: string) {
    if (!activeSession) return;
    const next = activeSessionSkillIds.includes(skillId) ? activeSessionSkillIds.filter((id) => id !== skillId) : [...activeSessionSkillIds, skillId];
    const result = await window.api.setSessionSkills(activeSession.id, next);
    hydrateBootstrap(result as BootstrapData);
  }

  async function generateOpenSpec() {
    try {
      setStatus('正在生成 OpenSpec…');
      const payload = await window.api.generateOpenSpec();
      hydrateBootstrap(payload.bootstrap as BootstrapData);
      if (payload.result?.roadmapPath) await openDocument(payload.result.roadmapPath as string);
      patchSidebar({ processPanelOpen: true, processPanelTab: 'stage' }, false);
      setStatus(`已生成 OpenSpec：${payload.result?.changeName ?? ''}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'OpenSpec 生成失败');
    }
  }

  async function pauseRuntimeRun(runId: string) {
    try {
      setStatus(`正在请求暂停运行 ${runId}…`);
      const payload = await window.api.pauseRuntimeRun(runId) as RuntimeActionEnvelope;
      hydrateBootstrap(payload.bootstrap as BootstrapData);
      setStatus(payload.result?.run?.id ? `已请求暂停运行：${payload.result.run.id}` : '已请求暂停运行');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '暂停运行失败');
    }
  }

  async function resumeRuntimeRun(runId: string) {
    try {
      setStatus(`正在恢复运行 ${runId}…`);
      const payload = await window.api.resumeRuntimeRun(runId) as RuntimeActionEnvelope;
      hydrateBootstrap(payload.bootstrap as BootstrapData);
      setStatus(payload.result?.paused
        ? `运行再次暂停：${payload.result?.run?.id ?? runId}`
        : payload.result?.run?.id
          ? `已恢复运行：${payload.result.run.id}`
          : '已恢复运行');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '恢复运行失败');
    }
  }

  async function retryRuntimeRun(runId: string) {
    try {
      setStatus(`正在重试运行 ${runId}…`);
      const payload = await window.api.retryRuntimeRun(runId) as RuntimeActionEnvelope;
      hydrateBootstrap(payload.bootstrap as BootstrapData);
      setStatus(payload.result?.paused
        ? `运行再次暂停：${payload.result?.run?.id ?? runId}`
        : payload.result?.run?.id
          ? `已重试运行：${payload.result.run.id}`
          : '已重试运行');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '重试运行失败');
    }
  }

  async function stopRuntimeRun(runId: string) {
    try {
      setStatus(`正在请求停止运行 ${runId}…`);
      const payload = await window.api.stopRuntimeRun(runId);
      hydrateBootstrap(payload.bootstrap as BootstrapData);
      setStatus(payload.result?.run?.id ? `已请求停止运行：${payload.result.run.id}` : '已请求停止运行');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '停止运行失败');
    }
  }

  async function resolveRuntimeApproval(runId: string, approvalId: string, approved: boolean, reason?: string) {
    try {
      const payload = await window.api.resolveRuntimeApproval({ runId, approvalId, approved, reason });
      hydrateBootstrap(payload.bootstrap as BootstrapData);
      setStatus(approved ? `已批准运行审批：${runId}` : `已拒绝运行审批：${runId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '处理运行审批失败');
    }
  }

  async function refreshKnowledgeIndex() {
    try {
      const payload = await window.api.refreshKnowledgeIndex('manual') as BootstrapData;
      hydrateBootstrap(payload, { preserveSidebar: true });
      setStatus('????????');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '?????????');
    }
  }

  async function saveSettings() {
    if (!settings || !settingsDraft) return;
    setSettingsBusy(true);
    try {
      const saved = await window.api.saveSettings({
        theme: settingsDraft.theme,
        sidebar: settings.sidebar,
        debug: settingsDraft.debug,
        activeProviderProfileId: settingsDraft.activeProviderProfileId,
        providerProfiles: toProviderProfileInputs(settingsDraft.providerProfiles)
      });
      setSettings(saved as AppSettings);
      setSettingsStatus('设置已保存。');
      setSettingsOpen(false);
      setStatus('设置已保存');
    } finally {
      setSettingsBusy(false);
    }
  }

  async function testAiConnection(profileId?: string) {
    if (!settingsDraft) return;
    try {
      setSettingsTesting(true);
      const draft = settingsDraft.providerProfiles.find((profile) => profile.id === (profileId ?? settingsDraft.activeProviderProfileId));
      const result = await window.api.testAiConnection(draft ? { profileId: draft.id, draft } : undefined);
      const message = (result as { message: string }).message;
      const latencyMs = (result as { latencyMs?: number }).latencyMs;
      if (draft) {
        setSettingsDraft((current) => current ? {
          ...current,
          providerProfiles: current.providerProfiles.map((profile) => profile.id === draft.id ? {
            ...profile,
            diagnostics: {
              checkedAt: new Date().toISOString(),
              status: 'healthy',
              message,
              latencyMs
            }
          } : profile)
        } : current);
      }
      const refreshedSettings = await window.api.getSettings();
      setSettings(refreshedSettings as AppSettings);
      setSettingsStatus(message);
      setStatus(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接测试失败';
      const targetId = profileId ?? settingsDraft.activeProviderProfileId;
      setSettingsDraft((current) => current ? {
        ...current,
        providerProfiles: current.providerProfiles.map((profile) => profile.id === targetId ? {
          ...profile,
          diagnostics: {
            checkedAt: new Date().toISOString(),
            status: 'error',
            message
          }
        } : profile)
      } : current);
      setSettingsStatus(message);
      setStatus(message);
    } finally {
      setSettingsTesting(false);
    }
  }

  async function saveFlow(flow: PlatformFlowAsset) {
    const result = await window.api.saveFlow(flow);
    hydrateBootstrap(result as BootstrapData);
  }

  async function deleteFlow(kind: PlatformFlowAsset['kind'], flowId: string) {
    const result = await window.api.deleteFlow(kind, flowId);
    hydrateBootstrap(result as BootstrapData);
  }

  async function duplicateFlow(kind: PlatformFlowAsset['kind'], flowId: string) {
    const result = await window.api.duplicateFlow(kind, flowId);
    hydrateBootstrap(result as BootstrapData);
  }

  async function importFlow(kind: PlatformFlowAsset['kind']) {
    const result = await window.api.importFlow(kind);
    hydrateBootstrap(result as BootstrapData);
  }

  async function exportFlow(kind: PlatformFlowAsset['kind'], flowId: string) {
    const payload = await window.api.exportFlow(kind, flowId) as { bootstrap: BootstrapData; exportPath?: string | null };
    hydrateBootstrap(payload.bootstrap);
    if (payload.exportPath) {
      setStatus(`已导出流程：${payload.exportPath}`);
    }
  }

  async function saveRoles(roles: PlatformRole[]) {
    const result = await window.api.saveRoles(roles);
    hydrateBootstrap(result as BootstrapData);
  }

  async function saveTaskTemplates(taskTemplates: TaskTemplate[]) {
    const result = await window.api.saveTaskTemplates(taskTemplates);
    hydrateBootstrap(result as BootstrapData);
  }

  async function saveAgentProfiles(agentProfiles: AgentProfile[]) {
    const result = await window.api.saveAgentProfiles(agentProfiles);
    hydrateBootstrap(result as BootstrapData);
  }

  async function saveConnectors(connectors: PlatformConnector[]) {
    const result = await window.api.saveConnectors(connectors);
    hydrateBootstrap(result as BootstrapData);
  }

  async function saveTools(tools: ControlledScriptTool[]) {
    const result = await window.api.saveTools(tools);
    hydrateBootstrap(result as BootstrapData);
  }

  async function saveRule(rule: Partial<RuleDefinition> & Pick<RuleDefinition, 'name' | 'body' | 'scope'>) {
    const payload = await window.api.saveRule(rule) as { bootstrap: BootstrapData };
    hydrateBootstrap(payload.bootstrap, { preserveSidebar: true });
    setStatus(`已保存${rule.scope === 'global' ? '全局' : rule.scope === 'project' ? '工程' : '节点'}规则：${rule.name}`);
  }

  async function deleteRule(ruleId: string) {
    const payload = await window.api.deleteRule(ruleId) as { bootstrap: BootstrapData };
    hydrateBootstrap(payload.bootstrap, { preserveSidebar: true });
    setStatus('已删除规则');
  }

  async function setRuleEnabled(ruleId: string, enabled: boolean) {
    const payload = await window.api.setRuleEnabled(ruleId, enabled) as { bootstrap: BootstrapData };
    hydrateBootstrap(payload.bootstrap, { preserveSidebar: true });
    setStatus(enabled ? '已启用规则' : '已停用规则');
  }

  async function saveAccumulationEntry(entry: Record<string, unknown>) {
    const payload = await window.api.saveAccumulationEntry(entry) as { bootstrap: BootstrapData };
    hydrateBootstrap(payload.bootstrap, { preserveSidebar: true });
    setStatus('已保存沉淀条目');
  }

  async function deleteAccumulationEntry(entryId: string) {
    const payload = await window.api.deleteAccumulationEntry(entryId) as { bootstrap: BootstrapData };
    hydrateBootstrap(payload.bootstrap, { preserveSidebar: true });
    setStatus('已删除沉淀条目');
  }

  async function createPromotionDraft(entryId: string, targetKind: 'rule' | 'skill' | 'knowledge', proposedName?: string) {
    const payload = await window.api.createPromotionDraft({ entryId, targetKind, proposedName }) as { bootstrap: BootstrapData };
    hydrateBootstrap(payload.bootstrap, { preserveSidebar: true });
    setStatus(`已创建${targetKind}提升草案`);
  }

  async function applyPromotionDraft(draftId: string, reviewNote?: string) {
    const payload = await window.api.applyPromotionDraft(draftId, reviewNote) as { bootstrap: BootstrapData };
    hydrateBootstrap(payload.bootstrap, { preserveSidebar: true });
    setStatus('已接受提升草案');
  }

  async function exportRules(scope: RuleScope) {
    const payload = await window.api.exportRules(scope) as { bootstrap: BootstrapData; exportPath?: string | null; count?: number };
    hydrateBootstrap(payload.bootstrap, { preserveSidebar: true });
    if (payload.exportPath) {
      setStatus(`已导出 ${payload.count ?? 0} 条规则到 ${payload.exportPath}`);
    }
  }

  async function importRules(scope: RuleScope) {
    const payload = await window.api.importRules(scope) as { bootstrap: BootstrapData; importedCount?: number };
    hydrateBootstrap(payload.bootstrap, { preserveSidebar: true });
    if (payload.importedCount) {
      setStatus(`已导入 ${payload.importedCount} 条规则`);
    }
  }

  async function testConnector(connectorId: string) {
    const payload = await window.api.testConnector(connectorId) as { bootstrap: BootstrapData; result: { ok: boolean; message: string } };
    hydrateBootstrap(payload.bootstrap);
    setStatus(payload.result.message);
    return payload.result;
  }

  async function runTool(toolId: string) {
    const payload = await window.api.runTool(toolId) as {
      bootstrap: BootstrapData;
      result: { result: { ok: boolean; exitCode: number | null; stdout: string; stderr: string; timedOut: boolean } };
    };
    hydrateBootstrap(payload.bootstrap);
    const result = payload.result.result;
    setStatus(result.ok ? '脚本工具执行成功' : `脚本工具执行失败：${result.stderr || result.exitCode}`);
    return result;
  }

  async function saveRuntimeTemplate(template: RuntimeTemplateAsset) {
    const payload = await window.api.saveRuntimeTemplate(template) as { bootstrap: BootstrapData; result: { template: RuntimeTemplateAsset; issues: Array<{ severity: 'warning' | 'error'; message: string }> } };
    hydrateBootstrap(payload.bootstrap);
    void refreshStageGuard();
    setStatus(payload.result.issues.length
      ? payload.result.issues.map((item) => item.message).join(' · ')
      : '已保存模板工件契约与导出映射');
    return payload.result;
  }

  async function validateFlow(kind: PlatformFlowAsset['kind'], flowId: string) {
    return window.api.validateFlow(kind, flowId);
  }

  async function restoreFlowVersion(kind: PlatformFlowAsset['kind'], flowId: string, versionId: string) {
    const result = await window.api.restoreFlowVersion(kind, flowId, versionId);
    hydrateBootstrap(result as BootstrapData);
    setStatus(`已恢复流程版本 ${versionId}`);
  }

  async function debugFlowNode(kind: PlatformFlowAsset['kind'], flowId: string, nodeId: string) {
    const payload = await window.api.debugFlowNode({
      kind,
      flowId,
      nodeId,
      sessionId: activeSession?.id
    }) as { bootstrap: BootstrapData; result: { run: RuntimeRun; events: RuntimeEvent[] } };
    hydrateBootstrap(payload.bootstrap, { preserveSidebar: true });
    setStatus(`已完成节点调试：${nodeId}`);
    return payload.result;
  }

  async function previewFlowRerun(kind: PlatformFlowAsset['kind'], flowId: string, nodeId: string, sourceRunId?: string, mode: RuntimeRerunPlan['mode'] = 'continue') {
    return window.api.previewFlowRerun({
      kind,
      flowId,
      nodeId,
      sourceRunId,
      mode
    });
  }

  async function applyFlowRerun(kind: PlatformFlowAsset['kind'], flowId: string, nodeId: string, sourceRunId?: string, mode: RuntimeRerunPlan['mode'] = 'continue') {
    const payload = await window.api.applyFlowRerun({
      kind,
      flowId,
      nodeId,
      sourceRunId,
      sessionId: activeSession?.id,
      mode
    }) as { bootstrap: BootstrapData; result: { plan: RuntimeRerunPlan; run: RuntimeRun } };
    hydrateBootstrap(payload.bootstrap, { preserveSidebar: true });
    setStatus(`已应用重跑计划：${nodeId}`);
    return payload.result;
  }

  function rememberDraftFlow(flow: PlatformFlowAsset, label = '保存草稿') {
    setDraftFlowHistories((current) => ({
      ...current,
      [flow.id]: [
        {
          id: crypto.randomUUID(),
          flowId: flow.id,
          kind: flow.kind,
          createdAt: new Date().toISOString(),
          label,
          summary: flow.description || flow.name,
          nodeCount: flow.nodes.length,
          edgeCount: flow.edges.length,
          snapshot: JSON.parse(JSON.stringify(flow)) as PlatformFlowAsset
        },
        ...(current[flow.id] ?? [])
      ].slice(0, 20)
    }));
  }

  async function saveDraftFlow(flow: PlatformFlowAsset) {
    setDraftPlatform((current) => {
      if (!current) return current;
      const key = flow.kind === 'subflow' ? 'subflows' : 'flows';
      const collection = current[key];
      const exists = collection.some((item) => item.id === flow.id);
      return {
        ...current,
        [key]: exists
          ? collection.map((item) => (item.id === flow.id ? flow : item))
          : [...collection, flow]
      };
    });
    rememberDraftFlow(flow);
    setStatus(`已保存草稿流程：${flow.name}`);
  }

  async function deleteDraftFlow(kind: PlatformFlowAsset['kind'], flowId: string) {
    setDraftPlatform((current) => {
      if (!current) return current;
      const key = kind === 'subflow' ? 'subflows' : 'flows';
      return {
        ...current,
        [key]: current[key].filter((item) => item.id !== flowId)
      };
    });
    setStatus(`已删除${kind === 'subflow' ? '子流程' : '流程'}：${flowId}`);
  }

  async function duplicateDraftFlow(kind: PlatformFlowAsset['kind'], flowId: string) {
    setDraftPlatform((current) => {
      if (!current) return current;
      const key = kind === 'subflow' ? 'subflows' : 'flows';
      const target = current[key].find((item) => item.id === flowId);
      if (!target) return current;
      const duplicate: PlatformFlowAsset = {
        ...target,
        id: crypto.randomUUID(),
        name: `${target.name} 副本`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      rememberDraftFlow(duplicate, '复制草稿');
      return {
        ...current,
        [key]: [...current[key], duplicate]
      };
    });
    setStatus('已复制草稿流程');
  }

  async function importDraftFlow(_kind: PlatformFlowAsset['kind']) {
    setStatus('草稿模式暂不支持导入流程，请先创建工程后再导入');
  }

  async function exportDraftFlow(kind: PlatformFlowAsset['kind'], flowId: string) {
    const flow = (kind === 'subflow' ? draftPlatform?.subflows : draftPlatform?.flows)?.find((item) => item.id === flowId);
    if (!flow) {
      setStatus('未找到要导出的草稿流程');
      return;
    }
    const blob = new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${flow.name || 'flow'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus(`已导出草稿流程：${flow.name}`);
  }

  async function saveDraftRoles(roles: PlatformRole[]) {
    setDraftPlatform((current) => (current ? { ...current, roles } : current));
    setStatus('已更新草稿角色');
  }

  async function saveDraftTaskTemplates(taskTemplates: TaskTemplate[]) {
    setDraftPlatform((current) => (current ? { ...current, taskTemplates } : current));
    setStatus('已更新草稿任务模板');
  }

  async function saveDraftAgentProfiles(agentProfiles: AgentProfile[]) {
    setDraftPlatform((current) => (current ? { ...current, agentProfiles } : current));
    setStatus('已更新草稿执行配置');
  }

  async function saveDraftConnectors(connectors: PlatformConnector[]) {
    setDraftPlatform((current) => (current ? { ...current, connectors } : current));
    setStatus('已更新草稿连接');
  }

  async function saveDraftTools(tools: ControlledScriptTool[]) {
    setDraftPlatform((current) => (current ? { ...current, tools } : current));
    setStatus('已更新草稿工具');
  }

  async function testDraftConnector(connectorId: string) {
    return { ok: false, message: `草稿模式未启用连接测试：${connectorId}` };
  }

  async function runDraftTool(toolId: string) {
    return {
      ok: false,
      exitCode: null,
      stdout: '',
      stderr: `草稿模式未启用脚本工具执行：${toolId}`,
      timedOut: false
    };
  }

  async function saveDraftRuntimeTemplate(template: RuntimeTemplateAsset) {
    setDraftRuntimeTemplate(template);
    setStatus('已保存草稿的工件契约与导出映射');
    return {
      template,
      issues: [] as Array<{ severity: 'warning' | 'error'; message: string }>
    };
  }

  async function validateDraftFlow(kind: PlatformFlowAsset['kind'], flowId: string) {
    if (!draftPlatform || !draftRuntimeTemplate) return [];
    const flow = (kind === 'subflow' ? draftPlatform.subflows : draftPlatform.flows).find((item) => item.id === flowId);
    if (!flow) return [];
    return validatePlatformFlow(flow, {
      template: draftRuntimeTemplate,
      subflows: draftPlatform.subflows,
      roles: draftPlatform.roles,
      taskTemplates: draftPlatform.taskTemplates,
      agentProfiles: draftPlatform.agentProfiles,
      connectors: draftPlatform.connectors,
      tools: draftPlatform.tools
    });
  }

  async function restoreDraftFlowVersion(kind: PlatformFlowAsset['kind'], flowId: string, versionId: string) {
    const historyEntry = draftFlowHistories[flowId]?.find((entry) => entry.id === versionId) ?? null;
    if (!historyEntry?.snapshot) {
      setStatus('未找到可恢复的草稿版本');
      return;
    }
    setDraftPlatform((current) => {
      if (!current) return current;
      const key = kind === 'subflow' ? 'subflows' : 'flows';
      return {
        ...current,
        [key]: current[key].map((item) => (item.id === flowId ? historyEntry.snapshot! : item))
      };
    });
    setStatus(`已恢复草稿版本：${historyEntry.label}`);
  }

  async function debugDraftFlowNode(kind: PlatformFlowAsset['kind'], flowId: string, nodeId: string): Promise<{ run: RuntimeRun; events: RuntimeEvent[] }> {
    const flow = (kind === 'subflow' ? draftPlatform?.subflows : draftPlatform?.flows)?.find((item) => item.id === flowId) ?? null;
    const node = flow?.nodes.find((item) => item.id === nodeId) ?? null;
    if (!flow || !node) {
      throw new Error(`未找到需要调试的草稿节点：${nodeId}`);
    }
    const now = new Date().toISOString();
    const content = [
      `节点：${node.data.label}`,
      `类型：${node.type}`,
      `说明：${node.data.description || '未填写'}`,
      `读取工件：${(node.data.inputArtifactPaths ?? []).join(', ') || '无'}`,
      `写入工件：${(node.data.outputArtifactPaths ?? []).join(', ') || '无'}`
    ].join('\n');
    const run: RuntimeRun = {
      id: crypto.randomUUID(),
      kind: 'template',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
      flowId,
      sessionId: activeSession?.id,
      selectedProfileId: settings?.activeProviderProfileId,
      diagnostics: [`草稿节点调试：${node.data.label}`],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0
      },
      outputs: [
        {
          id: crypto.randomUUID(),
          createdAt: now,
          kind: 'final',
          label: 'node-debug',
          contentType: 'text',
          content
        }
      ],
      checkpoints: [
        {
          id: crypto.randomUUID(),
          createdAt: now,
          turn: 1,
          status: 'completed',
          summary: `完成草稿节点调试：${node.data.label}`,
          nodeId
        }
      ]
    };
    const events: RuntimeEvent[] = [
      {
        id: crypto.randomUUID(),
        runId: run.id,
        createdAt: now,
        type: 'run.started',
        message: `开始草稿节点调试：${node.data.label}`,
        metadata: { nodeId, flowId }
      },
      {
        id: crypto.randomUUID(),
        runId: run.id,
        createdAt: now,
        type: 'run.completed',
        message: `完成草稿节点调试：${node.data.label}`,
        metadata: { nodeId, flowId }
      }
    ];
    setRuntimeRuns((current) => [run, ...current].slice(0, 40));
    setRuntimeEvents((current) => [...events, ...current].slice(0, 200));
    setStatus(`已完成草稿节点调试：${node.data.label}`);
    return { run, events };
  }

  async function applyFlowConversationPreview() {
    if (!flowConversationPreview) return;
    const nextFlow = flowConversationPreview.mode === 'draft'
      ? {
          ...flowConversationPreview.flow,
          name: flowConversationPreview.draft.name,
          description: flowConversationPreview.draft.description,
          nodes: flowConversationPreview.draft.nodes,
          edges: flowConversationPreview.draft.edges,
          updatedAt: new Date().toISOString()
        }
      : flowConversationPreview.preview;
    if (project) {
      await saveFlow(nextFlow);
    } else {
      await saveDraftFlow(nextFlow);
    }
    setOrchestrationConversationFlow(nextFlow);
    setFlowConversationPreview(null);
    setStatus(flowConversationPreview.mode === 'draft' ? '已应用流程草稿' : '已应用流程修改');
  }

  function dismissFlowConversationPreview() {
    setFlowConversationPreview(null);
    setStatus('已取消流程变更预览');
  }

  function jumpToThinkingChainEvidence(ref: ThinkingChainEvidenceRef) {
    if (ref.missing) {
      setStatus('该来源对象已不存在');
      return;
    }
    if (ref.path) {
      void openDocument(ref.path);
      patchSidebar({ activityView: 'project', leftCollapsed: false }, false);
      return;
    }
    if (ref.sessionId) {
      setActiveSessionId(ref.sessionId);
    }
    if (ref.kind === 'runtime-run' || ref.kind === 'runtime-event' || ref.kind === 'review-round' || ref.kind === 'review-issue') {
      patchSidebar({ activityView: 'project', processPanelOpen: true, processPanelTab: 'history', rightCollapsed: false }, false);
      return;
    }
    patchSidebar({ activityView: 'sessions', leftCollapsed: false, rightCollapsed: false }, false);
  }

  async function persistThinkingChainNodePosition(semanticKey: string, position: { x: number; y: number; pinned?: boolean }) {
    const sessionId = thinkingChainSnapshot?.sessionId || activeSession?.id;
    if (!sessionId) return;
    const layoutState = await window.api.saveThinkingChainLayout(sessionId, {
      nodes: {
        [semanticKey]: position
      }
    });
    setThinkingChainSnapshot((current) => {
      if (!current || current.sessionId !== sessionId) return current;
      return {
        ...current,
        generatedAt: new Date().toISOString(),
        layoutState,
        nodes: current.nodes.map((node) => node.semanticKey === semanticKey
          ? { ...node, manualPosition: position }
          : node)
      };
    });
  }

  async function persistThinkingChainView(view: { zoom?: number; scrollLeft?: number; scrollTop?: number; detailPaneWidth?: number }) {
    const sessionId = thinkingChainSnapshot?.sessionId || activeSession?.id;
    if (!sessionId) return;
    await window.api.saveThinkingChainLayout(sessionId, { view });
  }

  async function resetThinkingChainLayout() {
    const sessionId = thinkingChainSnapshot?.sessionId || activeSession?.id;
    if (!sessionId) return;
    await window.api.resetThinkingChainLayout(sessionId);
    await refreshThinkingChainSnapshot(sessionId);
  }

  function resolveKnowledgeGraphFlowTarget(node: KnowledgeLinkNode) {
    if (node.kind !== 'flow') return null;
    const flowKind = node.metadata?.flowKind === 'subflow' ? 'subflow' : 'flow';
    const sourceId = node.sourceId?.trim();
    if (sourceId) {
      return { kind: flowKind as PlatformFlowAsset['kind'], flowId: sourceId };
    }
    const [, parsedKind, ...rest] = node.id.split(':');
    if (!rest.length) return null;
    return {
      kind: parsedKind === 'subflow' ? 'subflow' : 'flow',
      flowId: rest.join(':')
    } as const;
  }

  function resolveKnowledgeGraphOpenPath(sourcePath: string) {
    const normalized = sourcePath.trim();
    if (!normalized) return '';
    if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(normalized)) {
      return normalized;
    }
    if (!project?.rootPath) {
      return normalized;
    }
    const root = project.rootPath.replace(/[\\/]+$/, '');
    const relative = normalized.replace(/^[/\\]+/, '');
    return `${root}/${relative}`;
  }

  function openKnowledgeGraphNode(node: KnowledgeLinkNode) {
    if (node.kind === 'document' || node.kind === 'artifact') {
      const sourcePath = node.sourceId?.trim();
      if (!sourcePath) {
        setStatus('该图谱对象缺少源文件路径');
        return;
      }
      const targetPath = resolveKnowledgeGraphOpenPath(sourcePath);
      patchSidebar({ activityView: 'project', leftCollapsed: false }, false);
      void openDocument(targetPath, { forceReload: true });
      return;
    }

    if (node.kind === 'flow') {
      const target = resolveKnowledgeGraphFlowTarget(node);
      if (!target) {
        setStatus('该流程图谱对象缺少可跳转的流程标识');
        return;
      }
      setOrchestrationFocusRequest({
        token: crypto.randomUUID(),
        kind: target.kind,
        flowId: target.flowId
      });
      patchSidebar({ activityView: 'orchestration', leftCollapsed: true }, false);
      return;
    }

    if (node.kind === 'skill') {
      const skillId = node.sourceId?.trim();
      if (!skillId) {
        setStatus('该 Skill 图谱对象缺少资源标识');
        return;
      }
      setResourceCenterKind('skill');
      setSelectedResourceId(`skill:${skillId}`);
      patchSidebar({ activityView: 'resources', leftCollapsed: true }, false);
    }
  }

  function updateThemeDraft(theme: AppSettings['theme']) {
    if (!settingsDraft) return;
    setSettingsDraft({ ...settingsDraft, theme });
  }

  function updateLiveLogConsoleDraft(liveLogConsoleEnabled: boolean) {
    if (!settingsDraft) return;
    setSettingsDraft({
      ...settingsDraft,
      debug: {
        ...settingsDraft.debug,
        liveLogConsoleEnabled
      }
    });
  }

  function updateProviderProfileDraft(profile: ProviderProfileDraft) {
    if (!settingsDraft) return;
    setSettingsDraft({
      ...settingsDraft,
      providerProfiles: settingsDraft.providerProfiles.map((item) => item.id === profile.id ? profile : item)
    });
  }

  function createProviderProfileDraft() {
    if (!settingsDraft) return;
    const nextId = `profile-${Date.now()}`;
    setSettingsDraft({
      ...settingsDraft,
      activeProviderProfileId: nextId,
      providerProfiles: [
        ...settingsDraft.providerProfiles,
        createProviderProfileDraftSeed(nextId)
      ]
    });
    setSettingsSelectedProfileId(nextId);
  }

  function deleteProviderProfileDraft(profileId: string) {
    if (!settingsDraft || settingsDraft.providerProfiles.length <= 1) return;
    const remaining = settingsDraft.providerProfiles.filter((item) => item.id !== profileId);
    setSettingsDraft({
      ...settingsDraft,
      providerProfiles: remaining,
      activeProviderProfileId: settingsDraft.activeProviderProfileId === profileId ? remaining[0].id : settingsDraft.activeProviderProfileId
    });
    setSettingsSelectedProfileId((current) => current === profileId ? remaining[0]?.id ?? '' : current);
  }

  function selectProviderProfileDraft(profileId: string) {
    setSettingsSelectedProfileId(profileId);
    const currentDraft = settingsDraft;
    const currentSettings = settings;
    if (!currentDraft || !currentSettings) return;
    const nextDraft = {
      ...currentDraft,
      activeProviderProfileId: profileId
    };
    setSettingsDraft(nextDraft);
    void window.api.saveSettings({
      theme: nextDraft.theme,
      sidebar: currentSettings.sidebar,
      debug: nextDraft.debug,
      recentProjects: currentSettings.recentProjects,
      activeProviderProfileId: profileId,
      providerProfiles: nextDraft.providerProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        provider: profile.provider,
        baseUrl: profile.baseUrl,
        model: profile.model,
        apiKey: profile.apiKey || undefined,
        enabled: profile.enabled,
        capabilities: profile.capabilities,
        diagnostics: profile.diagnostics
      }))
    }).then((saved) => {
      setSettings(saved as AppSettings);
      setStatus(`已切换模型配置：${(saved as AppSettings).providerProfiles.find((item) => item.id === profileId)?.name ?? profileId}`);
    });
  }

  function toggleActivityView(view: ActivityView) {
    if (view === 'project' && !project && !draftPlatform) {
      patchSidebar({ activityView: 'project', leftCollapsed: false, rightCollapsed: false });
      return;
    }
    if (layout.activityView === view && !layout.leftCollapsed) return patchSidebar({ leftCollapsed: true });
    patchSidebar({ activityView: view, leftCollapsed: false });
  }

  function toggleThemeQuick() {
    if (!settings || !settingsDraft) return;
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    setSettings({ ...settings, theme: nextTheme });
    setSettingsDraft({ ...settingsDraft, theme: nextTheme });
    void window.api.saveSettings({
      theme: nextTheme,
      sidebar: settings.sidebar,
      debug: settingsDraft.debug,
      activeProviderProfileId: settingsDraft.activeProviderProfileId,
      providerProfiles: toProviderProfileInputs(settingsDraft.providerProfiles)
    }).then((saved) => setSettings(saved as AppSettings));
  }

  function runTopbarMenuAction(action: () => void) {
    setTopbarMenuOpen(null);
    action();
  }

  useEffect(() => {
    const dispose = window.api.onAppCommand((command: AppCommand) => {
      switch (command.type) {
        case 'project:new': void createProject(); break;
        case 'project:open': void openProject(); break;
        case 'project:open-recent': void openProjectAt(command.path); break;
        case 'project:close': void closeProject(); break;
        case 'project:reveal': void window.api.openProjectFolder(); break;
        case 'project:import-documents': void importDocumentsIntoProject(); break;
        case 'session:new': createSession(); break;
        case 'ai:generate-stage': void generateStageDraft(); break;
        case 'ai:confirm-stage': void confirmStage(); break;
        case 'ai:review': void runReviewRound(); break;
        case 'ai:generate-openspec': void generateOpenSpec(); break;
        case 'doc:save': void saveDocument(); break;
        case 'doc:find': openFindReplace(false); break;
        case 'doc:replace': openFindReplace(true); break;
        case 'doc:reopen-last-closed': void reopenLastClosedDocument(); break;
        case 'search:project': openProjectSearch(); break;
        case 'view:toggle-left': patchSidebar({ leftCollapsed: !layout.leftCollapsed }); break;
        case 'view:toggle-right': patchSidebar({ rightCollapsed: !layout.rightCollapsed }); break;
        case 'view:toggle-process': patchSidebar({ processPanelOpen: !layout.processPanelOpen }); break;
        case 'view:set-activity': toggleActivityView(command.view); break;
        case 'tools:command-palette': setCommandPaletteOpen(true); break;
        case 'tools:settings': setSettingsOpen(true); break;
      }
    });
    return () => {
      dispose();
    };
  }, [layout.leftCollapsed, layout.processPanelOpen, layout.rightCollapsed, settings, activeSession, activeDocumentPath, stageInstructions]);

  function documentFileUrl(filePath: string) {
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
  }

  function openArtifactFromDocument(targetPath: string, sourcePath?: string) {
    const basePath = sourcePath || activeDocumentPath;
    if (!basePath) return;
    void window.api.openArtifact(targetPath, basePath).then((artifact) => {
      void openDocument(artifact.filePath);
    }).catch((error) => {
      setStatus(error instanceof Error ? error.message : '鎵撳紑宸ヤ欢澶辫触');
    });
  }

  function renderDocumentBody(
    documentState: OpenDocumentState | null,
    options?: {
      readOnly?: boolean;
      sourcePath?: string;
    }
  ) {
    if (!documentState) return null;
    const readOnly = options?.readOnly ?? false;
    const sourcePath = options?.sourcePath ?? documentState.path;

    if (documentState.loading) {
      return (
        <div className="document-artifact-card loading">
          <strong>{documentState.title}</strong>
          <span>Loading document content...</span>
        </div>
      );
    }

    if (documentState.kind === 'table' && documentState.artifact?.table) {
      return (
        <TableArtifactView
          artifact={documentState.artifact.table}
          readOnly={readOnly}
          onChange={readOnly ? undefined : updateActiveTableArtifact}
        />
      );
    }

    if (documentState.kind === 'image') {
      return (
        <div className="document-artifact-card image">
          <img src={documentFileUrl(documentState.path)} alt={documentState.title} />
        </div>
      );
    }

    if (documentState.kind === 'unsupported') {
      return (
        <div className="document-artifact-card">
          <strong>{documentState.title}</strong>
          <span>{documentState.artifact?.errorMessage ?? '褰撳墠鏍煎紡鏆備笉鏀寔鍦ㄥ伐浣滃彴涓瑙堛€?'}</span>
        </div>
      );
    }

    if (viewMode === 'read' || readOnly) {
      return (
        <MarkdownContent
          value={documentState.value}
          documentPath={sourcePath}
          onOpenArtifact={(filePath) => openArtifactFromDocument(filePath, sourcePath)}
        />
      );
    }

    return (
      <div className="structured-editor-card">
        {!readOnly && activeDocumentIsText ? (
          <div className="structured-markdown-toolbar" data-testid="markdown-block-toolbar">
            <button
              type="button"
              className="structured-markdown-action"
              onClick={() => openArtifactReferenceDialog('embed')}
              title="插入工件嵌入"
            >
              工件嵌入
            </button>
            <button
              type="button"
              className="structured-markdown-action"
              onClick={() => openArtifactReferenceDialog('link')}
              title="插入工件链接"
            >
              工件链接
            </button>
            {markdownToolbarCommands.map((command) => (
              <button
                key={command.id}
                type="button"
                className="structured-markdown-action"
                data-command-id={command.id}
                onClick={() => applyMarkdownCommand(command.id)}
                title={command.description}
              >
                {command.label}
              </button>
            ))}
          </div>
        ) : null}
        {!readOnly && activeMarkdownSlashMenu ? (
          <div className="markdown-slash-menu" data-testid="markdown-slash-menu" role="listbox">
            {markdownSlashCommands.length ? markdownSlashCommands.map((command, index) => {
              const active = index === activeMarkdownSlashMenu.selectedIndex;
              return (
                <button
                  key={command.id}
                  type="button"
                  className={`markdown-slash-item${active ? ' active' : ''}`}
                  data-testid={`markdown-command-${command.id}`}
                  role="option"
                  aria-selected={active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyMarkdownCommand(command.id, { fromSlashMenu: true })}
                >
                  <strong>{command.label}</strong>
                  <span>{command.description}</span>
                </button>
              );
            }) : (
              <div className="markdown-slash-empty">没有匹配的结构化命令</div>
            )}
          </div>
        ) : null}
        <textarea
          ref={readOnly ? undefined : editorRef}
          className={`editor${readOnly ? ' secondary-editor' : ''}`}
          value={documentState.value}
          onChange={readOnly ? undefined : handleEditorChange}
          onKeyDown={readOnly ? undefined : handleEditorKeyDown}
          onSelect={readOnly ? undefined : handleEditorSelectionChange}
          onClick={readOnly ? undefined : handleEditorSelectionChange}
          onPaste={readOnly ? undefined : (event) => {
            const imageFile = Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/'));
            if (!imageFile) return;
            event.preventDefault();
            void importImageFile(imageFile);
          }}
          onDragOver={readOnly ? undefined : (event) => event.preventDefault()}
          onDrop={readOnly ? undefined : (event) => {
            const imageFile = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith('image/'));
            if (!imageFile) return;
            event.preventDefault();
            void importImageFile(imageFile);
          }}
          readOnly={readOnly}
          spellCheck={false}
        />
      </div>
    );
  }

  const compactShellView = layout.activityView === 'thinking-chain' || layout.activityView === 'orchestration';
  const showTopbar = false;
  const railStageLabel = project
    ? stageLabels[project.workflow.stage]
    : activeSession
      ? stageLabels[activeSession.stage]
      : '阶段';
  const railUnsavedCount = documentDirty ? 1 : 0;
  const showProjectRailUtilities = Boolean(project)
    && (
      layout.activityView === 'project'
      || layout.activityView === 'thinking-chain'
      || layout.activityView === 'orchestration'
    );

  const goHome = () => {
    if (draftPlatform) {
      closeDraftToWelcome();
      return;
    }
    if (project) {
      void closeProject();
      return;
    }
    patchSidebar({ activityView: 'project', leftCollapsed: false, rightCollapsed: false });
  };

  const openWorkbench = () => {
    if (!project) return;
    patchSidebar({ activityView: 'project', leftCollapsed: false, rightCollapsed: false });
  };

  const openThinkingMap = () => {
    if (!project) return;
    patchSidebar({ activityView: 'thinking-chain', leftCollapsed: false, rightCollapsed: true });
  };

  const openFlowOrchestration = () => {
    if (!(project || draftPlatform)) return;
    patchSidebar({ activityView: 'orchestration', leftCollapsed: false, rightCollapsed: true, processPanelOpen: false });
  };

  const openGlobalWorkspace = (view: Extract<ActivityView, 'resources' | 'rules' | 'settings'>) => {
    patchSidebar({ activityView: view, leftCollapsed: false, rightCollapsed: true });
  };

  return (
    <div className={`app-shell view-${layout.activityView} ${compactShellView ? 'app-shell-compact-screen' : ''}`}>
      {showTopbar ? <header className="topbar">
        <div className="topbar-brand"><div className="brand-mark">CE</div><div className="brand-copy"><strong>Cyber Editor</strong><span>{project?.manifest.name ?? '未打开工程'}</span></div>{project ? <StageBadge stage={project.workflow.stage} /> : null}</div>
        <div className="topbar-meta">{project ? <><span className="meta-label">当前文档</span><strong>{activeDocumentName}</strong></> : <span className="meta-inline">从一句话需求开始，逐步沉淀为完整文档集</span>}</div>
        <div className="topbar-actions">
          <TopbarMenuButton
            title="文件"
            icon={FolderOpen}
            open={topbarMenuOpen === 'file'}
            sections={topbarMenus.file}
            onToggle={() => setTopbarMenuOpen((current) => current === 'file' ? null : 'file')}
            onRun={runTopbarMenuAction}
          />
          <TopbarMenuButton
            title="编辑"
            icon={Pencil}
            open={topbarMenuOpen === 'edit'}
            sections={topbarMenus.edit}
            onToggle={() => setTopbarMenuOpen((current) => current === 'edit' ? null : 'edit')}
            onRun={runTopbarMenuAction}
          />
          <TopbarMenuButton
            title="视图"
            icon={Eye}
            open={topbarMenuOpen === 'view'}
            sections={topbarMenus.view}
            onToggle={() => setTopbarMenuOpen((current) => current === 'view' ? null : 'view')}
            onRun={runTopbarMenuAction}
          />
          <IconButton title="打开命令面板" onClick={() => setCommandPaletteOpen(true)} icon={Command} />
          <IconButton title={project ? '切换工程' : '打开工程'} onClick={() => void openProject()} icon={FolderOpen} />
          <IconButton title="切换主侧栏" onClick={() => patchSidebar({ leftCollapsed: !layout.leftCollapsed })} icon={PanelLeft} active={!layout.leftCollapsed} />
          <IconButton title="切换流程面板" onClick={() => patchSidebar({ processPanelOpen: !layout.processPanelOpen })} icon={PanelBottom} active={layout.processPanelOpen} />
          <IconButton
            title="切换 AI 侧栏"
            onClick={() => patchSidebar({ rightCollapsed: !layout.rightCollapsed })}
            icon={PanelRight}
            active={!layout.rightCollapsed && Boolean(project || draftPlatform)}
            disabled={!(project || draftPlatform)}
          />
          <IconButton title="切换浅色/深色" onClick={toggleThemeQuick} icon={settings?.theme === 'dark' ? SunMedium : MoonStar} />
          <IconButton title="打开设置" onClick={() => setSettingsOpen(true)} icon={Settings2} />
        </div>
      </header> : null}
      <div className="workspace">
        {showActivityBar ? (
          <nav className="activity-bar app-rail" aria-label="主导航">
            <div className="activity-group activity-group-top">
              <ActivityButton
                title="欢迎页"
                icon={House}
                active={!project && !draftPlatform && layout.activityView === 'project'}
                onClick={goHome}
              />
              <ActivityButton
                title="主工作台"
                icon={LayoutGrid}
                active={Boolean(project) && layout.activityView === 'project'}
                onClick={openWorkbench}
                disabled={!project}
              />
              <ActivityButton
                title="思路地图"
                icon={Share2}
                active={layout.activityView === 'thinking-chain'}
                onClick={openThinkingMap}
                disabled={!project}
              />
              <ActivityButton
                title="流编排"
                icon={GitBranch}
                active={layout.activityView === 'orchestration'}
                onClick={openFlowOrchestration}
                disabled={!(project || draftPlatform)}
              />
            </div>
            <div className="activity-group activity-group-bottom">
              <div className="activity-rail-bottom workbench-rail-bottom">
                {showProjectRailUtilities ? (
                  <div className="rail-status-chip" title={`当前阶段：${railStageLabel}`}>
                    <Layers3 size={14} strokeWidth={1.8} />
                    <span className="rail-status-value">{railStageLabel}</span>
                  </div>
                ) : null}
                {showProjectRailUtilities ? (
                  <div className={`rail-status-chip rail-status-chip-unsaved ${railUnsavedCount ? 'is-active' : ''}`} title={railUnsavedCount ? `未保存 ${railUnsavedCount}` : '没有未保存内容'}>
                    <CircleDot size={14} strokeWidth={1.8} />
                    <span className="rail-status-value">{railUnsavedCount}</span>
                  </div>
                ) : null}
                {showProjectRailUtilities ? (
                  <ActivityButton
                    title="任务抽屉"
                    icon={Menu}
                    active={layout.processPanelOpen}
                    onClick={() => patchSidebar({ processPanelOpen: !layout.processPanelOpen })}
                  />
                ) : null}
                {showProjectRailUtilities ? (
                  <ActivityButton
                    title={documentSplitOpen ? '关闭分屏' : '分屏'}
                    icon={Columns2}
                    active={documentSplitOpen}
                    onClick={() => void toggleDocumentSplit()}
                    disabled={!activeDocumentPath || documentLoading}
                  />
                ) : null}
                <ActivityButton
                  title="资源中心"
                  icon={Layers3}
                  active={layout.activityView === 'resources'}
                  onClick={() => openGlobalWorkspace('resources')}
                />
                <ActivityButton
                  title="规则与沉淀中心"
                  icon={Network}
                  active={layout.activityView === 'rules'}
                  onClick={() => openGlobalWorkspace('rules')}
                />
                <ActivityButton
                  title="设置"
                  icon={SlidersHorizontal}
                  active={layout.activityView === 'settings'}
                  onClick={() => openGlobalWorkspace('settings')}
                />
              </div>
            </div>
          </nav>
        ) : null}
        {showPrimarySidebar && <aside className="primary-sidebar" style={{ width: fittedSidebarWidths.left }}><SidebarView layout={layout} project={project} activeDocumentPath={activeDocumentPath} activeSession={activeSession} visibleSessions={visibleSessions} archivedSessions={archivedSessions} filteredTree={filteredTree} installedSkills={installedSkills} projectSkillIds={projectSkillIds} activeSessionSkillIds={activeSessionSkillIds} skillCatalog={skillCatalog} catalogUrl={catalogUrl} resourcePackageUrl={resourcePackageUrl} settings={settings} settingsDraft={settingsDraft} treeFilter={treeFilter} searchQuery={searchQuery} projectSearchResults={projectSearchResults} projectSearching={projectSearching} setTreeFilter={setTreeFilter} setSearchQuery={setSearchQuery} setCatalogUrl={setCatalogUrl} setResourcePackageUrl={setResourcePackageUrl} setSettings={setSettings} setSettingsDraft={setSettingsDraft} createFile={createFile} createDirectory={createDirectory} createFileAt={createFileAt} createDirectoryAt={createDirectoryAt} renameEntryAt={renameEntryAt} moveEntryAt={moveEntryAt} deleteEntryAt={deleteEntryAt} renameActiveEntry={renameActiveEntry} deleteActiveEntry={deleteActiveEntry} importDocumentsIntoProject={importDocumentsIntoProject} createSession={createSession} renameSession={renameSession} toggleSessionFlag={toggleSessionFlag} deleteSession={deleteSession} openDocument={openDocument} openDocumentInWindow={openDocumentInWindow} openSearchResult={openSearchResult} chooseSkillCatalogSource={chooseSkillCatalogSource} loadSkillCatalog={loadSkillCatalog} installSkill={installSkill} importLocalSkill={importLocalSkill} deleteSkill={deleteSkill} toggleProjectSkill={toggleProjectSkill} toggleSessionSkill={toggleSessionSkill} testAiConnection={testAiConnection} setSettingsOpen={setSettingsOpen} patchSidebar={patchSidebar} setActiveSessionId={setActiveSessionId} setResourceInstallDialogOpen={setResourceInstallDialogOpen} stageLabels={stageLabels} fileName={fileName} providerLabel={getProviderLabel} /></aside>}
        {showPrimarySidebar && <div className="resizer" onMouseDown={() => setDragTarget('left')} />}
        <div className="workspace-main">
          <div className="workspace-body">
            <main className="document-pane">
              {!project && !draftPlatform ? (
                projectDialogOpen ? (
                  <ProjectTemplateDialog
                    open={projectDialogOpen}
                    templates={templates}
                    selectedTemplateOverride={projectTemplateOverride}
                    draft={projectDraft}
                    status={projectDialogStatus}
                    validation={projectCreateValidation}
                    busy={projectDialogBusy}
                    onChange={setProjectDraft}
                    onChooseLocation={(mode) => void chooseProjectLocation(mode)}
                    onOpenTemplateCenter={openResourceCenter}
                    onClose={() => {
                      setProjectDialogOpen(false);
                      setProjectTemplateOverride(null);
                      setProjectTemplatePackageOverride(null);
                    }}
                    onSubmit={() => void submitCreateProject()}
                  />
                ) : (layout.activityView === 'resources' || resourceCenterOpen) ? (
                  <Suspense fallback={<LazyPanelFallback label="正在加载资源中心..." />}>
                    <ResourceCenterPage
                      resources={resourceDescriptors}
                      recentResourceIds={settings?.recentResources ?? []}
                      selectedResourceId={selectedResourceId}
                      activeKind={resourceCenterKind}
                      activeSource={resourceCenterSourceFilter}
                      query={resourceCenterQuery}
                      status={projectDialogStatus}
                      onKindChange={setResourceCenterKind}
                      onSourceChange={setResourceCenterSourceFilter}
                      onQueryChange={setResourceCenterQuery}
                      onSelect={setSelectedResourceId}
                      onImportLocal={(kind) => void importResourcePackage(kind)}
                      onOpenInstallDialog={(kind) => {
                        setResourceInstallKind(normalizeResourceInstallKind(kind));
                        setResourceInstallDialogOpen(true);
                      }}
                      onUseTemplateInProject={(templateId) => {
                        openProjectDialogWithTemplate(templateId);
                      }}
                      onStartDraftFromTemplate={(templateId) => void startDraftOrchestration(templateId)}
                      onCheckTemplateUpdate={(templateId) => void checkTemplateUpdate(templateId)}
                      onRepairTemplate={(templateId) => void repairTemplate(templateId)}
                      onUpdateTemplate={(templateId) => void updateTemplate(templateId)}
                      onTestConnector={(connectorId) => activePlatform ? (project ? testConnector(connectorId) : testDraftConnector(connectorId)) : Promise.resolve({ ok: false, message: '当前没有可检查的连接' })}
                      onClose={() => {
                        setResourceCenterOpen(false);
                        setLandingView('welcome');
                        if (resourceCenterSource === 'project-create') {
                          setProjectDialogOpen(true);
                          return;
                        }
                        patchSidebar({ activityView: 'project', leftCollapsed: false, rightCollapsed: false });
                      }}
                    />
                  </Suspense>
                ) : layout.activityView === 'rules' && rulesDistillation ? (
                  <Suspense fallback={<LazyPanelFallback label="Loading rules workspace..." />}>
                    <RulesWorkspacePage
                      projectName={undefined}
                      snapshot={rulesDistillation}
                      platform={activePlatform}
                      onSaveRule={saveRule}
                      onDeleteRule={deleteRule}
                      onSetRuleEnabled={setRuleEnabled}
                      onSaveAccumulationEntry={saveAccumulationEntry}
                      onDeleteAccumulationEntry={deleteAccumulationEntry}
                      onCreatePromotionDraft={createPromotionDraft}
                      onApplyPromotionDraft={applyPromotionDraft}
                      onImportRules={(scope) => void importRules(scope)}
                      onExportRules={(scope) => void exportRules(scope)}
                      onOpenKnowledgeNode={openKnowledgeGraphNode}
                      onClose={() => patchSidebar({ activityView: 'project', leftCollapsed: false, rightCollapsed: false })}
                    />
                  </Suspense>
                ) : layout.activityView === 'settings' && settings && settingsDraft ? (
                  <Suspense fallback={<LazyPanelFallback label="Loading settings..." />}>
                    <SettingsWorkspacePage
                      settings={settings}
                      draftTheme={settingsDraft.theme}
                      providerDrafts={settingsDraft.providerProfiles}
                      activeProviderProfileId={settingsSelectedProfileId}
                      status={settingsStatus}
                      onOpenProviderManager={() => setSettingsOpen(true)}
                      onTestConnection={() => void testAiConnection()}
                    />
                  </Suspense>
                ) : (
                  <WelcomeScreen
                    recentProjects={settings?.recentProjects ?? []}
                    recentTemplates={recentTemplateEntries}
                    recentDrafts={recentDraftEntries}
                    onCreate={() => void createProject()}
                    onStartOrchestration={() => void startDraftOrchestration()}
                    onOpen={() => void openProject()}
                    onOpenResourceCenter={openResourceCenter}
                    onCreateFromRecentTemplate={(templateId) => {
                      openProjectDialogWithTemplate(templateId);
                    }}
                    onStartFromRecentTemplate={(templateId) => void startDraftOrchestration(templateId)}
                    onOpenRecentDraft={(entry) => void openRecentDraft(entry)}
                    onRemoveRecentDraft={(entry) => void removeRecentDraft(entry)}
                    onOpenRecent={(rootPath) => void openProjectAt(rootPath)}
                    onRenameRecent={(entry) => void renameRecentProject(entry)}
                    onRemoveRecent={(entry) => void removeRecentProject(entry)}
                    onRevealRecent={(entry) => void revealRecentProject(entry)}
                    onClearInvalidRecent={() => void clearInvalidRecentProjects()}
                    onClearAllRecent={() => void clearAllRecentProjects()}
                  />
                )
              ) : projectDialogOpen ? (
                <ProjectTemplateDialog
                  open={projectDialogOpen}
                  templates={templates}
                  selectedTemplateOverride={projectTemplateOverride}
                  draft={projectDraft}
                  status={projectDialogStatus}
                  validation={projectCreateValidation}
                  busy={projectDialogBusy}
                  onChange={setProjectDraft}
                  onChooseLocation={(mode) => void chooseProjectLocation(mode)}
                  onOpenTemplateCenter={openResourceCenter}
                  onClose={() => {
                    setProjectDialogOpen(false);
                    setProjectTemplateOverride(null);
                    setProjectTemplatePackageOverride(null);
                  }}
                  onSubmit={() => void submitCreateProject()}
                />
              ) : layout.activityView === 'resources' ? (
                <Suspense fallback={<LazyPanelFallback label="正在加载资源中心..." />}>
                  <ResourceCenterPage
                    resources={resourceDescriptors}
                    recentResourceIds={settings?.recentResources ?? []}
                    selectedResourceId={selectedResourceId}
                    activeKind={resourceCenterKind}
                    activeSource={resourceCenterSourceFilter}
                    query={resourceCenterQuery}
                    status={projectDialogStatus}
                    onKindChange={setResourceCenterKind}
                    onSourceChange={setResourceCenterSourceFilter}
                    onQueryChange={setResourceCenterQuery}
                    onSelect={setSelectedResourceId}
                    onImportLocal={(kind) => void importResourcePackage(kind)}
                    onOpenInstallDialog={(kind) => {
                      setResourceInstallKind(normalizeResourceInstallKind(kind));
                      setResourceInstallDialogOpen(true);
                    }}
                    onUseTemplateInProject={(templateId) => {
                      openProjectDialogWithTemplate(templateId);
                    }}
                    onStartDraftFromTemplate={(templateId) => void startDraftOrchestration(templateId)}
                    onCheckTemplateUpdate={(templateId) => void checkTemplateUpdate(templateId)}
                    onRepairTemplate={(templateId) => void repairTemplate(templateId)}
                    onUpdateTemplate={(templateId) => void updateTemplate(templateId)}
                    onTestConnector={(connectorId) => project ? testConnector(connectorId) : testDraftConnector(connectorId)}
                    onClose={() => patchSidebar({ activityView: project ? 'project' : 'orchestration' })}
                  />
                </Suspense>
              ) : layout.activityView === 'thinking-chain' ? (
                <Suspense fallback={<LazyPanelFallback label="加载思路地图..." />}>
                  <ThinkingChainPage
                    snapshot={thinkingChainSnapshot}
                    loading={thinkingChainLoading}
                    hideRejected={thinkingChainHideRejected}
                    zoom={thinkingChainZoom}
                    selectedNodeId={selectedThinkingNodeId}
                    onSelectNode={setSelectedThinkingNodeId}
                    onToggleHideRejected={() => setThinkingChainHideRejected((current) => !current)}
                    onZoomChange={async (value) => {
                      setThinkingChainZoom(value);
                    }}
                    onPersistNodePosition={persistThinkingChainNodePosition}
                    onPersistView={persistThinkingChainView}
                    onResetLayout={() => void resetThinkingChainLayout()}
                    onJumpEvidence={jumpToThinkingChainEvidence}
                    onClose={() => patchSidebar({ activityView: project ? 'project' : 'orchestration' })}
                  />
                </Suspense>
              ) : layout.activityView === 'rules' && rulesDistillation ? (
                <Suspense fallback={<LazyPanelFallback label="Loading rules workspace..." />}>
                  <RulesWorkspacePage
                    projectName={project?.manifest.name}
                    snapshot={rulesDistillation}
                    platform={activePlatform}
                    onSaveRule={saveRule}
                    onDeleteRule={deleteRule}
                    onSetRuleEnabled={setRuleEnabled}
                    onSaveAccumulationEntry={saveAccumulationEntry}
                    onDeleteAccumulationEntry={deleteAccumulationEntry}
                    onCreatePromotionDraft={createPromotionDraft}
                    onApplyPromotionDraft={applyPromotionDraft}
                    onImportRules={(scope) => void importRules(scope)}
                    onExportRules={(scope) => void exportRules(scope)}
                    onOpenKnowledgeNode={openKnowledgeGraphNode}
                    onClose={() => patchSidebar({ activityView: project ? 'project' : 'orchestration' })}
                  />
                </Suspense>
              ) : layout.activityView === 'settings' && settings && settingsDraft ? (
                <Suspense fallback={<LazyPanelFallback label="Loading settings..." />}>
                  <SettingsWorkspacePage
                    settings={settings}
                    draftTheme={settingsDraft.theme}
                    providerDrafts={settingsDraft.providerProfiles}
                    activeProviderProfileId={settingsSelectedProfileId}
                    status={settingsStatus}
                    onOpenProviderManager={() => setSettingsOpen(true)}
                    onTestConnection={() => void testAiConnection()}
                  />
                </Suspense>
              ) : layout.activityView === 'orchestration' && activePlatform && settings ? (
                <Suspense fallback={<LazyPanelFallback label="Loading orchestration..." />}>
                  <OrchestrationWorkspace
                    projectName={project?.manifest.name ?? activeRuntimeTemplate?.name ?? 'Draft Orchestration'}
                    platform={activePlatform}
                    runtimeTemplate={activeRuntimeTemplate}
                    settings={settings}
                    draftMode={!project}
                    draftStatus={draftStatusLabel}
                    installedSkills={installedSkills}
                    activeSession={activeSession}
                    chatInput={chatInput}
                    sending={sending}
                    setChatInput={setChatInput}
                    sendMessage={sendMessage}
                    stageGuard={stageGuard}
                    onSaveFlow={(flow) => project ? saveFlow(flow) : saveDraftFlow(flow)}
                    onDeleteFlow={(kind, flowId) => project ? deleteFlow(kind, flowId) : deleteDraftFlow(kind, flowId)}
                    onDuplicateFlow={(kind, flowId) => project ? duplicateFlow(kind, flowId) : duplicateDraftFlow(kind, flowId)}
                    onImportFlow={(kind) => project ? importFlow(kind) : importDraftFlow(kind)}
                    onExportFlow={(kind, flowId) => project ? exportFlow(kind, flowId) : exportDraftFlow(kind, flowId)}
                    onSaveRoles={(roles) => project ? saveRoles(roles) : saveDraftRoles(roles)}
                    onSaveTaskTemplates={(taskTemplates) => project ? saveTaskTemplates(taskTemplates) : saveDraftTaskTemplates(taskTemplates)}
                    onSaveAgentProfiles={(agentProfiles) => project ? saveAgentProfiles(agentProfiles) : saveDraftAgentProfiles(agentProfiles)}
                    onSaveConnectors={(connectors) => project ? saveConnectors(connectors) : saveDraftConnectors(connectors)}
                    onSaveTools={(tools) => project ? saveTools(tools) : saveDraftTools(tools)}
                    onTestConnector={(connectorId) => project ? testConnector(connectorId) : testDraftConnector(connectorId)}
                    onRunTool={(toolId) => project ? runTool(toolId) : runDraftTool(toolId)}
                    runtimeRuns={runtimeRuns}
                    runtimeEvents={runtimeEvents}
                    artifactRevisions={artifactRevisions}
                    artifactInvalidations={artifactInvalidations}
                    rulesDistillation={rulesDistillation}
                    runtimeCapabilities={runtimeCapabilities}
                    flowHistories={activeFlowHistories}
                    onSaveRuntimeTemplate={(template) => project ? saveRuntimeTemplate(template) : saveDraftRuntimeTemplate(template)}
                    onValidateFlow={(kind, flowId) => project ? validateFlow(kind, flowId) : validateDraftFlow(kind, flowId)}
                    onRestoreFlowVersion={(kind, flowId, versionId) => project ? restoreFlowVersion(kind, flowId, versionId) : restoreDraftFlowVersion(kind, flowId, versionId)}
                    onDebugNode={(kind, flowId, nodeId) => project ? debugFlowNode(kind, flowId, nodeId) : debugDraftFlowNode(kind, flowId, nodeId)}
                    onPreviewRerun={project ? previewFlowRerun : undefined}
                    onApplyRerun={project ? applyFlowRerun : undefined}
                    onPauseRun={project ? pauseRuntimeRun : undefined}
                    onResumeRun={project ? resumeRuntimeRun : undefined}
                    onResolveApproval={project ? resolveRuntimeApproval : undefined}
                    onRetryRun={project ? retryRuntimeRun : undefined}
                    onStopRun={project ? stopRuntimeRun : undefined}
                    focusRequest={orchestrationFocusRequest}
                    onConversationTargetChange={setOrchestrationConversationFlow}
                    onOpenConversation={() => patchSidebar({ rightCollapsed: false }, false)}
                    onOpenRunMerge={project ? openRunMergeForReview : undefined}
                    onSaveTemplate={() => openSaveTemplateDialog()}
                    onBindToProject={project ? undefined : () => bindDraftToProject()}
                    onReturnToProject={() => {
                      if (project) {
                        patchSidebar({ activityView: 'project' });
                        return;
                      }
                      closeDraftToWelcome();
                    }}
                  />
                </Suspense>
              ) : <>
                <section className="document-workspace-bar">
                  <div className="document-workspace-copy">
                    <div className="section-kicker">主工作台</div>
                    <div className="document-workspace-headline">
                      <strong>{project?.manifest.name ?? activeRuntimeTemplate?.name ?? '当前工作区'}</strong>
                      <span>{activeSession?.title ?? '起始会话'}</span>
                    </div>
                    <div className="document-workspace-meta">
                      <span className="small-tag">{project ? stageLabels[project.workflow.stage] : activeSession ? stageLabels[activeSession.stage] : '未选择阶段'}</span>
                      <span className="small-tag">{activeDocumentPath ? '正在编辑' : '等待打开文档'}</span>
                      <span className="small-tag">{documentTabs.length} 个标签</span>
                      <span className="small-tag">{documentDirty ? '未保存' : '已同步'}</span>
                    </div>
                  </div>
                  <div className="document-workspace-actions">
                    <button type="button" className="button-secondary icon-text" onClick={() => void window.api.openProjectFolder()}>
                      <FolderOpen size={14} strokeWidth={1.8} />
                      <span>项目目录</span>
                    </button>
                    <button type="button" className="button-secondary icon-text" onClick={() => setCommandPaletteOpen(true)}>
                      <Command size={14} strokeWidth={1.8} />
                      <span>命令面板</span>
                    </button>
                    <button type="button" className="button-primary icon-text" onClick={() => void saveDocument()} disabled={!activeDocumentPath || documentLoading}>
                      <Save size={14} strokeWidth={1.8} />
                      <span>{documentDirty ? '保存当前文档' : '已保存'}</span>
                    </button>
                  </div>
                </section>
                <DocumentTabs
                  tabs={documentTabs}
                  activePath={activeDocumentPath}
                  canReopen={Boolean(recentlyClosedTabs.length)}
                  onSelect={(filePath) => void openDocument(filePath)}
                  onClose={(filePath) => closeDocumentTab(filePath)}
                  onReopenLastClosed={() => void reopenLastClosedDocument()}
                />
                <div className="document-header">
                  <div className="document-breadcrumbs">
                    <span className="panel-kicker">docs / {activeDocumentName}</span>
                    <span className="document-status-pill">{documentDirty ? '有未保存更改' : '自动保存已开启'}</span>
                  </div>
                  <div className="document-toolbar-actions document-toolbar-actions-compact">
                    <IconButton title="源码" onClick={() => setViewMode('source')} icon={Code2} active={viewMode === 'source'} disabled={!activeDocumentPath || !activeDocumentIsText} />
                    <IconButton title="阅读" onClick={() => setViewMode('read')} icon={Eye} active={viewMode === 'read'} disabled={!activeDocumentPath || !activeDocumentIsText} />
                    <IconButton title={documentSplitOpen ? '关闭分屏' : '开启分屏'} onClick={() => void toggleDocumentSplit()} icon={Columns2} active={documentSplitOpen} disabled={!activeDocumentPath} />
                    <IconButton title="在新窗口打开" onClick={() => void openDocumentInWindow()} icon={SquareArrowOutUpRight} disabled={!activeDocumentPath} />
                    <IconButton title={documentDirty ? '保存更改' : '保存'} onClick={() => void saveDocument()} icon={Save} active={documentDirty} disabled={!activeDocumentPath} />
                  </div>
                </div>
                <FindReplaceBar open={findOpen} query={findQuery} replaceText={replaceText} matchCount={activeDocumentMatches.length} currentIndex={findIndex} canReplace={Boolean(activeDocumentPath && activeDocumentIsText)} onQueryChange={(value) => { setFindQuery(value); setFindIndex(0); }} onReplaceTextChange={setReplaceText} onPrev={() => selectFindMatch(findIndex - 1)} onNext={() => selectFindMatch(findIndex + 1)} onReplaceCurrent={replaceCurrentMatch} onReplaceAll={replaceAllMatches} onClose={() => setFindOpen(false)} />
                <div className={`document-surface ${documentSplitOpen ? 'split' : ''}`} ref={documentSurfaceRef}>{!activeDocumentPath ? <ProjectWelcomeCard projectName={project?.manifest.name ?? activeRuntimeTemplate?.name ?? '当前工作区'} sessionTitle={activeSession?.title ?? '起始会话'} onOpenProjectFolder={() => void window.api.openProjectFolder()} onOpenRequirementDoc={() => { const target = findFirstMarkdown(project?.tree ?? []); if (target) void openDocument(target); }} /> : <><div className="document-pane-split" style={documentSplitOpen ? { flexBasis: `${(1 - (layout.documentSplitRatio ?? 0.5)) * 100}%` } : undefined}>{renderDocumentBody(activeDocument)}</div>{documentSplitOpen && secondaryDocument ? <><div className="document-split-resizer" onMouseDown={() => setDragTarget('document-split')} /><div className="document-pane-split secondary" style={{ flexBasis: `${(layout.documentSplitRatio ?? 0.5) * 100}%` }}><div className="secondary-pane-header"><strong>{secondaryDocument.title}</strong><div className="icon-actions"><IconButton title="切换到主视图" onClick={() => void openDocument(secondaryDocument.path)} icon={FolderOpen} /><IconButton title="关闭分屏" onClick={() => patchSidebar({ documentSplitOpen: false, secondaryDocumentPath: '' })} icon={Columns2} active /></div></div>{renderDocumentBody(secondaryDocument, { readOnly: true, sourcePath: secondaryDocument.path })}</div></> : null}</>}</div>
              </>}
            </main>
            {showContextPane && <div className="resizer" onMouseDown={() => setDragTarget('right')} />}
            {showContextPane && <aside className="context-pane" style={{ width: fittedSidebarWidths.right }}><ContextPane activityView={layout.activityView} activeSession={activeSession} visibleSessions={visibleSessions} archivedSessions={archivedSessions} activeDocumentName={activeDocumentName} activeDocumentPath={activeDocumentPath} activeSessionSkillIds={activeSessionSkillIds} projectSkillIds={projectSkillIds} installedSkills={installedSkills} chatInput={chatInput} sending={sending} setChatInput={setChatInput} sendMessage={sendMessage} patchSidebar={patchSidebar} activeNoteDocument={activeNoteDocument} noteComparisonCandidates={noteComparisonCandidates} noteComparePath={noteComparePath} setNoteComparePath={setNoteComparePath} activeNoteComparison={activeNoteComparison} openDocument={openDocument} setActiveSessionId={setActiveSessionId} createSession={createSession} recentDocumentChanges={relevantRecentDocumentChanges} conversationTarget={conversationTarget} targetLabel={activeConversationTargetLabel} sameConversationTarget={sameConversationTarget} fileName={fileName} stageLabels={stageLabels} contextPacks={contextPacks} knowledgeIndexState={knowledgeIndexState} runtimeGovernorStatus={runtimeGovernorStatus} refreshKnowledgeIndex={refreshKnowledgeIndex} onOpenThinkingChain={() => patchSidebar({ activityView: 'thinking-chain', leftCollapsed: false }, false)} toggleSessionPinnedDocument={toggleSessionPinnedDocument} toggleSessionExcludedDocument={toggleSessionExcludedDocument} /></aside>}
          </div>
          {project && layout.processPanelOpen && layout.activityView !== 'orchestration' && <ProcessPanel layout={layout} project={project} activeSession={activeSession} activeReviewRounds={activeReviewRounds} stageInstructions={stageInstructions} stageGuard={stageGuard} setStageInstructions={setStageInstructions} updateSessionStage={updateSessionStage} generateStageDraft={generateStageDraft} confirmStage={confirmStage} revisitStage={revisitStage} generateOpenSpec={generateOpenSpec} runReviewRound={runReviewRound} updateReviewIssue={updateReviewIssue} consistencyReport={consistencyReport} snapshots={snapshots} restoreSnapshot={restoreSnapshot} auditEntries={auditEntries} runtimeRuns={runtimeRuns} runtimeEvents={runtimeEvents} runtimeCapabilities={runtimeCapabilities} runConsistencyCheck={runConsistencyCheck} pauseRuntimeRun={pauseRuntimeRun} resumeRuntimeRun={resumeRuntimeRun} retryRuntimeRun={retryRuntimeRun} stopRuntimeRun={stopRuntimeRun} openRunMergeForReview={openRunMergeForReview} patchSidebar={patchSidebar} stageLabels={stageLabels} stageOrder={stageOrder} fileName={fileName} />}
        </div>
      </div>
      {flowConversationPreview ? (
        <div className="modal-backdrop" onClick={dismissFlowConversationPreview}>
          <div className="modal flow-editor-modal" data-testid="flow-conversation-preview" onClick={(event) => event.stopPropagation()}>
            <div className="sidebar-header">
              <div className="sidebar-header-copy">
                <strong>{flowConversationPreview.mode === 'draft' ? '流程草稿预览' : '流程修改预览'}</strong>
                <div className="muted-line">{activeConversationTargetLabel} · {flowConversationPreview.prompt}</div>
              </div>
              <div className="icon-actions">
                <button type="button" className="button-secondary" onClick={dismissFlowConversationPreview}>取消</button>
                <button type="button" className="button-primary" onClick={() => void applyFlowConversationPreview()}>
                  {flowConversationPreview.mode === 'draft' ? '应用草稿' : '应用修改'}
                </button>
              </div>
            </div>
            <div className="flow-editor-modal-grid">
              <section className="inspector-card">
                <div className="section-kicker">{flowConversationPreview.mode === 'draft' ? 'Flow Plan' : 'Patch 摘要'}</div>
                {flowConversationPreview.mode === 'draft' ? (
                  <>
                    <strong>{flowConversationPreview.plan.name}</strong>
                    <div className="muted-line">{flowConversationPreview.plan.description}</div>
                    <div className="asset-list">
                      {flowConversationPreview.plan.steps.map((step) => (
                        <div key={step.id} className="asset-list-item">
                          <strong>{step.title}</strong>
                          <span className="muted-line">{step.description || step.type}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <strong>{flowConversationPreview.patch.summary}</strong>
                    <div className="asset-list">
                      {flowConversationPreview.patch.operations.map((operation, index) => (
                        <div key={`${operation.op}-${index}`} className="asset-list-item">
                          <strong>{operation.op}</strong>
                          <span className="muted-line">{JSON.stringify(operation)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
              <section className="inspector-card">
                <div className="section-kicker">应用后结果</div>
                <strong>{flowConversationPreview.mode === 'draft' ? flowConversationPreview.draft.name : flowConversationPreview.preview.name}</strong>
                <div className="muted-line">
                  节点 {(flowConversationPreview.mode === 'draft' ? flowConversationPreview.draft.nodes.length : flowConversationPreview.preview.nodes.length)}
                  · 连线 {(flowConversationPreview.mode === 'draft' ? flowConversationPreview.draft.edges.length : flowConversationPreview.preview.edges.length)}
                </div>
                <div className="tag-cloud compact">
                  {(flowConversationPreview.mode === 'draft' ? flowConversationPreview.draft.nodes : flowConversationPreview.preview.nodes)
                    .slice(0, 12)
                    .map((node) => <span key={node.id} className="small-tag">{node.data.label}</span>)}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
      <footer className="statusbar"><span>{status}</span><span>{getProviderLabel(settings?.provider)}</span><span>{settings?.model ?? '未配置模型'}</span><span>{activityViewLabel(layout.activityView)}</span></footer>
      <CommandPalette
        open={commandPaletteOpen}
        query={commandQuery}
        items={filteredCommandItems.map((item) => ({
          ...item,
          run: () => {
            setCommandPaletteOpen(false);
            setCommandQuery('');
            item.run();
          }
        }))}
        onQueryChange={setCommandQuery}
        onClose={() => {
          setCommandPaletteOpen(false);
          setCommandQuery('');
        }}
      />
      <DocumentProtectionDialog
        open={documentProtectionOpen}
        documentName={activePendingDocumentWrite?.title ?? activeDocumentName}
        snapshots={documentSnapshots}
        pendingWrite={activePendingDocumentWrite}
        busy={documentProtectionBusy}
        onClose={() => setDocumentProtectionOpen(false)}
        onCreateSnapshot={(label) => void createActiveDocumentSnapshot(label)}
        onRestoreSnapshot={(snapshotId) => void restoreActiveDocumentSnapshot(snapshotId)}
        onResolvePendingWrite={(proposalId, input) => void resolvePendingDocumentWrite(proposalId, input)}
      />
      <ArtifactReferenceDialog
        open={artifactReferenceDialogOpen}
        mode={artifactReferenceMode}
        items={projectArtifactCandidates}
        onClose={() => setArtifactReferenceDialogOpen(false)}
        onInsert={(targetPath, label) => insertArtifactReference(targetPath, artifactReferenceMode, label)}
      />
      <ConflictDialog conflict={conflictState} onReload={() => void resolveConflictReload()} onOverwrite={() => void resolveConflictOverwrite()} onLater={resolveConflictLater} />
      {settingsOpen && settings && settingsDraft ? (
        <ProviderProfilesDialog
          open={settingsOpen}
          settings={{
            theme: settingsDraft.theme,
            debug: settingsDraft.debug,
            activeProviderProfileId: settingsDraft.activeProviderProfileId
          }}
          drafts={settingsDraft.providerProfiles}
          selectedProfileId={settingsSelectedProfileId}
          status={settingsStatus}
          testing={settingsTesting}
          saving={settingsBusy}
          onChangeTheme={updateThemeDraft}
          onChangeLiveLogConsole={updateLiveLogConsoleDraft}
          onSelectProfile={selectProviderProfileDraft}
          onChangeProfile={updateProviderProfileDraft}
          onCreateProfile={createProviderProfileDraft}
          onDeleteProfile={deleteProviderProfileDraft}
          onTestProfile={(profileId) => void testAiConnection(profileId)}
          onSave={() => void saveSettings()}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      <SaveTemplateDialog
        open={saveTemplateOpen}
        draft={saveTemplateDraft}
        status={saveTemplateStatus}
        busy={saveTemplateBusy}
        onChange={setSaveTemplateDraft}
        onClose={() => setSaveTemplateOpen(false)}
        onSubmit={() => void saveCurrentAsTemplate()}
      />
      <PackageUrlDialog
        open={resourceInstallDialogOpen}
        title={resourceInstallKind === 'role-package' ? '下载角色包' : resourceInstallKind === 'skill' ? '安装技能包' : '下载模板'}
        description={resourceInstallKind === 'role-package'
          ? '输入角色包地址，安装后会立即出现在资源中心。'
          : resourceInstallKind === 'skill'
            ? '输入技能包地址，安装后会立即出现在资源中心。'
            : '输入模板包地址，安装后会立即出现在资源中心。'}
        value={resourcePackageUrl}
        placeholder={resourceInstallKind === 'role-package' ? '输入角色包地址' : resourceInstallKind === 'skill' ? '输入技能包地址' : '输入模板包地址'}
        actionLabel={resourceInstallKind === 'role-package' ? '下载角色包' : resourceInstallKind === 'skill' ? '安装技能包' : '下载模板'}
        status={projectDialogStatus}
        onChange={setResourcePackageUrl}
        onSubmit={() => void installResourcePackageFromUrl()}
        onClose={() => setResourceInstallDialogOpen(false)}
      />
    </div>
  );
}

function activityViewLabel(view: ActivityView) {
  return view === 'project'
    ? '工程视图'
    : view === 'orchestration'
      ? '编排视图'
      : view === 'sessions'
        ? '会话视图'
        : view === 'thinking-chain'
          ? '思路地图视图'
        : view === 'rules'
          ? '规则视图'
        : view === 'resources'
          ? '资源视图'
          : view === 'search'
            ? '搜索视图'
            : '设置视图';
}
function slugifyTemplateId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
function ensureUniqueTemplateId(value: string, existingIds: string[]) {
  const normalized = slugifyTemplateId(value) || 'template';
  if (!existingIds.includes(normalized)) return normalized;
  const base = normalized.slice(0, 56);
  let index = 2;
  let candidate = `${base}-${index}`;
  while (existingIds.includes(candidate)) {
    index += 1;
    candidate = `${base}-${index}`;
  }
  return candidate;
}
function fileName(filePath: string) { return filePath ? filePath.split(/[\\/]/).pop() ?? '' : ''; }
function stripFileExtension(value: string) { return value.replace(/\.[^./\\]+$/, ''); }
function existsInTree(tree: ProjectSummary['tree'] | undefined, targetPath: string) { if (!tree) return false; for (const node of tree) { if (node.path === targetPath) return true; if (node.children?.length && existsInTree(node.children, targetPath)) return true; } return false; }
function resolveParentDirectory(rootPath: string, activePath: string) { if (!activePath) return rootPath; const separator = activePath.includes('\\') ? '\\' : '/'; const parts = activePath.split(/[\\/]/); parts.pop(); return parts.join(separator) || rootPath; }
function normalizeComparablePath(targetPath: string) { return targetPath.replace(/\//g, '\\').toLowerCase(); }
function remapPathPrefix(candidatePath: string, sourcePath: string, destinationPath: string) {
  if (!candidatePath) return candidatePath;
  const normalizedCandidate = normalizeComparablePath(candidatePath);
  const normalizedSource = normalizeComparablePath(sourcePath);
  if (normalizedCandidate === normalizedSource) return destinationPath;
  const sourcePrefix = `${normalizedSource}\\`;
  if (!normalizedCandidate.startsWith(sourcePrefix)) return candidatePath;
  return `${destinationPath}${candidatePath.slice(sourcePath.length)}`;
}
function isPathWithinEntry(candidatePath: string, entryPath: string) {
  if (!candidatePath || !entryPath) return false;
  const normalizedCandidate = normalizeComparablePath(candidatePath);
  const normalizedEntry = normalizeComparablePath(entryPath);
  return normalizedCandidate === normalizedEntry || normalizedCandidate.startsWith(`${normalizedEntry}\\`);
}
function normalizeProjectRelativePath(rootPath: string, targetPath: string) {
  if (!targetPath) return '.';
  const normalizedRoot = normalizeComparablePath(rootPath);
  const normalizedTarget = normalizeComparablePath(targetPath);
  if (normalizedRoot === normalizedTarget) return '.';
  if (normalizedTarget.startsWith(`${normalizedRoot}\\`)) {
    return targetPath.slice(rootPath.length + 1).replace(/\\/g, '/') || '.';
  }
  return targetPath.replace(/\\/g, '/');
}
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function minCenterPaneWidth(viewportWidth: number) {
  return viewportWidth < 1180 ? COMPACT_CENTER_PANE_WIDTH : MIN_CENTER_PANE_WIDTH;
}

function minLeftSidebarWidth(viewportWidth: number) {
  return viewportWidth < 1180 ? COMPACT_LEFT_SIDEBAR_WIDTH : MIN_LEFT_SIDEBAR_WIDTH;
}

function minRightSidebarWidth(viewportWidth: number) {
  return viewportWidth < 1180 ? COMPACT_RIGHT_SIDEBAR_WIDTH : MIN_RIGHT_SIDEBAR_WIDTH;
}

function fitSidebarWidths(layout: SidebarLayout, viewportWidth: number, showLeft: boolean, showRight: boolean) {
  const leftFloor = minLeftSidebarWidth(viewportWidth);
  const rightFloor = minRightSidebarWidth(viewportWidth);
  const centerFloor = minCenterPaneWidth(viewportWidth);
  let left = showLeft ? clamp(layout.leftWidth, leftFloor, MAX_LEFT_SIDEBAR_WIDTH) : 0;
  let right = showRight ? clamp(layout.rightWidth, rightFloor, MAX_RIGHT_SIDEBAR_WIDTH) : 0;
  const availableWidth = viewportWidth
    - ACTIVITY_BAR_WIDTH
    - (showLeft ? RESIZER_WIDTH : 0)
    - (showRight ? RESIZER_WIDTH : 0)
    - centerFloor;

  let overflow = left + right - availableWidth;
  if (overflow > 0 && showRight) {
    const reducible = Math.max(0, right - rightFloor);
    const reduce = Math.min(reducible, overflow);
    right -= reduce;
    overflow -= reduce;
  }
  if (overflow > 0 && showLeft) {
    const reducible = Math.max(0, left - leftFloor);
    const reduce = Math.min(reducible, overflow);
    left -= reduce;
    overflow -= reduce;
  }
  if (overflow > 0 && showRight) {
    const fallbackFloor = Math.max(180, rightFloor - 40);
    const reduce = Math.min(Math.max(0, right - fallbackFloor), overflow);
    right -= reduce;
    overflow -= reduce;
  }
  if (overflow > 0 && showLeft) {
    const fallbackFloor = Math.max(180, leftFloor - 40);
    const reduce = Math.min(Math.max(0, left - fallbackFloor), overflow);
    left -= reduce;
  }

  return { left, right };
}
function relativeDocumentPath(sourcePath: string, targetPath: string) {
  const sourceNormalized = sourcePath.replace(/\\/g, '/');
  const targetNormalized = targetPath.replace(/\\/g, '/');
  const sourceParts = sourceNormalized.split('/').filter(Boolean);
  const targetParts = targetNormalized.split('/').filter(Boolean);
  sourceParts.pop();
  if ((sourceParts[0] ?? '').includes(':') && (targetParts[0] ?? '').includes(':') && sourceParts[0]!.toLowerCase() !== targetParts[0]!.toLowerCase()) {
    return targetNormalized;
  }
  while (sourceParts.length && targetParts.length && sourceParts[0]!.toLowerCase() === targetParts[0]!.toLowerCase()) {
    sourceParts.shift();
    targetParts.shift();
  }
  const relativeParts = [...sourceParts.map(() => '..'), ...targetParts];
  return relativeParts.join('/') || '.';
}
function collectProjectArtifactFiles(
  tree: ProjectSummary['tree'],
  activePath: string,
  rootPath: string
) {
  const items: Array<{ path: string; label: string; description: string }> = [];
  const visit = (nodes: ProjectSummary['tree']) => {
    for (const node of nodes) {
      if (node.type === 'directory') {
        if (node.children?.length) visit(node.children);
        continue;
      }
      if (!node.path || node.path === activePath) continue;
      items.push({
        path: node.path,
        label: fileName(node.path) || node.path,
        description: normalizeProjectRelativePath(rootPath, node.path)
      });
    }
  };
  visit(tree);
  return items.sort((left, right) => left.description.localeCompare(right.description, 'zh-CN'));
}
function compareNoteDocuments(base: NoteReferenceDocument, compare: NoteReferenceDocument, documents: NoteReferenceDocument[]): NoteReferenceComparison {
  const documentMap = new Map(documents.map((document) => [document.path, document]));
  const splitSets = (left: string[], right: string[]) => {
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    return {
      shared: [...leftSet].filter((item) => rightSet.has(item)),
      leftOnly: [...leftSet].filter((item) => !rightSet.has(item)),
      rightOnly: [...rightSet].filter((item) => !leftSet.has(item))
    };
  };
  const buildList = (paths: string[]) =>
    paths
      .map((itemPath) => documentMap.get(itemPath))
      .filter(Boolean)
      .sort((left, right) => left!.title.localeCompare(right!.title, 'zh-CN') || left!.path.localeCompare(right!.path)) as NoteReferenceDocument[];

  const outbound = splitSets(
    base.outbound.map((edge) => edge.targetPath),
    compare.outbound.map((edge) => edge.targetPath)
  );
  const inbound = splitSets(
    base.inbound.map((edge) => edge.sourcePath),
    compare.inbound.map((edge) => edge.sourcePath)
  );

  return {
    basePath: base.path,
    comparePath: compare.path,
    sharedOutbound: buildList(outbound.shared),
    baseOnlyOutbound: buildList(outbound.leftOnly),
    compareOnlyOutbound: buildList(outbound.rightOnly),
    sharedInbound: buildList(inbound.shared),
    baseOnlyInbound: buildList(inbound.leftOnly),
    compareOnlyInbound: buildList(inbound.rightOnly)
  };
}
function serializeDraftSnapshot(snapshot: DraftOrchestrationSnapshot) {
  return JSON.stringify({
    id: snapshot.id,
    name: snapshot.name,
    platform: snapshot.platform,
    runtimeTemplate: snapshot.runtimeTemplate,
    flowHistories: snapshot.flowHistories,
    sessions: snapshot.sessions,
    activeSessionId: snapshot.activeSessionId,
    templatePackage: snapshot.templatePackage
  });
}
function sortSessions(items: AiSession[]) { return [...items].sort((left, right) => left.pinned !== right.pinned ? (left.pinned ? -1 : 1) : left.title.localeCompare(right.title, 'zh-CN')); }
function filterTree(nodes: ProjectSummary['tree'], query: string): ProjectSummary['tree'] { if (!query.trim()) return nodes; const lower = query.trim().toLowerCase(); return nodes.map((node) => node.type === 'file' ? (node.name.toLowerCase().includes(lower) ? node : null) : (node.name.toLowerCase().includes(lower) || filterTree(node.children ?? [], query).length ? { ...node, children: filterTree(node.children ?? [], query) } : null)).filter(Boolean) as ProjectSummary['tree']; }
function findFirstMarkdown(nodes: ProjectSummary['tree']): string | null { for (const node of nodes) { if (node.type === 'file' && node.name.endsWith('.md')) return node.path; if (node.children?.length) { const nested = findFirstMarkdown(node.children); if (nested) return nested; } } return null; }
function findTextRanges(value: string, query: string) {
  if (!query) return [] as TextRange[];
  const lowerValue = value.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matches: TextRange[] = [];
  let startIndex = 0;
  while (startIndex < lowerValue.length) {
    const foundAt = lowerValue.indexOf(lowerQuery, startIndex);
    if (foundAt === -1) break;
    matches.push({ start: foundAt, end: foundAt + query.length });
    startIndex = foundAt + query.length;
  }
  return matches;
}
function offsetForLine(value: string, lineNumber: number) {
  if (lineNumber <= 1) return 0;
  const lines = value.split(/\r?\n/);
  let offset = 0;
  for (let index = 0; index < Math.min(lineNumber - 1, lines.length); index += 1) {
    offset += lines[index].length + 1;
  }
  return offset;
}
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
