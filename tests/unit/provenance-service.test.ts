import { describe, expect, it } from 'vitest';
import { ProvenanceService } from '../../src/main/services/provenance-service.js';

describe('ProvenanceService', () => {
  it('builds structured provenance records and stable legacy tokens', () => {
    const service = new ProvenanceService();

    const records = service.buildRecords({
      retrievalHits: [
        {
          unitId: 'unit-1',
          path: 'E:/project/01-requirements/overview.md',
          title: 'Overview',
          excerpt: 'alpha beta',
          score: 9,
          matchedBy: ['keyword', 'semantic'],
          reason: 'keyword + semantic',
          relatedChangeRecordIds: ['change-1']
        }
      ],
      contextDocumentPaths: ['E:/project/01-requirements/context.md'],
      rollingSummary: 'previous discussion summary',
      resumedFromRunId: 'run-1',
      baseProvenance: ['manual-tag']
    });

    expect(records.map((record) => record.kind)).toEqual(expect.arrayContaining([
      'conversation-summary',
      'context-document',
      'knowledge-hit',
      'recent-change',
      'run-resume'
    ]));

    const tokens = service.toLegacyTokens(records, ['conversation.send-message']);
    expect(tokens).toEqual(expect.arrayContaining([
      'conversation.send-message',
      'conversation-summary',
      'context-document:E:/project/01-requirements/context.md',
      'knowledge-hit:E:/project/01-requirements/overview.md',
      'recent-change:change-1',
      'resume:run-1'
    ]));
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});
