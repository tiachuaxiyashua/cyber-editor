import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type {
  DocumentChangeRecord,
  DocumentWriteResolutionInput,
  PendingDocumentWrite,
  PendingDocumentWriteStatus
} from '../../shared/types';
import { applyHunkSelections, buildLineHunks, diffLineStats, summarizeLineChange } from './document-diff';

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function proposalRoot(rootPath: string) {
  return path.join(rootPath, '.project', 'document-writes');
}

function proposalPath(rootPath: string, proposalId: string) {
  return path.join(proposalRoot(rootPath), `${proposalId}.json`);
}

function titleFor(filePath: string) {
  return path.basename(filePath, path.extname(filePath));
}

function latestChangeForFile(changes: DocumentChangeRecord[], filePath: string) {
  return changes
    .filter((item) => item.filePath === filePath)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function contentHash(contents: string) {
  return createHash('sha256').update(contents).digest('hex');
}

export class HumanAiMergeService {
  listPendingWrites(rootPath: string, filePath?: string) {
    const root = proposalRoot(rootPath);
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => readJsonSafe<PendingDocumentWrite | null>(path.join(root, entry), null))
      .filter((item): item is PendingDocumentWrite => Boolean(item))
      .filter((item) => item.status === 'pending' && (!filePath || item.filePath === filePath))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  createPendingWrite(input: {
    rootPath: string;
    filePath: string;
    currentContents: string;
    proposedContents: string;
    recentChanges: DocumentChangeRecord[];
    sourceRunId?: string;
    sourceLabel: string;
    baseRevisionId?: string;
    currentRevisionId?: string;
    baseContentHash?: string;
    currentContentHash?: string;
  }) {
    if (input.currentContents === input.proposedContents) {
      return null;
    }

    const lineHunks = buildLineHunks(input.currentContents, input.proposedContents);
    if (!lineHunks.length) {
      return null;
    }

    const latestChange = latestChangeForFile(input.recentChanges, input.filePath);
    const baseContentHash = input.baseContentHash ?? contentHash(input.currentContents);
    const currentContentHash = input.currentContentHash ?? contentHash(input.currentContents);
    const baseRevisionMismatch = Boolean(
      (input.baseRevisionId && input.currentRevisionId && input.baseRevisionId !== input.currentRevisionId)
      || baseContentHash !== currentContentHash
    );
    const recentHumanEdit = Boolean(latestChange && latestChange.source !== 'runtime-write');
    const hasConflicts = baseRevisionMismatch || recentHumanEdit;
    if (!hasConflicts) {
      return null;
    }
    const stats = diffLineStats(input.currentContents, input.proposedContents);
    const proposal: PendingDocumentWrite = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      filePath: input.filePath,
      title: titleFor(input.filePath),
      sourceRunId: input.sourceRunId,
      sourceLabel: input.sourceLabel,
      status: 'pending',
      hasConflicts,
      baseRevisionId: input.baseRevisionId,
      currentRevisionId: input.currentRevisionId,
      baseContentHash,
      currentContentHash,
      changeSummary: summarizeLineChange(titleFor(input.filePath), stats),
      proposedContent: input.proposedContents,
      chunks: lineHunks.map((hunk, index) => ({
        id: `chunk-${index + 1}`,
        startLine: hunk.startLine,
        deleteCount: hunk.deleteCount,
        humanText: hunk.humanText,
        aiText: hunk.aiText,
        conflict: hasConflicts
      }))
    };
    writeJson(proposalPath(input.rootPath, proposal.id), proposal);
    return proposal;
  }

  getPendingWrite(rootPath: string, proposalId: string) {
    const proposal = readJsonSafe<PendingDocumentWrite | null>(proposalPath(rootPath, proposalId), null);
    if (!proposal) {
      throw new Error('未找到待处理的 AI 写入提案。');
    }
    return proposal;
  }

  resolvePendingWrite(
    rootPath: string,
    proposalId: string,
    currentContents: string,
    input: DocumentWriteResolutionInput
  ) {
    const proposal = this.getPendingWrite(rootPath, proposalId);
    if (proposal.status !== 'pending') {
      throw new Error('当前 AI 写入提案已经处理过。');
    }

    let nextStatus: PendingDocumentWriteStatus = 'accepted';
    let nextContents = proposal.proposedContent;
    if (input.decision === 'keep-human') {
      nextStatus = 'discarded';
      nextContents = currentContents;
    } else if (input.decision === 'manual-merge') {
      nextStatus = 'merged';
      const selections = Object.fromEntries(proposal.chunks.map((chunk) => [chunk.id, 'human'])) as Record<string, 'human' | 'ai'>;
      for (const [chunkId, choice] of Object.entries(input.chunkSelections ?? {})) {
        selections[chunkId] = choice;
      }
      nextContents = applyHunkSelections(
        currentContents,
        proposal.chunks.map((chunk) => ({
          startLine: chunk.startLine,
          deleteCount: chunk.deleteCount,
          humanText: chunk.humanText,
          aiText: chunk.aiText
        })),
        selections
      );
    }

    const resolved: PendingDocumentWrite = {
      ...proposal,
      status: nextStatus,
      proposedContent: nextContents
    };
    writeJson(proposalPath(rootPath, proposalId), resolved);
    return {
      proposal: resolved,
      nextContents,
      shouldWrite: input.decision !== 'keep-human'
    };
  }
}
