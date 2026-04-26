import type { RuntimeRun, RuntimeRunActionId, RuntimeRunControlState, RuntimeRunStatus } from './types';

function uniqueActions(actions: RuntimeRunActionId[]) {
  return Array.from(new Set(actions));
}

export function resolveRuntimeRunControlState(
  run: Pick<RuntimeRun, 'kind' | 'status' | 'resumeContext' | 'recovery' | 'pendingApprovals' | 'latestCheckpointSummary'>,
  options?: { pendingMergeCount?: number }
): RuntimeRunControlState {
  const pendingApprovalCount = (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending').length;
  const pendingMergeCount = Math.max(0, options?.pendingMergeCount ?? 0);
  const canResume = Boolean(run.resumeContext && run.recovery?.status !== 'discarded');
  const canRetry = Boolean(run.resumeContext && (run.status === 'failed' || run.status === 'stopped' || run.status === 'paused'));

  if (pendingApprovalCount > 0 || run.status === 'waiting-approval') {
    return {
      status: 'waiting-approval',
      summary: pendingApprovalCount > 0 ? `Waiting for ${pendingApprovalCount} approval item(s).` : 'Waiting for approval.',
      blockingReason: 'waiting-approval',
      allowedActions: ['approve', 'reject'],
      pendingApprovalCount,
      pendingMergeCount
    };
  }

  if (pendingMergeCount > 0) {
    return {
      status: 'merge-required',
      summary: pendingMergeCount > 0 ? `${pendingMergeCount} merge proposal(s) require confirmation.` : 'Merge confirmation is required.',
      blockingReason: 'merge-required',
      allowedActions: ['resolve-merge'],
      pendingApprovalCount,
      pendingMergeCount
    };
  }

  if (run.status === 'merge-required') {
    return {
      status: 'completed',
      summary: 'Merge proposals were resolved.',
      blockingReason: 'none',
      allowedActions: [],
      pendingApprovalCount,
      pendingMergeCount
    };
  }

  switch (run.status) {
    case 'queued':
      return {
        status: 'queued',
        summary: 'Run is queued.',
        blockingReason: 'none',
        allowedActions: ['stop'],
        pendingApprovalCount,
        pendingMergeCount
      };
    case 'running':
      return {
        status: 'running',
        summary: 'Run is executing.',
        blockingReason: 'none',
        allowedActions: ['pause', 'stop'],
        pendingApprovalCount,
        pendingMergeCount
      };
    case 'pause-requested':
      return {
        status: 'pause-requested',
        summary: run.latestCheckpointSummary
          ? `Pause requested. Waiting for a safe checkpoint boundary after "${run.latestCheckpointSummary}".`
          : 'Pause requested. Waiting for the next safe checkpoint boundary.',
        blockingReason: 'recoverable',
        allowedActions: ['stop'],
        pendingApprovalCount,
        pendingMergeCount
      };
    case 'paused':
      return {
        status: 'paused',
        summary: run.latestCheckpointSummary
          ? `Run is paused at checkpoint "${run.latestCheckpointSummary}".`
          : 'Run is paused and can resume from the latest checkpoint.',
        blockingReason: 'recoverable',
        allowedActions: uniqueActions([
          ...(canResume ? ['resume'] as const : []),
          ...(canRetry ? ['retry'] as const : [])
        ]),
        pendingApprovalCount,
        pendingMergeCount
      };
    case 'stopped':
      return {
        status: 'stopped',
        summary: canResume ? 'Run was stopped and can resume or retry.' : 'Run was stopped.',
        blockingReason: canResume || canRetry ? 'recoverable' : 'terminal',
        allowedActions: uniqueActions([
          ...(canResume ? ['resume'] as const : []),
          ...(canRetry ? ['retry'] as const : [])
        ]),
        pendingApprovalCount,
        pendingMergeCount
      };
    case 'failed':
      return {
        status: 'failed',
        summary: canResume ? 'Run failed and can resume or retry.' : 'Run failed.',
        blockingReason: canResume || canRetry ? 'recoverable' : 'terminal',
        allowedActions: uniqueActions([
          ...(canResume ? ['resume'] as const : []),
          ...(canRetry ? ['retry'] as const : [])
        ]),
        pendingApprovalCount,
        pendingMergeCount
      };
    case 'completed':
      return {
        status: 'completed',
        summary: 'Run completed.',
        blockingReason: 'none',
        allowedActions: [],
        pendingApprovalCount,
        pendingMergeCount
      };
    default: {
      const fallbackStatus = run.status as RuntimeRunStatus;
      return {
        status: fallbackStatus,
        summary: `Run is ${fallbackStatus}.`,
        blockingReason: 'none',
        allowedActions: [],
        pendingApprovalCount,
        pendingMergeCount
      };
    }
  }
}
