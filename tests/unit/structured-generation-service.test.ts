import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { StructuredGenerationService } from '../../src/main/services/structured-generation-service.js';

describe('StructuredGenerationService', () => {
  it('marks accepted assistive mermaid fallback as repaired evidence while preserving fallback provenance', async () => {
    const responses = ['not-a-diagram', 'still-not-a-diagram'];
    const service = new StructuredGenerationService({
      complete: async () => responses.shift() ?? 'not-a-diagram'
    } as never);

    const result = await service.generateMarkdown(
      { provider: 'mock', baseUrl: '', model: 'mock-model', apiKey: '' },
      { system: 'draw a flow', user: 'generate a mermaid chart' },
      { id: 'mermaid-flow', title: '流程图', kind: 'mermaid' }
    );

    expect(result.content).toContain('flowchart TD');
    expect(result.repaired).toBe(true);
    expect(result.accepted).toBe(true);
    expect(result.verdict).toBe('repaired');
    expect(result.outputs.find((item) => item.label === 'validated-artifact')?.qualityVerdict).toBe('repaired');
    expect(result.outputs.some((item) => item.label === 'deterministic-fallback')).toBe(true);
  });

  it('rejects generic strict markdown fallback when no schema-specific rescue exists', async () => {
    const responses = ['bad output', 'still bad output'];
    const service = new StructuredGenerationService({
      complete: async () => responses.shift() ?? 'bad output'
    } as never);

    await expect(service.generateMarkdown(
      { provider: 'mock', baseUrl: '', model: 'mock-model', apiKey: '' },
      { system: 'generate requirements', user: 'write a requirement doc' },
      {
        id: 'strict-generic-markdown',
        title: 'Strict Generic Artifact',
        kind: 'markdown',
        requiredHeadings: ['# Strict Generic Artifact', '## Context', '## Actions'],
        minimumLength: 600
      }
    )).rejects.toThrow('Structured generation repair failed');
  });

  it('accepts discovery fallback when strict schema-specific structure is available', async () => {
    const responses = ['bad output', 'still bad output'];
    const service = new StructuredGenerationService({
      complete: async () => responses.shift() ?? 'bad output'
    } as never);
    const templatePackage = JSON.parse(
      fs.readFileSync(path.resolve('src/shared/template-packages/software-factory.json'), 'utf8')
    ) as {
      runtime?: {
        artifactSchemas?: Array<{ id?: string; deterministicFallbackContent?: string }>;
      };
    };
    const discoveryFallback = templatePackage.runtime?.artifactSchemas?.find(
      (item) => item.id === 'requirements-discovery'
    )?.deterministicFallbackContent;
    expect(discoveryFallback).toBeTruthy();
    const schema = {
      id: 'requirements-discovery',
      title: '原始需求',
      kind: 'markdown',
      requiredHeadings: ['# 原始需求', '## 目标用户', '## 核心问题', '## 核心价值', '## 显性限制', '## 待确认问题'],
      minimumLength: 200,
      deterministicFallbackContent: discoveryFallback
    } as any;

    const result = await service.generateMarkdown(
      { provider: 'mock', baseUrl: '', model: 'mock-model', apiKey: '' },
      { system: 'generate requirements', user: 'write a requirement doc' },
      schema
    );

    expect(result.repaired).toBe(true);
    expect(result.usedDeterministicFallback).toBe(true);
    expect(result.accepted).toBe(true);
    expect(result.verdict).toBe('repaired');
    expect(result.outputs.find((item) => item.label === 'validated-artifact')?.qualityVerdict).toBe('repaired');
    expect(result.content).toContain('## 目标用户');
    expect(result.content).toContain('成功标准');
    expect(result.content).toContain('## 下一步');
    expect(result.content).toContain('当前阶段只覆盖桌面端本地工程');
  });

  it('passes schema and density constraints into the repair prompt', async () => {
    const complete = vi.fn(async () => [
      '# 原始需求',
      '',
      '## 目标用户',
      '- 内容管理者需要快速梳理模糊想法。',
      '- 团队成员需要共享统一需求口径。',
      '',
      '## 核心问题',
      '- 当前需求输入零散，难以直接进入后续设计。',
      '- 用户不知道应该补哪些边界条件。',
      '',
      '## 核心价值',
      '- 自动整理为结构化初稿。',
      '- 让后续方案与测试可以直接承接。',
      '',
      '## 显性限制',
      '- 首阶段聚焦桌面端。',
      '- 输出物以 Markdown 为主。',
      '',
      '## 待确认问题',
      '- 是否需要多人协作审批。',
      '- 是否需要额外导出格式。',
      '',
      '补充细节补充细节补充细节补充细节补充细节补充细节补充细节补充细节补充细节补充细节'
    ].join('\n'));
    const service = new StructuredGenerationService({ complete } as never);

    const result = await service.coerceMarkdown(
      { provider: 'mock', baseUrl: '', model: 'mock-model', apiKey: '' },
      { system: 'generate requirements', user: 'write a requirement doc' },
      {
        id: 'requirements-discovery',
        title: '原始需求',
        kind: 'markdown',
        requiredHeadings: ['# 原始需求', '## 目标用户', '## 核心问题', '## 核心价值', '## 显性限制', '## 待确认问题'],
        minimumLength: 200
      },
      '# 原始需求\n\n## 目标用户\n- 太短了\n',
      { qualityTier: 'strict', minimumQualityScore: 76 }
    );

    expect(complete).toHaveBeenCalledTimes(1);
    const repairCall = complete.mock.calls[0] as unknown as [unknown, { system: string; user: string }];
    const repairInput = repairCall[1];
    expect(repairInput.system).toContain('Minimum length: at least 200 characters.');
    expect(repairInput.system).toContain('Required headings:');
    expect(repairInput.system).toContain('Targeted repair profile for requirements-discovery:');
    expect(repairInput.user).toContain('## 待确认问题');
    expect(repairInput.user).toContain('Validation issue:');
    expect(repairInput.user).toContain('补齐缺失标题“## 核心问题”对应的内容');
    expect(result.repaired).toBe(true);
  });
});
