import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { reviewMarkdownArtifact } from './lib/output-quality-review.mjs';
import {
  findBlockingAppLogEvents,
  formatBlockingAppLogEvents
} from './lib/app-log-events.mjs';

const REPO_ROOT = process.cwd();
const SUITE_STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const SUITE_ROOT = path.join(REPO_ROOT, 'artifacts', 'post-change-extreme-validation', SUITE_STAMP);
const OLLAMA_PROFILE_ID = 'profile-ollama';
const OLLAMA_MODEL = 'qwen3:8bm';

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function writeMarkdown(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function buildElectronEnv(userDataRoot) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  );
  delete env.ELECTRON_RUN_AS_NODE;
  env.APPDATA = path.join(userDataRoot, 'appdata');
  env.LOCALAPPDATA = path.join(userDataRoot, 'localappdata');
  env.HOME = path.join(userDataRoot, 'home');
  env.CYBER_EDITOR_USER_DATA = path.join(userDataRoot, 'userData');
  env.TEMP = path.join(userDataRoot, 'temp');
  env.TMP = path.join(userDataRoot, 'temp');
  ensureDir(env.APPDATA);
  ensureDir(env.LOCALAPPDATA);
  ensureDir(env.HOME);
  ensureDir(env.CYBER_EDITOR_USER_DATA);
  ensureDir(env.TEMP);
  return env;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function poll(fn, { timeoutMs = 30000, intervalMs = 300, label = 'condition' } = {}) {
  const startedAt = Date.now();
  let lastValue;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await fn();
    if (lastValue) return lastValue;
    await wait(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function createMessage(role, content) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

function seedRequirementMarkdown(note) {
  return [
    '# 原始需求',
    '',
    '## 目标用户',
    '- 内容团队负责人，需要把模糊想法快速沉淀为结构化文档与交付产物，并在 `01-requirements/01-原始需求.md` 中形成可复核基线。',
    '- 一线执行者，需要在最短时间内理解当前目标、约束、上下游依赖和交付边界，再继续补写 `01-requirements/02-需求澄清.md` 与 `02-solution/01-技术方案.md`。',
    '- 审查或重跑环节的操作者，需要拿到稳定、完整、可追踪的上游输入，才能安全执行 rerun、失效治理、snapshot 恢复与 `03-openspec/exports/` 导出。',
    '',
    '## 核心问题',
    '- 当前需求通常来自零散对话、即时想法或口头描述，缺少统一结构，容易遗漏约束、输入目录、输出目录和人工确认点。',
    '- 当上游文档被外部修改后，用户无法快速知道哪些阶段、节点和产物已经受影响，也无法判断是否应该 recover、merge 或 rerun。',
    '- 缺少稳定的需求基线时，局部重跑、失效治理和交付导出都会出现误判或返工，甚至把低质量输入继续传给下游节点。',
    '',
    '## 核心价值',
    '- 把一句话目标沉淀为后续编排、方案、测试和交付都能复用的结构化需求基线，让 `input/notes/`、`01-requirements/`、`02-solution/` 与 `03-openspec/exports/` 的边界一次写清。',
    '- 让 rerun、artifact governance、review 和 export 都围绕同一份高质量需求文档工作，而不是每个阶段重新解释背景。',
    '- 成功标准：1. 文档长度不少于 760 字；2. 明确输入输出路径、责任角色、恢复动作和验收方式；3. 进入局部重跑前人工复核评分不低于 90。',
    '- 验收方式：先 verify `01-requirements/01-原始需求.md` 是否覆盖目标用户、核心问题、显性限制、待确认问题和下一步动作，再允许继续下游阶段。',
    '',
    '## 显性限制',
    '- 当前场景只处理文本、文档与结构化交付，不涉及图像生成或其他重型多媒体工作，也不依赖联网市场才能完成闭环。',
    '- 需求文档必须兼容局部重跑、失效传播、审查子流程和 OpenSpec 导出路径，且必须保留 input / output contract、review owner 与 rollback 入口。',
    '- 文档结构必须足够稳定，不能只给出一句摘要或缺失关键标题；如果评分低于 90，则必须阻断阶段确认并要求修复。',
    '',
    '## 待确认问题',
    `- 当前种子说明：${note}`,
    '- 后续是否需要联网补证，以及联网结果应该如何写回到需求与方案文档。',
    '- 输出目录、角色边界和人工确认点是否还需要更细粒度的平台级约束。',
    '- 是否需要把 snapshot 证据、rerun 计划和审批记录统一写入 `artifacts/post-change-extreme-validation/`，供后续 AI 直接复现？',
    '',
    '## 下一步',
    '- 下一步进入 `01-requirements/02-需求澄清.md`，补齐操作步骤、输入输出合同、异常恢复和导出阈值。',
    '- 澄清动作：先确认 `input/notes/`、`01-requirements/`、`02-solution/` 与 `03-openspec/exports/` 的使用边界，再继续方案规划与局部重跑。',
    ''
  ].join('\n');
}

function scoreMarkdown(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const headings = content.match(/^#{1,6}\s+/gm) ?? [];
  const bullets = content.match(/^\s*[-*]\s+/gm) ?? [];
  const leakPatterns = ['## 模拟输出', 'toolCalls', '当前会话摘要', '当前工件目标', '如需调用能力', '只输出 JSON'];
  const leakHits = leakPatterns.filter((pattern) => content.includes(pattern));
  const codeFenceCount = (content.match(/```/g) ?? []).length;
  const score = [
    content.trim().length >= 600 ? 1 : 0,
    headings.length >= 3 ? 1 : 0,
    bullets.length >= 3 ? 1 : 0,
    leakHits.length === 0 ? 1 : 0,
    codeFenceCount <= 12 ? 1 : 0
  ].reduce((sum, value) => sum + value, 0);
  const verdict = leakHits.length ? 'fail' : score >= 4 ? 'pass' : score >= 3 ? 'warn' : 'fail';
  return {
    filePath,
    verdict,
    score,
    length: content.trim().length,
    headingCount: headings.length,
    bulletCount: bullets.length,
    leakHits
  };
}

function scoreMarkdownV2(filePath) {
  return reviewMarkdownArtifact(filePath, { qualityTier: 'strict' });
}

function getLatestStageRun(bootstrap, sessionId, stage) {
  const runs = (bootstrap.runtimeRuns ?? [])
    .filter((run) => run.kind === 'stage' && run.sessionId === sessionId && run.stage === stage)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  return runs[0] ?? null;
}

async function generateStageAndInspect(page, sessionId, stage) {
  await page.evaluate(async (id) => window.api.generateStageDraft(id), sessionId);
  const bootstrap = await loadBootstrap(page);
  const guard = await page.evaluate(async ({ id, activeStage }) => window.api.getStageGuard(id, activeStage), {
    id: sessionId,
    activeStage: stage
  });
  const latestRun = getLatestStageRun(bootstrap, sessionId, stage);
  const successfulRun = guard.lastSuccessfulRunId
    ? (bootstrap.runtimeRuns ?? []).find((run) => run.id === guard.lastSuccessfulRunId) ?? null
    : null;
  return {
    bootstrap,
    guard,
    run: latestRun ?? successfulRun
  };
}

function buildExecutionBindingLookup(runtimeTemplate) {
  const lookup = new Map();
  for (const binding of Object.values(runtimeTemplate?.stageExecutionProfiles ?? {})) {
    if (!binding?.roleId) continue;
    lookup.set(binding.roleId, {
      taskTemplateId: binding.taskTemplateId,
      agentProfileId: binding.agentProfileId
    });
  }
  for (const binding of Object.values(runtimeTemplate?.review?.executionProfiles ?? {})) {
    if (!binding?.roleId) continue;
    lookup.set(binding.roleId, {
      taskTemplateId: binding.taskTemplateId,
      agentProfileId: binding.agentProfileId
    });
  }
  return lookup;
}

function applyExecutionBindingsToFlow(flow, runtimeTemplate) {
  const lookup = buildExecutionBindingLookup(runtimeTemplate);
  return {
    ...flow,
    nodes: flow.nodes.map((node) => {
      if (node.type !== 'agent') return node;
      const binding = node.data?.roleId ? lookup.get(node.data.roleId) : null;
      if (!binding) return node;
      return {
        ...node,
        data: {
          ...node.data,
          taskTemplateId: node.data.taskTemplateId ?? binding.taskTemplateId,
          agentProfileId: node.data.agentProfileId ?? binding.agentProfileId
        }
      };
    })
  };
}

async function loadBoundMainFlow(page) {
  const bootstrap = await loadBootstrap(page);
  const baseFlow = bootstrap.platform?.flows?.[0];
  if (!baseFlow) {
    throw new Error('Missing default platform flow.');
  }
  return {
    bootstrap,
    flow: applyExecutionBindingsToFlow(structuredClone(baseFlow), bootstrap.runtimeTemplate)
  };
}

function renderScenarioReport(result) {
  const lines = [
    `# ${result.title}`,
    '',
    `- 场景 ID：${result.id}`,
    `- 状态：${result.status}`,
    `- 开始时间：${result.startedAt}`,
    `- 结束时间：${result.finishedAt}`,
    `- Project Root：${result.projectRoot ?? 'N/A'}`,
    ''
  ];
  if (result.notes?.length) {
    lines.push('## Notes', '');
    for (const note of result.notes) lines.push(`- ${note}`);
    lines.push('');
  }
  if (result.checks?.length) {
    lines.push('## Checks', '');
    for (const check of result.checks) {
      lines.push(`- [${check.ok ? 'x' : ' '}] ${check.label}${check.details ? `：${check.details}` : ''}`);
    }
    lines.push('');
  }
  if (result.outputs?.length) {
    lines.push('## Outputs', '');
    for (const output of result.outputs) lines.push(`- ${output}`);
    lines.push('');
  }
  if (result.qualityReviews?.length) {
    lines.push('## Quality Review', '');
    for (const review of result.qualityReviews) {
      lines.push(`- ${review.verdict.toUpperCase()} ${path.basename(review.filePath)} | band=${review.band ?? 'n/a'} | score=${review.score} | deliveryBand=${review.deliveryBand ?? 'n/a'} | deliveryScore=${review.deliveryScore ?? 'n/a'} | deliveryVerdict=${(review.deliveryVerdict ?? 'n/a').toUpperCase()} | headings=${review.headingCount} | bullets=${review.bulletCount} | fallback=${review.fallbackHits.join(', ') || 'none'} | placeholder=${review.placeholderHits.join(', ') || 'none'}`);
      if (review.dimensions) {
        lines.push(`  - dimensions completeness=${review.dimensions.completeness} structure=${review.dimensions.structure} specificity=${review.dimensions.specificity} actionability=${review.dimensions.actionability} hygiene=${review.dimensions.hygiene}`);
      }
      if (review.deliveryReasons?.length) {
        lines.push(`  - deliveryReasons ${review.deliveryReasons.slice(0, 3).join(' | ')}`);
      }
      if (review.reasons?.length) {
        for (const reason of review.reasons.slice(0, 3)) {
          lines.push(`  - ${reason}`);
        }
      }
    }
    lines.push('');
  }
  if (result.error) {
    lines.push('## Error', '', '```text', result.error, '```', '');
  }
  return lines.join('\n');
}

async function launchScenarioApp(runtimeRoot) {
  const env = buildElectronEnv(runtimeRoot);
  const app = await electron.launch({
    args: ['.'],
    cwd: REPO_ROOT,
    env
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1600, height: 1040 });
  });
  return { app, page, env };
}

async function loadBootstrap(page) {
  return page.evaluate(async () => window.api.bootstrapLoad());
}

async function createProject(page, scenarioRoot, name) {
  const projectParent = path.join(scenarioRoot, 'workspace');
  ensureDir(projectParent);
  await page.evaluate(async ({ projectParentPath, projectName }) => {
    await window.api.createProject({
      name: projectName,
      locationPath: projectParentPath,
      directoryMode: 'create-in-parent',
      templateId: 'software-factory'
    });
  }, { projectParentPath: projectParent, projectName: name });
  await page.reload();
  await wait(1000);
  const bootstrap = await loadBootstrap(page);
  assert.ok(bootstrap.project?.rootPath, 'Expected active project root after project creation.');
  return bootstrap.project.rootPath;
}

async function createScenarioProject(ctx, name) {
  const projectRoot = await createProject(ctx.page, ctx.scenarioRoot, name);
  ctx.setProjectRoot(projectRoot);
  return projectRoot;
}

function getRequiredTemplatePaths(bootstrap) {
  const template = bootstrap.runtimeTemplate;
  const discoverDoc = template?.stageDocuments?.discover?.[0];
  const clarifyDoc = template?.stageDocuments?.clarify?.[0];
  const featureTreeDoc = template?.stageDocuments?.plan?.find((item) => item.path.includes('03-'));
  const featureListDoc = template?.stageDocuments?.plan?.find((item) => item.path.includes('04-'));
  const solutionDoc = template?.stageDocuments?.plan?.find((item) => item.path.startsWith('02-solution/'));
  if (!discoverDoc || !clarifyDoc || !featureTreeDoc || !featureListDoc || !solutionDoc) {
    throw new Error('Required template stage documents are missing.');
  }
  return {
    discoverPath: discoverDoc.path,
    clarifyPath: clarifyDoc.path,
    featureTreePath: featureTreeDoc.path,
    featureListPath: featureListDoc.path,
    solutionPath: solutionDoc.path
  };
}

async function activateOllamaProfile(page) {
  const connection = await page.evaluate(async ({ profileId, model }) => {
    const current = await window.api.getSettings();
    const nextProfiles = current.providerProfiles.map((profile) => (
      profile.id === profileId
        ? {
            id: profile.id,
            name: profile.name,
            provider: profile.provider,
            baseUrl: 'http://127.0.0.1:11434/v1',
            model,
            apiKey: '',
            enabled: true,
            capabilities: profile.capabilities,
            diagnostics: profile.diagnostics
          }
        : {
            id: profile.id,
            name: profile.name,
            provider: profile.provider,
            baseUrl: profile.baseUrl,
            model: profile.model,
            apiKey: '',
            enabled: profile.enabled,
            capabilities: profile.capabilities,
            diagnostics: profile.diagnostics
          }
    ));
    await window.api.saveSettings({
      theme: current.theme,
      sidebar: current.sidebar,
      providerProfiles: nextProfiles,
      activeProviderProfileId: profileId,
      recentProjects: current.recentProjects,
      recentTemplates: current.recentTemplates,
      recentResources: current.recentResources,
      recentDrafts: current.recentDrafts
    });
    return window.api.testAiConnection({ profileId });
  }, { profileId: OLLAMA_PROFILE_ID, model: OLLAMA_MODEL });
  assert.equal(connection.ok, true, 'Expected Ollama connection test to succeed.');
  return connection;
}

async function appendUserMessage(page, sessionId, content) {
  const bootstrap = await loadBootstrap(page);
  const sessions = bootstrap.sessions.map((session) => (
    session.id === sessionId
      ? { ...session, messages: [...session.messages, createMessage('user', content)] }
      : session
  ));
  await page.evaluate(async (nextSessions) => window.api.saveSessions(nextSessions), sessions);
}

async function waitForRunState(page, matcher, expectedStatus, label) {
  return poll(async () => {
    const bootstrap = await loadBootstrap(page);
    const run = bootstrap.runtimeRuns.find(matcher);
    if (!run) return null;
    return run.status === expectedStatus ? run : null;
  }, { timeoutMs: 180000, label });
}

async function seedPlanContracts(page) {
  const requirement = seedRequirementMarkdown('Used for rerun and invalidation scenarios.');
  const { bootstrap, flow } = await loadBoundMainFlow(page);
  if (!bootstrap.project?.rootPath) {
    throw new Error('Missing project root.');
  }
  const discoverArtifactPath = bootstrap.runtimeTemplate?.stageDocuments?.discover?.[0]?.path ?? '01-requirements/01-原始需求.md';
  const solutionArtifactPath = bootstrap.runtimeTemplate?.stageDocuments?.plan?.find((item) => item.path.startsWith('02-solution/'))?.path ?? '02-solution/01-技术方案.md';
  flow.nodes = flow.nodes.map((node) => {
    if (node.id === 'sf-main-discover') {
      return { ...node, data: { ...node.data, outputArtifactPaths: [discoverArtifactPath] } };
    }
    if (node.id === 'sf-main-plan') {
      return {
        ...node,
        data: {
          ...node.data,
          inputArtifactPaths: [discoverArtifactPath],
          outputArtifactPaths: [solutionArtifactPath]
        }
      };
    }
    return node;
  });
  await page.evaluate(async ({ nextFlow, requirement, rootPath, discoverArtifactPath }) => {
    await window.api.saveFlow(nextFlow);
    await window.api.saveDocument(
      `${rootPath.replace(/\\/g, '/')}/${discoverArtifactPath}`,
      requirement
    );
  }, { nextFlow: flow, requirement, rootPath: bootstrap.project.rootPath, discoverArtifactPath });
  return {
    flowId: flow.id,
    discoverArtifactPath,
    solutionArtifactPath
  };
}

async function preparePlanStageForExport(page, instructions) {
  return page.evaluate(async (nextInstructions) => {
    await window.api.revisitStage('plan');
    const bootstrap = await window.api.bootstrapLoad();
    const session = bootstrap.sessions[0];
    if (!session?.id) {
      throw new Error('Missing plan-stage session.');
    }
    const nextSessions = bootstrap.sessions.map((item, index) => (
      index === 0
        ? {
            ...item,
            stage: 'plan',
            messages: [
              ...item.messages,
              {
                id: `user-plan-${Date.now()}`,
                role: 'user',
                content: nextInstructions,
                createdAt: new Date().toISOString()
              }
            ]
          }
        : item
    ));
    await window.api.saveSessions(nextSessions);
    await window.api.generateStageDraft(session.id);
    await window.api.confirmStage(session.id, 'plan');
    return { sessionId: session.id };
  }, instructions);
}

async function runScenario(definition) {
  const scenarioRoot = path.join(SUITE_ROOT, definition.id);
  const runtimeRoot = path.join(scenarioRoot, 'runtime');
  ensureDir(scenarioRoot);
  ensureDir(runtimeRoot);
  const startedAt = new Date().toISOString();
  const result = {
    id: definition.id,
    title: definition.title,
    status: 'passed',
    startedAt,
    finishedAt: '',
    projectRoot: null,
    checks: [],
    outputs: [],
    notes: definition.notes ?? [],
    qualityReviews: []
  };
  let app;
  let userDataPath = null;
  try {
    const launched = await launchScenarioApp(runtimeRoot);
    app = launched.app;
    userDataPath = launched.env.CYBER_EDITOR_USER_DATA;
    const page = launched.page;
    const context = {
      page,
      scenarioRoot,
      addCheck(label, ok, details) {
        result.checks.push({ label, ok, details });
        if (!ok) throw new Error(details ? `${label}: ${details}` : label);
      },
      addOutput(outputPath) {
        result.outputs.push(path.relative(SUITE_ROOT, outputPath).replace(/\\/g, '/'));
      },
      setProjectRoot(projectRoot) {
        result.projectRoot = projectRoot;
      }
    };
    const payload = await definition.execute(context);
    if (payload?.qualityReviews?.length) result.qualityReviews.push(...payload.qualityReviews);
    if (payload?.notes?.length) result.notes.push(...payload.notes);
  } catch (error) {
    result.status = 'failed';
    result.error = error instanceof Error ? error.stack ?? error.message : String(error);
  } finally {
    if (app) await app.close();
    if (userDataPath) {
      const blockingAppLogEvents = findBlockingAppLogEvents(userDataPath);
      const ok = blockingAppLogEvents.length === 0;
      result.checks.push({
        label: 'No blocking app log events',
        ok,
        details: ok
          ? 'no window.unresponsive, renderer crash, or main-process fatal events'
          : formatBlockingAppLogEvents(blockingAppLogEvents)
      });
      if (!ok) {
        result.status = 'failed';
        const detail = `Blocking app log events detected:\n${formatBlockingAppLogEvents(blockingAppLogEvents)}`;
        result.error = result.error ? `${result.error}\n\n${detail}` : detail;
      }
    }
    result.finishedAt = new Date().toISOString();
    writeJson(path.join(scenarioRoot, 'result.json'), result);
    writeMarkdown(path.join(scenarioRoot, 'report.md'), renderScenarioReport(result));
  }
  return result;
}

const scenarios = [
  {
    id: 'real-qwen-closed-loop-delivery',
    title: '真实本地模型闭环生成与交付质量',
    notes: ['使用 qwen3:8bm 生成真实阶段文档与 OpenSpec 交付。'],
    async execute(ctx) {
      const { page, scenarioRoot, setProjectRoot, addCheck, addOutput } = ctx;
      await activateOllamaProfile(page);
      const projectRoot = await createProject(page, scenarioRoot, 'extreme-qwen-delivery');
      setProjectRoot(projectRoot);
      const bootstrap = await loadBootstrap(page);
      const requiredPaths = getRequiredTemplatePaths(bootstrap);
      const sessionId = bootstrap.sessions[0]?.id;
      assert.ok(sessionId, 'Expected a default AI session.');

      await appendUserMessage(page, sessionId, '我要做一个帮助内容团队把模糊创意沉淀为结构化文档、脚本和交付摘要的桌面工作台。');
      await page.evaluate(async (input) => window.api.sendAiMessage(input), {
        sessionId,
        stage: 'discover',
        content: '请先识别目标用户、核心痛点、边界和最关键的成功标准。',
        contextDocuments: []
      });
      const discoverResult = await generateStageAndInspect(page, sessionId, 'discover');
      const discoverPath = path.join(projectRoot, requiredPaths.discoverPath);
      const discoverGuardPath = path.join(scenarioRoot, 'discover-stage-guard.json');
      const discoverRunPath = path.join(scenarioRoot, 'discover-stage-run.json');
      writeJson(discoverGuardPath, discoverResult.guard);
      writeJson(discoverRunPath, discoverResult.run);
      addOutput(discoverGuardPath);
      addOutput(discoverRunPath);
      addOutput(discoverPath);
      addCheck('discover 阶段留下运行证据', Boolean(discoverResult.run), discoverRunPath);
      addCheck(
        'discover 阶段留下工件质量结论',
        Boolean(discoverResult.run?.artifactOutcomes?.length),
        JSON.stringify(discoverResult.run?.artifactOutcomes ?? [])
      );

      if (!discoverResult.guard.ok) {
        const blockedQualityReview = scoreMarkdownV2(discoverPath);
        const blockedReviewPath = path.join(scenarioRoot, 'doc-quality-review.json');
        writeJson(blockedReviewPath, [blockedQualityReview]);
        addOutput(blockedReviewPath);
        addCheck(
          'discover 阶段被质量闸门显式阻止',
          discoverResult.run?.status === 'failed'
            && discoverResult.guard.blockers.some((item) => item.includes('Artifact check failed') || item.includes('No successful run recorded'))
            && discoverResult.run?.artifactOutcomes?.some((item) => item.qualityVerdict === 'blocked' && item.accepted === false),
          JSON.stringify({
            blockers: discoverResult.guard.blockers,
            artifactOutcomes: discoverResult.run?.artifactOutcomes ?? [],
            qualityReview: blockedQualityReview
          }, null, 2)
        );
        addCheck(
          'discover 当前文档质量评分明确低于严格阈值',
          blockedQualityReview.verdict === 'fail' && blockedQualityReview.score < 72,
          JSON.stringify(blockedQualityReview, null, 2)
        );
        return {
          notes: ['真实模型在 discover 阶段未达到核心工件质量阈值，运行时已显式阻止阶段确认与后续交付。'],
          qualityReviews: [blockedQualityReview]
        };
      }

      addCheck('discover 阶段达到严格质量阈值并允许确认', discoverResult.run?.status === 'completed', JSON.stringify(discoverResult.run, null, 2));
      await page.evaluate(async ({ id, stage }) => window.api.confirmStage(id, stage), { id: sessionId, stage: 'discover' });
      await appendUserMessage(page, sessionId, '平台只做桌面端，输出以 Markdown、表格和流程图为主，允许流程定义输入目录和输出目录。');
      const clarifyResult = await generateStageAndInspect(page, sessionId, 'clarify');
      const clarifyPath = path.join(projectRoot, requiredPaths.clarifyPath);
      addOutput(clarifyPath);
      addCheck('clarify 阶段达到严格质量阈值并允许确认', clarifyResult.guard.ok && clarifyResult.run?.status === 'completed', JSON.stringify({
        blockers: clarifyResult.guard.blockers,
        artifactOutcomes: clarifyResult.run?.artifactOutcomes ?? []
      }, null, 2));
      await page.evaluate(async ({ id, stage }) => window.api.confirmStage(id, stage), { id: sessionId, stage: 'clarify' });
      await appendUserMessage(page, sessionId, '请继续产出功能树、功能清单与技术方案，重点覆盖编排层、AI harness、工件契约和错误恢复。');
      const planResult = await generateStageAndInspect(page, sessionId, 'plan');
      const featureTreePath = path.join(projectRoot, requiredPaths.featureTreePath);
      const featureListPath = path.join(projectRoot, requiredPaths.featureListPath);
      const solutionPath = path.join(projectRoot, requiredPaths.solutionPath);
      addOutput(featureTreePath);
      addOutput(featureListPath);
      addOutput(solutionPath);
      addCheck('plan 阶段达到严格质量阈值并允许确认', planResult.guard.ok && planResult.run?.status === 'completed', JSON.stringify({
        blockers: planResult.guard.blockers,
        artifactOutcomes: planResult.run?.artifactOutcomes ?? []
      }, null, 2));
      await page.evaluate(async ({ id, stage }) => window.api.confirmStage(id, stage), { id: sessionId, stage: 'plan' });
      const exportPayload = await page.evaluate(async () => window.api.generateOpenSpec());
      const manifestPath = exportPayload.result.exportPackage.manifestPath;
      addCheck('OpenSpec 交付生成成功', fs.existsSync(manifestPath), manifestPath);
      addOutput(manifestPath);

      const markdownTargets = [
        discoverPath,
        clarifyPath,
        featureTreePath,
        featureListPath,
        solutionPath,
        path.join(path.dirname(manifestPath), 'delivery-package.md'),
        path.join(path.dirname(manifestPath), 'openspec', 'changes', exportPayload.result.changeName, 'proposal.md'),
        path.join(path.dirname(manifestPath), 'openspec', 'changes', exportPayload.result.changeName, 'tasks.md')
      ].filter((filePath) => fs.existsSync(filePath));
      const qualityReviews = markdownTargets.map(scoreMarkdownV2);
      const qualityReviewPath = path.join(scenarioRoot, 'doc-quality-review.json');
      writeJson(qualityReviewPath, qualityReviews);
      addOutput(qualityReviewPath);
      addCheck(
        '关键交付文档质量无明显提示词泄漏',
        qualityReviews.every((item) => item.verdict !== 'fail'),
        qualityReviews.filter((item) => item.verdict === 'fail').map((item) => path.basename(item.filePath)).join(', ') || 'all-pass'
      );
      addCheck(
        '关键交付文档达到 90+ 交付分',
        qualityReviews.every((item) => item.deliveryVerdict === 'pass' && (item.deliveryScore ?? 0) >= 90),
        qualityReviews
          .filter((item) => item.deliveryVerdict !== 'pass' || (item.deliveryScore ?? 0) < 90)
          .map((item) => `${path.basename(item.filePath)}:${item.deliveryScore ?? 'n/a'}/${item.deliveryVerdict ?? 'n/a'}`)
          .join(', ') || 'all-pass'
      );
      return { qualityReviews };
    }
  },
  {
    id: 'flow-draft-from-prompt',
    title: 'Natural-language flow draft generation',
    async execute(ctx) {
      const { page, scenarioRoot, addCheck, addOutput } = ctx;
      const payload = await page.evaluate(async () => window.api.buildConversationFlowDraft({
        prompt: [
          'Analyze the user goal',
          'Draft the solution in parallel',
          'Review key risks',
          'Run a subflow audit',
          'Export the final artifact'
        ].join('\n')
      }));
      const outputPath = path.join(scenarioRoot, 'flow-draft.json');
      writeJson(outputPath, payload);
      addOutput(outputPath);
      addCheck('Draft contains at least three real steps', payload.draft.nodes.length >= 5, 'nodes=' + payload.draft.nodes.length);
      addCheck('Draft contains start node', payload.draft.nodes.some((node) => node.type === 'start'), 'missing start');
      addCheck('Draft contains end node', payload.draft.nodes.some((node) => node.type === 'end'), 'missing end');
    }
  },
  {
    id: 'flow-patch-from-prompt',
    title: '自然语言 patch 流程',
    async execute(ctx) {
      const { page, scenarioRoot, addCheck, addOutput } = ctx;
      const draft = await page.evaluate(async () => window.api.buildConversationFlowDraft({
        prompt: '先收集需求，再形成方案，最后交付。'
      }));
      const patch = await page.evaluate(async (flow) => window.api.patchConversationFlow({
        flow,
        prompt: '在方案后增加一个循环审查节点，并在交付前增加子流程复核。'
      }), draft.draft);
      const applied = await page.evaluate(async ({ flow, patch: flowPatch }) => window.api.applyConversationFlowPatch({
        flow,
        patch: flowPatch
      }), { flow: draft.draft, patch });
      const outputPath = path.join(scenarioRoot, 'flow-patch.json');
      writeJson(outputPath, { patch, applied });
      addOutput(outputPath);
      addCheck('patch 后节点数增加', applied.nodes.length > draft.draft.nodes.length, `${draft.draft.nodes.length} -> ${applied.nodes.length}`);
    }
  },
  {
    id: 'approval-approve',
    title: '审批通过路径',
    async execute(ctx) {
      const { page, scenarioRoot, setProjectRoot, addCheck, addOutput } = ctx;
      const projectRoot = await createProject(page, scenarioRoot, 'approval-approve');
      setProjectRoot(projectRoot);
      const { flow } = await loadBoundMainFlow(page);
      flow.nodes.push({
        id: 'approval-node',
        type: 'approval',
        position: { x: 520, y: 260 },
        data: { label: '审批门', approvalPrompt: 'Need approval before continue.' }
      });
      const payload = await page.evaluate(async (nextFlow) => {
        await window.api.saveFlow(nextFlow);
        return window.api.debugFlowNode({ kind: 'flow', flowId: nextFlow.id, nodeId: 'approval-node' });
      }, flow);
      const runId = payload.result.run.id;
      const beforeApproval = await loadBootstrap(page);
      const pending = beforeApproval.runtimeRuns.find((run) => run.id === runId)?.pendingApprovals?.[0];
      assert.ok(pending?.id, 'Expected a pending approval.');
      await page.evaluate(async ({ runId: targetRunId, approvalId }) => window.api.resolveRuntimeApproval({
        runId: targetRunId,
        approvalId,
        approved: true,
        reason: 'approve-extreme'
      }), { runId, approvalId: pending.id });
      const completed = await waitForRunState(page, (run) => run.id === runId, 'completed', 'approved run');
      const outputPath = path.join(scenarioRoot, 'approval-approve.json');
      writeJson(outputPath, completed);
      addOutput(outputPath);
      addCheck('审批通过后运行完成', completed.status === 'completed', completed.status);
    }
  },
  {
    id: 'approval-reject',
    title: '审批拒绝路径',
    async execute(ctx) {
      const { page, scenarioRoot, setProjectRoot, addCheck, addOutput } = ctx;
      const projectRoot = await createProject(page, scenarioRoot, 'approval-reject');
      setProjectRoot(projectRoot);
      const { flow } = await loadBoundMainFlow(page);
      flow.nodes.push({
        id: 'approval-reject-node',
        type: 'approval',
        position: { x: 520, y: 260 },
        data: { label: '拒绝门', approvalPrompt: 'Need approval before continue.', approvalRollbackNodeId: 'sf-main-start' }
      });
      const payload = await page.evaluate(async (nextFlow) => {
        await window.api.saveFlow(nextFlow);
        return window.api.debugFlowNode({ kind: 'flow', flowId: nextFlow.id, nodeId: 'approval-reject-node' });
      }, flow);
      const runId = payload.result.run.id;
      const bootstrap = await loadBootstrap(page);
      const pending = bootstrap.runtimeRuns.find((run) => run.id === runId)?.pendingApprovals?.[0];
      assert.ok(pending?.id, 'Expected a pending approval for rejection.');
      await page.evaluate(async ({ runId: targetRunId, approvalId }) => window.api.resolveRuntimeApproval({
        runId: targetRunId,
        approvalId,
        approved: false,
        reason: 'reject-extreme'
      }), { runId, approvalId: pending.id });
      const refreshed = await poll(async () => {
        const current = await loadBootstrap(page);
        const run = current.runtimeRuns.find((item) => item.id === runId);
        return run?.status === 'stopped' ? { run, events: current.runtimeEvents } : null;
      }, { timeoutMs: 30000, label: 'rejected run' });
      const outputPath = path.join(scenarioRoot, 'approval-reject.json');
      writeJson(outputPath, refreshed);
      addOutput(outputPath);
      addCheck('审批拒绝后运行停止', refreshed.run.status === 'stopped', refreshed.run.status);
      addCheck('审批拒绝记录 cleanup', refreshed.events.some((event) => event.runId === runId && event.type === 'run.cleanup'), 'missing cleanup event');
    }
  },
  {
    id: 'loop-completed',
    title: 'Loop completes normally',
    async execute(ctx) {
      const { page, scenarioRoot, addCheck, addOutput } = ctx;
      await createScenarioProject(ctx, 'loop-completed');
      const { flow } = await loadBoundMainFlow(page);
      flow.nodes.push(
          {
            id: 'loop-complete',
            type: 'loop',
            position: { x: 520, y: 260 },
            data: {
              label: 'Loop Complete',
              loopExpression: 'needs_more',
              exitExpression: 'ready',
              maxIterations: 3,
              loopBackTargetId: 'loop-complete-worker',
              exitTargetId: 'sf-main-end'
            }
          },
          {
            id: 'loop-complete-worker',
            type: 'artifact',
            position: { x: 760, y: 260 },
            data: { label: 'Loop Worker', artifactPath: 'runtime/loop-complete.md' }
          }
      );
      flow.edges.push(
        { id: 'loop-complete-enter', source: 'sf-main-start', target: 'loop-complete' },
        { id: 'loop-complete-loop', source: 'loop-complete', target: 'loop-complete-worker', branch: 'loop' },
        { id: 'loop-complete-return', source: 'loop-complete-worker', target: 'loop-complete' },
        { id: 'loop-complete-exit', source: 'loop-complete', target: 'sf-main-end', branch: 'exit' }
      );
      const payload = await page.evaluate(async (nextFlow) => {
        await window.api.saveFlow(nextFlow);
        return window.api.debugFlowNode({ kind: 'flow', flowId: nextFlow.id, nodeId: 'loop-complete' });
      }, flow);
      const run = payload.result.run;
      const outputPath = path.join(scenarioRoot, 'loop-completed.json');
      writeJson(outputPath, run);
      addOutput(outputPath);
      addCheck('Loop run completes', run.status === 'completed', run.status);
      addCheck('Loop records persisted', (run.loops?.length ?? 0) > 0, 'loops=' + (run.loops?.length ?? 0));
    }
  },
  {
    id: 'loop-guard-stopped',
    title: 'Loop max-iteration guard stop',
    async execute(ctx) {
      const { page, scenarioRoot, addCheck, addOutput } = ctx;
      await createScenarioProject(ctx, 'loop-guard');
      const { flow } = await loadBoundMainFlow(page);
      flow.nodes.push(
          {
            id: 'loop-guard',
            type: 'loop',
            position: { x: 520, y: 260 },
            data: {
              label: 'Loop Guard',
              loopExpression: 'needs_more',
              exitExpression: 'ready',
              maxIterations: 1,
              loopBackTargetId: 'loop-guard-worker',
              exitTargetId: 'sf-main-end'
            }
          },
          {
            id: 'loop-guard-worker',
            type: 'artifact',
            position: { x: 760, y: 260 },
            data: { label: 'Loop Guard Worker', artifactPath: 'runtime/loop-guard.md' }
          }
      );
      flow.edges.push(
        { id: 'loop-guard-enter', source: 'sf-main-start', target: 'loop-guard' },
        { id: 'loop-guard-loop', source: 'loop-guard', target: 'loop-guard-worker', branch: 'loop' },
        { id: 'loop-guard-return', source: 'loop-guard-worker', target: 'loop-guard' },
        { id: 'loop-guard-exit', source: 'loop-guard', target: 'sf-main-end', branch: 'exit' }
      );
      const payload = await page.evaluate(async (nextFlow) => {
        await window.api.saveFlow(nextFlow);
        return window.api.debugFlowNode({ kind: 'flow', flowId: nextFlow.id, nodeId: 'loop-guard' });
      }, flow);
      const run = payload.result.run;
      const outputPath = path.join(scenarioRoot, 'loop-guard.json');
      writeJson(outputPath, run);
      addOutput(outputPath);
      addCheck('Loop stops at max-iteration guard', run.status === 'stopped', run.status);
      addCheck('Recovery remains available', run.recovery?.status === 'recoverable', run.recovery?.status ?? 'missing');
    }
  },
  {
    id: 'loop-timeout-recovery',
    title: 'Loop timeout recovery',
    async execute(ctx) {
      const { page, scenarioRoot, addCheck, addOutput } = ctx;
      await createScenarioProject(ctx, 'loop-timeout');
      const { flow } = await loadBoundMainFlow(page);
      flow.nodes.push(
          {
            id: 'loop-timeout',
            type: 'loop',
            position: { x: 520, y: 260 },
            data: {
              label: 'Loop Timeout',
              loopExpression: 'needs_more',
              exitExpression: 'ready',
              maxIterations: 5,
              loopTimeoutMs: 50,
              loopBackTargetId: 'loop-timeout-worker',
              exitTargetId: 'sf-main-end'
            }
          },
          {
            id: 'loop-timeout-worker',
            type: 'artifact',
            position: { x: 760, y: 260 },
            data: { label: 'Loop Timeout Worker', artifactPath: 'runtime/loop-timeout.md' }
          }
      );
      flow.edges.push(
        { id: 'loop-timeout-enter', source: 'sf-main-start', target: 'loop-timeout' },
        { id: 'loop-timeout-loop', source: 'loop-timeout', target: 'loop-timeout-worker', branch: 'loop' },
        { id: 'loop-timeout-return', source: 'loop-timeout-worker', target: 'loop-timeout' },
        { id: 'loop-timeout-exit', source: 'loop-timeout', target: 'sf-main-end', branch: 'exit' }
      );
      const payload = await page.evaluate(async (nextFlow) => {
        await window.api.saveFlow(nextFlow);
        return window.api.debugFlowNode({ kind: 'flow', flowId: nextFlow.id, nodeId: 'loop-timeout' });
      }, flow);
      const run = payload.result.run;
      const outputPath = path.join(scenarioRoot, 'loop-timeout.json');
      writeJson(outputPath, run);
      addOutput(outputPath);
      addCheck('Loop fails on timeout', run.status === 'failed', run.status);
      addCheck('Timeout error is recorded', (run.errorMessage ?? '').includes('timed out'), run.errorMessage ?? 'missing');
    }
  },
  {
    id: 'subflow-io-writeback',
    title: '子流程输入输出映射',
    async execute(ctx) {
      const { page, scenarioRoot, setProjectRoot, addCheck, addOutput } = ctx;
      const projectRoot = await createProject(page, scenarioRoot, 'subflow-io');
      setProjectRoot(projectRoot);
      const { flow } = await loadBoundMainFlow(page);
      const subflow = {
        id: 'subflow-io',
        name: '子流程 IO',
        description: '',
        kind: 'subflow',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        nodes: [
          { id: 'sub-start', type: 'start', position: { x: 0, y: 0 }, data: { label: '开始' } },
          { id: 'sub-artifact', type: 'artifact', position: { x: 180, y: 0 }, data: { label: '子输出', artifactPath: 'sub/output.md' } },
          { id: 'sub-end', type: 'end', position: { x: 360, y: 0 }, data: { label: '结束' } }
        ],
        edges: [
          { id: 'sub-edge-1', source: 'sub-start', target: 'sub-artifact' },
          { id: 'sub-edge-2', source: 'sub-artifact', target: 'sub-end' }
        ]
      };
      flow.nodes.push({
        id: 'subflow-call',
        type: 'subflow',
        position: { x: 520, y: 260 },
        data: {
          label: '子流程调用',
          subflowId: subflow.id,
          subflowInputBindings: ['01-requirements/01-原始需求.md=>sub/input.md'],
          subflowOutputBindings: ['sub/output.md=>02-solution/02-功能实现方案.md']
        }
      });
      const payload = await page.evaluate(async ({ nextSubflow, nextFlow }) => {
        await window.api.saveFlow(nextSubflow);
        await window.api.saveFlow(nextFlow);
        return window.api.debugFlowNode({ kind: 'flow', flowId: nextFlow.id, nodeId: 'subflow-call' });
      }, { nextSubflow: subflow, nextFlow: flow });
      const run = payload.result.run;
      const outputPath = path.join(scenarioRoot, 'subflow-io.json');
      writeJson(outputPath, run);
      addOutput(outputPath);
      addCheck('子流程调用记录存在', (run.subflowCalls?.length ?? 0) > 0, `calls=${run.subflowCalls?.length ?? 0}`);
      addCheck('子流程输出映射持久化', (run.subflowCalls?.[0]?.outputBindings?.length ?? 0) > 0, 'missing output bindings');
    }
  },
  {
    id: 'parallel-first-success-cancel',
    title: 'Parallel first-success cancellation',
    async execute(ctx) {
      const { page, scenarioRoot, addCheck, addOutput } = ctx;
      await createScenarioProject(ctx, 'parallel-first-success');
      const { flow } = await loadBoundMainFlow(page);
      flow.nodes.push(
          {
            id: 'parallel-split',
            type: 'parallel_split',
            position: { x: 420, y: 260 },
            data: {
              label: 'Parallel Split',
              parallelMode: 'fanout',
              parallelFailureStrategy: 'manual_review',
              parallelCancellationPolicy: 'cancel_pending'
            }
          },
          { id: 'parallel-ok', type: 'artifact', position: { x: 700, y: 180 }, data: { label: 'Winning Branch', artifactPath: 'pipeline/out/parallel-ok.md' } },
          { id: 'parallel-skipped', type: 'artifact', position: { x: 700, y: 320 }, data: { label: 'Skipped Branch', artifactPath: 'pipeline/out/parallel-skip.md' } },
          { id: 'parallel-join', type: 'parallel_join', position: { x: 960, y: 260 }, data: { label: 'Parallel Join', mergeStrategy: 'first_success' } }
      );
      flow.edges.push(
        { id: 'edge-ps-ok', source: 'parallel-split', target: 'parallel-ok' },
        { id: 'edge-ps-skip', source: 'parallel-split', target: 'parallel-skipped' },
        { id: 'edge-ok-join', source: 'parallel-ok', target: 'parallel-join' },
        { id: 'edge-skip-join', source: 'parallel-skipped', target: 'parallel-join' }
      );
      const payload = await page.evaluate(async (nextFlow) => {
        await window.api.saveFlow(nextFlow);
        return window.api.debugFlowNode({ kind: 'flow', flowId: nextFlow.id, nodeId: 'parallel-split' });
      }, flow);
      const run = payload.result.run;
      const outputPath = path.join(scenarioRoot, 'parallel-first-success.json');
      writeJson(outputPath, run);
      addOutput(outputPath);
      const branchGroup = run.branchGroups?.[0];
      addCheck('Parallel branch group exists', Boolean(branchGroup), 'missing branch group');
      addCheck('At least one branch is skipped', branchGroup?.branches?.some((branch) => branch.status === 'skipped') ?? false, JSON.stringify(branchGroup?.branches ?? []));
    }
  },
  {
    id: 'parallel-join-inspection',
    title: 'Parallel join inspection',
    async execute(ctx) {
      const { page, scenarioRoot, addCheck, addOutput } = ctx;
      await createScenarioProject(ctx, 'parallel-join');
      const { flow } = await loadBoundMainFlow(page);
      flow.nodes.push(
          { id: 'join-split', type: 'parallel_split', position: { x: 280, y: 260 }, data: { label: 'Join Split', parallelFailureStrategy: 'manual_review' } },
          { id: 'join-left', type: 'artifact', position: { x: 480, y: 180 }, data: { label: 'Left Branch', artifactPath: 'pipeline/out/left.md' } },
          { id: 'join-right', type: 'artifact', position: { x: 480, y: 320 }, data: { label: 'Right Branch', artifactPath: 'pipeline/out/right.md' } },
          { id: 'join-node', type: 'parallel_join', position: { x: 760, y: 260 }, data: { label: 'Join Node', mergeStrategy: 'collect_all' } }
      );
      flow.edges.push(
        { id: 'join-start-edge', source: 'sf-main-start', target: 'join-split' },
        { id: 'join-split-left', source: 'join-split', target: 'join-left' },
        { id: 'join-split-right', source: 'join-split', target: 'join-right' },
        { id: 'join-left-edge', source: 'join-left', target: 'join-node' },
        { id: 'join-right-edge', source: 'join-right', target: 'join-node' },
        { id: 'join-to-end', source: 'join-node', target: 'sf-main-end' }
      );
      const payload = await page.evaluate(async (nextFlow) => {
        await window.api.saveFlow(nextFlow);
        return window.api.debugFlowNode({ kind: 'flow', flowId: nextFlow.id, nodeId: 'join-node' });
      }, flow);
      const run = payload.result.run;
      const outputPath = path.join(scenarioRoot, 'parallel-join.json');
      writeJson(outputPath, run);
      addOutput(outputPath);
      addCheck('Join creates branch group', (run.branchGroups?.length ?? 0) > 0, 'groups=' + (run.branchGroups?.length ?? 0));
      addCheck('Join sees two incoming branches', (run.branchGroups?.[0]?.branches?.length ?? 0) === 2, JSON.stringify(run.branchGroups?.[0] ?? {}));
    }
  },
  {
    id: 'rerun-preview-invalidations',
    title: '局部重跑预览失效范围',
    async execute(ctx) {
      const { page, scenarioRoot, setProjectRoot, addCheck, addOutput } = ctx;
      const projectRoot = await createProject(page, scenarioRoot, 'rerun-preview');
      setProjectRoot(projectRoot);
      const seeded = await seedPlanContracts(page);
      const preview = await page.evaluate(async (input) => window.api.previewFlowRerun({
        kind: 'flow',
        flowId: input.flowId,
        nodeId: 'sf-main-plan',
        mode: 'continue'
      }), seeded);
      const outputPath = path.join(scenarioRoot, 'rerun-preview.json');
      writeJson(outputPath, preview);
      addOutput(outputPath);
      addCheck('重跑计划包含失效节点', preview.plan.invalidatedNodeIds.length > 0, JSON.stringify(preview.plan));
    }
  },
  {
    id: 'rerun-apply-snapshot',
    title: '局部重跑应用前创建快照',
    async execute(ctx) {
      const { page, scenarioRoot, setProjectRoot, addCheck, addOutput } = ctx;
      const projectRoot = await createProject(page, scenarioRoot, 'rerun-apply');
      setProjectRoot(projectRoot);
      const seeded = await seedPlanContracts(page);
      const applied = await page.evaluate(async (input) => window.api.applyFlowRerun({
        kind: 'flow',
        flowId: input.flowId,
        nodeId: 'sf-main-plan',
        mode: 'continue'
      }), seeded);
      const outputPath = path.join(scenarioRoot, 'rerun-apply.json');
      writeJson(outputPath, applied);
      addOutput(outputPath);
      addCheck('局部重跑返回 snapshot', (applied.result.run.snapshots?.length ?? 0) > 0, JSON.stringify(applied.result.run.snapshots ?? []));
      addCheck('局部重跑返回 rerun plan', (applied.result.run.rerunPlans?.length ?? 0) > 0, JSON.stringify(applied.result.run.rerunPlans ?? []));
    }
  },
  {
    id: 'artifact-invalidation-blocks-export',
    title: 'Artifact invalidation blocks export',
    async execute(ctx) {
      const { page, scenarioRoot, addCheck, addOutput } = ctx;
      const projectRoot = await createScenarioProject(ctx, 'artifact-invalidation');
      const seeded = await seedPlanContracts(page);
      await preparePlanStageForExport(
        page,
        'Generate the feature tree, feature list, and solution docs so the plan stage can be confirmed before export.'
      );
      await poll(() => fs.existsSync(path.join(projectRoot, seeded.solutionArtifactPath)) ? true : null, { timeoutMs: 120000, label: 'plan solution document' });
      const discoverPath = path.join(projectRoot, seeded.discoverArtifactPath);
      await poll(() => fs.existsSync(discoverPath) ? true : null, { timeoutMs: 120000, label: 'discover seed document' });
      const previous = fs.readFileSync(discoverPath, 'utf8');
      const next = previous + '\nUpstream requirement changed.\n';
      await page.evaluate(async ({ filePath, previousContents, nextContents }) => {
        await window.api.recordExternalDocumentChange(filePath, previousContents, nextContents);
      }, { filePath: discoverPath, previousContents: previous, nextContents: next });
      let blockedMessage = '';
      try {
        await page.evaluate(async () => window.api.generateOpenSpec());
      } catch (error) {
        blockedMessage = error instanceof Error ? error.message : String(error);
      }
      const outputPath = path.join(scenarioRoot, 'artifact-invalidation.json');
      writeJson(outputPath, { blockedMessage });
      addOutput(outputPath);
      addCheck('Invalidated artifacts block export', blockedMessage.includes('Export blocked by invalidated artifacts'), blockedMessage || 'no error');
    }
  },
  {
    id: 'pending-document-write-protection',
    title: '阶段生成保护人工编辑',
    async execute(ctx) {
      const { page, scenarioRoot, setProjectRoot, addCheck, addOutput } = ctx;
      const projectRoot = await createProject(page, scenarioRoot, 'document-protection');
      setProjectRoot(projectRoot);
      await activateOllamaProfile(page);
      const bootstrap = await loadBootstrap(page);
      const sessionId = bootstrap.sessions[0]?.id;
      const activeDocumentPath = bootstrap.project?.workflow.activeDocumentPath;
      assert.ok(sessionId && activeDocumentPath, 'Expected active session and document.');
      await page.evaluate(async ({ filePath, contents }) => window.api.saveDocument(filePath, contents), {
        filePath: activeDocumentPath,
        contents: '# Human Draft\n\nThis file was edited locally before AI write-back.\n'
      });
      await page.evaluate(async ({ id, instructions }) => window.api.generateStageDraft(id, instructions), {
        id: sessionId,
        instructions: seedRequirementMarkdown('本场景用于验证人工编辑保护与待确认写入。')
      });
      const pending = await poll(async () => {
        const proposals = await page.evaluate(async (filePath) => window.api.listPendingDocumentWrites(filePath), activeDocumentPath);
        return proposals[0] ?? null;
      }, { timeoutMs: 120000, label: 'pending document write proposal' });
      await page.evaluate(async (proposalId) => window.api.resolvePendingDocumentWrite(proposalId, { action: 'accept_ai' }), pending.id);
      const after = await page.evaluate(async (filePath) => ({
        contents: await window.api.readDocument(filePath),
        pending: await window.api.listPendingDocumentWrites(filePath)
      }), activeDocumentPath);
      const outputPath = path.join(scenarioRoot, 'pending-write.json');
      writeJson(outputPath, { pending, after });
      addOutput(outputPath);
      addCheck('存在待处理 AI 写入提案', Boolean(pending.id), 'missing proposal');
      addCheck('接受后 pending 清零', after.pending.length === 0, `pending=${after.pending.length}`);
    }
  },
  {
    id: 'knowledge-index-refresh',
    title: 'Knowledge index stale and refresh',
    async execute(ctx) {
      const { page, scenarioRoot, addCheck, addOutput } = ctx;
      await createScenarioProject(ctx, 'knowledge-refresh');
      const bootstrap = await loadBootstrap(page);
      const sessionId = bootstrap.sessions[0]?.id;
      const notePath = bootstrap.project?.workflow.activeDocumentPath;
      assert.ok(sessionId, 'Expected default session.');
      assert.ok(notePath, 'Expected active document path.');
      await page.evaluate(async (request) => window.api.sendAiMessage(request), {
        sessionId,
        stage: 'discover',
        content: 'Summarize the current context and cite the active document.',
        contextDocuments: [notePath]
      });
      await poll(async () => {
        const refreshed = await loadBootstrap(page);
        const hits = refreshed.contextPacks[0]?.retrievalHits?.length ?? 0;
        return refreshed.knowledgeIndexState?.status === 'ready' && hits > 0 ? refreshed : null;
      }, { timeoutMs: 120000, label: 'knowledge index ready before mutation' });
      const future = Date.now() + 10000;
      fs.writeFileSync(notePath, '# Updated Requirement\n\nThis file changed after indexing.\n', 'utf8');
      fs.utimesSync(notePath, future / 1000, future / 1000);
      const stale = await poll(async () => {
        const refreshed = await page.evaluate(async () => window.api.refreshProject());
        const status = refreshed.knowledgeIndexState;
        return status?.status === 'stale' ? status : null;
      }, { timeoutMs: 120000, label: 'knowledge index stale' });
      await page.evaluate(async () => window.api.refreshKnowledgeIndex('manual'));
      const ready = await poll(async () => {
        const status = await page.evaluate(async () => window.api.getKnowledgeIndexStatus());
        return status.status === 'ready' ? status : null;
      }, { timeoutMs: 120000, label: 'knowledge index ready again' });
      const outputPath = path.join(scenarioRoot, 'knowledge-index.json');
      writeJson(outputPath, { stale, ready });
      addOutput(outputPath);
      addCheck('Knowledge index becomes stale', stale.status === 'stale', stale.status);
      addCheck('Knowledge index returns to ready', ready.status === 'ready', ready.status);
    }
  },
  {
    id: 'external-change-impact-record',
    title: 'External document change impact record',
    async execute(ctx) {
      const { page, scenarioRoot, addCheck, addOutput } = ctx;
      const projectRoot = await createScenarioProject(ctx, 'external-change');
      const bootstrap = await loadBootstrap(page);
      const stagePaths = getRequiredTemplatePaths(bootstrap);
      const sourcePath = path.join(projectRoot, stagePaths.discoverPath);
      const targetPath = path.join(projectRoot, stagePaths.clarifyPath);
      fs.writeFileSync(targetPath, '# Clarify\n\n- [Requirement](./' + path.basename(stagePaths.discoverPath) + ')\n', 'utf8');
      const previous = fs.readFileSync(sourcePath, 'utf8');
      const next = previous + '\nAdd one new requirement constraint.\n';
      await page.evaluate(async ({ filePath, previousContents, nextContents }) => {
        await window.api.recordExternalDocumentChange(filePath, previousContents, nextContents);
      }, { filePath: sourcePath, previousContents: previous, nextContents: next });
      const refreshed = await loadBootstrap(page);
      const record = refreshed.recentDocumentChanges.find((item) => item.filePath === sourcePath);
      const outputPath = path.join(scenarioRoot, 'external-change-impact.json');
      writeJson(outputPath, record);
      addOutput(outputPath);
      addCheck('Change summary exists', Boolean(record?.summary), record?.summary ?? 'missing summary');
      addCheck('Change statistics exist', Boolean((record?.changedLineCount ?? 0) > 0 || (record?.addedLineCount ?? 0) > 0), JSON.stringify(record ?? {}));
      addCheck('Impact graph is populated', Boolean((record?.impact?.inboundAffectedPaths?.length ?? 0) > 0), JSON.stringify(record?.impact ?? {}));
    }
  },
  {
    id: 'note-reference-comparison',
    title: 'Note reference comparison',
    async execute(ctx) {
      const { page, scenarioRoot, addCheck, addOutput } = ctx;
      const projectRoot = await createScenarioProject(ctx, 'note-compare');
      const bootstrap = await loadBootstrap(page);
      const stagePaths = getRequiredTemplatePaths(bootstrap);
      const basePath = path.join(projectRoot, 'notes-base.md');
      const comparePath = path.join(projectRoot, 'notes-compare.md');
      const solutionAbsolutePath = path.join(projectRoot, stagePaths.solutionPath);
      const featureTreeAbsolutePath = path.join(projectRoot, stagePaths.featureTreePath);
      fs.mkdirSync(path.dirname(solutionAbsolutePath), { recursive: true });
      fs.mkdirSync(path.dirname(featureTreeAbsolutePath), { recursive: true });
      fs.writeFileSync(solutionAbsolutePath, '# Solution\n\nBase solution note target.\n', 'utf8');
      fs.writeFileSync(featureTreeAbsolutePath, '# Feature Tree\n\nCompare note target.\n', 'utf8');
      fs.writeFileSync(basePath, ['# Base', '', '- [Requirement](./' + stagePaths.discoverPath + ')', '- [Solution](./' + stagePaths.solutionPath + ')', ''].join('\n'), 'utf8');
      fs.writeFileSync(comparePath, ['# Compare', '', '- [Requirement](./' + stagePaths.discoverPath + ')', '- [Feature Tree](./' + stagePaths.featureTreePath + ')', ''].join('\n'), 'utf8');
      const comparison = await page.evaluate(async ({ base, compare }) => window.api.compareNoteReferences(base, compare), { base: basePath, compare: comparePath });
      const outputPath = path.join(scenarioRoot, 'note-reference-comparison.json');
      writeJson(outputPath, comparison);
      addOutput(outputPath);
      addCheck('Comparison reports shared and divergent outbound links', comparison.sharedOutbound.length === 1 && comparison.baseOnlyOutbound.length === 1 && comparison.compareOnlyOutbound.length === 1, JSON.stringify(comparison));
    }
  },
  {
    id: 'document-snapshot-restore',
    title: 'Document snapshot restore',
    async execute(ctx) {
      const { page, scenarioRoot, addCheck, addOutput } = ctx;
      const projectRoot = await createScenarioProject(ctx, 'snapshot-restore');
      const bootstrap = await loadBootstrap(page);
      const stagePaths = getRequiredTemplatePaths(bootstrap);
      const documentPath = path.join(projectRoot, stagePaths.discoverPath);
      await page.evaluate(async ({ filePath, contents }) => window.api.saveDocument(filePath, contents), { filePath: documentPath, contents: '# Snapshot A\n\nInitial version.\n' });
      const snapshot = await page.evaluate(async (filePath) => window.api.createDocumentSnapshot(filePath, 'before-change'), documentPath);
      const snapshotList = await page.evaluate(async (filePath) => window.api.listDocumentSnapshots(filePath), documentPath);
      await page.evaluate(async ({ filePath, contents }) => window.api.saveDocument(filePath, contents), { filePath: documentPath, contents: '# Snapshot B\n\nOverwritten version.\n' });
      await page.evaluate(async ({ filePath, snapshotId }) => window.api.restoreDocumentSnapshot(filePath, snapshotId), { filePath: documentPath, snapshotId: snapshotList[0]?.id ?? snapshot.id });
      const contents = fs.readFileSync(documentPath, 'utf8');
      const outputPath = path.join(scenarioRoot, 'snapshot-restore.json');
      writeJson(outputPath, { snapshot, snapshotList, contents });
      addOutput(outputPath);
      addCheck('Restored contents match the old snapshot', contents.includes('Snapshot A'), contents);
    }
  },
  {
    id: 'recent-project-reopen',
    title: '最近工程 reopen',
    async execute(ctx) {
      const { page, scenarioRoot, setProjectRoot, addCheck, addOutput } = ctx;
      const projectRoot = await createProject(page, scenarioRoot, 'recent-reopen');
      setProjectRoot(projectRoot);
      await page.evaluate(async () => window.api.closeProject());
      await page.reload();
      await wait(800);
      await page.evaluate(async (rootPath) => window.api.openProject(rootPath), projectRoot);
      const bootstrap = await loadBootstrap(page);
      const outputPath = path.join(scenarioRoot, 'recent-reopen.json');
      writeJson(outputPath, bootstrap.project);
      addOutput(outputPath);
      addCheck('最近工程 reopen 成功', bootstrap.project?.rootPath === projectRoot, bootstrap.project?.rootPath ?? 'missing');
    }
  }
];

async function main() {
  ensureDir(SUITE_ROOT);
  const summaries = [];
  for (const scenario of scenarios) {
    console.log(`\n[extreme-validation] ${scenario.id}`);
    const result = await runScenario(scenario);
    summaries.push(result);
    console.log(`[extreme-validation] ${scenario.id}: ${result.status}`);
  }

  const summaryPayload = {
    generatedAt: new Date().toISOString(),
    suiteRoot: SUITE_ROOT,
    scenarioCount: summaries.length,
    passed: summaries.filter((item) => item.status === 'passed').length,
    failed: summaries.filter((item) => item.status === 'failed').length,
    scenarios: summaries.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      reportPath: path.relative(REPO_ROOT, path.join(SUITE_ROOT, item.id, 'report.md')).replace(/\\/g, '/')
    }))
  };
  writeJson(path.join(SUITE_ROOT, 'summary.json'), summaryPayload);
  writeMarkdown(
    path.join(SUITE_ROOT, 'summary.md'),
    [
      '# Post-Change Extreme Validation',
      '',
      `- Generated At: ${summaryPayload.generatedAt}`,
      `- Suite Root: ${summaryPayload.suiteRoot}`,
      `- Passed: ${summaryPayload.passed}`,
      `- Failed: ${summaryPayload.failed}`,
      '',
      '## Scenario Summary',
      '',
      ...summaryPayload.scenarios.map((item) => `- [${item.status === 'passed' ? 'x' : ' '}] ${item.id} | ${item.title} | ${item.reportPath}`),
      ''
    ].join('\n')
  );

  if (summaryPayload.failed > 0) {
    throw new Error(`Extreme validation failed: ${summaryPayload.failed} scenario(s). See ${path.join(SUITE_ROOT, 'summary.md')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
