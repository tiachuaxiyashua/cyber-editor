import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ActionableErrorRecord,
  ReviewGateReport,
  SideEffectApprovalRecord,
  SideEffectPreview
} from '../../shared/types';
import { EvidenceStoreService } from './evidence-store-service';
import { ProjectService } from './project-service';

function isTextLikeFile(targetPath: string) {
  return ['.md', '.markdown', '.txt', '.json', '.yaml', '.yml'].includes(path.extname(targetPath).toLowerCase());
}

function previewsMatch(left: SideEffectPreview, right: SideEffectPreview) {
  return left.capabilityId === right.capabilityId
    && left.summary === right.summary
    && left.status === right.status
    && left.requiresApproval === right.requiresApproval
    && JSON.stringify(left.operations) === JSON.stringify(right.operations);
}

export class SideEffectGovernanceService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly evidenceStore = new EvidenceStoreService()
  ) {}

  previewCapability(rootPath: string, capabilityId: string, input: Record<string, unknown>, runId?: string) {
    const candidate = this.buildPreview(rootPath, capabilityId, input, runId);
    if (!candidate) {
      return null;
    }
    return this.persistPreview(rootPath, candidate.preview, candidate.review);
  }

  resolveExecutionPreview(rootPath: string, capabilityId: string, input: Record<string, unknown>, approvalId?: string, runId?: string) {
    const candidate = this.buildPreview(rootPath, capabilityId, input, runId);
    if (!candidate) {
      return null;
    }
    if (!approvalId) {
      return this.persistPreview(rootPath, candidate.preview, candidate.review);
    }
    const approval = this.evidenceStore.readSideEffectApproval(rootPath, approvalId);
    const approvedPreview = approval?.previewId
      ? this.evidenceStore.readSideEffectPreview(rootPath, approval.previewId)
      : null;
    if (approvedPreview && previewsMatch(approvedPreview, candidate.preview)) {
      return approvedPreview;
    }
    return this.persistPreview(rootPath, candidate.preview, candidate.review);
  }

  approvePreview(rootPath: string, previewId: string, approved: boolean, reason?: string) {
    const preview = this.evidenceStore.readSideEffectPreview(rootPath, previewId);
    if (!preview) {
      throw new Error(`Side-effect preview not found: ${previewId}`);
    }
    const approval: SideEffectApprovalRecord = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      previewId: preview.id,
      capabilityId: preview.capabilityId,
      approved,
      reviewer: 'user',
      reason,
      expiresAt: approved ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : undefined
    };
    this.evidenceStore.persistSideEffectApproval(rootPath, approval);
    this.evidenceStore.persistSideEffectPreview(rootPath, {
      ...preview,
      approvalId: approval.id
    });
    return approval;
  }

  assertExecutionAllowed(rootPath: string, preview: SideEffectPreview, approvalId?: string) {
    if (preview.status === 'blocked') {
      throw this.createExecutionError(preview, 'SIDE_EFFECT_BLOCKED', 'This side effect is blocked by policy.');
    }
    if (!preview.requiresApproval) {
      return;
    }
    if (!approvalId) {
      throw this.createExecutionError(preview, 'SIDE_EFFECT_APPROVAL_REQUIRED', 'This side effect requires explicit approval.');
    }
    const approval = this.evidenceStore.readSideEffectApproval(rootPath, approvalId);
    if (!approval?.approved) {
      throw this.createExecutionError(preview, 'SIDE_EFFECT_APPROVAL_INVALID', 'The required approval is missing or invalid.');
    }
    if (approval.previewId !== preview.id) {
      throw this.createExecutionError(preview, 'SIDE_EFFECT_APPROVAL_SCOPE_MISMATCH', 'The provided approval does not match this side effect preview.');
    }
    if (approval.expiresAt) {
      const expiresAt = Date.parse(approval.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
        throw this.createExecutionError(preview, 'SIDE_EFFECT_APPROVAL_EXPIRED', 'The provided approval has expired.');
      }
    }
  }

  createExecutionError(preview: SideEffectPreview, code: string, message: string): ActionableErrorRecord {
    return {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      scope: 'side-effect',
      code,
      severity: preview.status === 'blocked' ? 'critical' : 'error',
      message,
      runId: preview.runId,
      targetId: preview.id,
      retryable: preview.status !== 'blocked',
      recoverable: true,
      suggestedActions: preview.requiresApproval
        ? ['Request approval for this side effect.', 'Retry execution with a valid approval id.']
        : ['Adjust the target path or capability policy and retry.']
    };
  }

  private buildPreview(rootPath: string, capabilityId: string, input: Record<string, unknown>, runId?: string) {
    if (capabilityId === 'builtin:write_artifact') {
      const targetPath = String(input.path ?? '');
      const resolved = this.projectService.resolveProjectPath(rootPath, targetPath);
      const underProjectState = resolved.startsWith(path.join(rootPath, '.project'));
      const exists = fs.existsSync(resolved);
      const hasContent = exists && fs.statSync(resolved).size > 0;
      const status = underProjectState
        ? 'blocked'
        : hasContent || !isTextLikeFile(resolved)
          ? 'review'
          : 'trusted';
      const review = this.buildReview(capabilityId, resolved, status, [
        underProjectState ? 'Writing under .project is blocked.' : '',
        hasContent ? 'Existing non-empty file will be overwritten.' : '',
        !underProjectState && !isTextLikeFile(resolved) ? 'Non-text artifact write requires review.' : ''
      ].filter(Boolean));
      const preview: SideEffectPreview = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        runId,
        capabilityId,
        summary: `Write artifact to ${resolved}`,
        status,
        requiresApproval: status === 'review',
        operations: [{ kind: 'write-file', target: resolved, description: exists ? 'overwrite file' : 'create file' }],
        reviewGateId: review.id
      };
      return {
        preview,
        review
      };
    }

    if (capabilityId.startsWith('script:')) {
      const toolId = capabilityId.replace('script:', '');
      const review = this.buildReview(capabilityId, toolId, 'review', ['Script execution requires explicit approval.']);
      const preview: SideEffectPreview = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        runId,
        capabilityId,
        summary: `Run controlled script tool ${toolId}`,
        status: 'review',
        requiresApproval: true,
        operations: [{ kind: 'run-script', target: toolId, description: 'execute controlled script tool' }],
        reviewGateId: review.id
      };
      return {
        preview,
        review
      };
    }

    return null;
  }

  private buildReview(capabilityId: string, targetId: string, status: SideEffectPreview['status'], messages: string[]): ReviewGateReport {
    return {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      scope: 'side-effect',
      targetKind: 'side-effect',
      targetId,
      sourceLabel: capabilityId,
      trust: status,
      compatibility: 'current',
      health: status === 'blocked' ? 'corrupt' : status === 'review' ? 'warning' : 'healthy',
      summary: messages.join(' ') || 'Side effect verified.',
      issues: messages.map((message, index) => ({
        code: `${capabilityId}.issue.${index + 1}`,
        severity: status === 'blocked' ? 'error' : 'warning',
        message
      })),
      recommendedAction: status === 'blocked' ? 'block' : status === 'review' ? 'approve' : 'install'
    };
  }

  private persistPreview(rootPath: string, preview: SideEffectPreview, review: ReviewGateReport) {
    this.evidenceStore.persistReview(rootPath, review);
    this.evidenceStore.persistSideEffectPreview(rootPath, preview);
    return preview;
  }
}
