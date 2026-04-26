import type { PlatformModelPolicy, PlatformRole } from './types';

export type DependencyKind = 'skill' | 'plugin' | 'connector' | 'mcp_server';
export type DependencyInstallMode = 'embedded' | 'builtin' | 'registry' | 'url';
export type DependencyInstallState = 'installed' | 'skipped' | 'failed' | 'missing';

export type DependencySpecItem = {
  id: string;
  kind: DependencyKind;
  required: boolean;
  installMode: DependencyInstallMode;
  source?: string;
  version?: string;
};

export type DependencyInstallRecord = DependencySpecItem & {
  state: DependencyInstallState;
  message?: string;
};

export type DependencyInstallSummary = {
  skills: DependencyInstallRecord[];
  plugins: DependencyInstallRecord[];
  connectors: DependencyInstallRecord[];
  mcpServers: DependencyInstallRecord[];
};

export type RoleProfile = {
  id: string;
  identity: {
    name: string;
    domain?: string;
    description: string;
  };
  principles: string[];
  focusAreas: string[];
  packageSections: {
    identity: string;
    soul: string;
    agents: string;
    user: string;
    memory: string;
  };
};

export type TaskTemplate = {
  id: string;
  name: string;
  objective: string;
  inputContract: {
    requiredArtifacts?: string[];
    requiredMessages?: string[];
  };
  outputContract: {
    format: 'markdown' | 'json' | 'text' | 'table';
    validatorId?: string;
  };
  recommendedSkillIds?: string[];
  requiredCapabilities?: string[];
};

export type AgentProfile = {
  id: string;
  name: string;
  roleProfileId: string;
  defaultSkillBundle?: string[];
  capabilityPolicy: {
    allowedCapabilities?: string[];
  };
  modelPolicy: PlatformModelPolicy;
  dependencySpec?: DependencySpecItem[];
};

export type EffectiveExecutionBundle = {
  roleProfileId: string;
  taskTemplateId?: string;
  agentProfileId?: string;
  effectiveSkillIds: string[];
  allowedCapabilities: string[];
  modelPolicy: PlatformModelPolicy;
  sourceMap: Record<string, 'role' | 'task' | 'agent' | 'node'>;
};

export function createEmptyDependencySummary(): DependencyInstallSummary {
  return {
    skills: [],
    plugins: [],
    connectors: [],
    mcpServers: []
  };
}

export function summarizeDependencyInstallResults(results: DependencyInstallRecord[]): DependencyInstallSummary {
  const summary = createEmptyDependencySummary();
  for (const result of results) {
    if (result.kind === 'skill') {
      summary.skills.push(result);
      continue;
    }
    if (result.kind === 'plugin') {
      summary.plugins.push(result);
      continue;
    }
    if (result.kind === 'connector') {
      summary.connectors.push(result);
      continue;
    }
    summary.mcpServers.push(result);
  }
  return summary;
}

export function hasRequiredDependencyFailure(results: DependencyInstallRecord[]) {
  return results.some((result) => result.required && (result.state === 'failed' || result.state === 'missing'));
}

export function normalizeTaskTemplate(task: TaskTemplate): TaskTemplate {
  return {
    ...task,
    recommendedSkillIds: Array.from(new Set((task.recommendedSkillIds ?? []).filter(Boolean))),
    requiredCapabilities: Array.from(new Set((task.requiredCapabilities ?? []).filter(Boolean)))
  };
}

export function normalizeAgentProfile(profile: AgentProfile): AgentProfile {
  return {
    ...profile,
    defaultSkillBundle: Array.from(new Set((profile.defaultSkillBundle ?? []).filter(Boolean))),
    capabilityPolicy: {
      allowedCapabilities: Array.from(new Set((profile.capabilityPolicy.allowedCapabilities ?? []).filter(Boolean)))
    },
    dependencySpec: (profile.dependencySpec ?? []).map((item) => ({
      ...item
    }))
  };
}

export function migrateLegacyRoleToRoleProfile(role: PlatformRole) {
  const roleProfile: RoleProfile = {
    id: role.id,
    identity: {
      name: role.name,
      domain: role.domain,
      description: role.description
    },
    principles: [],
    focusAreas: [],
    packageSections: {
      identity: role.packageSections?.identity ?? '',
      soul: role.packageSections?.soul ?? '',
      agents: role.packageSections?.agents ?? '',
      user: role.packageSections?.user ?? '',
      memory: role.packageSections?.memory ?? ''
    }
  };

  const agentProfile: AgentProfile = normalizeAgentProfile({
    id: `${role.id}-default-profile`,
    name: `${role.name} Default Profile`,
    roleProfileId: role.id,
    defaultSkillBundle: role.allowedSkillIds ?? [],
    capabilityPolicy: {
      allowedCapabilities: role.allowedCapabilities
    },
    modelPolicy: role.modelPolicy,
    dependencySpec: []
  });

  return { roleProfile, agentProfile };
}
