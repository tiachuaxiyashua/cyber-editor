import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CapabilityRuntime } from '../../src/main/services/capability-runtime.js';
import { RuntimeError } from '../../src/main/services/runtime-errors.js';
import { SideEffectGovernanceService } from '../../src/main/services/side-effect-governance-service.js';
import type { RuntimeEvent } from '../../src/shared/types.js';

function createContext(approvalId?: string) {
  const events: Omit<RuntimeEvent, 'id' | 'createdAt' | 'runId'>[] = [];
  return {
    events,
    value: {
      runId: 'run-test',
      approvalId,
      emit: (event: Omit<RuntimeEvent, 'id' | 'createdAt' | 'runId'>) => {
        events.push(event);
      }
    }
  };
}

describe('CapabilityRuntime', () => {
  const rootPath = path.join('E:', 'tmp', 'cyber-editor-project');
  const projectService = {
    resolveProjectPath: (_rootPath: string, relativePath: string) => path.join(rootPath, relativePath),
    readFile: vi.fn(() => [
      '# Artifact Review Sample',
      '',
      '## Summary',
      '',
      'This artifact captures responsibility boundaries, evidence expectations, and delivery details in a reusable form.',
      '',
      '## Execution Notes',
      '',
      '- Includes concrete steps.',
      '- Includes observable outputs.',
      '- Includes review hooks.'
    ].join('\n')),
    saveFile: vi.fn(),
    listMarkdownFiles: vi.fn(() => ['01-requirements/01-原始需求.md']),
    searchProjectContent: vi.fn(() => []),
    appendAudit: vi.fn()
  };

  const platformService = {
    loadAssets: vi.fn(() => ({ connectors: [], tools: [{ id: 'tool-ok', name: '本地脚本', description: '', enabled: true }] })),
    runTool: vi.fn(async () => ({
      ok: true,
      result: { ok: true, stdout: 'tool ok' }
    })),
    testConnector: vi.fn(async () => ({ ok: true, message: 'ok' }))
  };

  const runtime = new CapabilityRuntime(projectService as never, platformService as never);

  it('blocks direct access into .project runtime files', async () => {
    const context = createContext();

    await expect(
      runtime.execute(rootPath, 'builtin:write_artifact', { path: '.project/runtime/events.jsonl', content: 'x' }, context.value)
    ).rejects.toMatchObject({
      code: 'permission_error'
    } satisfies Partial<RuntimeError>);

    expect(context.events.some((event) => event.type === 'permission.blocked')).toBe(true);
  });

  it('blocks loopback network validation targets', async () => {
    const context = createContext();

    await expect(
      runtime.execute(rootPath, 'network:validate_url', { url: 'http://127.0.0.1:3000/health' }, context.value)
    ).rejects.toMatchObject({
      code: 'permission_error'
    } satisfies Partial<RuntimeError>);

    expect(context.events.some((event) => event.type === 'permission.blocked')).toBe(true);
  });

  it('runs script-backed tools and emits hook lifecycle events', async () => {
    const governance = new SideEffectGovernanceService(projectService as never);
    const preview = governance.previewCapability(rootPath, 'script:tool-ok', {}, 'run-test');
    const approval = governance.approvePreview(rootPath, preview!.id, true, 'test approval');
    const context = createContext(approval.id);

    const result = await runtime.execute(rootPath, 'script:tool-ok', {}, context.value);

    expect(result).toEqual({ ok: true, stdout: 'tool ok' });
    expect(platformService.runTool).toHaveBeenCalledWith(rootPath, 'tool-ok');
    expect(context.events.some((event) => event.type === 'hook.before')).toBe(true);
    expect(context.events.some((event) => event.type === 'hook.after')).toBe(true);
    expect(context.events.some((event) => event.type === 'tool.completed')).toBe(true);
  });

  it('exposes review_artifact and returns a structured review summary for project artifacts', async () => {
    const context = createContext();

    expect(runtime.listCapabilities(rootPath).some((item) => item.id === 'builtin:review_artifact')).toBe(true);

    const result = await runtime.execute(
      rootPath,
      'review_artifact',
      {
        artifactPath: '02-solution/03-risk-review.md',
        reviewFocus: '责任边界与证据字段',
        reviewCriteria: ['检查责任边界', '检查证据字段', '检查回滚要求']
      },
      context.value
    );

    expect(result).toMatchObject({
      path: path.join(rootPath, '02-solution', '03-risk-review.md'),
      schemaId: 'markdown-basic',
      reviewFocus: '责任边界与证据字段',
      reviewCriteria: ['检查责任边界', '检查证据字段', '检查回滚要求'],
      qualityVerdict: 'degraded'
    });
    expect(projectService.readFile).toHaveBeenCalledWith(path.join(rootPath, '02-solution', '03-risk-review.md'));
    expect(context.events.some((event) => event.type === 'tool.completed')).toBe(true);
  });
});
