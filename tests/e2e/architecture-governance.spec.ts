import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

function buildElectronEnv(userDataRoot: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  ) as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  env.APPDATA = path.join(userDataRoot, 'appdata');
  env.LOCALAPPDATA = path.join(userDataRoot, 'localappdata');
  env.HOME = path.join(userDataRoot, 'home');
  env.CYBER_EDITOR_USER_DATA = path.join(userDataRoot, 'userData');
  fs.mkdirSync(env.APPDATA, { recursive: true });
  fs.mkdirSync(env.LOCALAPPDATA, { recursive: true });
  fs.mkdirSync(env.HOME, { recursive: true });
  fs.mkdirSync(env.CYBER_EDITOR_USER_DATA, { recursive: true });
  return env;
}

function writeRolePackage(root: string, id: string, includeBlockedScript = false) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'role-package.json'), JSON.stringify({
    id,
    name: id,
    version: '1.0.0',
    description: `${id} package`
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(root, 'IDENTITY.md'), '# identity\n', 'utf8');
  fs.writeFileSync(path.join(root, 'SOUL.md'), '# soul\n', 'utf8');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# agents\n', 'utf8');
  fs.writeFileSync(path.join(root, 'USER.md'), '# user\n', 'utf8');
  if (includeBlockedScript) {
    fs.writeFileSync(path.join(root, 'danger.ps1'), 'Write-Host blocked', 'utf8');
  }
}

function writeReviewSkill(root: string) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
    id: 'review-skill',
    name: 'Review Skill',
    version: '1.0.0',
    description: 'Missing root SKILL.md'
  }, null, 2), 'utf8');
  fs.mkdirSync(path.join(root, 'references'), { recursive: true });
  fs.writeFileSync(path.join(root, 'references', 'guide.md'), '# guide\n', 'utf8');
}

test('architecture governance classifies local resource imports end-to-end', async () => {
  test.setTimeout(180_000);

  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-arch-governance-userdata-'));
  const trustedRoleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-trusted-role-'));
  const blockedRoleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-blocked-role-'));
  const reviewSkillRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-review-skill-'));

  writeRolePackage(trustedRoleRoot, 'trusted-role');
  writeRolePackage(blockedRoleRoot, 'blocked-role', true);
  writeReviewSkill(reviewSkillRoot);

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await expect(page.locator('.welcome-screen')).toBeVisible();

    const payload = await page.evaluate(async ({ trustedRoleRoot: trustedPath, reviewSkillRoot: reviewPath, blockedRoleRoot: blockedPath }) => {
      const trusted = await window.api.installRoleFromPath(trustedPath);
      const review = await window.api.installSkillFromPath(reviewPath);
      const approved = review.status === 'review-required'
        ? await window.api.installSkillFromPath(reviewPath, true)
        : review;
      const blocked = await window.api.installRoleFromPath(blockedPath);
      return { trusted, review, approved, blocked };
    }, {
      trustedRoleRoot,
      reviewSkillRoot,
      blockedRoleRoot
    });

    expect(payload.trusted.status).toBe('installed');
    expect(payload.trusted.kind).toBe('role-package');
    expect(payload.review.status).toBe('review-required');
    expect(payload.approved.status).toBe('installed');
    expect(payload.blocked.status).toBe('blocked');
    if (payload.blocked.status !== 'blocked') {
      throw new Error(`Expected blocked install result, received ${payload.blocked.status}`);
    }
    expect(payload.blocked.actionableError?.code).toBe('LOCAL_IMPORT_TRUST_BLOCKED');
  } finally {
    await app.close();
    fs.rmSync(userDataRoot, { recursive: true, force: true });
    fs.rmSync(trustedRoleRoot, { recursive: true, force: true });
    fs.rmSync(blockedRoleRoot, { recursive: true, force: true });
    fs.rmSync(reviewSkillRoot, { recursive: true, force: true });
  }
});

test('architecture governance enforces side-effect preview, approval, and blocked paths end-to-end', async () => {
  test.setTimeout(180_000);

  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-side-effects-userdata-'));
  const projectParentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-side-effects-projects-'));

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await expect(page.locator('.welcome-screen')).toBeVisible();

    const payload = await page.evaluate(async ({ projectParentRoot: parentRoot }) => {
      const bootstrap = await window.api.createProject({
        name: 'governance-project',
        locationPath: parentRoot,
        directoryMode: 'create-in-parent',
        templateId: 'software-factory'
      });

      await window.api.saveTools([
        {
          id: 'tool-review',
          name: 'Review Tool',
          description: 'Requires approval',
          command: 'cmd',
          args: ['/c', 'echo', 'ok'],
          cwd: '.',
          timeoutMs: 1000,
          enabled: true
        },
        {
          id: 'tool-other',
          name: 'Other Tool',
          description: 'Used for replay checks',
          command: 'cmd',
          args: ['/c', 'echo', 'other'],
          cwd: '.',
          timeoutMs: 1000,
          enabled: true
        },
        {
          id: 'tool-fail',
          name: 'Fail Tool',
          description: 'Returns exit 1',
          command: 'cmd',
          args: ['/c', 'exit', '1'],
          cwd: '.',
          timeoutMs: 1000,
          enabled: true
        }
      ]);

      const safePreview = await window.api.previewSideEffect('builtin:write_artifact', {
        path: '02-solution/output.md',
        content: '# ok'
      });
      const blockedPreview = await window.api.previewSideEffect('builtin:write_artifact', {
        path: '.project/blocked.md',
        content: '# blocked'
      });
      const reviewPreview = await window.api.previewSideEffect('script:tool-review', {}, 'run-review');

      let missingApprovalError = '';
      try {
        await window.api.runTool('tool-review');
      } catch (error) {
        missingApprovalError = error instanceof Error ? error.message : String(error);
      }

      const rejectedApproval = await window.api.approveSideEffect(reviewPreview!.id, false, 'reject');
      let rejectedError = '';
      try {
        await window.api.runTool('tool-review', rejectedApproval.id);
      } catch (error) {
        rejectedError = error instanceof Error ? error.message : String(error);
      }

      const approved = await window.api.approveSideEffect(reviewPreview!.id, true, 'approve');
      const executed = await window.api.runTool('tool-review', approved.id);

      const failingPreview = await window.api.previewSideEffect('script:tool-fail', {}, 'run-fail');
      const failingApproval = await window.api.approveSideEffect(failingPreview!.id, true, 'approve');
      const failingExecution = await window.api.runTool('tool-fail', failingApproval.id);

      return {
        projectRoot: bootstrap.project?.rootPath ?? '',
        safePreview,
        blockedPreview,
        reviewPreview,
        missingApprovalError,
        rejectedError,
        approvedApprovalId: approved.id,
        executed,
        failingExecution
      };
    }, { projectParentRoot });

    expect(payload.projectRoot).toContain('governance-project');
    expect(payload.safePreview?.status).toBe('trusted');
    expect(payload.blockedPreview?.status).toBe('blocked');
    expect(payload.reviewPreview?.status).toBe('review');
    expect(payload.missingApprovalError).toContain('requires explicit approval');
    expect(payload.rejectedError).toContain('approval is missing or invalid');
    expect(payload.executed.result.result.ok).toBe(true);
    expect(payload.failingExecution.result.result.ok).toBe(false);

    const replayError = await page.evaluate(async ({ approvalId }) => {
      try {
        await window.api.runTool('tool-other', approvalId);
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }, { approvalId: payload.approvedApprovalId });

    expect(replayError).toContain('does not match this side effect preview');

    const approvalPath = path.join(payload.projectRoot, '.project', 'evidence', 'approvals', `${payload.approvedApprovalId}.json`);
    const approvalRecord = JSON.parse(fs.readFileSync(approvalPath, 'utf8')) as { expiresAt?: string };
    approvalRecord.expiresAt = '2000-01-01T00:00:00.000Z';
    fs.writeFileSync(approvalPath, JSON.stringify(approvalRecord, null, 2), 'utf8');

    const expiredError = await page.evaluate(async ({ approvalId }) => {
      try {
        await window.api.runTool('tool-review', approvalId);
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }, { approvalId: payload.approvedApprovalId });

    expect(expiredError).toContain('has expired');
  } finally {
    await app.close();
    fs.rmSync(userDataRoot, { recursive: true, force: true });
    fs.rmSync(projectParentRoot, { recursive: true, force: true });
  }
});

test('architecture governance persists compacted context packs and run evidence on the real chat path', async () => {
  test.setTimeout(180_000);

  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-context-pack-userdata-'));
  const projectParentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-context-pack-projects-'));

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await expect(page.locator('.welcome-screen')).toBeVisible();

    const payload = await page.evaluate(async ({ projectParentRoot: parentRoot }) => {
      const bootstrap = await window.api.createProject({
        name: 'context-pack-project',
        locationPath: parentRoot,
        directoryMode: 'create-in-parent',
        templateId: 'software-factory'
      });

      const retrievalTarget = await window.api.createFile(bootstrap.project!.rootPath, 'retrieval-target.md');
      const linkedContext = await window.api.createFile(bootstrap.project!.rootPath, 'linked-context.md');
      await window.api.saveDocument(linkedContext, '# Linked Context\n\nsupplemental planning notes');
      await window.api.saveDocument(
        retrievalTarget,
        '# Retrieval Target\n\nalpha beta gamma planning context\n\n[Linked](./linked-context.md)'
      );

      const session = bootstrap.sessions[0];
      const now = new Date().toISOString();
      const noisyMessages = [
        ...session.messages,
        ...Array.from({ length: 16 }, (_, index) => ({
          id: `seed-${index}`,
          role: index % 2 === 0 ? 'user' : 'assistant',
          content: `seed message ${index} `.repeat(40),
          createdAt: now
        }))
      ];

      await window.api.saveSessions([
        {
          ...session,
          messages: noisyMessages
        }
      ]);

      const response = await window.api.sendAiMessage({
        sessionId: session.id,
        stage: session.stage,
        content: '请基于 alpha beta gamma planning context 总结当前上下文并给出下一步建议。',
        contextDocuments: [retrievalTarget]
      });

      const refreshed = await window.api.refreshProject();
      const run = [...refreshed.runtimeRuns]
        .filter((item) => item.kind === 'chat')
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

      return {
        projectRoot: refreshed.project?.rootPath ?? '',
        response: response.message.content,
        runId: run?.id ?? '',
        contextPackId: run?.contextPackId ?? '',
        evidencePackageId: run?.evidencePackageId ?? '',
        knowledgeIndexStatus: refreshed.knowledgeIndexState?.status ?? '',
        latestContextPack: refreshed.contextPacks[0] ?? null,
        runtimeGovernorActiveCount: refreshed.runtimeGovernorStatus?.activeRunCount ?? -1
      };
    }, { projectParentRoot });

    expect(payload.projectRoot).toContain('context-pack-project');
    expect(payload.response.trim().length).toBeGreaterThan(0);
    expect(payload.runId).toBeTruthy();
    expect(payload.contextPackId).toBeTruthy();
    expect(payload.evidencePackageId).toBeTruthy();
    expect(payload.knowledgeIndexStatus).toBe('ready');
    expect(payload.runtimeGovernorActiveCount).toBe(0);
    expect(payload.latestContextPack?.retrievalHits?.length).toBeGreaterThan(0);
    expect(payload.latestContextPack?.provenanceRecords?.length).toBeGreaterThan(0);
    expect(payload.latestContextPack?.budgetPlan?.selectedRetrievalHitCount).toBeGreaterThan(0);
    expect(payload.latestContextPack?.knowledgeIndexBuiltAt).toBeTruthy();

    const evidenceIndexPath = path.join(payload.projectRoot, '.project', 'evidence', 'index.json');
    const evidenceIndex = JSON.parse(fs.readFileSync(evidenceIndexPath, 'utf8')) as {
      entries: Array<{ id: string; category: string; status?: string; filePath: string }>;
    };
    const contextPackEntry = evidenceIndex.entries.find((entry) => entry.id === payload.contextPackId);
    const runEvidenceEntry = evidenceIndex.entries.find((entry) => entry.id === payload.evidencePackageId);

    expect(contextPackEntry?.category).toBe('context-packs');
    expect(contextPackEntry?.status).toBe('compacted');
    expect(runEvidenceEntry?.category).toBe('runs');
    expect(runEvidenceEntry?.status).toBe('completed');

    const contextPack = JSON.parse(fs.readFileSync(path.join(payload.projectRoot, contextPackEntry!.filePath), 'utf8')) as {
      compacted: boolean;
      omittedMessageCount: number;
      provenance: string[];
      runId: string;
      retrievalHits: Array<{ path: string; reason: string }>;
      provenanceRecords: Array<{ kind: string; sourcePath?: string }>;
      budgetPlan?: { selectedRetrievalHitCount: number };
      knowledgeIndexBuiltAt?: string;
    };
    const evidencePackage = JSON.parse(fs.readFileSync(path.join(payload.projectRoot, runEvidenceEntry!.filePath), 'utf8')) as {
      runId: string;
      contextPackId: string;
      status: string;
    };

    expect(contextPack.runId).toBe(payload.runId);
    expect(contextPack.compacted).toBe(true);
    expect(contextPack.omittedMessageCount).toBeGreaterThan(0);
    expect(contextPack.provenance).toContain('conversation.send-message');
    expect(contextPack.retrievalHits.length).toBeGreaterThan(0);
    expect(contextPack.retrievalHits.some((hit) => hit.path.endsWith('retrieval-target.md'))).toBe(true);
    expect(contextPack.provenanceRecords.some((record) => record.kind === 'knowledge-hit')).toBe(true);
    expect(contextPack.provenanceRecords.some((record) => record.kind === 'context-document')).toBe(true);
    expect(contextPack.budgetPlan?.selectedRetrievalHitCount).toBeGreaterThan(0);
    expect(contextPack.knowledgeIndexBuiltAt).toBeTruthy();
    expect(evidencePackage.runId).toBe(payload.runId);
    expect(evidencePackage.contextPackId).toBe(payload.contextPackId);
    expect(evidencePackage.status).toBe('completed');
  } finally {
    await app.close();
    fs.rmSync(userDataRoot, { recursive: true, force: true });
    fs.rmSync(projectParentRoot, { recursive: true, force: true });
  }
});
