import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type {
  AgentProfile,
  AssetDiagnostic,
  ControlledScriptTool,
  FlowHistoryEntry,
  PlatformAssets,
  PlatformConnector,
  PlatformFlowAsset,
  PlatformRole,
  PlatformToolRunResult,
  ProjectTemplateDefinition,
  ProjectTemplateInfo,
  ProjectTemplatePackage,
  ResolvedRoleRuntimeBundle
} from '../../shared/types';
import type { TaskTemplate } from '../../shared/orchestration-contracts';
import { normalizeAgentProfile, normalizeTaskTemplate } from '../../shared/orchestration-contracts';
import {
  computeRolePackageStatus,
  connectorBindingState,
  ensureRolePackageSections,
  resolveNodeCapabilityIds,
  toolBindingState
} from '../../shared/platform-bindings';
import {
  buildRolePackageFromPlatformRole,
  loadRolePackageDirectory
} from '../../shared/role-package';
import { defaultFlowPathConfig } from '../../shared/runtime-template';
import { normalizeFlowAssetPaths } from './runtime-template-paths';
import { ResourceGovernanceService } from './resource-governance-service';
import { TemplateRegistryService } from './template-registry-service';

const PLATFORM_ROOT = '.project/platform';
const MAX_TOOL_OUTPUT_BYTES = 128 * 1024;
const RESERVED_SEGMENT_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function normalizeHttpConnectorEndpoint(endpoint: string) {
  const parsed = new URL(endpoint.trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('连接只支持 http/https endpoint。');
  }
  if (parsed.username || parsed.password) {
    throw new Error('连接 endpoint 不允许内嵌账号或密码。');
  }
  return parsed.toString();
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function rootPaths(rootPath: string) {
  const platformRoot = path.join(rootPath, PLATFORM_ROOT);
  return {
    platformRoot,
    flowsDir: path.join(platformRoot, 'flows'),
    subflowsDir: path.join(platformRoot, 'subflows'),
    historyRoot: path.join(platformRoot, 'history'),
    templateFile: path.join(platformRoot, 'template.json'),
    rolesFile: path.join(platformRoot, 'roles.json'),
    taskTemplatesFile: path.join(platformRoot, 'task-templates.json'),
    agentProfilesFile: path.join(platformRoot, 'agent-profiles.json'),
    rolePackagesDir: path.join(platformRoot, 'roles'),
    connectorsFile: path.join(platformRoot, 'connectors.json'),
    toolsFile: path.join(platformRoot, 'tools.json')
  };
}

function createTemplateInfo(template: ProjectTemplateDefinition): ProjectTemplateInfo {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    icon: template.icon,
    category: template.category,
    source: template.source,
    selectedAt: new Date().toISOString()
  };
}

function assertSafePathSegment(label: string, value: string) {
  const segment = value.trim();
  if (!segment || segment !== value) {
    throw new Error(`${label} must be a non-empty file-safe identifier.`);
  }
  if (
    segment === '.'
    || segment === '..'
    || path.isAbsolute(segment)
    || /[<>:"/\\|?*\u0000-\u001F]/.test(segment)
    || /[.\s]$/.test(segment)
    || RESERVED_SEGMENT_PATTERN.test(segment)
  ) {
    throw new Error(`${label} contains unsafe path characters.`);
  }
  return segment;
}

function writeFlowCollection(dirPath: string, items: PlatformFlowAsset[]) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
  for (const item of items) {
    const flowId = assertSafePathSegment('Flow id', item.id);
    writeJson(path.join(dirPath, `${flowId}.json`), item);
  }
}

function buildExecutionBindingLookups(templatePackage: ProjectTemplatePackage) {
  const stageLookup = new Map<string, { taskTemplateId?: string; agentProfileId?: string }>();
  const reviewLookup = new Map<string, { taskTemplateId?: string; agentProfileId?: string }>();
  const runtimeTemplate = templatePackage.runtime.template;

  for (const binding of Object.values(runtimeTemplate.stageExecutionProfiles ?? {})) {
    if (!binding?.roleId) continue;
    if (!stageLookup.has(binding.roleId)) {
      stageLookup.set(binding.roleId, {
        taskTemplateId: binding.taskTemplateId,
        agentProfileId: binding.agentProfileId
      });
    }
  }

  for (const binding of Object.values(runtimeTemplate.review?.executionProfiles ?? {})) {
    if (!binding?.roleId) continue;
    if (!reviewLookup.has(binding.roleId)) {
      reviewLookup.set(binding.roleId, {
        taskTemplateId: binding.taskTemplateId,
        agentProfileId: binding.agentProfileId
      });
    }
  }

  return { stageLookup, reviewLookup };
}

function materializeExecutionBindings(
  flow: PlatformFlowAsset,
  lookups: {
    stageLookup: Map<string, { taskTemplateId?: string; agentProfileId?: string }>;
    reviewLookup: Map<string, { taskTemplateId?: string; agentProfileId?: string }>;
  }
) {
  return {
    ...flow,
    nodes: flow.nodes.map((node) => {
      if (node.type !== 'agent' || !node.data.roleId) {
        return node;
      }
      const primaryLookup = flow.kind === 'subflow' ? lookups.reviewLookup : lookups.stageLookup;
      const fallbackLookup = flow.kind === 'subflow' ? lookups.stageLookup : lookups.reviewLookup;
      const binding = primaryLookup.get(node.data.roleId) ?? fallbackLookup.get(node.data.roleId);
      if (!binding) {
        return node;
      }
      return {
        ...node,
        data: {
          ...node.data,
          taskTemplateId: node.data.taskTemplateId ?? binding.taskTemplateId,
          agentProfileId: node.data.agentProfileId ?? binding.agentProfileId
        }
      };
    })
  };
}

function spawnSyncText(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true
  }) as { status: number | null; stdout: string; stderr: string; error?: Error };
  return {
    ok: result.status === 0 && !result.error,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status
  };
}

function commandExists(command: string) {
  if (!command) return false;
  if (path.isAbsolute(command)) return fs.existsSync(command);
  try {
    const output = process.platform === 'win32'
      ? spawnSyncText('where', [command])
      : spawnSyncText('which', [command]);
    return output.ok;
  } catch {
    return false;
  }
}

function relativeInside(rootPath: string, targetPath: string) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}

function historyDir(rootPath: string, kind: PlatformFlowAsset['kind'], flowId: string) {
  const locations = rootPaths(rootPath);
  return path.join(locations.historyRoot, kind, assertSafePathSegment('Flow id', flowId));
}

function flowAssetFilePath(rootPath: string, kind: PlatformFlowAsset['kind'], flowId: string) {
  const locations = rootPaths(rootPath);
  const dir = kind === 'subflow' ? locations.subflowsDir : locations.flowsDir;
  return path.join(dir, `${assertSafePathSegment('Flow id', flowId)}.json`);
}

function diagnostic(
  status: AssetDiagnostic['status'],
  code: string,
  summary: string,
  checkedAt?: string,
  details?: string[]
): AssetDiagnostic {
  return {
    status,
    code,
    summary,
    checkedAt,
    details
  };
}

function roleHealthFromIssues(issues: { severity: 'warning' | 'error' }[]) {
  if (issues.some((item) => item.severity === 'error')) {
    return 'corrupt' as const;
  }
  if (issues.length) {
    return 'warning' as const;
  }
  return 'healthy' as const;
}

function appendBoundedOutput(
  current: string,
  chunk: unknown,
  state: { truncated: boolean },
  maxBytes = MAX_TOOL_OUTPUT_BYTES
) {
  if (state.truncated) {
    return current;
  }

  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '');
  const next = current + text;
  if (Buffer.byteLength(next, 'utf8') <= maxBytes) {
    return next;
  }

  const marker = `\n[output truncated after ${maxBytes} bytes]`;
  const remainingBytes = Math.max(0, maxBytes - Buffer.byteLength(marker, 'utf8'));
  let kept = current;
  while (Buffer.byteLength(kept, 'utf8') > remainingBytes) {
    kept = kept.slice(0, Math.max(0, kept.length - 1024));
  }

  let allowedChunk = text;
  while (allowedChunk && Buffer.byteLength(kept + allowedChunk, 'utf8') > remainingBytes) {
    allowedChunk = allowedChunk.slice(0, Math.max(0, allowedChunk.length - 1024));
  }

  state.truncated = true;
  return `${kept}${allowedChunk}${marker}`;
}

export class PlatformService {
  constructor(
    private readonly templateRegistry = new TemplateRegistryService(),
    private readonly resourceGovernance = new ResourceGovernanceService()
  ) {}

  private rolePackageDir(rootPath: string, roleId: string) {
    return path.join(rootPaths(rootPath).rolePackagesDir, assertSafePathSegment('Role id', roleId));
  }

  private syncRolePackageDirectory(rootPath: string, role: PlatformRole) {
    const rolePackage = buildRolePackageFromPlatformRole(role, 'project');
    const packageDir = this.rolePackageDir(rootPath, role.id);
    fs.rmSync(packageDir, { recursive: true, force: true });
    ensureDir(packageDir);
    for (const file of rolePackage.files) {
      const targetPath = path.join(packageDir, file.path);
      ensureDir(path.dirname(targetPath));
      fs.writeFileSync(targetPath, file.content, 'utf8');
    }
    return packageDir;
  }

  private normalizeRole(rootPath: string, role: PlatformRole): PlatformRole {
    const packageSections = ensureRolePackageSections(role);
    const promptHint = role.promptHint?.trim() || [packageSections.identity, packageSections.soul, packageSections.agents].filter(Boolean).join('\n\n');
    const normalized: PlatformRole = {
      ...clone(role),
      packageSections,
      promptHint,
      packageStatus: computeRolePackageStatus({
        name: role.name,
        description: role.description,
        promptHint,
        packageSections
      }),
      packageSource: role.packageSource ?? 'project',
      packageVersion: role.packageVersion ?? '1.0.0',
      allowedSkillIds: Array.from(new Set((role.allowedSkillIds ?? []).filter(Boolean))),
      allowedCapabilities: Array.from(new Set((role.allowedCapabilities ?? []).filter(Boolean)))
    };

    const packageDir = this.syncRolePackageDirectory(rootPath, normalized);
    const snapshot = loadRolePackageDirectory(packageDir);
    return {
      ...normalized,
      packageRoot: packageDir,
      packageVersion: snapshot.rolePackage.version,
      packageStatus: computeRolePackageStatus({
        name: normalized.name,
        description: normalized.description,
        promptHint,
        packageSections: snapshot.sections
      }),
      packageHealth: roleHealthFromIssues(snapshot.issues),
      packageIssueMessage: snapshot.issues[0]?.message,
      lastValidatedAt: new Date().toISOString(),
      packageDiagnostics: snapshot.issues
    };
  }

  private normalizeConnector(connector: PlatformConnector): PlatformConnector {
    const next = clone(connector);
    const capabilitySummary = next.capabilitySummary?.length
      ? next.capabilitySummary
      : next.transport === 'http'
        ? ['http-request']
        : ['stdio-command'];

    if (!next.enabled) {
      return {
        ...next,
        health: 'warning',
        compatibility: next.compatibility ?? 'review',
        authStatus: next.authStatus ?? 'not_required',
        capabilitySummary,
        diagnostic: next.diagnostic ?? diagnostic('warning', 'CONNECTOR_DISABLED', '连接已禁用。', next.lastCheckedAt)
      };
    }

    if (next.transport === 'http') {
      if (!next.endpoint?.trim()) {
        return {
          ...next,
          health: 'error',
          compatibility: 'incompatible',
          authStatus: next.authStatus ?? 'not_required',
          capabilitySummary,
          lastError: '连接缺少 endpoint。',
          diagnostic: diagnostic('error', 'CONNECTOR_ENDPOINT_MISSING', '连接缺少 endpoint。', next.lastCheckedAt)
        };
      }
      try {
        next.endpoint = normalizeHttpConnectorEndpoint(next.endpoint);
      } catch (error) {
        const message = error instanceof Error ? error.message : '连接 endpoint 无效。';
        return {
          ...next,
          health: 'error',
          compatibility: 'incompatible',
          authStatus: next.authStatus ?? 'not_required',
          capabilitySummary,
          lastError: message,
          diagnostic: diagnostic('error', 'CONNECTOR_ENDPOINT_INVALID', message, next.lastCheckedAt)
        };
      }
      return {
        ...next,
        health: next.health ?? 'unknown',
        compatibility: next.compatibility ?? 'current',
        authStatus: next.authStatus ?? 'not_required',
        capabilitySummary,
        diagnostic: next.diagnostic ?? diagnostic(
          next.health === 'healthy' ? 'healthy' : 'unknown',
          next.health === 'healthy' ? 'CONNECTOR_READY' : 'CONNECTOR_NOT_TESTED',
          next.health === 'healthy' ? '连接诊断通过。' : '连接尚未测试。',
          next.lastCheckedAt
        )
      };
    }

    if (!next.command?.trim()) {
      return {
        ...next,
        health: 'error',
        compatibility: 'incompatible',
        authStatus: next.authStatus ?? 'not_required',
        capabilitySummary,
        lastError: '连接缺少本地命令。',
        diagnostic: diagnostic('error', 'CONNECTOR_COMMAND_MISSING', '连接缺少本地命令。', next.lastCheckedAt)
      };
    }

    return {
      ...next,
      health: next.health ?? 'unknown',
      compatibility: next.compatibility ?? 'current',
      authStatus: next.authStatus ?? 'not_required',
      capabilitySummary,
      diagnostic: next.diagnostic ?? diagnostic(
        next.health === 'healthy' ? 'healthy' : 'unknown',
        next.health === 'healthy' ? 'CONNECTOR_READY' : 'CONNECTOR_NOT_TESTED',
        next.health === 'healthy' ? '连接诊断通过。' : '连接尚未测试。',
        next.lastCheckedAt
      )
    };
  }

  private normalizeTool(tool: ControlledScriptTool, connectors: PlatformConnector[]): ControlledScriptTool {
    const next = clone(tool);
    next.kind = next.kind ?? 'script';

    if (!next.enabled) {
      return {
        ...next,
        health: 'warning',
        diagnostic: next.diagnostic ?? diagnostic('warning', 'TOOL_DISABLED', '工具已禁用。', next.lastCheckedAt)
      };
    }
    if (!next.command?.trim()) {
      return {
        ...next,
        health: 'error',
        lastError: '工具缺少命令。',
        diagnostic: diagnostic('error', 'TOOL_COMMAND_MISSING', '工具缺少命令。', next.lastCheckedAt)
      };
    }
    if (!next.inputSchemaRef?.trim()) {
      return {
        ...next,
        health: 'warning',
        diagnostic: next.diagnostic ?? diagnostic('warning', 'TOOL_SCHEMA_MISSING', '工具缺少 input schema，不能进入可绑定状态。', next.lastCheckedAt)
      };
    }
    if (next.connectorId) {
      const connectorState = connectorBindingState(connectors.find((item) => item.id === next.connectorId));
      if (!connectorState.ready) {
        return {
          ...next,
          health: 'warning',
          lastError: connectorState.reason,
          diagnostic: diagnostic('warning', 'TOOL_CONNECTOR_UNAVAILABLE', connectorState.reason || '工具依赖的连接不可用。', next.lastCheckedAt)
        };
      }
    }
    return {
      ...next,
      health: next.lastRun?.ok ? 'healthy' : (next.health ?? 'unknown'),
      diagnostic: next.diagnostic ?? diagnostic(
        next.lastRun?.ok ? 'healthy' : 'unknown',
        next.lastRun?.ok ? 'TOOL_READY' : 'TOOL_NOT_TESTED',
        next.lastRun?.ok ? '工具测试通过。' : '工具尚未测试。',
        next.lastCheckedAt
      )
    };
  }

  listTemplates() {
    return clone(this.templateRegistry.listTemplates());
  }

  getTemplateDefinition(templateId?: string) {
    return this.templateRegistry.getTemplateDefinition(templateId);
  }

  getTemplatePackage(templateId: string) {
    return this.templateRegistry.getTemplatePackage(templateId);
  }

  installTemplateFromPath(targetPath: string) {
    const governed = this.resourceGovernance.verifyTemplateImportFromPath(targetPath);
    if (!governed.packageValue || governed.review.trust === 'blocked') {
      throw new Error(governed.actionableError?.message || governed.review.summary);
    }
    if (governed.review.trust === 'review') {
      throw new Error('Template import requires explicit review approval before installation.');
    }
    return this.templateRegistry.installPackageObject(governed.packageValue, `local:${path.resolve(targetPath)}`, {
      trust: governed.review.trust,
      compatibility: governed.review.compatibility,
      issueMessage: governed.review.summary,
      verificationId: governed.verification.id
    });
  }

  inspectTemplatePackageFromUrl(packageUrl: string) {
    return this.templateRegistry.inspectTemplatePackageFromUrl(packageUrl);
  }

  installTemplateFromUrl(packageUrl: string, options?: { approved?: boolean }) {
    return this.templateRegistry.installFromUrl(packageUrl, options);
  }

  checkTemplateForUpdate(templateId: string) {
    return this.templateRegistry.checkForUpdate(templateId);
  }

  repairTemplate(templateId: string) {
    return this.templateRegistry.repairTemplate(templateId);
  }

  updateTemplate(templateId: string) {
    return this.templateRegistry.updateTemplate(templateId);
  }

  installTemplatePackage(
    templatePackage: ProjectTemplatePackage,
    packageUrl?: string,
    metadata?: {
      trust?: ProjectTemplateDefinition['trust'];
      compatibility?: ProjectTemplateDefinition['compatibility'];
      issueMessage?: string;
      verificationId?: string;
    }
  ) {
    return this.templateRegistry.installPackageObject(templatePackage, packageUrl, metadata);
  }

  initializeProjectPlatform(rootPath: string, templateId?: string) {
    const template = this.getTemplateDefinition(templateId);
    const templatePackage = this.templateRegistry.getTemplatePackage(template.id);
    if (!templatePackage) {
      throw new Error(`未找到模板包：${template.id}`);
    }

    const bindingLookups = buildExecutionBindingLookups(templatePackage);
    const flows = clone(templatePackage.platform.flows).map((flow) => normalizeFlowAssetPaths(rootPath, materializeExecutionBindings({
      ...flow,
      pathConfig: flow.pathConfig ?? defaultFlowPathConfig()
    }, bindingLookups)));
    const subflows = clone(templatePackage.platform.subflows).map((flow) => normalizeFlowAssetPaths(rootPath, materializeExecutionBindings({
      ...flow,
      pathConfig: flow.pathConfig ?? defaultFlowPathConfig()
    }, bindingLookups)));

    const locations = rootPaths(rootPath);
    ensureDir(locations.platformRoot);
    writeFlowCollection(locations.flowsDir, flows);
    writeFlowCollection(locations.subflowsDir, subflows);

    const roles = clone(templatePackage.platform.roles).map((role) => this.normalizeRole(rootPath, role));
    const taskTemplates = clone(templatePackage.platform.taskTemplates ?? []).map((task) => normalizeTaskTemplate(task));
    const agentProfiles = clone(templatePackage.platform.agentProfiles ?? []).map((profile) => normalizeAgentProfile(profile));
    const connectors = clone(templatePackage.platform.connectors).map((connector) => this.normalizeConnector(connector));
    const tools = clone(templatePackage.platform.tools).map((tool) => this.normalizeTool(tool, connectors));

    writeJson(locations.templateFile, createTemplateInfo(template));
    writeJson(locations.rolesFile, roles);
    writeJson(locations.taskTemplatesFile, taskTemplates);
    writeJson(locations.agentProfilesFile, agentProfiles);
    writeJson(locations.connectorsFile, connectors);
    writeJson(locations.toolsFile, tools);
    for (const flow of flows) {
      this.writeFlowHistory(rootPath, flow, '初始化版本');
    }
    for (const subflow of subflows) {
      this.writeFlowHistory(rootPath, subflow, '初始化版本');
    }
    return this.loadAssets(rootPath);
  }

  loadAssets(rootPath: string): PlatformAssets {
    const locations = rootPaths(rootPath);
    const connectors = readJsonSafe<PlatformConnector[]>(locations.connectorsFile, []).map((connector) => this.normalizeConnector(connector));
    const tools = readJsonSafe<ControlledScriptTool[]>(locations.toolsFile, []).map((tool) => this.normalizeTool(tool, connectors));
    const roles = readJsonSafe<PlatformRole[]>(locations.rolesFile, []).map((role) => this.normalizeRole(rootPath, role));
    const taskTemplates = readJsonSafe<TaskTemplate[]>(locations.taskTemplatesFile, []).map((task) => normalizeTaskTemplate(task));
    const agentProfiles = readJsonSafe<AgentProfile[]>(locations.agentProfilesFile, []).map((profile) => normalizeAgentProfile(profile));
    return {
      template: readJsonSafe<ProjectTemplateInfo | null>(locations.templateFile, null),
      flows: this.loadFlowDir(locations.flowsDir, 'flow'),
      subflows: this.loadFlowDir(locations.subflowsDir, 'subflow'),
      roles,
      taskTemplates,
      agentProfiles,
      connectors,
      tools
    };
  }

  saveFlow(rootPath: string, flow: PlatformFlowAsset) {
    const next = normalizeFlowAssetPaths(rootPath, {
      ...flow,
      pathConfig: flow.pathConfig ?? defaultFlowPathConfig(),
      updatedAt: new Date().toISOString()
    });
    writeJson(flowAssetFilePath(rootPath, next.kind, next.id), next);
    this.writeFlowHistory(rootPath, next, '保存版本');
    return next;
  }

  deleteFlow(rootPath: string, kind: PlatformFlowAsset['kind'], flowId: string) {
    const target = flowAssetFilePath(rootPath, kind, flowId);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
    }
    fs.rmSync(historyDir(rootPath, kind, flowId), { recursive: true, force: true });
  }

  duplicateFlow(rootPath: string, kind: PlatformFlowAsset['kind'], flowId: string) {
    const assets = this.loadAssets(rootPath);
    const source = (kind === 'subflow' ? assets.subflows : assets.flows).find((item) => item.id === flowId);
    if (!source) {
      throw new Error('未找到要复制的流程资产。');
    }
    const now = new Date().toISOString();
    const duplicate: PlatformFlowAsset = {
      ...clone(source),
      id: randomUUID(),
      name: `${source.name} 副本`,
      createdAt: now,
      updatedAt: now
    };
    return this.saveFlow(rootPath, duplicate);
  }

  importFlow(rootPath: string, filePath: string, kind: PlatformFlowAsset['kind']) {
    const raw = readJsonSafe<PlatformFlowAsset | null>(filePath, null);
    if (!raw || !raw.nodes || !raw.edges) {
      throw new Error('导入文件不是有效的流程包。');
    }
    const imported: PlatformFlowAsset = {
      ...raw,
      id: randomUUID(),
      kind,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return this.saveFlow(rootPath, imported);
  }

  exportFlow(rootPath: string, kind: PlatformFlowAsset['kind'], flowId: string, targetPath: string) {
    const assets = this.loadAssets(rootPath);
    const source = (kind === 'subflow' ? assets.subflows : assets.flows).find((item) => item.id === flowId);
    if (!source) {
      throw new Error('未找到要导出的流程资产。');
    }
    writeJson(targetPath, source);
    return targetPath;
  }

  listFlowHistory(rootPath: string, kind: PlatformFlowAsset['kind'], flowId: string): FlowHistoryEntry[] {
    const dirPath = historyDir(rootPath, kind, flowId);
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => readJsonSafe<{ metadata: FlowHistoryEntry } | null>(path.join(dirPath, entry), null))
      .filter((item): item is { metadata: FlowHistoryEntry } => Boolean(item?.metadata))
      .map((item) => item.metadata)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  restoreFlowVersion(rootPath: string, kind: PlatformFlowAsset['kind'], flowId: string, versionId: string) {
    const safeVersionId = assertSafePathSegment('Flow history version id', versionId);
    const entryPath = path.join(historyDir(rootPath, kind, flowId), `${safeVersionId}.json`);
    const payload = readJsonSafe<{ flow: PlatformFlowAsset } | null>(entryPath, null);
    if (!payload?.flow) {
      throw new Error('未找到要恢复的流程版本。');
    }
    const restored: PlatformFlowAsset = {
      ...payload.flow,
      updatedAt: new Date().toISOString()
    };
    return this.saveFlow(rootPath, restored);
  }

  saveRoles(rootPath: string, roles: PlatformRole[]) {
    const normalized = roles.map((role) => this.normalizeRole(rootPath, role));
    writeJson(rootPaths(rootPath).rolesFile, normalized);
    return normalized;
  }

  saveTaskTemplates(rootPath: string, taskTemplates: TaskTemplate[]) {
    const normalized = taskTemplates.map((task) => normalizeTaskTemplate(task));
    writeJson(rootPaths(rootPath).taskTemplatesFile, normalized);
    return normalized;
  }

  saveAgentProfiles(rootPath: string, agentProfiles: AgentProfile[]) {
    const normalized = agentProfiles.map((profile) => normalizeAgentProfile(profile));
    writeJson(rootPaths(rootPath).agentProfilesFile, normalized);
    return normalized;
  }

  saveConnectors(rootPath: string, connectors: PlatformConnector[]) {
    const normalized = connectors.map((connector) => this.normalizeConnector(connector));
    writeJson(rootPaths(rootPath).connectorsFile, normalized);
    return normalized;
  }

  saveTools(rootPath: string, tools: ControlledScriptTool[]) {
    const connectors = this.loadAssets(rootPath).connectors;
    const normalized = tools.map((tool) => this.normalizeTool(tool, connectors));
    writeJson(rootPaths(rootPath).toolsFile, normalized);
    return normalized;
  }

  async testConnector(rootPath: string, connectorId: string) {
    const assets = this.loadAssets(rootPath);
    const connector = assets.connectors.find((item) => item.id === connectorId);
    if (!connector) {
      throw new Error('未找到连接定义。');
    }

    const checkedAt = new Date().toISOString();
    let ok = false;
    let message = '';
    let authStatus: PlatformConnector['authStatus'] | undefined = connector.authStatus;
    let diagnosticCode = 'CONNECTOR_TEST_FAILED';

    if (!connector.enabled) {
      ok = false;
      message = '连接已禁用。';
    } else if (connector.transport === 'http') {
      if (!connector.endpoint) {
        throw new Error('远程连接缺少 endpoint。');
      }
      try {
        const endpoint = normalizeHttpConnectorEndpoint(connector.endpoint);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        try {
        const response = await fetch(endpoint, {
          method: 'GET',
          signal: controller.signal
        });
        ok = response.ok;
        authStatus = response.ok
          ? (connector.authStatus === 'missing' ? 'authorized' : (connector.authStatus ?? 'not_required'))
          : response.status === 401 || response.status === 403
            ? 'missing'
            : (connector.authStatus ?? 'not_required');
        diagnosticCode = response.ok
          ? 'CONNECTOR_READY'
          : response.status === 401 || response.status === 403
            ? 'CONNECTOR_AUTH_REQUIRED'
            : 'CONNECTOR_TEST_FAILED';
        message = response.ok ? '连接可用。' : `连接失败：${response.status} ${response.statusText}`;
        } catch (error) {
        ok = false;
        message = error instanceof Error ? error.message : '连接失败。';
        authStatus = /401|403|unauthorized|forbidden/i.test(message)
          ? 'missing'
          : (connector.authStatus ?? 'not_required');
        diagnosticCode = /401|403|unauthorized|forbidden/i.test(message)
          ? 'CONNECTOR_AUTH_REQUIRED'
          : 'CONNECTOR_TEST_FAILED';
        } finally {
        clearTimeout(timer);
        }
      } catch (error) {
        ok = false;
        message = error instanceof Error ? error.message : '连接 endpoint 无效。';
        authStatus = connector.authStatus ?? 'not_required';
        diagnosticCode = 'CONNECTOR_ENDPOINT_INVALID';
      }
    } else {
      ok = commandExists(connector.command ?? '');
      message = ok ? '本地命令可用。' : '未找到本地命令。';
      authStatus = connector.authStatus ?? 'not_required';
      diagnosticCode = ok ? 'CONNECTOR_READY' : 'CONNECTOR_TEST_FAILED';
    }

    const updated = assets.connectors.map((item) =>
      item.id === connectorId
        ? this.normalizeConnector({
            ...item,
            lastCheckedAt: checkedAt,
            health: (ok ? 'healthy' : 'error') as PlatformConnector['health'],
            compatibility: ok ? 'current' : 'review',
            authStatus,
            lastError: ok ? undefined : message,
            diagnostic: diagnostic(
              ok ? 'healthy' : 'error',
              diagnosticCode,
              message,
              checkedAt
            )
          })
        : item
    );
    this.saveConnectors(rootPath, updated);
    return {
      ok,
      message,
      connector: updated.find((item) => item.id === connectorId) as PlatformConnector
    };
  }

  async runTool(rootPath: string, toolId: string) {
    const assets = this.loadAssets(rootPath);
    const tool = assets.tools.find((item) => item.id === toolId);
    if (!tool) {
      throw new Error('未找到脚本工具。');
    }
    if (!tool.enabled) {
      throw new Error('脚本工具已禁用。');
    }
    if (!commandExists(tool.command)) {
      throw new Error('脚本工具命令不可用。');
    }
    const cwd = path.isAbsolute(tool.cwd) ? tool.cwd : path.resolve(rootPath, tool.cwd || '.');
    if (!fs.existsSync(cwd)) {
      throw new Error('脚本工具工作目录不存在。');
    }
    if (!relativeInside(rootPath, cwd)) {
      throw new Error('脚本工具工作目录必须位于当前工程内。');
    }

    const startedAt = Date.now();
    const result = await new Promise<PlatformToolRunResult>((resolve) => {
      const child = spawn(tool.command, tool.args, {
        cwd,
        shell: false,
        windowsHide: true
      });
      let stdout = '';
      let stderr = '';
      const stdoutState = { truncated: false };
      const stderrState = { truncated: false };
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, Math.max(500, tool.timeoutMs || 5000));

      child.stdout.on('data', (chunk) => {
        stdout = appendBoundedOutput(stdout, chunk, stdoutState);
      });
      child.stderr.on('data', (chunk) => {
        stderr = appendBoundedOutput(stderr, chunk, stderrState);
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          exitCode: null,
          stdout,
          stderr: appendBoundedOutput(stderr, error.message, stderrState),
          durationMs: Date.now() - startedAt,
          timedOut
        });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          ok: !timedOut && code === 0,
          exitCode: code,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
          timedOut
        });
      });
    });

    const ranAt = new Date().toISOString();
    const updatedTools = assets.tools.map((item) =>
      item.id === toolId
        ? this.normalizeTool({
            ...item,
            lastCheckedAt: ranAt,
            health: result.ok ? 'healthy' : 'error',
            lastError: result.ok ? undefined : (result.stderr.trim() || '工具执行失败。'),
            diagnostic: diagnostic(
              result.ok ? 'healthy' : 'error',
              result.ok ? 'TOOL_READY' : 'TOOL_RUN_FAILED',
              result.ok ? '工具测试通过。' : (result.stderr.trim() || '工具执行失败。'),
              ranAt,
              [`exitCode=${result.exitCode ?? 'null'}`, `timedOut=${String(result.timedOut)}`]
            ),
            lastRun: {
              ranAt,
              ok: result.ok,
              exitCode: result.exitCode,
              durationMs: result.durationMs,
              timedOut: result.timedOut,
              stdoutPreview: result.stdout.slice(0, 240),
              stderrPreview: result.stderr.slice(0, 240)
            }
          }, assets.connectors)
        : item
    );
    this.saveTools(rootPath, updatedTools);

    return {
      tool: updatedTools.find((item) => item.id === toolId) as ControlledScriptTool,
      result
    };
  }

  resolveRoleRuntimeBundle(
    rootPath: string,
    roleId: string,
    nodeBindings?: {
      connectorId?: string;
      toolId?: string;
      toolIds?: string[];
      skillIds?: string[];
    }
  ): ResolvedRoleRuntimeBundle {
    const assets = this.loadAssets(rootPath);
    const role = assets.roles.find((item) => item.id === roleId);
    if (!role) {
      throw new Error(`未找到角色：${roleId}`);
    }

    const roleDir = role.packageRoot ?? this.syncRolePackageDirectory(rootPath, role);
    const snapshot = loadRolePackageDirectory(roleDir);
    const defaultSkillIds = Array.from(new Set(snapshot.defaultSkillIds));
    const effectiveSkillIds = Array.from(new Set([
      ...defaultSkillIds,
      ...((nodeBindings?.skillIds ?? []).filter(Boolean))
    ]));
    const boundToolIds = Array.from(new Set([
      ...(nodeBindings?.toolId ? [nodeBindings.toolId] : []),
      ...(nodeBindings?.toolIds ?? [])
    ].filter(Boolean)));
    const allowedCapabilities = Array.from(new Set(resolveNodeCapabilityIds(
      {
        ...role,
        allowedCapabilities: snapshot.allowedCapabilities.length ? snapshot.allowedCapabilities : role.allowedCapabilities
      },
      {
        connectorId: nodeBindings?.connectorId,
        toolId: nodeBindings?.toolId,
        toolIds: nodeBindings?.toolIds
      }
    )));

    const diagnostics = [...snapshot.issues];
    if (nodeBindings?.connectorId) {
      const connectorState = connectorBindingState(assets.connectors.find((item) => item.id === nodeBindings.connectorId));
      if (!connectorState.ready && connectorState.reason) {
        diagnostics.push({
          code: 'ROLE_BUNDLE_CONNECTOR_UNAVAILABLE',
          severity: 'error',
          message: connectorState.reason
        });
      }
    }
    for (const toolId of boundToolIds) {
      const toolState = toolBindingState(assets.tools.find((item) => item.id === toolId), assets.connectors);
      if (!toolState.ready && toolState.reason) {
        diagnostics.push({
          code: 'ROLE_BUNDLE_TOOL_UNAVAILABLE',
          severity: 'error',
          message: `${toolId}: ${toolState.reason}`
        });
      }
    }

    return {
      roleId: role.id,
      roleName: role.name,
      packageRoot: roleDir,
      packageVersion: snapshot.rolePackage.version,
      packageStatus: computeRolePackageStatus(role),
      packageHealth: roleHealthFromIssues(snapshot.issues),
      promptHint: [snapshot.sections.identity, snapshot.sections.soul, snapshot.sections.agents].filter(Boolean).join('\n\n'),
      sections: snapshot.sections,
      defaultSkillIds,
      effectiveSkillIds,
      allowedCapabilities,
      boundConnectorId: nodeBindings?.connectorId,
      boundToolIds,
      modelPolicy: snapshot.modelPolicy ?? role.modelPolicy,
      diagnostics,
      sourceMap: {
        sections: 'package',
        modelPolicy: 'package',
        skillIds: nodeBindings?.skillIds?.length ? 'node' : 'package',
        capabilities: nodeBindings?.connectorId || boundToolIds.length ? 'node' : 'package'
      }
    };
  }

  private loadFlowDir(dirPath: string, kind: PlatformFlowAsset['kind']) {
    if (!fs.existsSync(dirPath)) return [];
    const rootPath = path.dirname(path.dirname(path.dirname(dirPath)));
    return fs.readdirSync(dirPath)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => readJsonSafe<PlatformFlowAsset | null>(path.join(dirPath, entry), null))
      .filter((item): item is PlatformFlowAsset => Boolean(item))
      .map((item) => normalizeFlowAssetPaths(rootPath, {
        ...item,
        kind,
        pathConfig: item.pathConfig ?? defaultFlowPathConfig()
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

  private writeFlowHistory(rootPath: string, flow: PlatformFlowAsset, label: string) {
    const createdAt = new Date().toISOString();
    const metadata: FlowHistoryEntry = {
      id: `${createdAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`,
      flowId: flow.id,
      kind: flow.kind,
      createdAt,
      label,
      summary: `${flow.name} · 节点 ${flow.nodes.length} · 连线 ${flow.edges.length}`,
      nodeCount: flow.nodes.length,
      edgeCount: flow.edges.length
    };
    writeJson(path.join(historyDir(rootPath, flow.kind, flow.id), `${metadata.id}.json`), {
      metadata,
      flow
    });
    return metadata;
  }
}
