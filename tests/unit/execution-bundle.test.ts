import { describe, expect, it } from 'vitest';

describe('execution bundle assembly', () => {
  it('assembles role, task, agent, and node overrides into one effective bundle', async () => {
    const { assembleExecutionBundle } = await import('../../src/shared/execution-bundle.js');

    const bundle = assembleExecutionBundle({
      roleProfile: {
        id: 'role-review',
        identity: {
          name: '审查官',
          description: '审查变更',
          domain: 'review'
        },
        principles: [],
        focusAreas: [],
        packageSections: {
          identity: '',
          soul: '',
          agents: '',
          user: '',
          memory: ''
        }
      },
      taskTemplate: {
        id: 'task-review',
        name: '回归审查',
        objective: '判断当前变更是否存在回归风险',
        inputContract: {},
        outputContract: {
          format: 'markdown'
        },
        recommendedSkillIds: ['regression-risk-check'],
        requiredCapabilities: ['read_artifact']
      },
      agentProfile: {
        id: 'agent-review',
        name: 'Review Agent',
        roleProfileId: 'role-review',
        defaultSkillBundle: ['verification-before-completion'],
        capabilityPolicy: {
          allowedCapabilities: ['read_artifact']
        },
        modelPolicy: {
          mode: 'fallback_to_active',
          preferredProfileIds: [],
          fallbackToActive: true
        },
        dependencySpec: []
      },
      nodeOverrides: {
        skillIds: ['review-skill']
      }
    });

    expect(bundle.effectiveSkillIds.sort()).toEqual([
      'regression-risk-check',
      'review-skill',
      'verification-before-completion'
    ]);
    expect(bundle.sourceMap.skillIds).toBe('node');
    expect(bundle.allowedCapabilities).toEqual(['read_artifact']);
  });
});
