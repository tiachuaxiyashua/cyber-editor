import type {
  ControlledScriptTool,
  PlatformConnector,
  PlatformFlowNodeData,
  PlatformRole,
  ResourceCompatibilityState,
  ResourceHealthState
} from './types';

type BindingState = {
  ready: boolean;
  reason?: string;
};

const DEFAULT_ROLE_SECTIONS: Required<NonNullable<PlatformRole['packageSections']>> = {
  identity: '',
  soul: '',
  agents: '',
  user: '',
  memory: ''
};

function nonEmpty(value?: string) {
  return Boolean(value?.trim());
}

export function ensureRolePackageSections(
  role: Pick<PlatformRole, 'name' | 'description' | 'promptHint' | 'packageSections'>
): Required<NonNullable<PlatformRole['packageSections']>> {
  const sections = role.packageSections ?? DEFAULT_ROLE_SECTIONS;
  const promptHint = role.promptHint?.trim() ?? '';
  const description = role.description?.trim() ?? '';
  const identity = sections.identity?.trim() || `# ${role.name}\n${description || promptHint || role.name}`;
  const soul = sections.soul?.trim() || promptHint || description;
  const agents = sections.agents?.trim() || promptHint || `- Focus: ${role.name}`;
  const user = sections.user?.trim() || `面向需要 ${role.name} 支持的用户。`;
  const memory = sections.memory?.trim() || '';
  return {
    identity,
    soul,
    agents,
    user,
    memory
  };
}

export function computeRolePackageStatus(
  role: Pick<PlatformRole, 'name' | 'packageSections' | 'promptHint' | 'description'>
): NonNullable<PlatformRole['packageStatus']> {
  const sections = ensureRolePackageSections(role);
  if (!role.name.trim() || !nonEmpty(sections.identity) || !nonEmpty(sections.agents)) {
    return 'incomplete';
  }
  return nonEmpty(sections.soul) && nonEmpty(sections.user) ? 'complete' : 'incomplete';
}

export function connectorCapabilityId(connectorId: string) {
  return `connector:${connectorId}`;
}

export function scriptCapabilityId(toolId: string) {
  return `script:${toolId}`;
}

function incompatible(compatibility?: ResourceCompatibilityState) {
  return compatibility === 'incompatible';
}

export function roleBindingState(role: PlatformRole | null | undefined): BindingState {
  if (!role) {
    return { ready: false, reason: '未绑定角色。' };
  }
  if (role.packageHealth === 'corrupt') {
    return { ready: false, reason: role.packageIssueMessage || '角色包已损坏。' };
  }
  if ((role.packageStatus ?? computeRolePackageStatus(role)) !== 'complete') {
    return { ready: false, reason: '角色包尚未完整。' };
  }
  return { ready: true };
}

export function connectorBindingState(connector: PlatformConnector | null | undefined): BindingState {
  if (!connector) {
    return { ready: false, reason: '未绑定连接。' };
  }
  if (!connector.enabled) {
    return { ready: false, reason: '连接已禁用。' };
  }
  if (incompatible(connector.compatibility)) {
    return { ready: false, reason: connector.diagnostic?.summary || '连接当前不兼容。' };
  }
  if (connector.authStatus === 'missing') {
    return { ready: false, reason: connector.diagnostic?.summary || '连接缺少授权。' };
  }
  if (connector.health !== 'healthy') {
    return {
      ready: false,
      reason: connector.diagnostic?.summary
        || connector.lastError
        || (connector.health === 'unknown' ? '连接尚未测试。' : '连接不可用。')
    };
  }
  return { ready: true };
}

export function toolBindingState(
  tool: ControlledScriptTool | null | undefined,
  connectors: PlatformConnector[]
): BindingState {
  if (!tool) {
    return { ready: false, reason: '未绑定工具。' };
  }
  if (!tool.enabled) {
    return { ready: false, reason: '工具已禁用。' };
  }
  if ((tool.health ?? 'unknown') !== 'healthy') {
    return {
      ready: false,
      reason: tool.diagnostic?.summary
        || tool.lastError
        || ((tool.health ?? 'unknown') === 'unknown' ? '工具尚未测试。' : '工具不可用。')
    };
  }
  if (tool.connectorId) {
    const connectorState = connectorBindingState(connectors.find((item) => item.id === tool.connectorId));
    if (!connectorState.ready) {
      return {
        ready: false,
        reason: connectorState.reason ? `工具依赖的连接不可用：${connectorState.reason}` : '工具依赖的连接不可用。'
      };
    }
  }
  return { ready: true };
}

export function resolveNodeCapabilityIds(
  role: PlatformRole,
  nodeData: Pick<PlatformFlowNodeData, 'connectorId' | 'toolId' | 'toolIds'>
) {
  const ids = new Set(role.allowedCapabilities ?? []);
  if (nodeData.connectorId) {
    ids.add(connectorCapabilityId(nodeData.connectorId));
  }
  if (nodeData.toolId) {
    ids.add(scriptCapabilityId(nodeData.toolId));
  }
  for (const toolId of nodeData.toolIds ?? []) {
    if (toolId) {
      ids.add(scriptCapabilityId(toolId));
    }
  }
  return Array.from(ids);
}

export function summarizeBindingHealth(
  health: ResourceHealthState | 'unknown' | 'healthy' | 'warning' | 'error' | undefined
) {
  switch (health) {
    case 'healthy':
      return '正常';
    case 'warning':
      return '警告';
    case 'error':
      return '异常';
    case 'corrupt':
      return '损坏';
    default:
      return '未完成';
  }
}
