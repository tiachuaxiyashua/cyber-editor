export type AppStage =
  | 'discover'
  | 'clarify'
  | 'plan'
  | 'draft'
  | 'review'
  | 'finalize';

export type ActivityView = 'project' | 'orchestration' | 'sessions' | 'thinking-chain' | 'rules' | 'resources' | 'search' | 'settings';

export type ProcessPanelTab = 'stage' | 'review' | 'history';

export type SidebarLayout = {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  activityView: ActivityView;
  processPanelOpen: boolean;
  processPanelTab: ProcessPanelTab;
  documentSplitOpen: boolean;
  documentSplitRatio: number;
  secondaryDocumentPath?: string;
};

export type RecentProjectEntry = {
  rootPath: string;
  name: string;
  alias?: string;
  lastOpenedAt: string;
  available: boolean;
};

export type RecentDraftEntry = {
  id: string;
  name: string;
  templateId?: string;
  templateName?: string;
  updatedAt: string;
  available: boolean;
};

export type ProviderKind = 'mock' | 'openai-compatible' | 'deepseek' | 'ollama';

export type ProviderCapabilityTag =
  | 'tools'
  | 'structured-output'
  | 'json-mode'
  | 'streaming'
  | 'long-context'
  | 'local-runtime';

export type ProviderCapabilityMetadata = {
  tags: ProviderCapabilityTag[];
  maxContextTokens: number;
  privacy: 'local' | 'cloud';
  costTier: 'low' | 'medium' | 'high';
  latencyTier: 'low' | 'medium' | 'high';
};

export type ProviderDiagnosticStatus = 'unknown' | 'healthy' | 'error';

export type ProviderDiagnostic = {
  checkedAt?: string;
  status: ProviderDiagnosticStatus;
  message?: string;
  latencyMs?: number;
};

export type ProviderProfile = {
  id: string;
  name: string;
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  capabilities: ProviderCapabilityMetadata;
  diagnostics: ProviderDiagnostic;
};

export type ProviderProfileInput = {
  id?: string;
  name: string;
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
  enabled?: boolean;
  capabilities?: ProviderCapabilityMetadata;
  diagnostics?: ProviderDiagnostic;
};

export type AppSettings = {
  theme: 'system' | 'light' | 'dark';
  sidebar: SidebarLayout;
  debug: AppDebugSettings;
  provider: string;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  activeProviderProfileId: string;
  providerProfiles: ProviderProfile[];
  recentProjects: RecentProjectEntry[];
  recentTemplates: string[];
  recentResources: string[];
  recentDrafts: RecentDraftEntry[];
};

export type AppDebugSettings = {
  liveLogConsoleEnabled: boolean;
};

export type AppSettingsInput = {
  theme: AppSettings['theme'];
  sidebar: SidebarLayout;
  debug?: Partial<AppDebugSettings>;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  activeProviderProfileId?: string;
  providerProfiles?: ProviderProfileInput[];
  recentProjects?: RecentProjectEntry[];
  recentTemplates?: string[];
  recentResources?: string[];
  recentDrafts?: RecentDraftEntry[];
};

export type FileNode = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
};

export type ProjectManifest = {
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  version: string;
  templateId?: string;
};

export type ProjectTemplateDefinition = {
  id: string;
  name: string;
  version?: string;
  shortDescription: string;
  description: string;
  icon: string;
  category: 'product' | 'writing' | 'planning';
  source: 'builtin' | 'local' | 'remote';
  starterPrompt: string;
  requirementDocName: string;
  packageUrl?: string;
  installedAt?: string;
  defaultFlowName?: string;
  flowCount?: number;
  subflowCount?: number;
  roleCount?: number;
  connectorCount?: number;
  toolCount?: number;
  artifactCount?: number;
  artifactPreview?: string[];
  trust?: 'trusted' | 'review' | 'blocked' | 'unknown';
  compatibility?: 'current' | 'review' | 'incompatible' | 'unknown';
  health?: 'healthy' | 'update-available' | 'corrupt';
  issueMessage?: string;
  repairable?: boolean;
  updatable?: boolean;
};

export type ProjectTemplateInfo = Pick<ProjectTemplateDefinition, 'id' | 'name' | 'description' | 'icon' | 'category' | 'source'> & {
  selectedAt: string;
};

export type WorkflowState = {
  stage: AppStage;
  confirmedStages: AppStage[];
  activeDocumentPath?: string;
};

import type {
  AgentProfile,
  DependencyInstallSummary,
  DependencySpecItem,
  TaskTemplate
} from './orchestration-contracts';
export type {
  AgentProfile,
  DependencyInstallRecord,
  DependencyInstallSummary,
  DependencySpecItem,
  EffectiveExecutionBundle,
  RoleProfile,
  TaskTemplate
} from './orchestration-contracts';

export type AgentMemory = {
  productIntent: string;
  constraints: string[];
  decisions: string[];
  openQuestions: string[];
  updatedAt: string;
};

export type PlatformModelPolicy = {
  mode: 'fixed' | 'prefer_list' | 'capability_match' | 'policy_router' | 'fallback_to_active';
  fixedProfileId?: string;
  preferredProfileIds: string[];
  fallbackToActive: boolean;
  requiredProviderCapabilities?: ProviderCapabilityTag[];
  privacyPreference?: 'local' | 'balanced' | 'cloud';
  costPreference?: 'low' | 'balanced' | 'quality';
  latencyPreference?: 'low' | 'balanced' | 'quality';
  note?: string;
};

export type AssetDiagnosticStatus = 'unknown' | 'healthy' | 'warning' | 'error' | 'blocked';

export type AssetDiagnostic = {
  status: AssetDiagnosticStatus;
  code: string;
  summary: string;
  checkedAt?: string;
  details?: string[];
};

export type RolePackageValidationIssue = {
  code: string;
  severity: 'warning' | 'error';
  message: string;
  path?: string;
};

export type PlatformRole = {
  id: string;
  name: string;
  domain?: string;
  description: string;
  responsibilities?: string[];
  packageSections?: {
    identity: string;
    soul: string;
    agents: string;
      user: string;
      memory: string;
  };
  packageStatus?: 'complete' | 'incomplete';
  packageSource?: 'project' | 'local' | 'builtin' | 'installed';
  packageRoot?: string;
  packageVersion?: string;
  packageHealth?: ResourceHealthState;
  packageIssueMessage?: string;
  lastValidatedAt?: string;
  packageDiagnostics?: RolePackageValidationIssue[];
  promptHint: string;
  allowedSkillIds?: string[];
  allowedCapabilities: string[];
  outputSchema: string;
  outputFormat?: 'markdown' | 'json' | 'text';
  modelPolicy: PlatformModelPolicy;
};

export type FlowNodeType =
  | 'start'
  | 'end'
  | 'agent'
  | 'tool'
  | 'condition'
  | 'loop'
  | 'approval'
  | 'parallel_split'
  | 'parallel_join'
  | 'subflow'
  | 'artifact';

export type FlowNodePosition = {
  x: number;
  y: number;
};

export type PlatformFlowNodeData = {
  label: string;
  description?: string;
  notes?: string;
  roleId?: string;
  taskTemplateId?: string;
  agentProfileId?: string;
  skillIds?: string[];
  ruleBindingIds?: string[];
  toolId?: string;
  toolIds?: string[];
  connectorId?: string;
  subflowId?: string;
  artifactPath?: string;
  inputArtifactPaths?: string[];
  outputArtifactPaths?: string[];
  inputMessageKeys?: string[];
  outputMessageKeys?: string[];
  outputSignalKeys?: string[];
  inputRequirement?: string;
  outputRequirement?: string;
  outputFormat?: 'markdown' | 'json' | 'text' | 'table';
  conditionExpression?: string;
  trueTargetId?: string;
  falseTargetId?: string;
  loopExpression?: string;
  exitExpression?: string;
  maxIterations?: number;
  loopTimeoutMs?: number;
  loopFailurePolicy?: 'guard_fail' | 'continue_to_exit' | 'manual_review';
  loopBackTargetId?: string;
  exitTargetId?: string;
  approvalPrompt?: string;
  approvalRollbackNodeId?: string;
  parallelMode?: 'fanout' | 'review' | 'research';
  parallelFailureStrategy?: 'fail_fast' | 'continue' | 'manual_review';
  parallelCancellationPolicy?: 'cancel_pending' | 'preserve_completed' | 'wait_all';
  mergeStrategy?: 'collect_all' | 'first_success' | 'judge' | 'manual_merge';
  sharedBoardArtifactPath?: string;
  subflowInputBindings?: string[];
  subflowOutputBindings?: string[];
  modelPolicy?: PlatformModelPolicy;
};

export type PlatformFlowNode = {
  id: string;
  type: FlowNodeType;
  position: FlowNodePosition;
  data: PlatformFlowNodeData;
};

export type PlatformFlowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  branch?: 'default' | 'true' | 'false' | 'loop' | 'exit';
  description?: string;
};

export type PlatformFlowAsset = {
  id: string;
  name: string;
  description: string;
  kind: 'flow' | 'subflow';
  createdAt: string;
  updatedAt: string;
  pathConfig?: FlowPathConfig;
  roleIds?: string[];
  nodes: PlatformFlowNode[];
  edges: PlatformFlowEdge[];
};

export type PlatformConnector = {
  id: string;
  name: string;
  description: string;
  scope: 'local' | 'remote';
  transport: 'stdio' | 'http';
  endpoint?: string;
  command?: string;
  args: string[];
  enabled: boolean;
  lastCheckedAt?: string;
  health: 'unknown' | 'healthy' | 'warning' | 'error';
  compatibility?: ResourceCompatibilityState;
  authStatus?: 'unknown' | 'not_required' | 'authorized' | 'missing';
  capabilitySummary?: string[];
  diagnostic?: AssetDiagnostic;
  lastError?: string;
};

export type PlatformToolRunSummary = {
  ranAt: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  stdoutPreview: string;
  stderrPreview: string;
};

export type ControlledScriptTool = {
  id: string;
  name: string;
  description: string;
  kind?: 'script' | 'builtin' | 'mcp';
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  enabled: boolean;
  connectorId?: string;
  allowedPaths?: string[];
  inputSchemaRef?: string;
  lastCheckedAt?: string;
  health?: 'unknown' | 'healthy' | 'warning' | 'error';
  diagnostic?: AssetDiagnostic;
  lastError?: string;
  lastRun?: PlatformToolRunSummary;
};

export type PlatformToolRunResult = {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

export type PlatformAssets = {
  template: ProjectTemplateInfo | null;
  flows: PlatformFlowAsset[];
  subflows: PlatformFlowAsset[];
  roles: PlatformRole[];
  taskTemplates: TaskTemplate[];
  agentProfiles: AgentProfile[];
  connectors: PlatformConnector[];
  tools: ControlledScriptTool[];
};

export type PromptProfileAsset = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  outputMode: 'text' | 'markdown' | 'json';
  outputSchema?: string;
};

export type ArtifactQualityTier = 'strict' | 'assistive';

export type ArtifactQualityVerdict = 'accepted' | 'degraded' | 'blocked';

export type ArtifactSchemaAsset = {
  id: string;
  title: string;
  kind: 'markdown' | 'mermaid' | 'ui-preview' | 'review-issues' | 'openspec-handoff' | 'text';
  requiredHeadings?: string[];
  requiredFields?: string[];
  minimumLength?: number;
  qualityTier?: ArtifactQualityTier;
  minimumQualityScore?: number;
  deterministicFallbackContent?: string;
};

export type RuntimeTemplateStageDocument = {
  path: string;
  title: string;
  purpose: string;
  promptProfileId: string;
  validatorId: ArtifactSchemaAsset['id'];
  qualityTier?: ArtifactQualityTier;
  minimumQualityScore?: number;
};

export type RuntimeExecutionBinding = {
  roleId: string;
  taskTemplateId?: string;
  agentProfileId?: string;
};

export type RuntimeReviewExecutionProfiles = Partial<Record<'blue' | 'red' | 'judge', RuntimeExecutionBinding>>;

export type RuntimeTemplateReviewProfile = {
  bluePromptProfileId: string;
  redPromptProfileId: string;
  judgePromptProfileId: string;
  validatorId: ArtifactSchemaAsset['id'];
  executionProfiles?: RuntimeReviewExecutionProfiles;
};

export type RuntimeTemplateExportProfile = {
  markdown: boolean;
  text: boolean;
  pdf: boolean;
  openspec: boolean;
  custom: boolean;
};

export type RuntimeExportFormat = keyof RuntimeTemplateExportProfile;

export type FlowPathConfig = {
  inputRoot: string;
  outputRoot: string;
  inheritProjectRoot: boolean;
  resolvedInputRoot?: string;
  resolvedOutputRoot?: string;
};

export type StageOutputContract = {
  stageId: AppStage;
  requiredArtifactPaths: string[];
  validatorIds: string[];
  blockingPolicy: 'all_required' | 'allow_warnings';
  allowManualBypass: boolean;
};

export type ExperienceBindingAsset = {
  id: string;
  targetKey: string;
  priority: number;
  keywords: string[];
  preferredNodeTypes?: FlowNodeType[];
};

export type RuntimeTemplateExportMappingEntry = {
  enabled: boolean;
  artifactPaths: string[];
  outputPathPattern?: string;
  fileNamePattern?: string;
  transformProfile?: string;
};

export type RuntimeTemplateExportMapping = Record<RuntimeExportFormat, RuntimeTemplateExportMappingEntry>;

export type RuntimeTemplateAsset = {
  id: string;
  name: string;
  description: string;
  defaultFlowId?: string;
  stageRoleIds: Record<AppStage, string>;
  stageExecutionProfiles?: Partial<Record<AppStage, RuntimeExecutionBinding>>;
  stageDocuments: Record<AppStage, RuntimeTemplateStageDocument[]>;
  stageContracts?: Record<AppStage, StageOutputContract>;
  experienceBindings?: ExperienceBindingAsset[];
  review: RuntimeTemplateReviewProfile;
  exportProfile: RuntimeTemplateExportProfile;
  exportMapping?: RuntimeTemplateExportMapping;
};

export type FlowHistoryEntry = {
  id: string;
  flowId: string;
  kind: PlatformFlowAsset['kind'];
  createdAt: string;
  label: string;
  summary: string;
  nodeCount: number;
  edgeCount: number;
  snapshot?: PlatformFlowAsset;
};

export type FlowValidationIssue = {
  id: string;
  severity: 'warning' | 'error';
  scope: 'flow' | 'node' | 'edge';
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type StageArtifactGuard = {
  path: string;
  title: string;
  purpose: string;
  exists: boolean;
  nonEmpty: boolean;
  valid: boolean;
  qualityTier?: ArtifactQualityTier;
  qualityVerdict?: ArtifactQualityVerdict;
  qualityScore?: number;
  qualityReasons?: string[];
  invalidated?: boolean;
  invalidationMessage?: string;
  recommendedNodeIds?: string[];
  message?: string;
};

export type StageGuardStatus = {
  ok: boolean;
  stage: AppStage;
  sessionId: string;
  blockers: string[];
  warnings: string[];
  artifacts: StageArtifactGuard[];
  lastSuccessfulRunId?: string;
};

export type ArtifactRevisionWriteMode = 'replace' | 'merge' | 'patch';

export type ArtifactRevisionRecord = {
  id: string;
  createdAt: string;
  artifactPath: string;
  absolutePath: string;
  title?: string;
  purpose?: string;
  stage?: AppStage;
  source: DocumentChangeSource;
  previousRevisionId?: string;
  changeRecordId?: string;
  runId?: string;
  flowId?: string;
  nodeIds: string[];
  writeMode: ArtifactRevisionWriteMode;
  contentHash: string;
  exists: boolean;
  valid: boolean;
  schemaId?: string;
  validationMessage?: string;
  qualityTier?: ArtifactQualityTier;
  qualityVerdict?: ArtifactQualityVerdict;
  qualityScore?: number;
  qualityReasons?: string[];
  contractSignature: string;
  contentSummary?: string;
};

export type ArtifactInvalidationCause = 'upstream-revision' | 'upstream-invalidated' | 'contract-changed';

export type ArtifactInvalidationSeverity = 'soft' | 'hard';

export type ArtifactInvalidationRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  artifactPath: string;
  title?: string;
  purpose?: string;
  stage?: AppStage;
  status: 'active' | 'resolved';
  cause: ArtifactInvalidationCause;
  severity: ArtifactInvalidationSeverity;
  sourceArtifactPath?: string;
  sourceRevisionId?: string;
  currentRevisionId?: string;
  flowIds: string[];
  nodeIds: string[];
  downstreamArtifactPaths: string[];
  recommendedNodeIds: string[];
  requiredForExport: boolean;
  blockedExportFormats: RuntimeExportFormat[];
  message: string;
  resolvedAt?: string;
  resolvedByRevisionId?: string;
};

export type ArtifactGovernanceEvidence = {
  id: string;
  createdAt: string;
  kind: 'revision' | 'invalidation' | 'export-block';
  status: 'written' | 'invalidated' | 'resolved' | 'blocked';
  artifactPath: string;
  sourceArtifactPath?: string;
  revisionId?: string;
  invalidationId?: string;
  runId?: string;
  flowId?: string;
  nodeIds: string[];
  message: string;
};

export type RuleScope = 'global' | 'project' | 'node';

export type RuleApplicability = 'all' | 'bound-only';

export type RuleDefinition = {
  id: string;
  name: string;
  description: string;
  body: string;
  scope: RuleScope;
  enabled: boolean;
  category: 'style' | 'quality' | 'safety' | 'structure' | 'domain';
  targetKey?: string;
  appliesTo: RuleApplicability;
  priority: number;
  source: 'manual' | 'import' | 'promotion' | 'sync';
  tags?: string[];
  flowId?: string;
  nodeId?: string;
  provenanceEntryId?: string;
  createdAt: string;
  updatedAt: string;
};

export type RuleScopeSummary = {
  scope: RuleScope;
  count: number;
  enabledCount: number;
};

export type RuleOverrideExplanation = {
  targetKey: string;
  effectiveRuleId: string;
  overriddenRuleIds: string[];
  reason: string;
};

export type RuleConflict = {
  id: string;
  targetKey: string;
  ruleIds: string[];
  winningRuleId: string;
  severity: 'warning' | 'error';
  message: string;
  actionableSuggestions: string[];
};

export type EffectiveRuleSet = {
  rules: RuleDefinition[];
  conflicts: RuleConflict[];
  overrides: RuleOverrideExplanation[];
  appliedRuleIds: string[];
};

export type KnowledgeLinkNode = {
  id: string;
  kind: 'rule' | 'knowledge' | 'accumulation' | 'promotion' | 'document' | 'flow' | 'skill' | 'artifact' | 'run';
  title: string;
  summary: string;
  sourceId?: string;
  status?: 'active' | 'draft' | 'accepted' | 'archived';
  metadata?: Record<string, string>;
};

export type KnowledgeLinkEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'derived-from' | 'promotes-to' | 'references' | 'activates' | 'contains' | 'binds' | 'uses' | 'reads' | 'writes';
  label?: string;
};

export type ProjectKnowledgeGraph = {
  generatedAt: string;
  nodes: KnowledgeLinkNode[];
  edges: KnowledgeLinkEdge[];
};

export type AccumulationEntry = {
  id: string;
  title: string;
  summary: string;
  details?: string;
  category: 'writing-pattern' | 'project-decision' | 'domain-knowledge' | 'tooling' | 'risk' | 'quality';
  source: 'user' | 'runtime' | 'review' | 'import' | 'interaction' | 'assistant-experience';
  sourceDocumentPaths: string[];
  sourceRunId?: string;
  sourceNodeId?: string;
  tags: string[];
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
};

export type PromotionTargetKind = 'rule' | 'skill' | 'knowledge';

export type PromotionDraft = {
  id: string;
  entryId: string;
  targetKind: PromotionTargetKind;
  status: 'draft' | 'accepted' | 'rejected';
  proposedName: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  reviewNote?: string;
  appliedRuleId?: string;
  appliedKnowledgeNodeId?: string;
  appliedSkillId?: string;
  appliedSkillPackagePath?: string;
};

export type RulesDistillationSnapshot = {
  scopes: RuleScopeSummary[];
  globalRules: RuleDefinition[];
  projectRules: RuleDefinition[];
  nodeRules: RuleDefinition[];
  accumulationEntries: AccumulationEntry[];
  promotionDrafts: PromotionDraft[];
  knowledgeGraph: ProjectKnowledgeGraph;
};

export type ProjectTemplatePackage = {
  definition: ProjectTemplateDefinition;
  platform: Omit<PlatformAssets, 'template'>;
  runtime: {
    promptProfiles: PromptProfileAsset[];
    artifactSchemas: ArtifactSchemaAsset[];
    template: RuntimeTemplateAsset;
  };
};

export type DraftOrchestrationSnapshot = {
  id: string;
  name: string;
  updatedAt: string;
  platform: PlatformAssets;
  runtimeTemplate: RuntimeTemplateAsset;
  flowHistories: Record<string, FlowHistoryEntry[]>;
  sessions: AiSession[];
  activeSessionId?: string;
  templatePackage: ProjectTemplatePackage;
};

export type ProjectTemplateSaveInput = {
  id: string;
  name: string;
  shortDescription: string;
  description: string;
  category: ProjectTemplateDefinition['category'];
  icon: string;
  starterPrompt?: string;
};

export type RolePackageFile = {
  path: string;
  content: string;
};

export type RolePackageManifest = {
  id: string;
  name: string;
  version: string;
  description: string;
  source: string;
  icon?: string;
  domain?: string;
  tags?: string[];
  defaultSkillIds?: string[];
  allowedCapabilities?: string[];
  modelPolicy?: PlatformModelPolicy;
  dependencySpec?: DependencySpecItem[];
};

export type RolePackage = RolePackageManifest & {
  files: RolePackageFile[];
};

export type InstalledRolePackage = {
  id: string;
  name: string;
  version: string;
  description: string;
  source: string;
  icon?: string;
  domain?: string;
  tags: string[];
  installedAt: string;
  fileCount: number;
  packageRoot: string;
  manifestPath?: string;
  health: ResourceHealthState;
  lastValidatedAt: string;
  validationIssues: RolePackageValidationIssue[];
  defaultSkillIds: string[];
  allowedCapabilities: string[];
  dependencySummary?: DependencyInstallSummary;
  trust?: 'trusted' | 'review' | 'blocked' | 'unknown';
  compatibility?: 'current' | 'review' | 'incompatible' | 'unknown';
  issueMessage?: string;
  verificationId?: string;
};

export type ResolvedRoleRuntimeBundle = {
  roleId: string;
  roleName: string;
  packageRoot: string;
  packageVersion: string;
  packageStatus: NonNullable<PlatformRole['packageStatus']>;
  packageHealth: ResourceHealthState;
  promptHint: string;
  sections: Required<NonNullable<PlatformRole['packageSections']>>;
  defaultSkillIds: string[];
  effectiveSkillIds: string[];
  allowedCapabilities: string[];
  boundConnectorId?: string;
  boundToolIds: string[];
  modelPolicy: PlatformModelPolicy;
  diagnostics: RolePackageValidationIssue[];
  sourceMap: Record<string, 'package' | 'role' | 'task' | 'agent' | 'node'>;
};

export type RemoteRoleCatalogItem = {
  id: string;
  name: string;
  version: string;
  description: string;
  source: string;
  packageUrl: string;
  icon?: string;
  domain?: string;
  tags: string[];
};

export type ResourceKind = 'template' | 'skill' | 'role-package' | 'connector';

export type ResourceTrustState = 'trusted' | 'review' | 'blocked' | 'unknown';
export type ResourceCompatibilityState = 'current' | 'review' | 'incompatible' | 'unknown';
export type ResourceHealthState = 'healthy' | 'warning' | 'corrupt';

export type ResourceDescriptor = {
  id: string;
  kind: ResourceKind;
  name: string;
  version?: string;
  description: string;
  source: 'builtin' | 'local' | 'remote';
  sourceLabel: string;
  packageUrl?: string;
  installed: boolean;
  installedAt?: string;
  trust: ResourceTrustState;
  compatibility: ResourceCompatibilityState;
  health?: 'healthy' | 'warning' | 'error' | 'update-available' | 'corrupt';
  issueMessage?: string;
  repairable?: boolean;
  updatable?: boolean;
  tags: string[];
  metadata: Array<{ label: string; value: string }>;
};

export type ReviewGateIssue = {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
};

export type ReviewGateReport = {
  id: string;
  createdAt: string;
  scope: 'resource-import' | 'side-effect' | 'architecture-review' | 'runtime-review';
  targetKind: ResourceKind | 'side-effect' | 'runtime-run' | 'document';
  targetId: string;
  sourceLabel: string;
  trust: ResourceTrustState;
  compatibility: ResourceCompatibilityState;
  health: ResourceHealthState;
  summary: string;
  issues: ReviewGateIssue[];
  recommendedAction: 'install' | 'approve' | 'repair' | 'block';
};

export type ResourceVerificationRecord = {
  id: string;
  createdAt: string;
  kind: ResourceKind;
  resourceId: string;
  sourceLabel: string;
  sourcePath?: string;
  trust: ResourceTrustState;
  compatibility: ResourceCompatibilityState;
  health: ResourceHealthState;
  issueMessage?: string;
  reviewGateId: string;
};

export type SideEffectOperation = {
  kind: 'write-file' | 'run-script' | 'delete-path' | 'move-path' | 'network-request';
  target: string;
  description: string;
};

export type SideEffectPreview = {
  id: string;
  createdAt: string;
  runId?: string;
  capabilityId: string;
  summary: string;
  status: ResourceTrustState;
  requiresApproval: boolean;
  operations: SideEffectOperation[];
  reviewGateId?: string;
  approvalId?: string;
};

export type SideEffectApprovalRecord = {
  id: string;
  createdAt: string;
  previewId: string;
  capabilityId: string;
  approved: boolean;
  reviewer: 'user' | 'system';
  reason?: string;
  expiresAt?: string;
};

export type KnowledgeIndexStatus = 'missing' | 'stale' | 'ready' | 'error';

export type KnowledgeIndexUnit = {
  id: string;
  path: string;
  title: string;
  excerpt: string;
  keywords: string[];
  outboundPaths: string[];
  inboundPaths: string[];
  relatedChangeRecordIds: string[];
  modifiedAt: number;
  indexedAt: string;
};

export type KnowledgeIndexState = {
  version: 1;
  builtAt?: string;
  status: KnowledgeIndexStatus;
  documentCount: number;
  staleDocumentPaths: string[];
  units: KnowledgeIndexUnit[];
  lastError?: string;
};

export type RetrievalMode = 'keyword' | 'semantic' | 'reference';

export type RetrievalHit = {
  unitId: string;
  path: string;
  title: string;
  excerpt: string;
  score: number;
  matchedBy: RetrievalMode[];
  reason: string;
  relatedChangeRecordIds: string[];
  pinned?: boolean;
};

export type ProvenanceRecord = {
  id: string;
  kind:
    | 'conversation-summary'
    | 'context-document'
    | 'recent-change'
    | 'knowledge-hit'
    | 'run-resume'
    | 'effective-rule'
    | 'promoted-knowledge';
  label: string;
  detail: string;
  sourcePath?: string;
  score?: number;
};

export type RuntimeBudgetPlan = {
  maxPromptTokens: number;
  reservedOutputTokens: number;
  estimatedPromptTokens: number;
  estimatedContextTokens: number;
  selectedRetrievalHitCount: number;
  truncatedRetrievalHitCount: number;
  compactedConversation: boolean;
  omittedMessageCount: number;
};

export type RuntimeGovernorStatus = {
  activeRunCount: number;
  maxConcurrentRuns: number;
  lastUpdatedAt: string;
  lastDecision: string;
};

export type ContextPackDocumentDigest = {
  path: string;
  excerpt: string;
  modifiedAt?: number;
};

export type ContextPack = {
  id: string;
  createdAt: string;
  runId?: string;
  sessionId?: string;
  stage?: AppStage;
  roleId?: string;
  systemPrompt: string;
  userPrompt: string;
  compacted: boolean;
  sourceMessageCount: number;
  retainedMessageCount: number;
  omittedMessageCount: number;
  anchorPaths: string[];
  pinnedDocumentPaths: string[];
  excludedDocumentPaths: string[];
  changeRecordIds: string[];
  documentDigests: ContextPackDocumentDigest[];
  provenance: string[];
  rollingSummary?: string;
  retrievalHits?: RetrievalHit[];
  provenanceRecords?: ProvenanceRecord[];
  effectiveRuleIds?: string[];
  knowledgeNodeIds?: string[];
  budgetPlan?: RuntimeBudgetPlan;
  knowledgeIndexBuiltAt?: string;
};

export type EvidencePackage = {
  id: string;
  createdAt: string;
  runId: string;
  kind: RuntimeRun['kind'];
  status: RuntimeRun['status'];
  sessionId?: string;
  stage?: AppStage;
  roleId?: string;
  selectedProfileId?: string;
  contextPackId?: string;
  checkpointIds: string[];
  outputIds: string[];
  approvalIds?: string[];
  branchGroupIds?: string[];
  scopeIds?: string[];
  loopIds?: string[];
  subflowCallIds?: string[];
  rerunPlanIds?: string[];
  snapshotIds?: string[];
  recoveryStatus?: RuntimeRunRecovery['status'];
  eventCount: number;
  diagnostics: string[];
};

export type CapabilityExecutionLogPhase =
  | 'validate-input'
  | 'launch-browser'
  | 'navigate'
  | 'extract'
  | 'summarize'
  | 'persist';

export type CapabilityExecutionLog = {
  id: string;
  createdAt: string;
  phase: CapabilityExecutionLogPhase;
  level: 'info' | 'warning' | 'error';
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type CapabilityExecutionFailureClass =
  | 'browser_unavailable'
  | 'navigation_timeout'
  | 'navigation_error'
  | 'selector_timeout'
  | 'extraction_failed';

export type CapabilityExecutionEvidence = {
  id: string;
  createdAt: string;
  runId?: string;
  capabilityId: string;
  status: 'completed' | 'failed';
  targetId?: string;
  timeout: {
    requestedMs: number;
    appliedMs: number;
  };
  selector: {
    requestedSelector: string;
    usedSelector: string;
    usedFallback: boolean;
  };
  truncation: {
    requestedMaxLength: number;
    appliedMaxLength: number;
    sourceTextLength: number;
    returnedTextLength: number;
    truncated: boolean;
  };
  response?: {
    ok: boolean;
    status: number | null;
    statusText: string;
    finalUrl: string;
    title: string;
    linkCount: number;
  };
  failure?: {
    classification: CapabilityExecutionFailureClass;
    code: RuntimeErrorCode;
    message: string;
    hint: string;
    retryable: boolean;
  };
  logs: CapabilityExecutionLog[];
};

export type ActionableErrorRecord = {
  id: string;
  createdAt: string;
  scope: 'runtime' | 'resource-import' | 'side-effect' | 'project-migration';
  code: string;
  severity: 'warning' | 'error' | 'critical';
  message: string;
  runId?: string;
  targetId?: string;
  checkpointId?: string;
  contextPackId?: string;
  retryable: boolean;
  recoverable: boolean;
  suggestedActions: string[];
};

export type LocalResourceInstallResult =
  | {
      status: 'installed';
      kind: ResourceKind;
      targetPath: string;
      bootstrap: BootstrapData;
      review: ReviewGateReport;
      verification: ResourceVerificationRecord;
    }
  | {
      status: 'review-required';
      kind: ResourceKind;
      targetPath: string;
      review: ReviewGateReport;
      verification: ResourceVerificationRecord;
    }
  | {
      status: 'blocked';
      kind: ResourceKind;
      targetPath: string;
      review: ReviewGateReport;
      verification: ResourceVerificationRecord;
      actionableError?: ActionableErrorRecord;
    };

export type RuntimeCapabilityKind = 'builtin' | 'mcp' | 'script' | 'network';

export type RuntimeCapabilityDefinition = {
  id: string;
  name: string;
  description: string;
  kind: RuntimeCapabilityKind;
  enabled: boolean;
  sourceId?: string;
  inputSchema?: string;
  outputSchema?: string;
};

export type ConversationTargetType = 'project-doc' | 'orchestration-flow' | 'settings';

export type ConversationTargetContext = {
  targetType: ConversationTargetType;
  targetId: string;
};

export type FlowPlanStep = {
  id: string;
  title: string;
  type: PlatformFlowNode['type'];
  description?: string;
  roleId?: string;
  toolId?: string;
  subflowId?: string;
  conditionExpression?: string;
  loopExpression?: string;
  maxIterations?: number;
  inputArtifactPaths?: string[];
  outputArtifactPaths?: string[];
};

export type FlowPlan = {
  id: string;
  name: string;
  description: string;
  steps: FlowPlanStep[];
};

export type FlowPatchOperation =
  | {
      op: 'rename_flow';
      name: string;
      description?: string;
    }
  | {
      op: 'add_node';
      afterNodeId?: string;
      node: FlowPlanStep;
    }
  | {
      op: 'update_node';
      nodeId: string;
      patch: Partial<PlatformFlowNode['data']>;
    }
  | {
      op: 'delete_node';
      nodeId: string;
    };

export type FlowPatch = {
  id: string;
  summary: string;
  operations: FlowPatchOperation[];
};

export type RuntimeEvent = {
  id: string;
  runId: string;
  createdAt: string;
  type:
    | 'run.started'
    | 'run.resumed'
    | 'run.pause-requested'
    | 'run.paused'
    | 'model.selected'
    | 'assistant.output'
    | 'tool.requested'
    | 'tool.retry'
    | 'tool.completed'
    | 'tool.failed'
    | 'permission.blocked'
    | 'hook.before'
    | 'hook.after'
    | 'validation.failed'
    | 'repair.applied'
    | 'checkpoint.saved'
    | 'branch.group-started'
    | 'branch.started'
    | 'branch.completed'
    | 'branch.join-waiting'
    | 'branch.join-released'
    | 'loop.started'
    | 'loop.iteration.started'
    | 'loop.iteration.completed'
    | 'loop.exit-satisfied'
    | 'loop.guard-stopped'
    | 'approval.waiting'
    | 'approval.approved'
    | 'approval.rejected'
    | 'merge.required'
    | 'merge.resolved'
    | 'subflow.started'
    | 'subflow.completed'
    | 'subflow.failed'
    | 'rerun.plan-created'
    | 'rerun.applied'
    | 'snapshot.created'
    | 'run.recovery-saved'
    | 'run.cleanup'
    | 'run.stop-requested'
    | 'run.retry-requested'
    | 'run.stopped'
    | 'run.completed'
    | 'run.failed';
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type RuntimeErrorCode =
  | 'auth_error'
  | 'network_error'
  | 'rate_limit'
  | 'model_error'
  | 'validation_error'
  | 'capability_error'
  | 'permission_error'
  | 'cancelled_error'
  | 'state_error';

export type RuntimeOutputRecord = {
  id: string;
  createdAt: string;
  kind: 'raw' | 'repaired' | 'final';
  label: string;
  contentType: 'text' | 'markdown' | 'json';
  content: string;
  qualityTier?: ArtifactQualityTier;
  qualityVerdict?: ArtifactQualityVerdict | 'validated' | 'repaired';
  qualityScore?: number;
  qualityReasons?: string[];
  artifactPath?: string;
  artifactTitle?: string;
  accepted?: boolean;
};

export type RuntimeArtifactOutcome = {
  id: string;
  createdAt: string;
  artifactPath: string;
  artifactTitle: string;
  schemaId: string;
  qualityTier: ArtifactQualityTier;
  qualityVerdict: 'validated' | 'repaired' | 'degraded' | 'blocked';
  qualityScore: number;
  qualityReasons: string[];
  accepted: boolean;
  usedRepair: boolean;
  usedDeterministicFallback: boolean;
  message?: string;
};

export type RuntimeCheckpoint = {
  id: string;
  createdAt: string;
  turn: number;
  status: 'completed' | 'failed' | 'waiting-approval';
  summary: string;
  nodeId?: string;
  scopeId?: string;
  contextPackId?: string;
  lineageRunId?: string;
  sideEffectPolicy?: 'model-only' | 'tool-assisted' | 'manual-review-required';
};

export type RuntimeUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type RuntimeResumeContext = {
  system: string;
  user: string;
  allowedCapabilities: string[];
};

export type RuntimeBranchRecord = {
  id: string;
  nodeId: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  checkpointId?: string;
  scopeId?: string;
  outputIds: string[];
  errorMessage?: string;
};

export type RuntimeBranchGroup = {
  id: string;
  forkNodeId: string;
  joinNodeId?: string;
  strategy: 'collect_all' | 'first_success' | 'judge' | 'manual_merge';
  status: 'running' | 'waiting-join' | 'joined' | 'failed';
  createdAt: string;
  updatedAt: string;
  scopeId?: string;
  branches: RuntimeBranchRecord[];
};

export type RuntimeScopeType =
  | 'root-run'
  | 'branch-group'
  | 'branch'
  | 'loop'
  | 'loop-iteration'
  | 'subflow-call'
  | 'node-attempt'
  | 'rerun';

export type RuntimeScopeStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'skipped';

export type RuntimeScopeRecord = {
  id: string;
  type: RuntimeScopeType;
  status: RuntimeScopeStatus;
  label: string;
  createdAt: string;
  updatedAt: string;
  parentScopeId?: string;
  nodeId?: string;
  flowId?: string;
  checkpointId?: string;
  outputIds: string[];
  childScopeIds: string[];
  errorMessage?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type RuntimeLoopRecord = {
  id: string;
  nodeId: string;
  status: 'running' | 'completed' | 'failed' | 'guard-stopped' | 'timed-out';
  exitReason: 'exit-condition' | 'max-iterations' | 'timeout' | 'failure-policy';
  maxIterations: number;
  timeoutMs?: number;
  iterationScopeIds: string[];
  startedAt: string;
  completedAt?: string;
  scopeId?: string;
};

export type RuntimeSubflowCallRecord = {
  id: string;
  nodeId: string;
  subflowId: string;
  status: 'running' | 'completed' | 'failed';
  parentFlowId?: string;
  childFlowId: string;
  inputBindings: string[];
  outputBindings: string[];
  startedAt: string;
  completedAt?: string;
  scopeId?: string;
  childScopeId?: string;
  outputIds: string[];
  errorMessage?: string;
};

export type RuntimeRerunPlan = {
  id: string;
  createdAt: string;
  sourceRunId?: string;
  flowId: string;
  nodeId: string;
  mode: 'continue' | 'debug' | 'partial-rerun';
  reusableNodeIds: string[];
  reusableArtifactPaths: string[];
  invalidatedNodeIds: string[];
  invalidatedArtifactPaths: string[];
  downstreamNodeIds: string[];
  snapshotId?: string;
  status: 'preview' | 'applied' | 'discarded';
  summary: string;
};

export type RuntimeSnapshotRecord = {
  id: string;
  createdAt: string;
  label: string;
  projectSnapshotId: string;
  reason: string;
  nodeId?: string;
  rerunPlanId?: string;
};

export type RuntimeApprovalRecord = {
  id: string;
  nodeId: string;
  status: 'pending' | 'approved' | 'rejected';
  prompt: string;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
  reason?: string;
  rollbackNodeId?: string;
};

export type RuntimeRunRecovery = {
  status: 'recoverable' | 'resolved' | 'discarded';
  savedAt: string;
  latestCheckpointId?: string;
  approvalIds: string[];
  branchGroupIds: string[];
  scopeIds?: string[];
  rerunPlanIds?: string[];
  snapshotIds?: string[];
  resumedAt?: string;
  resolvedAt?: string;
  resolvedByRunId?: string;
  reason?: string;
};

export type RuntimeRunHistoryRecord = {
  id: string;
  runId: string;
  createdAt: string;
  updatedAt: string;
  kind: RuntimeRun['kind'];
  status: RuntimeRun['status'];
  sessionId?: string;
  stage?: AppStage;
  roleId?: string;
  flowId?: string;
  checkpointCount: number;
  latestCheckpointId?: string;
  latestCheckpointSummary?: string;
  outputCount: number;
  heartbeatAt?: string;
  recoveryStatus?: RuntimeRunRecovery['status'];
};

export type RuntimeRunStatus =
  | 'queued'
  | 'running'
  | 'pause-requested'
  | 'paused'
  | 'waiting-approval'
  | 'merge-required'
  | 'stopped'
  | 'completed'
  | 'failed';

export type RuntimeRunActionId =
  | 'pause'
  | 'stop'
  | 'retry'
  | 'resume'
  | 'approve'
  | 'reject'
  | 'resolve-merge';

export type RuntimeRunControlState = {
  status: RuntimeRunStatus;
  summary: string;
  blockingReason?: 'waiting-approval' | 'merge-required' | 'recoverable' | 'terminal' | 'none';
  allowedActions: RuntimeRunActionId[];
  pendingApprovalCount: number;
  pendingMergeCount: number;
};

export type RuntimeRun = {
  id: string;
  kind: 'chat' | 'stage' | 'review' | 'template' | 'delivery';
  status: RuntimeRunStatus;
  createdAt: string;
  updatedAt: string;
  heartbeatAt?: string;
  sessionId?: string;
  stage?: AppStage;
  roleId?: string;
  flowId?: string;
  selectedProfileId?: string;
  currentStep?: string;
  latestCheckpointId?: string;
  latestCheckpointSummary?: string;
  pauseRequestedAt?: string;
  pausedAt?: string;
  diagnostics: string[];
  usage: RuntimeUsage;
  outputs: RuntimeOutputRecord[];
  artifactOutcomes?: RuntimeArtifactOutcome[];
  checkpoints: RuntimeCheckpoint[];
  errorMessage?: string;
  resumedFromRunId?: string;
  resumeContext?: RuntimeResumeContext;
  contextPackId?: string;
  evidencePackageId?: string;
  actionableErrorId?: string;
  branchGroups?: RuntimeBranchGroup[];
  scopes?: RuntimeScopeRecord[];
  loops?: RuntimeLoopRecord[];
  subflowCalls?: RuntimeSubflowCallRecord[];
  rerunPlans?: RuntimeRerunPlan[];
  snapshots?: RuntimeSnapshotRecord[];
  pendingApprovals?: RuntimeApprovalRecord[];
  mergeProposalIds?: string[];
  recovery?: RuntimeRunRecovery;
  controlState?: RuntimeRunControlState;
};

export type ProjectSummary = {
  rootPath: string;
  manifest: ProjectManifest;
  workflow: WorkflowState;
  tree: FileNode[];
  template: ProjectTemplateInfo | null;
};

export type ProjectCreateInput = {
  name: string;
  locationPath: string;
  directoryMode: 'create-in-parent' | 'use-existing-directory';
  templateId?: string;
};

export type ProjectCreateValidationIssueCode =
  | 'name.empty'
  | 'name.invalid-chars'
  | 'path.empty'
  | 'path.missing-parent'
  | 'path.parent-not-writable'
  | 'path.target-missing'
  | 'path.target-not-directory'
  | 'path.target-not-writable'
  | 'path.target-exists-nonempty'
  | 'path.target-conflict';

export type ProjectCreateValidationIssue = {
  code: ProjectCreateValidationIssueCode;
  field: 'name' | 'locationPath' | 'directoryMode';
  message: string;
};

export type ProjectCreateValidation = {
  ok: boolean;
  finalPath: string;
  issues: ProjectCreateValidationIssue[];
};

export type AiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};

export type SessionContextControls = {
  pinnedDocumentPaths: string[];
  excludedDocumentPaths: string[];
  updatedAt: string;
};

export type AiSession = {
  id: string;
  title: string;
  stage: AppStage;
  summary: string;
  pinned: boolean;
  archived: boolean;
  target?: ConversationTargetContext;
  projectDocumentPaths?: string[];
  contextControls?: SessionContextControls;
  messages: AiMessage[];
};

export type AiRequest = {
  sessionId: string;
  stage: AppStage;
  content: string;
  contextDocuments: string[];
};

export type AiResponse = {
  message?: AiMessage;
  bootstrap?: BootstrapData;
  paused?: boolean;
  pausedRunId?: string;
  diagnostics?: string[];
};

export type ReviewIssueState = 'pending' | 'adopted' | 'ignored';

export type ReviewIssue = {
  id: string;
  title: string;
  detail: string;
  state: ReviewIssueState;
};

export type ReviewRound = {
  id: string;
  sessionId: string;
  stage: AppStage;
  documentPath: string;
  createdAt: string;
  status: 'running' | 'completed' | 'failed';
  blueOutput: string;
  redFeedback: string;
  summary: string;
  diagnostics: string[];
  issues: ReviewIssue[];
};

export type InstalledSkill = {
  id: string;
  name: string;
  version: string;
  description: string;
  source: string;
  applicableStages: AppStage[];
  installedAt: string;
  fileCount: number;
  trust?: ResourceTrustState;
  compatibility?: ResourceCompatibilityState;
  issueMessage?: string;
  verificationId?: string;
  provenance?: {
    kind: 'promotion';
    promotionDraftId: string;
    accumulationEntryId: string;
    packagePath?: string;
  };
};

export type RemoteSkillCatalogItem = {
  id: string;
  name: string;
  version: string;
  description: string;
  source: string;
  packageUrl: string;
  applicableStages: AppStage[];
};

export type SkillPackageFile = {
  path: string;
  content: string;
};

export type SkillPackage = {
  id: string;
  name: string;
  version: string;
  description: string;
  source: string;
  applicableStages: AppStage[];
  files: SkillPackageFile[];
};

export type SessionSkillMap = Record<string, string[]>;

export type EffectiveSkill = InstalledSkill & {
  scope: 'project' | 'session';
};

export type SnapshotInfo = {
  id: string;
  label: string;
  createdAt: string;
};

export type DocumentSnapshotSource = 'manual' | 'editor-save' | 'runtime-write' | 'restore';

export type DocumentSnapshotInfo = {
  id: string;
  filePath: string;
  label: string;
  createdAt: string;
  source: DocumentSnapshotSource;
  summary: string;
  excerpt?: string;
};

export type DocumentWriteChunk = {
  id: string;
  startLine: number;
  deleteCount: number;
  humanText: string;
  aiText: string;
  conflict: boolean;
};

export type PendingDocumentWriteStatus = 'pending' | 'accepted' | 'discarded' | 'merged';

export type PendingDocumentWrite = {
  id: string;
  createdAt: string;
  filePath: string;
  title: string;
  sourceRunId?: string;
  sourceLabel: string;
  status: PendingDocumentWriteStatus;
  hasConflicts: boolean;
  baseRevisionId?: string;
  currentRevisionId?: string;
  baseContentHash?: string;
  currentContentHash?: string;
  changeSummary: string;
  proposedContent: string;
  chunks: DocumentWriteChunk[];
};

export type DocumentWriteDecision = 'accept-ai' | 'keep-human' | 'manual-merge';

export type DocumentWriteResolutionInput = {
  decision: DocumentWriteDecision;
  chunkSelections?: Record<string, 'human' | 'ai'>;
};

export type AuditEntry = {
  id: string;
  createdAt: string;
  type: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type DocumentChangeSource = 'editor-save' | 'external-change' | 'runtime-write';

export type DocumentChangeImpact = {
  inboundAffectedPaths: string[];
  outboundAddedPaths: string[];
  outboundRemovedPaths: string[];
  artifactPaths: string[];
};

export type DocumentChangeRecord = {
  id: string;
  createdAt: string;
  filePath: string;
  title: string;
  source: DocumentChangeSource;
  summary: string;
  addedLineCount: number;
  removedLineCount: number;
  changedLineCount: number;
  excerptBefore?: string;
  excerptAfter?: string;
  impact: DocumentChangeImpact;
};

export type ConsistencyFinding = {
  id: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  documentPath?: string;
};

export type ConsistencyReport = {
  createdAt: string;
  findings: ConsistencyFinding[];
};

export type UiPreviewRegion = {
  id: string;
  title: string;
  description?: string;
  target?: string;
};

export type UiPreviewSection = {
  id: string;
  title: string;
  regions: UiPreviewRegion[];
};

export type UiPreviewSpec = {
  title: string;
  description?: string;
  sections: UiPreviewSection[];
};

export type TableArtifactFormat = 'csv' | 'tsv' | 'xlsx';

export type TableArtifactSheet = {
  id: string;
  name: string;
  columns: string[];
  rows: string[][];
};

export type TableArtifactModel = {
  filePath: string;
  title: string;
  format: TableArtifactFormat;
  activeSheetId: string;
  sheets: TableArtifactSheet[];
  warnings: string[];
};

export type ArtifactViewKind =
  | 'text'
  | 'table'
  | 'image'
  | 'diagram'
  | 'mindmap'
  | 'unsupported';

export type ArtifactOpenPayload = {
  kind: ArtifactViewKind;
  filePath: string;
  title: string;
  editable: boolean;
  binary: boolean;
  content?: string;
  table?: TableArtifactModel;
  warnings?: string[];
  errorMessage?: string;
};

export type DocumentMeta = {
  path: string;
  modifiedAt: number;
  size: number;
};

export type ProjectSearchResult = {
  path: string;
  name: string;
  line: number;
  column: number;
  preview: string;
  matchCount: number;
};

export type NoteReferenceKind = 'markdown' | 'wiki';

export type NoteReferenceEdge = {
  id: string;
  sourcePath: string;
  targetPath: string;
  targetTitle: string;
  kind: NoteReferenceKind;
  rawTarget: string;
  line: number;
};

export type UnresolvedNoteReference = {
  id: string;
  sourcePath: string;
  sourceTitle: string;
  rawTarget: string;
  kind: NoteReferenceKind;
  line: number;
};

export type NoteReferenceDocument = {
  path: string;
  title: string;
  outbound: NoteReferenceEdge[];
  inbound: NoteReferenceEdge[];
};

export type NoteReferenceGraph = {
  generatedAt: string;
  documents: NoteReferenceDocument[];
  edges: NoteReferenceEdge[];
  unresolved: UnresolvedNoteReference[];
};

export type NoteReferenceComparison = {
  basePath: string;
  comparePath: string;
  sharedOutbound: NoteReferenceDocument[];
  baseOnlyOutbound: NoteReferenceDocument[];
  compareOnlyOutbound: NoteReferenceDocument[];
  sharedInbound: NoteReferenceDocument[];
  baseOnlyInbound: NoteReferenceDocument[];
  compareOnlyInbound: NoteReferenceDocument[];
};

export type ThinkingChainNodeKind =
  | 'goal'
  | 'branch'
  | 'criterion'
  | 'decision'
  | 'artifact'
  | 'rejected'
  | 'summary';

export type ThinkingChainNodeStatus =
  | 'active'
  | 'accepted'
  | 'rejected'
  | 'abandoned'
  | 'orphaned';

export type ThinkingChainNodeLane =
  | 'focus'
  | 'formed'
  | 'exploration'
  | 'landed'
  | 'discarded';

export type ThinkingChainNodeStage =
  | 'core'
  | 'premise'
  | 'constraint'
  | 'conclusion'
  | 'exploration'
  | 'discarded'
  | 'materialized';

export type ThinkingChainEdgeKind =
  | 'derives'
  | 'supports'
  | 'constrains'
  | 'lands-into'
  | 'materializes'
  | 'explores'
  | 'replaces';

export type ThinkingChainEvidenceKind =
  | 'session-message'
  | 'runtime-run'
  | 'runtime-event'
  | 'review-round'
  | 'review-issue'
  | 'artifact-revision'
  | 'document-change'
  | 'document'
  | 'artifact';

export type ThinkingChainEvidenceRef = {
  id: string;
  kind: ThinkingChainEvidenceKind;
  label: string;
  summary?: string;
  createdAt?: string;
  sessionId?: string;
  runId?: string;
  reviewRoundId?: string;
  path?: string;
  targetId?: string;
  missing?: boolean;
  metadata?: Record<string, string>;
};

export type ThinkingChainDetailItem = {
  id: string;
  label: string;
  value: string;
};

export type ThinkingChainManualPosition = {
  x: number;
  y: number;
  pinned?: boolean;
};

export type ThinkingChainLayoutState = {
  version: number;
  sessionId: string;
  updatedAt: string;
  nodes: Record<string, ThinkingChainManualPosition>;
  view: {
    zoom: number;
    scrollLeft: number;
    scrollTop: number;
    detailPaneWidth: number;
  };
};

export type ThinkingChainNode = {
  id: string;
  semanticKey: string;
  kind: ThinkingChainNodeKind;
  status: ThinkingChainNodeStatus;
  lane: ThinkingChainNodeLane;
  stage: ThinkingChainNodeStage;
  title: string;
  summary: string;
  order: number;
  level: number;
  evidenceRefs: ThinkingChainEvidenceRef[];
  detailItems?: ThinkingChainDetailItem[];
  artifactPath?: string;
  artifactAnchor?: string;
  manualPosition?: ThinkingChainManualPosition;
};

export type ThinkingChainEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  kind: ThinkingChainEdgeKind;
  label?: string;
};

export type ThinkingChainSnapshot = {
  sessionId: string;
  sessionTitle: string;
  generatedAt: string;
  nodes: ThinkingChainNode[];
  edges: ThinkingChainEdge[];
  sourceRefs: ThinkingChainEvidenceRef[];
  layoutState: ThinkingChainLayoutState | null;
  counts: {
    totalNodes: number;
    rejectedNodes: number;
    orphanedNodes: number;
  };
};

export type BootstrapData = {
  settings: AppSettings;
  project: ProjectSummary | null;
  templates: ProjectTemplateDefinition[];
  platform: PlatformAssets | null;
  runtimeTemplate: RuntimeTemplateAsset | null;
  flowHistories: Record<string, FlowHistoryEntry[]>;
  sessions: AiSession[];
  agentMemory: AgentMemory | null;
  reviewRounds: ReviewRound[];
  installedSkills: InstalledSkill[];
  installedRolePackages: InstalledRolePackage[];
  projectSkillIds: string[];
  sessionSkillIds: SessionSkillMap;
  snapshots: SnapshotInfo[];
  consistencyReport: ConsistencyReport | null;
  auditEntries: AuditEntry[];
  recentDocumentChanges: DocumentChangeRecord[];
  artifactRevisions: ArtifactRevisionRecord[];
  artifactInvalidations: ArtifactInvalidationRecord[];
  runtimeRuns: RuntimeRun[];
  runtimeEvents: RuntimeEvent[];
  runtimeCapabilities: RuntimeCapabilityDefinition[];
  contextPacks: ContextPack[];
  knowledgeIndexState: KnowledgeIndexState | null;
  runtimeGovernorStatus: RuntimeGovernorStatus | null;
  noteReferenceGraph: NoteReferenceGraph | null;
  rulesDistillation: RulesDistillationSnapshot;
};

export type WindowMode = 'main' | 'document';

export type WindowBootstrapContext = {
  mode: WindowMode;
  rootPath?: string;
  documentPath?: string;
  sourceWebContentsId?: number;
};

export type AppCommand =
  | { type: 'project:new' }
  | { type: 'project:open' }
  | { type: 'project:open-recent'; path: string }
  | { type: 'project:close' }
  | { type: 'project:reveal' }
  | { type: 'project:import-documents' }
  | { type: 'session:new' }
  | { type: 'ai:generate-stage' }
  | { type: 'ai:confirm-stage' }
  | { type: 'ai:review' }
  | { type: 'ai:generate-openspec' }
  | { type: 'doc:save' }
  | { type: 'doc:find' }
  | { type: 'doc:replace' }
  | { type: 'doc:reopen-last-closed' }
  | { type: 'search:project' }
  | { type: 'view:toggle-left' }
  | { type: 'view:toggle-right' }
  | { type: 'view:toggle-process' }
  | { type: 'view:set-activity'; view: ActivityView }
  | { type: 'tools:command-palette' }
  | { type: 'tools:settings' };
