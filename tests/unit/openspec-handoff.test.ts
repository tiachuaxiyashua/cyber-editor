import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildOpenSpecTasks,
  type OpenSpecSourceArtifact
} from '../../src/main/services/openspec-handoff';

type ReviewMarkdownArtifact = (
  filePath: string,
  options?: { qualityTier?: 'strict' | 'assistive' }
) => {
  score: number;
  verdict: string;
  dimensions: Record<string, number>;
  deliveryScore?: number;
  deliveryBand?: string;
  deliveryVerdict?: string;
  deliveryReasons?: string[];
  reasons: string[];
};

const tempDirs: string[] = [];

async function loadReviewer(): Promise<ReviewMarkdownArtifact> {
  const module = await import('../../scripts/lib/output-quality-review.mjs');
  return module.reviewMarkdownArtifact as ReviewMarkdownArtifact;
}

function writeTempMarkdown(name: string, content: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-openspec-handoff-'));
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

describe('OpenSpec handoff tasks', () => {
  it('keeps generated tasks above the 90+ delivery bar for real handoff review', async () => {
    const reviewMarkdownArtifact = await loadReviewer();
    const artifacts: OpenSpecSourceArtifact[] = [
      {
        stage: 'discover',
        path: '01-requirements/01-原始需求.md',
        title: '原始需求',
        purpose: '整理一句话目标、边界和成功标准',
        promptProfileId: 'discover-default',
        validatorId: 'requirements-discovery',
        absolutePath: 'E:/demo/01-requirements/01-原始需求.md',
        content: [
          '# 原始需求',
          '',
          '## 核心价值',
          '- 明确 `01-requirements/`、`02-solution/` 与 `03-openspec/exports/` 的边界。',
          '- 把一句话目标沉淀成可复用的项目基线，并写清 90 分验收门槛。'
        ].join('\n')
      },
      {
        stage: 'clarify',
        path: '01-requirements/02-需求澄清.md',
        title: '需求澄清',
        purpose: '补齐输入输出合同、失败恢复和导出边界',
        promptProfileId: 'clarify-default',
        validatorId: 'requirements-clarify',
        absolutePath: 'E:/demo/01-requirements/02-需求澄清.md',
        content: [
          '# 需求澄清',
          '',
          '## 输入与输出',
          '- 输出包含 `md + txt + pdf + openspec`。',
          '- 任何 401/403、路径冲突或人工编辑冲突都必须可恢复、可回滚。'
        ].join('\n')
      },
      {
        stage: 'plan',
        path: '02-solution/01-技术方案.md',
        title: '技术方案',
        purpose: '明确编排、验证、证据与导出实现路径',
        promptProfileId: 'plan-default',
        validatorId: 'technology-solution',
        absolutePath: 'E:/demo/02-solution/01-技术方案.md',
        content: [
          '# 技术方案',
          '',
          '## 验证',
          '- 执行 `npm run lint`、`npm run test:unit`、`npm run build` 和 `npm run test:post-change-extreme`。',
          '- 交付摘要需要让另一个 AI 不依赖额外背景即可复现。'
        ].join('\n')
      }
    ];
    const tasks = buildOpenSpecTasks(artifacts, {
      exportRoot: '03-openspec/exports',
      exportFormatSummary: 'md + txt + pdf + openspec'
    });
    const filePath = writeTempMarkdown('tasks.md', tasks);

    const review = reviewMarkdownArtifact(filePath, { qualityTier: 'strict' });

    expect(tasks).toContain('01-requirements/01-原始需求.md');
    expect(tasks).toContain('03-openspec/exports/');
    expect(tasks).toContain('npm run test:post-change-extreme');
    expect(review.deliveryScore).toBeGreaterThanOrEqual(90);
    expect(review.deliveryVerdict).toBe('pass');
    expect(review.reasons).toHaveLength(0);
  });

  it('derives source and export directory guidance from the template-owned paths', () => {
    const tasks = buildOpenSpecTasks([
      {
        stage: 'discover',
        path: '01-office-hours/01-demand-reality.md',
        title: 'Demand Reality',
        purpose: 'Capture user demand.',
        promptProfileId: 'discover-default',
        validatorId: 'requirements-discovery',
        absolutePath: 'E:/demo/01-office-hours/01-demand-reality.md',
        content: '# Demand Reality\n'
      },
      {
        stage: 'plan',
        path: '02-governance/01-rollout-plan.md',
        title: 'Rollout Plan',
        purpose: 'Plan the rollout.',
        promptProfileId: 'plan-default',
        validatorId: 'technology-solution',
        absolutePath: 'E:/demo/02-governance/01-rollout-plan.md',
        content: '# Rollout Plan\n'
      }
    ], {
      exportRoot: 'handoff/openspec/exports',
      exportFormatSummary: 'md + txt + pdf + openspec'
    });

    expect(tasks).toContain('`01-office-hours/`');
    expect(tasks).toContain('`02-governance/`');
    expect(tasks).toContain('`handoff/openspec/exports/`');
    expect(tasks).not.toContain('03-openspec/exports/');
  });
});
