import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RulesDistillationService } from '../../src/main/services/rules-distillation-service.js';
import { BUILTIN_GLOBAL_RULES } from '../../src/shared/builtin-rules.js';

const roots: string[] = [];
const previousUserData = process.env.CYBER_EDITOR_USER_DATA;

function createTempDir(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

describe('RulesDistillationService', () => {
  afterEach(() => {
    process.env.CYBER_EDITOR_USER_DATA = previousUserData;
    while (roots.length) {
      fs.rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  it('persists global/project/node rules and supports import export', () => {
    const userDataRoot = createTempDir('cyber-editor-rules-userdata-');
    const projectRoot = createTempDir('cyber-editor-rules-project-');
    process.env.CYBER_EDITOR_USER_DATA = userDataRoot;
    const service = new RulesDistillationService();

    service.saveRule(null, {
      name: 'Global concise rule',
      body: 'Keep the output concise.',
      scope: 'global',
      targetKey: 'style'
    });
    service.saveRule(projectRoot, {
      name: 'Project structure rule',
      body: 'Output must keep numbered headings.',
      scope: 'project',
      targetKey: 'structure'
    });
    const snapshotAfterNode = service.saveRule(projectRoot, {
      name: 'Node review rule',
      body: 'This node must include a risk checklist.',
      scope: 'node',
      flowId: 'flow-main',
      nodeId: 'node-review',
      targetKey: 'review-shape'
    });

    expect(snapshotAfterNode.globalRules).toHaveLength(BUILTIN_GLOBAL_RULES.length + 1);
    expect(snapshotAfterNode.projectRules).toHaveLength(1);
    expect(snapshotAfterNode.nodeRules).toHaveLength(1);
    expect(snapshotAfterNode.globalRules.some((item) => item.id === 'builtin-global-no-false-green')).toBe(true);

    const exportPath = path.join(projectRoot, 'project-rules-export.json');
    const exported = service.exportRules(projectRoot, exportPath, 'project');
    expect(exported.count).toBe(1);
    expect(fs.existsSync(exportPath)).toBe(true);

    const importProject = createTempDir('cyber-editor-rules-import-project-');
    service.importRules(importProject, exportPath, 'project');
    expect(service.getSnapshot(importProject).projectRules).toHaveLength(1);
  });

  it('creates promotion drafts and rebuilds the project knowledge graph after applying them', () => {
    const userDataRoot = createTempDir('cyber-editor-rules-userdata-');
    const projectRoot = createTempDir('cyber-editor-rules-project-');
    process.env.CYBER_EDITOR_USER_DATA = userDataRoot;
    const service = new RulesDistillationService();

    service.saveAccumulationEntry(projectRoot, {
      title: 'Review habit',
      summary: 'Every review should finish with action items.',
      details: 'When writing review reports, include a final action list.',
      category: 'writing-pattern',
      source: 'user',
      sourceDocumentPaths: [path.join(projectRoot, '02-solution', 'review.md')]
    });

    const created = service.createPromotionDraft(projectRoot, {
      entryId: service.getSnapshot(projectRoot).accumulationEntries[0]!.id,
      targetKind: 'rule',
      proposedName: 'Review action items rule'
    });
    expect(created.promotionDrafts).toHaveLength(1);

    const accepted = service.applyPromotionDraft(projectRoot, created.promotionDrafts[0]!.id, 'Approved in unit test');
    expect(accepted.projectRules.some((item) => item.name === 'Review action items rule')).toBe(true);
    expect(accepted.knowledgeGraph.nodes.some((item) => item.kind === 'promotion')).toBe(true);
    expect(accepted.knowledgeGraph.nodes.some((item) => item.kind === 'rule')).toBe(true);
    expect(accepted.knowledgeGraph.edges.some((item) => item.type === 'promotes-to')).toBe(true);
  });

  it('materializes accepted skill promotions into installed skills with provenance', () => {
    const userDataRoot = createTempDir('cyber-editor-rules-userdata-');
    const projectRoot = createTempDir('cyber-editor-rules-project-');
    process.env.CYBER_EDITOR_USER_DATA = userDataRoot;
    const installPackage = vi.fn((skillPackage, sourceUrl, metadata) => ({
      id: skillPackage.id,
      name: skillPackage.name,
      version: skillPackage.version,
      description: skillPackage.description,
      source: sourceUrl,
      applicableStages: skillPackage.applicableStages,
      installedAt: '2026-04-17T08:00:00.000Z',
      fileCount: skillPackage.files.length,
      provenance: metadata?.provenance
    }));
    const service = new RulesDistillationService(undefined, undefined, { installPackage } as any);

    service.saveAccumulationEntry(projectRoot, {
      title: 'Skill habit',
      summary: 'Review notes should always end with next actions.',
      details: 'Capture the rule as a reusable review skill.',
      category: 'writing-pattern',
      source: 'user',
      sourceDocumentPaths: [path.join(projectRoot, '02-solution', 'review.md')]
    });

    const created = service.createPromotionDraft(projectRoot, {
      entryId: service.getSnapshot(projectRoot).accumulationEntries[0]!.id,
      targetKind: 'skill',
      proposedName: 'Review Next Action Skill'
    });
    const accepted = service.applyPromotionDraft(projectRoot, created.promotionDrafts[0]!.id, 'Approved in unit test');
    const acceptedDraft = accepted.promotionDrafts.find((draft) => draft.targetKind === 'skill');

    expect(acceptedDraft?.status).toBe('accepted');
    expect(acceptedDraft?.appliedSkillId).toBeTruthy();
    expect(acceptedDraft?.appliedSkillPackagePath).toContain('.project');
    expect(installPackage).toHaveBeenCalledTimes(1);
    expect(accepted.knowledgeGraph.nodes.some((node) => node.kind === 'skill' && node.sourceId === acceptedDraft?.appliedSkillId)).toBe(true);
  });

  it('keeps skill promotion drafts unaccepted when installation fails', () => {
    const userDataRoot = createTempDir('cyber-editor-rules-userdata-');
    const projectRoot = createTempDir('cyber-editor-rules-project-');
    process.env.CYBER_EDITOR_USER_DATA = userDataRoot;
    const service = new RulesDistillationService(undefined, undefined, {
      installPackage: () => {
        throw new Error('install failed');
      }
    } as any);

    service.saveAccumulationEntry(projectRoot, {
      title: 'Broken skill habit',
      summary: 'This should fail to install.',
      details: 'Install path must roll back.',
      category: 'writing-pattern',
      source: 'user',
      sourceDocumentPaths: [path.join(projectRoot, '02-solution', 'broken.md')]
    });

    const created = service.createPromotionDraft(projectRoot, {
      entryId: service.getSnapshot(projectRoot).accumulationEntries[0]!.id,
      targetKind: 'skill',
      proposedName: 'Broken Skill'
    });

    expect(() => service.applyPromotionDraft(projectRoot, created.promotionDrafts[0]!.id)).toThrow('install failed');
    const snapshot = service.getSnapshot(projectRoot);
    const failedDraft = snapshot.promotionDrafts.find((draft) => draft.id === created.promotionDrafts[0]!.id);
    expect(failedDraft?.status).toBe('draft');
    expect(failedDraft?.appliedSkillId).toBeUndefined();
  });
});
