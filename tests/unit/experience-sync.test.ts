import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildExperienceSyncPlan } from '../../src/main/services/experience-sync.js';
import { RulesDistillationService } from '../../src/main/services/rules-distillation-service.js';

const roots: string[] = [];
const previousUserData = process.env.CYBER_EDITOR_USER_DATA;

function createTempDir(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

describe('experience sync', () => {
  afterEach(() => {
    process.env.CYBER_EDITOR_USER_DATA = previousUserData;
    while (roots.length) {
      fs.rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  it('builds a deterministic sync plan from napkin-style markdown', () => {
    const markdown = [
      '## Corrections',
      '| Date | Source | What Went Wrong | What To Do Instead |',
      '|------|--------|-----------------|-------------------|',
      '| 2026-04-16 | self | The workflow looked green because only file existence was checked. | Require runtime evidence and artifact quality before calling the run complete. |',
      '',
      '## User Preferences',
      '- The user wants Cyber Editor outputs to stay local, auditable, and document-first.',
      '',
      '## Domain Notes',
      '- Cyber Editor is an orchestration-first desktop workbench rather than a generic landing page.',
      ''
    ].join('\n');

    const plan = buildExperienceSyncPlan(markdown, 'E:/repo/.scratch/napkin.md');
    expect(plan.lessonCount).toBe(3);
    expect(plan.accumulationEntries).toHaveLength(3);
    expect(plan.globalRules.length).toBe(1);
    expect(plan.projectRules.length).toBe(2);
    expect(plan.nodeRules.length).toBe(0);
    expect(plan.globalRules[0]?.source).toBe('sync');
    expect(plan.globalRules[0]?.enabled).toBe(false);
    expect(plan.accumulationEntries.every((entry) => entry.tags.includes('auto-synced'))).toBe(true);
  });

  it('still ingests correction rows appended outside the Corrections heading block', () => {
    const markdown = [
      '## Session Notes 2026-04-16',
      '- A normal note.',
      '',
      '| 2026-04-16 | self | The parser missed tail correction rows. | Parse correction-table rows anywhere in the napkin, not only inside the Corrections heading. |',
      ''
    ].join('\n');

    const plan = buildExperienceSyncPlan(markdown, 'E:/repo/.scratch/napkin.md');
    expect(plan.lessonCount).toBe(2);
    expect(plan.accumulationEntries.some((entry) => entry.details?.includes('tail correction rows'))).toBe(true);
  });

  it('syncs napkin experience into workspace global, project, node, and accumulation stores', () => {
    const userDataRoot = createTempDir('cyber-editor-rules-userdata-');
    const projectRoot = createTempDir('cyber-editor-rules-project-');
    process.env.CYBER_EDITOR_USER_DATA = userDataRoot;
    const napkinDir = path.join(projectRoot, '.scratch');
    const platformDir = path.join(projectRoot, '.project', 'platform');
    fs.mkdirSync(napkinDir, { recursive: true });
    fs.mkdirSync(path.join(platformDir, 'flows'), { recursive: true });
    fs.mkdirSync(path.join(platformDir, 'subflows'), { recursive: true });
    fs.writeFileSync(path.join(napkinDir, 'napkin.md'), [
      '## Corrections',
      '| Date | Source | What Went Wrong | What To Do Instead |',
      '|------|--------|-----------------|-------------------|',
      '| 2026-04-16 | self | The review subflow ended with scattered notes only. | Review nodes must produce an adoption summary with actions, risks, and explicit conclusion. |',
      '| 2026-04-16 | self | Packaging was called complete without runtime evidence. | Require runtime evidence and regression checks before marking the change complete. |',
      '',
      '## User Preferences',
      '- The user wants Cyber Editor to stay document-first and local-delivery-first.',
      ''
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(platformDir, 'template.json'), JSON.stringify({
      id: 'sync-template',
      name: 'Sync Template',
      description: 'sync',
      icon: 'workflow',
      category: 'product',
      source: 'local',
      selectedAt: '2026-04-17T00:00:00.000Z'
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(platformDir, 'roles.json'), '[]', 'utf8');
    fs.writeFileSync(path.join(platformDir, 'connectors.json'), '[]', 'utf8');
    fs.writeFileSync(path.join(platformDir, 'tools.json'), '[]', 'utf8');
    fs.writeFileSync(path.join(platformDir, 'flows', 'review-main.json'), JSON.stringify({
      id: 'review-main',
      kind: 'flow',
      name: 'Review Main Flow',
      description: 'flow for review adoption',
      createdAt: '2026-04-17T00:00:00.000Z',
      updatedAt: '2026-04-17T00:00:00.000Z',
      nodes: [
        {
          id: 'review-summary-node',
          type: 'subflow',
          position: { x: 0, y: 0 },
          data: {
            label: '审查汇总',
            description: '输出采纳结论、风险与下一步动作'
          }
        }
      ],
      edges: []
    }, null, 2), 'utf8');

    const service = new RulesDistillationService();
    const synced = service.syncExperienceSources(projectRoot);

    expect(synced.lessonCount).toBe(3);
    expect(synced.globalRuleCount).toBe(1);
    expect(synced.projectRuleCount).toBe(1);
    expect(synced.nodeRuleCount).toBe(1);
    expect(synced.accumulationEntryCount).toBe(3);

    const snapshot = service.getSnapshot(projectRoot);
    expect(snapshot.globalRules.some((rule) => rule.source === 'sync')).toBe(true);
    expect(snapshot.projectRules.some((rule) => rule.source === 'sync')).toBe(true);
    expect(snapshot.nodeRules.some((rule) => rule.flowId === 'review-main' && rule.nodeId === 'review-summary-node')).toBe(true);
    expect(snapshot.accumulationEntries.filter((entry) => entry.tags.includes('auto-synced'))).toHaveLength(3);
    expect(fs.existsSync(path.join(projectRoot, '.project', 'runtime', 'rules-distillation', 'global-rules.json'))).toBe(true);
  });

  it('binds node-scoped experience rules against the project flow graph instead of software-factory ids', () => {
    const userDataRoot = createTempDir('cyber-editor-rules-userdata-');
    const projectRoot = createTempDir('cyber-editor-rules-project-');
    process.env.CYBER_EDITOR_USER_DATA = userDataRoot;

    const napkinDir = path.join(projectRoot, '.scratch');
    const platformDir = path.join(projectRoot, '.project', 'platform');
    fs.mkdirSync(napkinDir, { recursive: true });
    fs.mkdirSync(path.join(platformDir, 'flows'), { recursive: true });
    fs.mkdirSync(path.join(platformDir, 'subflows'), { recursive: true });
    fs.writeFileSync(path.join(napkinDir, 'napkin.md'), [
      '## Corrections',
      '| Date | Source | What Went Wrong | What To Do Instead |',
      '|------|--------|-----------------|-------------------|',
      '| 2026-04-16 | self | The review summary stayed too scattered. | Review nodes must produce a single decision summary with actions and risks. |',
      ''
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(platformDir, 'template.json'), JSON.stringify({
      id: 'custom-template',
      name: 'Custom Template',
      description: 'custom',
      icon: 'workflow',
      category: 'product',
      source: 'local',
      selectedAt: '2026-04-17T00:00:00.000Z'
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(platformDir, 'roles.json'), '[]', 'utf8');
    fs.writeFileSync(path.join(platformDir, 'connectors.json'), '[]', 'utf8');
    fs.writeFileSync(path.join(platformDir, 'tools.json'), '[]', 'utf8');
    fs.writeFileSync(path.join(platformDir, 'flows', 'custom-main.json'), JSON.stringify({
      id: 'custom-main',
      kind: 'flow',
      name: 'Custom Main Flow',
      description: 'custom flow',
      createdAt: '2026-04-17T00:00:00.000Z',
      updatedAt: '2026-04-17T00:00:00.000Z',
      nodes: [
        {
          id: 'custom-review-node',
          type: 'subflow',
          position: { x: 0, y: 0 },
          data: {
            label: '审查汇总',
            description: '输出统一审查结论和下一步动作'
          }
        }
      ],
      edges: []
    }, null, 2), 'utf8');

    const service = new RulesDistillationService();
    const synced = service.syncExperienceSources(projectRoot);

    expect(synced.nodeRuleCount).toBe(1);
    const snapshot = service.getSnapshot(projectRoot);
    expect(snapshot.nodeRules.some((rule) => rule.flowId === 'custom-main' && rule.nodeId === 'custom-review-node')).toBe(true);
    expect(snapshot.nodeRules.some((rule) => rule.nodeId === 'sf-main-review')).toBe(false);
  });

  it('rejects sync sources that resolve outside the active project root', () => {
    const projectRoot = createTempDir('cyber-editor-rules-project-');
    const outsideRoot = createTempDir('cyber-editor-rules-outside-');
    const sourcePath = path.join(outsideRoot, 'napkin.md');
    fs.writeFileSync(sourcePath, '# outside\n', 'utf8');

    const service = new RulesDistillationService();

    expect(() => service.syncExperienceSources(projectRoot, sourcePath)).toThrow('must stay inside the active project');
  });

  it('prefers template-owned experience bindings over generic defaults when provided', () => {
    const markdown = [
      '## Corrections',
      '| Date | Source | What Went Wrong | What To Do Instead |',
      '|------|--------|-----------------|-------------------|',
      '| 2026-04-16 | self | The storyboard summary was scattered. | Storyboard synthesis nodes must produce one summary with shot order and decision notes. |',
      ''
    ].join('\n');

    const plan = buildExperienceSyncPlan(
      markdown,
      'E:/repo/.scratch/napkin.md',
      {
        flows: [
          {
            id: 'story-main',
            kind: 'flow',
            name: 'Story Main',
            description: 'story planning',
            createdAt: '2026-04-17T00:00:00.000Z',
            updatedAt: '2026-04-17T00:00:00.000Z',
            nodes: [
              {
                id: 'storyboard-synthesis',
                type: 'subflow',
                position: { x: 0, y: 0 },
                data: {
                  label: '镜头整合',
                  description: '输出镜头顺序与决策总结'
                }
              }
            ],
            edges: []
          }
        ],
        subflows: [],
        roles: []
      },
      [
        {
          id: 'storyboard',
          targetKey: 'experience.storyboard',
          priority: 93,
          keywords: ['storyboard', 'shot order', '镜头', 'shot', '决策总结'],
          preferredNodeTypes: ['subflow']
        }
      ]
    );

    expect(plan.nodeRules).toHaveLength(1);
    expect(plan.nodeRules[0]?.targetKey).toBe('experience.storyboard');
    expect(plan.nodeRules[0]?.flowId).toBe('story-main');
    expect(plan.nodeRules[0]?.nodeId).toBe('storyboard-synthesis');
  });
});
