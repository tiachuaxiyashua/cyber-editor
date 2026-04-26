import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

async function loadReviewer() {
  const module = await import('../../scripts/lib/output-quality-review.mjs');
  return module.reviewMarkdownArtifact as (
    filePath: string,
    options?: { qualityTier?: 'strict' | 'assistive' }
  ) => {
    score: number;
    verdict: string;
    dimensions: Record<string, number>;
    bulletCount: number;
    tableRowCount: number;
    listMarkerCount: number;
    deliveryScore?: number;
    deliveryBand?: string;
    deliveryVerdict?: string;
    deliveryReasons?: string[];
    reasons: string[];
  };
}

function writeTempMarkdown(name: string, content: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-output-quality-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('output quality review', () => {
  it('marks generic discovery docs as below the 90+ delivery bar even when structure is complete', async () => {
    const reviewMarkdownArtifact = await loadReviewer();
    const filePath = writeTempMarkdown('discover.md', [
      '# 原始需求',
      '',
      '## 目标用户',
      '- 内容团队需要更高效地整理资料。',
      '- 管理者希望看到统一结果。',
      '',
      '## 核心问题',
      '- 当前效率较低。',
      '- 协作经常返工。',
      '',
      '## 核心价值',
      '- 提高效率。',
      '- 保持一致性。',
      '',
      '## 显性限制',
      '- 当前只做桌面端。',
      '- 先输出 Markdown。',
      '',
      '## 待确认问题',
      '- 是否支持更多模板？',
      '- 是否支持更多导出格式？',
      ''
    ].join('\n'));

    const review = reviewMarkdownArtifact(filePath, { qualityTier: 'strict' });

    expect(review.score).toBeGreaterThan(50);
    expect(review.deliveryScore).toBeDefined();
    expect(review.deliveryScore).toBeLessThan(90);
    expect(review.deliveryReasons?.join(' ')).toMatch(/specificity|actionability|generic/i);
  });

  it('rates concrete, contract-driven docs above the 90+ delivery bar', async () => {
    const reviewMarkdownArtifact = await loadReviewer();
    const filePath = writeTempMarkdown('clarify.md', [
      '# 需求澄清',
      '',
      '## 使用方式',
      '- 运营负责人在欢迎页创建工程后进入 `01-requirements/01-原始需求.md`，先补齐范围，再点击生成进入澄清阶段。',
      '- 审查负责人在主工作台检查 `阶段`、`未保存数量` 与右侧 AI 会话栏，确认无阻断后再导出交付包。',
      '- 如果发现上游文档被外部修改，用户必须先执行“检查外部变更”，再选择恢复、合并或重跑。',
      '',
      '## 输入与输出',
      '- 输入包括一句话目标、`input/notes/*.md`、流程定义 `flows/main.flow.json` 与本地规则文件 `rules/project/*.md`。',
      '- 输出包括 `01-requirements/*.md`、`02-solution/*.md`、`03-openspec/exports/` 下的 `md + txt + pdf + openspec` 交付物。',
      '- 所有输出必须保留目录、命名规则、工件责任人和验收状态字段，便于重跑和审计。',
      '',
      '## 关键约束',
      '- 只允许桌面端本地运行；联网市场先不做，但 `browse_web` 无头浏览器必须仅访问公开互联网地址，禁止 `127.0.0.1`、局域网和文件协议。',
      '- 任何 AI 写回在覆盖人工修改前都必须进入合并保护；如果质量评分低于 90，则阻断确认并要求修复。',
      '- 导出前必须通过 20 个复杂场景回归、类型检查、构建和打包验证。',
      '',
      '## 风险与边界',
      '- 若模型输出缺失路径、输入输出合同、失败恢复或验收条件，系统应自动修复一次；仍不达标则阻断并记录证据。',
      '- 若连接器鉴权缺失或返回 401/403，资源中心必须明确显示认证缺失，而不是泛化为普通失败。',
      '- 当前不覆盖远程模板市场和多实例联网协作；这些能力只作为后续扩展边界保留。',
      '',
      '## 待确认问题',
      '- 下一阶段是否把 `03-openspec/specs/` 的模块边界也写回到编排节点说明中？',
      '- 是否需要把人工确认节点的审批记录同步写入 `artifacts/post-change-extreme-validation/` 作为长期证据？',
      '',
      '## 下一阶段输入',
      '- 下一阶段直接使用本文件中的输入输出合同、失败恢复、导出路径和 90 分质量门槛作为方案、测试与交付的共同基线。',
      '- 开发前先验证 `npm run test:post-change-extreme`、`npm run review:output-quality -- <file>` 与 `npm run package` 都可复现。',
      ''
    ].join('\n'));

    const review = reviewMarkdownArtifact(filePath, { qualityTier: 'strict' });

    expect(review.deliveryScore).toBeGreaterThanOrEqual(90);
    expect(review.deliveryVerdict).toBe('pass');
    expect((review.deliveryReasons ?? []).length).toBe(0);
  });

  it('keeps the software-factory discovery fallback above the 90+ delivery bar', async () => {
    const reviewMarkdownArtifact = await loadReviewer();
    const templatePackagePath = path.resolve('src/shared/template-packages/software-factory.json');
    const templatePackage = JSON.parse(fs.readFileSync(templatePackagePath, 'utf8')) as {
      runtime?: {
        artifactSchemas?: Array<{ id?: string; deterministicFallbackContent?: string }>;
      };
    };
    const discoverFallback = templatePackage.runtime?.artifactSchemas?.find(
      (item) => item.id === 'requirements-discovery'
    )?.deterministicFallbackContent;

    expect(discoverFallback).toBeTruthy();

    const filePath = writeTempMarkdown('software-factory-discovery-fallback.md', discoverFallback!);
    const review = reviewMarkdownArtifact(filePath, { qualityTier: 'strict' });

    expect(review.deliveryScore).toBeGreaterThanOrEqual(90);
    expect(review.deliveryVerdict).toBe('pass');
    expect((review.deliveryReasons ?? []).length).toBe(0);
  });

  it('keeps the software-factory clarify fallback above the 90+ delivery bar', async () => {
    const reviewMarkdownArtifact = await loadReviewer();
    const templatePackagePath = path.resolve('src/shared/template-packages/software-factory.json');
    const templatePackage = JSON.parse(fs.readFileSync(templatePackagePath, 'utf8')) as {
      runtime?: {
        artifactSchemas?: Array<{ id?: string; deterministicFallbackContent?: string }>;
      };
    };
    const clarifyFallback = templatePackage.runtime?.artifactSchemas?.find(
      (item) => item.id === 'requirements-clarify'
    )?.deterministicFallbackContent;

    expect(clarifyFallback).toBeTruthy();

    const filePath = writeTempMarkdown('software-factory-clarify-fallback.md', clarifyFallback!);
    const review = reviewMarkdownArtifact(filePath, { qualityTier: 'strict' });

    expect(review.deliveryScore).toBeGreaterThanOrEqual(90);
    expect(review.deliveryVerdict).toBe('pass');
    expect((review.deliveryReasons ?? []).length).toBe(0);
  });

  it('does not fail delivery quality when TODO appears only in inline code examples', async () => {
    const reviewMarkdownArtifact = await loadReviewer();
    const filePath = writeTempMarkdown('delivery-todo-example.md', [
      '# Delivery Summary',
      '',
      '## Scope',
      '- Final package includes `exports/manifest.json`, review evidence, and rollback notes.',
      '- Acceptance requires concrete owners, commands, paths, and recovery steps for each deliverable.',
      '',
      '## Rules',
      '- The document must not ship with unresolved markers such as `TODO` or `[待补充]` in user-facing content.',
      '- Acceptance requires no deterministic fallback marker, placeholder wording, empty section, or generic demo content.',
      '- Reviewers should block handoff if generated text still contains unresolved scaffolding outside quoted examples.',
      '',
      '## Verification',
      '- Run `npm run build`, `npm run test:unit`, and `npm run review:output-quality -- <file>` before handoff.',
      '- Save logs under `artifacts/post-change-extreme-validation/` so another AI can replay the delivery path.',
      '',
      '## Recovery',
      '- If export validation fails, restore the last accepted artifact, regenerate the package, and re-run the review gate.',
      '- If a stage rerun changes scope, record the delta, approval owner, and evidence links before confirming delivery.'
    ].join('\n'));

    const review = reviewMarkdownArtifact(filePath, { qualityTier: 'strict' });

    expect(review.deliveryVerdict).not.toBe('fail');
    expect(review.deliveryScore).toBeGreaterThan(59);
    expect(review.reasons.join(' ')).not.toMatch(/placeholder patterns detected/i);
  });

  it('does not pass strict clarify artifacts that miss explicit next-stage inputs', async () => {
    const reviewMarkdownArtifact = await loadReviewer();
    const filePath = writeTempMarkdown('clarify-missing-next-stage-inputs.md', [
      '# 需求澄清',
      '',
      '## 使用方式',
      '- 运营负责人在欢迎页创建工程后进入 `01-requirements/01-原始需求.md`，补齐范围、交付对象和验收方式。',
      '- 审查负责人在主工作台检查 `阶段`、未保存状态与 AI 侧栏提示，再决定是否继续细化当前范围并准备导出。',
      '- 编排负责人在流编排页调整节点、子流程和导出映射，再回到主工作台继续生成与审查文档。',
      '',
      '## 输入与输出',
      '- 输入包括 `input/notes/*.md`、`flows/main.flow.json`、`rules/project/*.md` 与本地审查记录。',
      '- 输出工件包括 `01-requirements/*.md`、`02-solution/*.md`、`03-stage-plans/*.md`、`03-openspec/specs/*` 与 `03-openspec/exports/` 下的交付包。',
      '- 输出格式必须覆盖 `md`、`txt`、`pdf` 与 `openspec`；输出目录结构固定为 `01-requirements/`、`02-solution/`、`03-stage-plans/`、`03-openspec/exports/` 四层。',
      '- 文档结构需要包含输入来源、处理动作、失败恢复、责任人和验收状态，避免交付阶段再次补写。',
      '',
      '## 关键约束',
      '- 当前只支持桌面端本地运行，联网市场先不启用，但 `browse_web` 无头浏览器必须只访问公开互联网地址。',
      '- 任意 AI 生成内容在覆盖人工修改前都必须进入合并保护；交付评分低于 90 时禁止阶段确认。',
      '- 导出前必须通过 lint、unit、build、post-change-extreme validation 与输出质量门禁，并保存证据。',
      '',
      '## 风险与边界',
      '- 如果输入目录缺失或文件被外部改写，系统必须提示冲突并要求恢复、合并或重跑。',
      '- 如果连接器鉴权失败或返回 401/403，资源中心必须明确显示认证缺失，而不是笼统提示未知失败。',
      '- 如果导出目录结构被改写、manifest 缺字段或证据包不完整，系统必须阻断交付并提示修复路径。',
      '',
      '## 待确认问题',
      '- 是否需要把审批记录同步写入 `artifacts/post-change-extreme-validation/` 作为长期证据？',
      '- 是否要为导出目录增加固定 manifest 模板，避免不同项目各自扩展？',
      '- 是否需要把失败恢复脚本也放进交付包，让另一个 AI 无需额外背景即可接手？'
    ].join('\n'));

    const review = reviewMarkdownArtifact(filePath, { qualityTier: 'strict' });

    expect(review.deliveryVerdict).not.toBe('pass');
    expect(review.reasons.join(' ')).toMatch(/next-stage inputs/i);
    expect(review.score).toBeLessThan(100);
  });

  it('treats table-driven feature lists as structured delivery artifacts', async () => {
    const reviewMarkdownArtifact = await loadReviewer();
    const filePath = writeTempMarkdown('04-\u529f\u80fd\u6e05\u5355.md', [
      '# \u529f\u80fd\u6e05\u5355',
      '',
      '## \u539f\u5b50\u529f\u80fd\u4e0e\u4f9d\u8d56\u5173\u7cfb',
      '### 1. Input capture and baseline drafting',
      '| Atomic capability | Trigger | Input | Output | Dependency | Done bar | Recovery | Acceptance | Next action |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| Draft original requirement baseline | User creates a project from the welcome page | one-line goal, `input/notes/brief.md` | `01-requirements/01-original.md` | none | document length >= 760, includes actor, scope, evidence path, and acceptance bar | rerun generation once, then merge manual edits instead of overwrite | reviewer can verify paths, owners, and rerun notes directly in the artifact | enter clarify stage |',
      '| Generate clarify package | User confirms discovery output and starts clarify stage | `01-requirements/01-original.md`, `rules/project/review.md` | `01-requirements/02-clarify.md` | original baseline artifact | clarify contract calls out inputs, outputs, risks, export paths, and downstream handoff | restore accepted baseline and regenerate with conflict note if output drifts | another AI can continue without extra background because scope and path contracts are explicit | enter planning stage |',
      '',
      '### 2. Planning and solution decomposition',
      '| Atomic capability | Trigger | Input | Output | Dependency | Done bar | Recovery | Acceptance | Next action |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| Build feature tree | Planner enters the planning stage from the main workbench | `01-requirements/02-clarify.md`, current flow graph | `01-requirements/03-feature-tree.md` | clarify package | feature tree maps user-facing capabilities, ownership, and validation checkpoints | rerun tree generation after conflict check and preserve previous accepted branch | acceptance review can trace every node back to a source artifact and user goal | continue with atomic feature list |',
      '| Build atomic feature list | Planner locks the scope and exports stage inputs | `01-requirements/03-feature-tree.md`, `flows/main.flow.json` | `01-requirements/04-feature-list.md` | feature tree | each row defines trigger, dependency, done bar, recovery path, acceptance rule, and next action | reopen planning stage, repair missing paths, and regenerate only affected rows | output is executable enough for engineering and review without supplemental explanation | continue with technical solution |',
      '',
      '### 3. Delivery and audit handoff',
      '| Atomic capability | Trigger | Input | Output | Dependency | Done bar | Recovery | Acceptance | Next action |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| Export delivery package | Reviewer confirms no unresolved blockers in the project | `02-solution/*.md`, accepted review notes | `03-openspec/exports/` package with `md + txt + pdf + openspec` | validated solution docs | export manifest lists every path, owner, quality gate result, and runtime evidence link | rerun export after fixing manifest gaps or broken evidence links | delivery package is reproducible on a clean machine with isolated userData | archive change set |',
      '| Record audit evidence | System passes `npm run lint`, `npm run test:unit`, `npm run build`, and `npm run test:post-change-extreme` | run logs, screenshots, manifests | `artifacts/post-change-extreme-validation/` evidence pack | successful validation run | evidence pack contains commands, timestamps, failure handling, and reviewer conclusion | keep the failed pack, regenerate only after the blocking issue is fixed, and compare deltas | auditors can replay the exact delivery path and verify no hidden manual steps remain | close the delivery loop |',
      ''
    ].join('\n'));

    const review = reviewMarkdownArtifact(filePath, { qualityTier: 'strict' });

    expect(review.bulletCount).toBe(0);
    expect(review.deliveryScore).toBeGreaterThanOrEqual(90);
    expect(review.deliveryVerdict).toBe('pass');
    expect(review.reasons).not.toContain('only 0 list markers found');
  });
});
