import { describe, expect, it, vi } from 'vitest';
import type { RuntimeRun } from '../../src/shared/types.js';
import { RuntimeService } from '../../src/main/services/runtime-service.js';

describe('RuntimeService merge resolution', () => {
  it('closes a merge-required run after the last pending proposal is resolved', () => {
    let pendingWrites = [{
      id: 'proposal-1',
      filePath: 'E:/tmp/project/01-requirements/brief.md',
      title: '需求基线',
      sourceRunId: 'run-merge',
      status: 'pending'
    }];

    const projectService = {
      getPendingDocumentWrite: vi.fn((_rootPath: string, proposalId: string) => pendingWrites.find((item) => item.id === proposalId)!),
      resolvePendingDocumentWrite: vi.fn((_rootPath: string, proposalId: string) => {
        const resolved = pendingWrites.find((item) => item.id === proposalId)!;
        pendingWrites = [];
        return {
          ...resolved,
          status: 'discarded'
        };
      }),
      listPendingDocumentWrites: vi.fn(() => pendingWrites),
      openProject: vi.fn(() => ({ manifest: { templateId: 'template-1', name: 'Project' } })),
      loadPlatformAssets: vi.fn(() => ({ roles: [] }))
    };
    const run: RuntimeRun = {
      id: 'run-merge',
      kind: 'stage',
      status: 'merge-required',
      createdAt: '2026-04-16T00:00:00.000Z',
      updatedAt: '2026-04-16T00:00:00.000Z',
      sessionId: 'session-1',
      stage: 'discover',
      roleId: 'role-1',
      diagnostics: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
      outputs: [],
      checkpoints: [],
      pendingApprovals: [],
      mergeProposalIds: ['proposal-1']
    };
    const runtimeAssets = {
      getRun: vi.fn(() => run),
      saveRun: vi.fn(),
      saveRunHistory: vi.fn(),
      saveRunRecovery: vi.fn(),
      appendEvent: vi.fn(),
      listEventsForRun: vi.fn(() => [])
    };
    const evidenceStore = {
      persistRunEvidence: vi.fn()
    };

    const service = new RuntimeService(
      projectService as never,
      runtimeAssets as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      evidenceStore as never
    );
    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);

    const result = service.resolvePendingDocumentWrite('E:/tmp/project', 'proposal-1', {
      decision: 'keep-human'
    });

    expect(projectService.resolvePendingDocumentWrite).toHaveBeenCalledWith('E:/tmp/project', 'proposal-1', {
      decision: 'keep-human'
    });
    expect(runtimeAssets.saveRun).toHaveBeenCalledWith('E:/tmp/project', expect.objectContaining({
      id: 'run-merge',
      status: 'completed',
      mergeProposalIds: [],
      diagnostics: expect.arrayContaining(['merge-resolution:proposal-1:keep-human'])
    }));
    expect(runtimeAssets.appendEvent).toHaveBeenCalledWith('E:/tmp/project', expect.objectContaining({
      runId: 'run-merge',
      type: 'merge.resolved'
    }));
    expect(runtimeAssets.appendEvent).toHaveBeenCalledWith('E:/tmp/project', expect.objectContaining({
      runId: 'run-merge',
      type: 'run.completed'
    }));
    expect(evidenceStore.persistRunEvidence).toHaveBeenCalled();
    expect(result.run?.status).toBe('completed');
    expect(result.run?.controlState?.allowedActions).toEqual([]);
  });
});
