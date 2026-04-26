import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { RuntimeService } from '../../src/main/services/runtime-service.js';

describe('runtime context explanation', () => {
  it('surfaces compaction, retrieval provenance and budget decisions in the harness prompt', () => {
    const briefPath = path.resolve('E:/project/01-requirements/brief.md');
    const rulePath = path.resolve('E:/project/02-rules/style-guide.md');
    const selectedProfile = {
      id: 'profile-1',
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:8b',
      apiKey: '',
      enabled: true,
      createdAt: '',
      updatedAt: '',
      hasApiKey: false,
      apiKeyMasked: '',
      diagnostics: { status: 'unknown' },
      capabilities: {
        tags: ['json-mode', 'long-context'],
        maxContextTokens: 4096,
        privacy: 'local',
        costTier: 'low',
        latencyTier: 'low'
      }
    };

    const service = new RuntimeService(
      {
        loadSessions: vi.fn(() => [{
          id: 'session-1',
          title: 'Session',
          stage: 'discover',
          contextControls: {
            pinnedDocumentPaths: [rulePath],
            excludedDocumentPaths: [],
            updatedAt: '2026-04-20T00:00:00.000Z'
          },
          messages: Array.from({ length: 16 }, (_, index) => ({
            id: `m-${index + 1}`,
            role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
            content: index < 8 ? `older context ${index + 1}` : `recent context ${index + 1}`,
            createdAt: `2026-04-20T00:00:${String(index).padStart(2, '0')}.000Z`
          }))
        }]),
        listKnowledgeFiles: vi.fn(() => [briefPath, rulePath]),
        buildNoteReferenceGraph: vi.fn(() => ({
          documents: [
            { path: briefPath, title: 'Brief', outbound: [], inbound: [] },
            { path: rulePath, title: 'Style Guide', outbound: [], inbound: [] }
          ]
        })),
        getRelevantDocumentChanges: vi.fn(() => []),
        readFile: vi.fn((targetPath: string) => {
          if (targetPath === briefPath) return '# Brief\n\nHeadless browser and evidence requirements.';
          if (targetPath === rulePath) return '# Rules\n\nKeep every decision traceable.';
          return '';
        }),
        getDocumentMeta: vi.fn(() => ({ modifiedAt: 1 }))
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    const result = (service as any).buildHarnessPrompt({
      rootPath: 'E:/project',
      sessionId: 'session-1',
      system: 'system prompt',
      user: 'please prepare a reliable delivery plan',
      contextDocumentPaths: [briefPath],
      selectedProfile,
      provenance: ['unit-test']
    });

    expect(result.compaction.compacted).toBe(true);
    expect(result.compaction.omittedMessageCount).toBeGreaterThan(0);
    expect(result.promptUser).toContain('please prepare a reliable delivery plan');
    expect(result.promptUser).toContain('older context');
    expect(result.budgetPlan.omittedMessageCount).toBe(result.compaction.omittedMessageCount);
    expect(result.budgetPlan.selectedRetrievalHitCount).toBeGreaterThan(0);
    expect(result.contextDocumentPaths).toEqual(expect.arrayContaining([briefPath, rulePath]));
    expect(result.pinnedDocumentPaths).toEqual([rulePath]);
    expect(result.retrievalHits.length).toBeGreaterThan(0);
    expect(result.provenanceRecords.some((record: any) => record.kind === 'conversation-summary')).toBe(true);
    expect(result.provenanceRecords.some((record: any) => record.kind === 'knowledge-hit')).toBe(true);
    expect(result.provenanceRecords.some((record: any) => record.kind === 'context-document' && record.sourcePath === rulePath)).toBe(true);
    expect(result.provenance).toEqual(expect.arrayContaining(['unit-test']));
  });
});
