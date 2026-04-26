import type {
  AgentProfile,
  EffectiveExecutionBundle,
  RoleProfile,
  TaskTemplate
} from './orchestration-contracts';
import { normalizeAgentProfile, normalizeTaskTemplate } from './orchestration-contracts';

export function assembleExecutionBundle(input: {
  roleProfile: RoleProfile;
  taskTemplate?: TaskTemplate;
  agentProfile: AgentProfile;
  nodeOverrides?: {
    skillIds?: string[];
    connectorId?: string;
    toolId?: string;
    toolIds?: string[];
  };
}): EffectiveExecutionBundle {
  const taskTemplate = input.taskTemplate ? normalizeTaskTemplate(input.taskTemplate) : undefined;
  const agentProfile = normalizeAgentProfile(input.agentProfile);
  const nodeSkillIds = Array.from(new Set((input.nodeOverrides?.skillIds ?? []).filter(Boolean)));
  const effectiveSkillIds = Array.from(new Set([
    ...(agentProfile.defaultSkillBundle ?? []),
    ...(taskTemplate?.recommendedSkillIds ?? []),
    ...nodeSkillIds
  ]));
  const allowedCapabilities = Array.from(new Set([
    ...(agentProfile.capabilityPolicy.allowedCapabilities ?? []),
    ...(taskTemplate?.requiredCapabilities ?? [])
  ]));

  return {
    roleProfileId: input.roleProfile.id,
    taskTemplateId: taskTemplate?.id,
    agentProfileId: agentProfile.id,
    effectiveSkillIds,
    allowedCapabilities,
    modelPolicy: agentProfile.modelPolicy,
    sourceMap: {
      skillIds: nodeSkillIds.length ? 'node' : (taskTemplate?.recommendedSkillIds?.length ? 'task' : 'agent'),
      capabilities: taskTemplate?.requiredCapabilities?.length ? 'task' : 'agent',
      modelPolicy: 'agent'
    }
  };
}
