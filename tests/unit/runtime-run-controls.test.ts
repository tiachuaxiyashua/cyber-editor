import { describe, expect, it } from 'vitest';
import { resolveRuntimeRunControlState } from '../../src/shared/runtime-run-controls.js';
import type { RuntimeRun } from '../../src/shared/types.js';

function createRun(overrides?: Partial<RuntimeRun>): RuntimeRun {
  return {
    id: 'run-1',
    kind: 'chat',
    status: 'completed',
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
    diagnostics: [],
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
    outputs: [],
    checkpoints: [],
    pendingApprovals: [],
    ...overrides
  };
}

describe('resolveRuntimeRunControlState', () => {
  it('requires approval actions while approvals are pending', () => {
    const control = resolveRuntimeRunControlState(createRun({
      status: 'waiting-approval',
      pendingApprovals: [{
        id: 'approval-1',
        nodeId: 'node-1',
        prompt: 'approve',
        status: 'pending',
        createdAt: '2026-04-16T00:00:00.000Z',
        updatedAt: '2026-04-16T00:00:00.000Z'
      }]
    }));

    expect(control.status).toBe('waiting-approval');
    expect(control.allowedActions).toEqual(['approve', 'reject']);
    expect(control.pendingApprovalCount).toBe(1);
  });

  it('elevates a completed run to merge-required while merge proposals are pending', () => {
    const control = resolveRuntimeRunControlState(createRun(), {
      pendingMergeCount: 2
    });

    expect(control.status).toBe('merge-required');
    expect(control.allowedActions).toEqual(['resolve-merge']);
    expect(control.pendingMergeCount).toBe(2);
  });

  it('allows resume and retry for recoverable failed runs', () => {
    const control = resolveRuntimeRunControlState(createRun({
      status: 'failed',
      resumeContext: {
        system: 'system',
        user: 'user',
        allowedCapabilities: []
      },
      recovery: {
        status: 'recoverable',
        savedAt: '2026-04-16T00:00:00.000Z',
        approvalIds: [],
        branchGroupIds: []
      }
    }));

    expect(control.status).toBe('failed');
    expect(control.allowedActions).toEqual(['resume', 'retry']);
  });

  it('allows pause and stop while running', () => {
    const control = resolveRuntimeRunControlState(createRun({
      status: 'running'
    }));

    expect(control.status).toBe('running');
    expect(control.allowedActions).toEqual(['pause', 'stop']);
  });

  it('shows pause-requested as waiting for the next safe checkpoint', () => {
    const control = resolveRuntimeRunControlState(createRun({
      status: 'pause-requested',
      latestCheckpointSummary: 'Completed model turn 1'
    }));

    expect(control.status).toBe('pause-requested');
    expect(control.allowedActions).toEqual(['stop']);
    expect(control.summary).toContain('Completed model turn 1');
  });

  it('allows resume and retry after a run is paused at a checkpoint', () => {
    const control = resolveRuntimeRunControlState(createRun({
      status: 'paused',
      latestCheckpointSummary: 'Completed model turn 2',
      resumeContext: {
        system: 'system',
        user: 'user',
        allowedCapabilities: []
      },
      recovery: {
        status: 'recoverable',
        savedAt: '2026-04-16T00:00:00.000Z',
        approvalIds: [],
        branchGroupIds: []
      }
    }));

    expect(control.status).toBe('paused');
    expect(control.allowedActions).toEqual(['resume', 'retry']);
    expect(control.summary).toContain('Completed model turn 2');
  });
});
