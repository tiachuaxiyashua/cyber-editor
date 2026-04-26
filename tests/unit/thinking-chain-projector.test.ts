import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  AiSession,
  ArtifactRevisionRecord,
  DocumentChangeRecord,
  ReviewRound,
  RuntimeRun
} from '../../src/shared/types.js';
import { ThinkingChainProjector } from '../../src/main/services/thinking-chain-projector.js';

const roots: string[] = [];

function createTempRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

describe('ThinkingChainProjector', () => {
  afterEach(() => {
    while (roots.length) {
      fs.rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  it('projects an idea map with lanes, strips raw payloads, keeps discarded paths, and persists the snapshot', () => {
    const rootPath = createTempRoot('cyber-editor-thinking-chain-');
    const existingDoc = path.join(rootPath, '01-requirements', 'idea.md');
    fs.mkdirSync(path.dirname(existingDoc), { recursive: true });
    fs.writeFileSync(existingDoc, '# 想法\n', 'utf8');

    const session: AiSession = {
      id: 'session-1',
      title: '初始需求会话',
      stage: 'discover',
      summary: '{"toolCalls":[{"capabilityId":"read_artifact","input":{"artifactType":"softwareRequirement","purpose":"A software for reading novels during work breaks"}}]}',
      pinned: false,
      archived: false,
      projectDocumentPaths: [existingDoc],
      messages: [
        { id: 'm1', role: 'user', content: '我想做一个把模糊想法沉淀成结构化文档的工具。', createdAt: '2026-04-17T08:00:00.000Z' },
        {
          id: 'm2',
          role: 'assistant',
          content: '{"toolCalls":[{"capabilityId":"read_artifact","input":{"artifactType":"softwareRequirement","purpose":"A software for reading novels during work breaks"}}]}',
          createdAt: '2026-04-17T08:01:00.000Z'
        },
        { id: 'm3', role: 'assistant', content: '请用一句话描述你想做的软件，它要解决什么问题。', createdAt: '2026-04-17T08:01:30.000Z' },
        { id: 'm4', role: 'user', content: '浏览器插件这条路先放弃。', createdAt: '2026-04-17T08:02:00.000Z' }
      ]
    };

    const runs: RuntimeRun[] = [
      {
        id: 'run-1',
        kind: 'stage',
        status: 'completed',
        createdAt: '2026-04-17T08:03:00.000Z',
        updatedAt: '2026-04-17T08:03:20.000Z',
        sessionId: session.id,
        stage: 'discover',
        diagnostics: [],
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUsd: 0 },
        outputs: [
          {
            id: 'output-1',
            createdAt: '2026-04-17T08:03:20.000Z',
            kind: 'final',
            label: '发现摘要',
            contentType: 'markdown',
            content: '当前主方向收敛为桌面图文工作台，并以结构化文档作为主要产物。'
          }
        ],
        checkpoints: [],
        latestCheckpointSummary: '收敛到桌面图文工作台主方向'
      },
      {
        id: 'run-2',
        kind: 'stage',
        status: 'completed',
        createdAt: '2026-04-17T08:03:30.000Z',
        updatedAt: '2026-04-17T08:03:40.000Z',
        sessionId: session.id,
        stage: 'discover',
        diagnostics: [],
        usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10, estimatedCostUsd: 0 },
        outputs: [
          {
            id: 'output-2',
            createdAt: '2026-04-17T08:03:40.000Z',
            kind: 'final',
            label: '运行载荷',
            contentType: 'json',
            content: '{"toolCalls":[{"capabilityId":"read_artifact","input":{"artifactType":"softwareRequirement","purpose":"A software for reading novels during work breaks"}}]}'
          }
        ],
        checkpoints: [],
        latestCheckpointSummary: '{"toolCalls":[{"capabilityId":"read_artifact","input":{"artifactType":"softwareRequirement","purpose":"A software for reading novels during work breaks"}}]}'
      }
    ];

    const reviewRounds: ReviewRound[] = [
      {
        id: 'review-1',
        sessionId: session.id,
        stage: 'review',
        documentPath: existingDoc,
        createdAt: '2026-04-17T08:04:00.000Z',
        status: 'completed',
        blueOutput: '提出了两个方向。',
        redFeedback: '其中一个方向过于发散。',
        summary: '审查要求收紧输出边界。',
        diagnostics: [],
        issues: [
          {
            id: 'issue-1',
            title: '先聚焦文档交付',
            detail: '不要扩展到演示页和网页端。',
            state: 'adopted'
          }
        ]
      }
    ];

    const artifactRevisions: ArtifactRevisionRecord[] = [
      {
        id: 'rev-1',
        createdAt: '2026-04-17T08:05:00.000Z',
        artifactPath: '01-requirements/idea.md',
        absolutePath: existingDoc,
        title: '文档 idea',
        source: 'runtime-write',
        nodeIds: [],
        writeMode: 'replace',
        contentHash: 'hash',
        exists: true,
        valid: true,
        contractSignature: 'sig',
        runId: 'run-1',
        contentSummary: '同一文档同时来自运行写入和外部修改。'
      }
    ];

    const documentChanges: DocumentChangeRecord[] = [
      {
        id: 'change-1',
        createdAt: '2026-04-17T08:06:00.000Z',
        filePath: existingDoc,
        title: 'idea',
        source: 'external-change',
        summary: 'changed 3 lines, added refs 1, summary: 新增收敛目标',
        addedLineCount: 3,
        removedLineCount: 0,
        changedLineCount: 3,
        impact: {
          inboundAffectedPaths: [],
          outboundAddedPaths: [],
          outboundRemovedPaths: [],
          artifactPaths: ['01-requirements/idea.md']
        }
      }
    ];

    const projector = new ThinkingChainProjector();
    const snapshot = projector.getSnapshot({
      rootPath,
      sessionId: session.id,
      projectService: {
        loadSessions: () => [session],
        loadReviewRounds: () => reviewRounds,
        listArtifactRevisions: () => artifactRevisions,
        listRecentDocumentChanges: () => documentChanges
      } as any,
      runtimeService: {
        listRuns: () => runs,
        listEvents: () => []
      } as any
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.nodes[0]?.lane).toBe('focus');
    expect(snapshot?.nodes.some((node) => node.lane === 'exploration')).toBe(true);
    expect(snapshot?.nodes.some((node) => node.lane === 'landed')).toBe(true);
    expect(snapshot?.nodes.some((node) => node.lane === 'discarded')).toBe(true);
    expect(snapshot?.edges.some((edge) => edge.kind === 'materializes')).toBe(true);
    expect(snapshot?.edges.some((edge) => edge.kind === 'explores')).toBe(true);
    expect(snapshot?.counts.rejectedNodes).toBeGreaterThan(0);
    expect(snapshot?.sourceRefs.some((ref) => ref.kind === 'artifact-revision')).toBe(true);

    const visibleText = (snapshot?.nodes ?? []).map((node) => `${node.title}\n${node.summary}`).join('\n');
    expect(visibleText).not.toContain('toolCalls');
    expect(visibleText).not.toContain('read_artifact');
    expect(visibleText).not.toContain('capabilityId');
    expect(visibleText).not.toContain('引用已有证据');
    expect(visibleText).not.toContain('请用一句话描述你想做的软件');
    expect(visibleText).toContain('待明确：核心目标');
    expect(snapshot?.nodes.some((node) => node.id === 'thinking-message:m2')).toBe(false);
    expect(snapshot?.nodes.some((node) => node.id === 'thinking-run:run-2')).toBe(false);
    expect(snapshot?.nodes[0]?.summary).not.toContain('toolCalls');
    expect(snapshot?.nodes.filter((node) => node.lane === 'landed' && node.artifactPath === existingDoc)).toHaveLength(1);

    const persistedFile = path.join(rootPath, '.project', 'runtime', 'thinking-chains', `${session.id}.json`);
    expect(fs.existsSync(persistedFile)).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(persistedFile, 'utf8')) as { sessionId: string; nodes: Array<{ lane: string }> };
    expect(persisted.sessionId).toBe(session.id);
    expect(persisted.nodes[0]?.lane).toBe('focus');
  });
});
