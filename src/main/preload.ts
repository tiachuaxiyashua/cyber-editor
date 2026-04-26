import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentProfile,
  ArtifactOpenPayload,
  AiRequest,
  AiSession,
  AppCommand,
  AppSettingsInput,
  BootstrapData,
  ControlledScriptTool,
  DraftOrchestrationSnapshot,
  DocumentSnapshotInfo,
  DocumentWriteResolutionInput,
  PendingDocumentWrite,
  DocumentMeta,
  FlowPatch,
  FlowPlan,
  FlowValidationIssue,
  LocalResourceInstallResult,
  PromotionTargetKind,
  NoteReferenceComparison,
  PlatformConnector,
  PlatformFlowAsset,
  PlatformRole,
  ProjectTemplatePackage,
  ProjectCreateInput,
  ProjectCreateValidation,
  ProjectSearchResult,
  ProjectTemplateSaveInput,
  ProviderProfileInput,
  RuleDefinition,
  RuleScope,
  RuntimeTemplateAsset,
  ReviewIssueState,
  RuntimeRerunPlan,
  SessionContextControls,
  SidebarLayout,
  TaskTemplate,
  ThinkingChainLayoutState,
  ThinkingChainSnapshot,
  WindowBootstrapContext
} from '../shared/types';

const api = {
  bootstrapLoad: () => ipcRenderer.invoke('bootstrap:load') as Promise<BootstrapData>,
  getWindowBootstrapContext: () => ipcRenderer.invoke('window:get-bootstrap-context') as Promise<WindowBootstrapContext>,
  openDocumentWindow: (filePath: string) => ipcRenderer.invoke('window:open-document', filePath) as Promise<boolean>,
  pickProjectDirectory: () => ipcRenderer.invoke('project:pick-directory') as Promise<string | null>,
  validateProjectCreate: (input: ProjectCreateInput) => ipcRenderer.invoke('project:validate-create', input) as Promise<ProjectCreateValidation>,
  createProject: (input: ProjectCreateInput) => ipcRenderer.invoke('project:create', input),
  openProject: (rootPath: string) => ipcRenderer.invoke('project:open', rootPath),
  closeProject: () => ipcRenderer.invoke('project:close'),
  refreshProject: () => ipcRenderer.invoke('project:refresh'),
  setActiveDocument: (filePath?: string) => ipcRenderer.invoke('project:set-active-document', filePath),
  openProjectFolder: () => ipcRenderer.invoke('project:open-folder'),
  createFile: (parentPath: string, name: string) => ipcRenderer.invoke('project:create-file', parentPath, name),
  createDirectory: (parentPath: string, name: string) => ipcRenderer.invoke('project:create-directory', parentPath, name),
  renameEntry: (targetPath: string, nextName: string) => ipcRenderer.invoke('project:rename-entry', targetPath, nextName),
  moveEntry: (targetPath: string, destinationDirectoryPath: string) =>
    ipcRenderer.invoke('project:move-entry', targetPath, destinationDirectoryPath),
  deleteEntry: (targetPath: string) => ipcRenderer.invoke('project:delete-entry', targetPath),
  importDocuments: (parentPath: string) => ipcRenderer.invoke('project:import-documents', parentPath) as Promise<string[]>,
  restoreSnapshot: (snapshotId: string) => ipcRenderer.invoke('project:restore-snapshot', snapshotId),
  readDocument: (filePath: string) => ipcRenderer.invoke('document:read', filePath) as Promise<string>,
  getDocumentMeta: (filePath: string) => ipcRenderer.invoke('document:meta', filePath) as Promise<DocumentMeta>,
  saveDocument: (filePath: string, contents: string) => ipcRenderer.invoke('document:save', filePath, contents),
  listDocumentSnapshots: (filePath: string) =>
    ipcRenderer.invoke('document:list-snapshots', filePath) as Promise<DocumentSnapshotInfo[]>,
  createDocumentSnapshot: (filePath: string, label?: string) =>
    ipcRenderer.invoke('document:create-snapshot', filePath, label),
  restoreDocumentSnapshot: (filePath: string, snapshotId: string) =>
    ipcRenderer.invoke('document:restore-snapshot', filePath, snapshotId),
  openArtifact: (targetPath: string, sourcePath?: string) =>
    ipcRenderer.invoke('artifact:open', { targetPath, sourcePath }) as Promise<ArtifactOpenPayload>,
  saveArtifact: (filePath: string, artifact: ArtifactOpenPayload) =>
    ipcRenderer.invoke('artifact:save', { filePath, artifact }) as Promise<{ artifact: ArtifactOpenPayload; bootstrap: BootstrapData | null }>,
  listPendingDocumentWrites: (filePath?: string) =>
    ipcRenderer.invoke('document:list-pending-writes', filePath) as Promise<PendingDocumentWrite[]>,
  resolvePendingDocumentWrite: (proposalId: string, input: DocumentWriteResolutionInput) =>
    ipcRenderer.invoke('document:resolve-pending-write', proposalId, input) as Promise<{ bootstrap: BootstrapData }>,
  recordExternalDocumentChange: (filePath: string, previousContents: string, nextContents: string) =>
    ipcRenderer.invoke('document:record-external-change', filePath, previousContents, nextContents),
  watchDocument: (filePath: string) => ipcRenderer.invoke('document:watch', filePath) as Promise<boolean>,
  unwatchDocument: () => ipcRenderer.invoke('document:unwatch') as Promise<boolean>,
  importImageIntoDocument: (documentPath: string, payload: { fileName: string; base64: string }) =>
    ipcRenderer.invoke('document:import-image', documentPath, payload) as Promise<{ assetPath: string; markdown: string }>,
  searchProjectContent: (query: string) => ipcRenderer.invoke('search:project-content', query) as Promise<ProjectSearchResult[]>,
  compareNoteReferences: (basePath: string, comparePath: string) =>
    ipcRenderer.invoke('notes:compare-references', basePath, comparePath) as Promise<NoteReferenceComparison>,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (input: AppSettingsInput) => ipcRenderer.invoke('settings:save', input),
  testAiConnection: (payload?: { profileId?: string; draft?: ProviderProfileInput }) => ipcRenderer.invoke('settings:test-ai', payload),
  updateLayout: (layout: SidebarLayout) => ipcRenderer.invoke('layout:update', layout),
  saveSessions: (sessions: AiSession[]) => ipcRenderer.invoke('sessions:save', sessions),
  sendAiMessage: (request: AiRequest) => ipcRenderer.invoke('ai:send', request),
  planConversationFlow: (prompt: string) => ipcRenderer.invoke('conversation-flow:plan', prompt) as Promise<FlowPlan>,
  buildConversationFlowDraft: (payload: { prompt: string; kind?: PlatformFlowAsset['kind'] }) =>
    ipcRenderer.invoke('conversation-flow:draft', payload) as Promise<{ plan: FlowPlan; draft: PlatformFlowAsset }>,
  patchConversationFlow: (payload: { flow: PlatformFlowAsset; prompt: string }) =>
    ipcRenderer.invoke('conversation-flow:patch', payload) as Promise<FlowPatch>,
  applyConversationFlowPatch: (payload: { flow: PlatformFlowAsset; patch: FlowPatch }) =>
    ipcRenderer.invoke('conversation-flow:apply-patch', payload) as Promise<PlatformFlowAsset>,
  generateStageDraft: (sessionId: string, instructions?: string) => ipcRenderer.invoke('workflow:generate-stage', sessionId, instructions),
  getStageGuard: (sessionId: string, stage?: string) => ipcRenderer.invoke('workflow:get-stage-guard', sessionId, stage),
  confirmStage: (sessionId: string, stage: string) => ipcRenderer.invoke('workflow:confirm-stage', sessionId, stage),
  revisitStage: (stage: string) => ipcRenderer.invoke('workflow:revisit-stage', stage),
  runReviewRound: (sessionId: string, documentPath: string) => ipcRenderer.invoke('review:run', sessionId, documentPath),
  updateReviewIssue: (roundId: string, issueId: string, state: ReviewIssueState) => ipcRenderer.invoke('review:update-issue', roundId, issueId, state),
  runConsistency: () => ipcRenderer.invoke('consistency:run'),
  generateOpenSpec: () => ipcRenderer.invoke('handoff:generate-openspec'),
  pauseRuntimeRun: (runId: string) => ipcRenderer.invoke('runtime:pause-run', runId),
  resumeRuntimeRun: (runId: string) => ipcRenderer.invoke('runtime:resume-run', runId),
  retryRuntimeRun: (runId: string) => ipcRenderer.invoke('runtime:retry-run', runId),
  stopRuntimeRun: (runId: string) => ipcRenderer.invoke('runtime:stop-run', runId),
  resolveRuntimeApproval: (payload: { runId: string; approvalId: string; approved: boolean; reason?: string }) =>
    ipcRenderer.invoke('runtime:resolve-approval', payload),
  debugFlowNode: (payload: { kind: PlatformFlowAsset['kind']; flowId: string; nodeId: string; sessionId?: string }) =>
    ipcRenderer.invoke('runtime:debug-node', payload),
  previewFlowRerun: (payload: { kind: PlatformFlowAsset['kind']; flowId: string; nodeId: string; sourceRunId?: string; mode?: RuntimeRerunPlan['mode'] }) =>
    ipcRenderer.invoke('runtime:preview-rerun', payload) as Promise<{ flow: PlatformFlowAsset; node: PlatformFlowAsset['nodes'][number]; plan: RuntimeRerunPlan }>,
  applyFlowRerun: (payload: { kind: PlatformFlowAsset['kind']; flowId: string; nodeId: string; sessionId?: string; sourceRunId?: string; mode?: RuntimeRerunPlan['mode'] }) =>
    ipcRenderer.invoke('runtime:apply-rerun', payload),
  saveRuntimeTemplate: (template: RuntimeTemplateAsset) => ipcRenderer.invoke('runtime:save-template', template),
  validateFlow: (kind: PlatformFlowAsset['kind'], flowId: string) =>
    ipcRenderer.invoke('runtime:validate-flow', kind, flowId) as Promise<FlowValidationIssue[]>,
  getKnowledgeIndexStatus: () => ipcRenderer.invoke('knowledge:get-status'),
  updateSessionContextControls: (sessionId: string, controls: SessionContextControls) =>
    ipcRenderer.invoke('knowledge:update-session-context-controls', sessionId, controls) as Promise<BootstrapData>,
  refreshKnowledgeIndex: (mode?: 'manual' | 'incremental') => ipcRenderer.invoke('knowledge:refresh', mode),
  getThinkingChain: (sessionId?: string) =>
    ipcRenderer.invoke('runtime.thinkingChain.get', { sessionId }) as Promise<ThinkingChainSnapshot | null>,
  saveThinkingChainLayout: (
    sessionId: string,
    payload: {
      nodes?: Record<string, { x: number; y: number; pinned?: boolean }>;
      view?: Partial<ThinkingChainLayoutState['view']>;
    }
  ) => ipcRenderer.invoke('runtime.thinkingChain.save-layout', { sessionId, payload }) as Promise<ThinkingChainLayoutState>,
  resetThinkingChainLayout: (sessionId: string) =>
    ipcRenderer.invoke('runtime.thinkingChain.reset-layout', { sessionId }) as Promise<boolean>,
  saveFlow: (flow: PlatformFlowAsset) => ipcRenderer.invoke('platform:save-flow', flow),
  deleteFlow: (kind: PlatformFlowAsset['kind'], flowId: string) => ipcRenderer.invoke('platform:delete-flow', kind, flowId),
  duplicateFlow: (kind: PlatformFlowAsset['kind'], flowId: string) => ipcRenderer.invoke('platform:duplicate-flow', kind, flowId),
  importFlow: (kind: PlatformFlowAsset['kind']) => ipcRenderer.invoke('platform:import-flow', kind),
  exportFlow: (kind: PlatformFlowAsset['kind'], flowId: string) => ipcRenderer.invoke('platform:export-flow', kind, flowId),
  restoreFlowVersion: (kind: PlatformFlowAsset['kind'], flowId: string, versionId: string) =>
    ipcRenderer.invoke('platform:restore-flow-version', kind, flowId, versionId),
  saveRoles: (roles: PlatformRole[]) => ipcRenderer.invoke('platform:save-roles', roles),
  saveTaskTemplates: (taskTemplates: TaskTemplate[]) => ipcRenderer.invoke('platform:save-task-templates', taskTemplates),
  saveAgentProfiles: (agentProfiles: AgentProfile[]) => ipcRenderer.invoke('platform:save-agent-profiles', agentProfiles),
  saveConnectors: (connectors: PlatformConnector[]) => ipcRenderer.invoke('platform:save-connectors', connectors),
  saveTools: (tools: ControlledScriptTool[]) => ipcRenderer.invoke('platform:save-tools', tools),
  testConnector: (connectorId: string) => ipcRenderer.invoke('platform:test-connector', connectorId),
  runTool: (toolId: string, approvalId?: string) => ipcRenderer.invoke('platform:run-tool', toolId, approvalId),
  previewSideEffect: (capabilityId: string, input: Record<string, unknown>, runId?: string) =>
    ipcRenderer.invoke('side-effects:preview', capabilityId, input, runId),
  approveSideEffect: (previewId: string, approved: boolean, reason?: string) =>
    ipcRenderer.invoke('side-effects:approve', previewId, approved, reason),
  saveRule: (rule: Partial<RuleDefinition> & Pick<RuleDefinition, 'name' | 'body' | 'scope'>) =>
    ipcRenderer.invoke('rules:save-rule', rule),
  deleteRule: (ruleId: string) => ipcRenderer.invoke('rules:delete-rule', ruleId),
  setRuleEnabled: (ruleId: string, enabled: boolean) => ipcRenderer.invoke('rules:set-enabled', { ruleId, enabled }),
  saveAccumulationEntry: (entry: Record<string, unknown>) => ipcRenderer.invoke('rules:save-accumulation', entry),
  deleteAccumulationEntry: (entryId: string) => ipcRenderer.invoke('rules:delete-accumulation', entryId),
  createPromotionDraft: (payload: { entryId: string; targetKind: PromotionTargetKind; proposedName?: string }) =>
    ipcRenderer.invoke('rules:create-promotion', payload),
  applyPromotionDraft: (draftId: string, reviewNote?: string) =>
    ipcRenderer.invoke('rules:apply-promotion', { draftId, reviewNote }),
  exportRules: (scope: RuleScope) => ipcRenderer.invoke('rules:export', scope),
  importRules: (scope: RuleScope) => ipcRenderer.invoke('rules:import', scope),
  syncExperienceSources: (payload?: { rootPath?: string; sourcePath?: string } | string) =>
    ipcRenderer.invoke('rules:sync-experience', payload),
  installTemplateFromUrl: (packageUrl: string, approved = false) =>
    ipcRenderer.invoke('templates:install-url', packageUrl, approved) as Promise<LocalResourceInstallResult>,
  installTemplateFromPath: (targetPath: string, approved = false) =>
    ipcRenderer.invoke('templates:install-path', targetPath, approved) as Promise<LocalResourceInstallResult>,
  saveProjectAsTemplate: (input: ProjectTemplateSaveInput) => ipcRenderer.invoke('templates:save-project', input),
  getTemplatePackage: (templateId: string) => ipcRenderer.invoke('templates:get-package', templateId) as Promise<ProjectTemplatePackage | null>,
  checkTemplateUpdate: (templateId: string) => ipcRenderer.invoke('templates:check-update', templateId),
  repairTemplate: (templateId: string) => ipcRenderer.invoke('templates:repair', templateId),
  updateTemplate: (templateId: string) => ipcRenderer.invoke('templates:update', templateId),
  markRecentTemplate: (templateId: string) => ipcRenderer.invoke('templates:mark-recent', templateId),
  saveDraftAsTemplate: (templatePackage: ProjectTemplatePackage, sourceLabel?: string) =>
    ipcRenderer.invoke('templates:save-draft', templatePackage, sourceLabel),
  saveDraftOrchestration: (snapshot: DraftOrchestrationSnapshot) => ipcRenderer.invoke('drafts:save', snapshot),
  getDraftOrchestration: (id: string) => ipcRenderer.invoke('drafts:get', id) as Promise<DraftOrchestrationSnapshot | null>,
  removeDraftOrchestration: (id: string) => ipcRenderer.invoke('drafts:remove', id),
  chooseTemplateSource: () => ipcRenderer.invoke('templates:choose-source') as Promise<string | null>,
  listSkillCatalog: (catalogUrl?: string) => ipcRenderer.invoke('skills:list-catalog', catalogUrl),
  installSkillFromUrl: (packageUrl: string, approved = false) =>
    ipcRenderer.invoke('skills:install-url', packageUrl, approved) as Promise<LocalResourceInstallResult>,
  installSkillFromPath: (targetPath: string, approved = false) =>
    ipcRenderer.invoke('skills:install-path', targetPath, approved) as Promise<LocalResourceInstallResult>,
  chooseSkillSource: () => ipcRenderer.invoke('skills:choose-source') as Promise<string | null>,
  chooseSkillCatalogSource: () => ipcRenderer.invoke('skills:choose-catalog-source') as Promise<string | null>,
  deleteSkill: (skillId: string) => ipcRenderer.invoke('skills:delete', skillId),
  setProjectSkills: (skillIds: string[]) => ipcRenderer.invoke('skills:set-project', skillIds),
  setSessionSkills: (sessionId: string, skillIds: string[]) => ipcRenderer.invoke('skills:set-session', sessionId, skillIds),
  listRoleCatalog: (catalogUrl?: string) => ipcRenderer.invoke('roles:list-catalog', catalogUrl),
  installRoleFromUrl: (packageUrl: string, approved = false) =>
    ipcRenderer.invoke('roles:install-url', packageUrl, approved) as Promise<LocalResourceInstallResult>,
  installRoleFromPath: (targetPath: string, approved = false) =>
    ipcRenderer.invoke('roles:install-path', targetPath, approved) as Promise<LocalResourceInstallResult>,
  chooseRoleSource: () => ipcRenderer.invoke('roles:choose-source') as Promise<string | null>,
  chooseRoleCatalogSource: () => ipcRenderer.invoke('roles:choose-catalog-source') as Promise<string | null>,
  chooseProjectBase: (mode?: 'create-in-parent' | 'use-existing-directory') => ipcRenderer.invoke('dialog:create-project-base', mode) as Promise<string | null>,
  renameRecentProject: (rootPath: string, alias: string) => ipcRenderer.invoke('recent:rename', rootPath, alias),
  removeRecentProject: (rootPath: string) => ipcRenderer.invoke('recent:remove', rootPath),
  clearInvalidRecentProjects: () => ipcRenderer.invoke('recent:clear-invalid'),
  clearAllRecentProjects: () => ipcRenderer.invoke('recent:clear-all'),
  revealRecentProject: (rootPath: string) => ipcRenderer.invoke('recent:reveal', rootPath) as Promise<boolean>,
  basename: (filePath: string) => ipcRenderer.invoke('path:basename', filePath) as Promise<string>,
  onAppCommand: (listener: (command: AppCommand) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, command: AppCommand) => listener(command);
    ipcRenderer.on('app:command', wrapped);
    return () => ipcRenderer.removeListener('app:command', wrapped);
  },
  onDocumentChanged: (listener: (meta: DocumentMeta) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, meta: DocumentMeta) => listener(meta);
    ipcRenderer.on('document:changed', wrapped);
    return () => ipcRenderer.removeListener('document:changed', wrapped);
  }
};

contextBridge.exposeInMainWorld('api', api);

export type DesktopApi = typeof api;
