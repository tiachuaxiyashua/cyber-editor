import type {
  AgentProfile,
  AppStage,
  ControlledScriptTool,
  PlatformConnector,
  PlatformFlowAsset,
  PlatformModelPolicy,
  PlatformRole,
  RuntimeTemplateAsset,
  RuntimeTemplateStageDocument,
  TaskTemplate
} from '../../../shared/types';

export type TemplateArtifactItem = RuntimeTemplateStageDocument & {
  id: string;
  stage: AppStage;
};

export type RoleCreatorDraft = {
  name: string;
  domain: string;
  description: string;
  identity: string;
  soul: string;
  agents: string;
  user: string;
  memory: string;
  allowedSkillIds: string[];
  modelPolicy: PlatformModelPolicy;
};

export function flattenTemplateArtifacts(runtimeTemplate: RuntimeTemplateAsset | null): TemplateArtifactItem[] {
  if (!runtimeTemplate) return [];
  return (Object.entries(runtimeTemplate.stageDocuments) as Array<[AppStage, RuntimeTemplateAsset['stageDocuments'][AppStage]]>)
    .flatMap(([stage, docs]) =>
      docs.map((doc) => ({
        id: `${stage}:${doc.path}`,
        stage,
        path: doc.path,
        title: doc.title,
        purpose: doc.purpose,
        promptProfileId: doc.promptProfileId,
        validatorId: doc.validatorId
      }))
    );
}

export function createEmptyFlow(kind: PlatformFlowAsset['kind'], name: string): PlatformFlowAsset {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    kind,
    name,
    description: '',
    createdAt: now,
    updatedAt: now,
    roleIds: [],
    nodes: [
      {
        id: crypto.randomUUID(),
        type: 'start',
        position: { x: 80, y: 120 },
        data: { label: '开始' }
      },
      {
        id: crypto.randomUUID(),
        type: 'end',
        position: { x: 360, y: 120 },
        data: { label: '结束' }
      }
    ],
    edges: []
  };
}

export function createEmptyRole(index: number): PlatformRole {
  return {
    id: crypto.randomUUID(),
    name: `新角色 ${index}`,
    domain: '',
    description: '',
    packageSections: {
      identity: '',
      soul: '',
      agents: '',
      user: '',
      memory: ''
    },
    packageStatus: 'incomplete',
    responsibilities: [],
    promptHint: '',
    allowedSkillIds: [],
    allowedCapabilities: ['read_artifact'],
    outputSchema: 'markdown',
    outputFormat: 'markdown',
    modelPolicy: {
      mode: 'fallback_to_active',
      preferredProfileIds: [],
      fallbackToActive: true,
      note: ''
    }
  };
}

export function rolePackageStatusForSections(role: Pick<PlatformRole, 'name' | 'packageSections'>): PlatformRole['packageStatus'] {
  const sections = role.packageSections;
  if (!role.name.trim() || !sections?.identity.trim() || !sections?.agents.trim()) {
    return 'incomplete';
  }
  return sections.soul.trim() && sections.user.trim() ? 'complete' : 'incomplete';
}

export function createRoleCreatorDraft(index: number): RoleCreatorDraft {
  return {
    name: `新角色 ${index}`,
    domain: '',
    description: '',
    identity: '',
    soul: '',
    agents: '',
    user: '',
    memory: '',
    allowedSkillIds: [],
    modelPolicy: {
      mode: 'fallback_to_active',
      preferredProfileIds: [],
      fallbackToActive: true,
      note: ''
    }
  };
}

export function roleFromCreatorDraft(id: string, draft: RoleCreatorDraft): PlatformRole {
  const nextRole: PlatformRole = {
    id,
    name: draft.name.trim() || '未命名角色',
    domain: draft.domain.trim() || undefined,
    description: draft.description.trim(),
    responsibilities: [],
    packageSections: {
      identity: draft.identity.trim(),
      soul: draft.soul.trim(),
      agents: draft.agents.trim(),
      user: draft.user.trim(),
      memory: draft.memory.trim()
    },
    promptHint: [draft.identity.trim(), draft.soul.trim(), draft.agents.trim()].filter(Boolean).join('\n\n'),
    allowedSkillIds: [...draft.allowedSkillIds],
    allowedCapabilities: ['read_artifact'],
    outputSchema: 'markdown',
    outputFormat: 'markdown',
    modelPolicy: {
      ...draft.modelPolicy,
      preferredProfileIds: [...draft.modelPolicy.preferredProfileIds]
    },
    packageStatus: 'incomplete'
  };
  nextRole.packageStatus = rolePackageStatusForSections(nextRole);
  return nextRole;
}

export function createEmptyConnector(index: number): PlatformConnector {
  return {
    id: crypto.randomUUID(),
    name: `新连接 ${index}`,
    description: '',
    scope: 'local',
    transport: 'stdio',
    args: [],
    enabled: true,
    health: 'unknown'
  };
}

export function createEmptyTool(index: number): ControlledScriptTool {
  return {
    id: crypto.randomUUID(),
    name: `新工具 ${index}`,
    description: '',
    command: 'node',
    args: [],
    cwd: '.',
    timeoutMs: 5000,
    enabled: true
  };
}

export function createEmptyTaskTemplate(index: number): TaskTemplate {
  return {
    id: crypto.randomUUID(),
    name: `任务模板 ${index}`,
    objective: '',
    inputContract: {},
    outputContract: {
      format: 'markdown'
    },
    recommendedSkillIds: [],
    requiredCapabilities: []
  };
}

export function createEmptyAgentProfile(index: number, roleProfileId?: string): AgentProfile {
  return {
    id: crypto.randomUUID(),
    name: `执行配置 ${index}`,
    roleProfileId: roleProfileId ?? '',
    defaultSkillBundle: [],
    capabilityPolicy: {
      allowedCapabilities: []
    },
    modelPolicy: {
      mode: 'fallback_to_active',
      preferredProfileIds: [],
      fallbackToActive: true,
      note: ''
    },
    dependencySpec: []
  };
}
