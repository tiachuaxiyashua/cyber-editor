import { describe, expect, it } from 'vitest';
import { validateArtifact } from '../../src/shared/artifact-validators.js';
import { AiService } from '../../src/main/services/ai-service.js';

describe('AiService mock artifact generation', () => {
  it('generates strict discovery markdown that passes artifact validation', async () => {
    const service = new AiService();
    const content = await service.complete(
      { provider: 'mock', baseUrl: '', model: 'mock-chat', apiKey: '' },
      {
        system: [
          '你是需求梳理员。',
          '请直接输出结构化 Markdown，不要输出额外解释、道歉、提问回问或元评论。',
          '必须使用以下标题并保持原样：',
          '# 原始需求',
          '## 目标用户',
          '## 核心问题',
          '## 核心价值',
          '## 显性限制',
          '## 待确认问题'
        ].join('\n'),
        user: [
          '产品意图：把模糊想法沉淀为结构化文档。',
          '约束：本地优先、可恢复、可人工确认。',
          '阶段补充指令：优先保证结构清晰和下一步可执行。',
          '当前会话摘要：',
          '用户希望先形成需求基线，再继续方案与测试。'
        ].join('\n')
      }
    );

    const validation = validateArtifact(content, {
      id: 'requirements-discovery',
      title: '原始需求',
      kind: 'markdown',
      requiredHeadings: [
        '# 原始需求',
        '## 目标用户',
        '## 核心问题',
        '## 核心价值',
        '## 显性限制',
        '## 待确认问题'
      ],
      minimumLength: 560,
      qualityTier: 'strict',
      minimumQualityScore: 84
    });

    expect(validation.ok).toBe(true);
    expect(validation.qualityVerdict).toBe('accepted');
    expect(content).toContain('## 核心价值');
    expect(content).toContain('成功标准');
  });

  it('keeps generic strict planning markdown free of role-specific hardcoded headings', async () => {
    const service = new AiService();
    const content = await service.complete(
      { provider: 'mock', baseUrl: '', model: 'mock-chat', apiKey: '' },
      {
        system: '你是技术方案代理。请基于当前需求和功能清单给出可落地技术方案，明确模块、边界、依赖和风险，输出 Markdown。',
        user: [
          '产品意图：重构 Cyber Editor 的运行时状态与文档写回保护。',
          '约束：不能破坏现有工作台、编排页和规则中心。',
          '工件目标：形成当前阶段技术方案。'
        ].join('\n')
      }
    );

    const validation = validateArtifact(content, {
      id: 'technology-solution',
      title: '技术方案',
      kind: 'markdown',
      requiredHeadings: ['#', '##'],
      qualityTier: 'strict',
      minimumQualityScore: 76
    });

    expect(validation.ok).toBe(true);
    expect(validation.qualityScore).toBeGreaterThanOrEqual(76);
    expect(content).toContain('## 当前目标');
    expect(content).toContain('## 风险与恢复');
    expect(content).not.toContain('## 模块边界');
    expect(content).not.toContain('## 风险与缓解');
  });
});
