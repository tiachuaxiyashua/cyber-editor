import { describe, expect, it } from 'vitest';
import { runConsistencyCheck } from '../../src/shared/consistency.js';

describe('runConsistencyCheck', () => {
  it('reports missing required documents and missing installed skills', () => {
    const findings = runConsistencyCheck({
      project: {
        rootPath: 'E:/project',
        manifest: {
          name: 'demo',
          rootPath: 'E:/project',
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
          version: '0.1.0'
        },
        workflow: {
          stage: 'plan',
          confirmedStages: ['discover'],
          activeDocumentPath: 'E:/project/01-requirements/02-需求澄清.md'
        },
        template: null,
        tree: [
          {
            name: '01-requirements',
            path: 'E:/project/01-requirements',
            type: 'directory',
            children: [
              {
                name: '01-原始需求.md',
                path: 'E:/project/01-requirements/01-原始需求.md',
                type: 'file'
              }
            ]
          }
        ]
      },
      requiredPaths: [
        'E:/project/01-requirements/01-原始需求.md',
        'E:/project/02-solution/01-技术方案.md'
      ],
      projectSkillIds: ['solution-planner'],
      sessionSkillIds: { session1: ['missing-skill'] },
      installedSkillIds: []
    });

    expect(findings.some((item) => item.id.includes('missing:E:/project/02-solution/01-技术方案.md'))).toBe(true);
    expect(findings.some((item) => item.id.includes('project-skill:solution-planner'))).toBe(true);
    expect(findings.some((item) => item.id.includes('session-skill:session1:missing-skill'))).toBe(true);
  });
});
