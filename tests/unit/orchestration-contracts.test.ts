import { describe, expect, it } from 'vitest';
import type { PlatformRole } from '../../src/shared/types.js';

describe('workflow-centric orchestration contracts', () => {
  it('migrates a legacy PlatformRole into a role profile and default agent profile', async () => {
    const {
      migrateLegacyRoleToRoleProfile
    } = await import('../../src/shared/orchestration-contracts.js');

    const legacyRole: PlatformRole = {
      id: 'planner-role',
      name: 'Planner',
      description: 'Plans work',
      promptHint: 'Plan carefully.',
      allowedSkillIds: ['outline-skill'],
      allowedCapabilities: ['read_artifact'],
      outputSchema: 'markdown',
      outputFormat: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };

    const migrated = migrateLegacyRoleToRoleProfile(legacyRole);

    expect(migrated.roleProfile.id).toBe('planner-role');
    expect(migrated.roleProfile.identity.name).toBe('Planner');
    expect(migrated.agentProfile.defaultSkillBundle).toEqual(['outline-skill']);
    expect(migrated.agentProfile.capabilityPolicy.allowedCapabilities).toEqual(['read_artifact']);
  });

  it('normalizes task templates with explicit contracts and default arrays', async () => {
    const {
      normalizeTaskTemplate
    } = await import('../../src/shared/orchestration-contracts.js');

    const task = normalizeTaskTemplate({
      id: 'task-review',
      name: '回归审查',
      objective: '判断当前变更是否存在回归风险',
      inputContract: {
        requiredArtifacts: ['docs/requirements.md']
      },
      outputContract: {
        format: 'markdown',
        validatorId: 'review-schema'
      }
    });

    expect(task.id).toBe('task-review');
    expect(task.outputContract.format).toBe('markdown');
    expect(task.recommendedSkillIds).toEqual([]);
    expect(task.requiredCapabilities).toEqual([]);
  });
});
