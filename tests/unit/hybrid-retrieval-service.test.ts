import { describe, expect, it, vi } from 'vitest';
import { HybridRetrievalService } from '../../src/main/services/hybrid-retrieval-service.js';

describe('HybridRetrievalService', () => {
  it('combines keyword, semantic, direct reference, and reference expansion hits', () => {
    const docCore = {
      id: 'doc-core',
      path: 'E:/project/01-requirements/core.md',
      title: 'Alpha Plan',
      excerpt: 'alpha beta implementation outline',
      keywords: ['alpha', 'beta', 'implementation'],
      outboundPaths: ['E:/project/02-solution/linked.md'],
      inboundPaths: [],
      relatedChangeRecordIds: ['change:core'],
      modifiedAt: 1,
      indexedAt: '2026-04-14T00:00:00.000Z'
    };
    const docLinked = {
      id: 'doc-linked',
      path: 'E:/project/02-solution/linked.md',
      title: 'Linked Notes',
      excerpt: 'supporting material only',
      keywords: ['supporting'],
      outboundPaths: [],
      inboundPaths: ['E:/project/01-requirements/core.md'],
      relatedChangeRecordIds: ['change:linked'],
      modifiedAt: 1,
      indexedAt: '2026-04-14T00:00:00.000Z'
    };
    const docAnchor = {
      id: 'doc-anchor',
      path: 'E:/project/01-requirements/anchor.md',
      title: 'Anchor Context',
      excerpt: 'context anchor for the run',
      keywords: ['anchor', 'context'],
      outboundPaths: [],
      inboundPaths: [],
      relatedChangeRecordIds: [],
      modifiedAt: 1,
      indexedAt: '2026-04-14T00:00:00.000Z'
    };

    const service = new HybridRetrievalService({
      refresh: vi.fn(() => ({
        version: 1,
        status: 'ready',
        builtAt: '2026-04-14T00:00:00.000Z',
        documentCount: 3,
        staleDocumentPaths: [],
        units: [docCore, docLinked, docAnchor]
      }))
    } as never);

    const result = service.retrieve('E:/project', 'alpha implementation', [docAnchor.path], 5);
    expect(result.indexState.status).toBe('ready');
    expect(result.hits[0]?.path).toBe(docCore.path);
    expect(result.hits[0]?.matchedBy).toEqual(expect.arrayContaining(['keyword', 'semantic']));
    expect(result.hits[0]?.relatedChangeRecordIds).toContain('change:core');

    const expandedHit = result.hits.find((hit) => hit.path === docLinked.path);
    expect(expandedHit?.matchedBy).toContain('reference');
    expect(expandedHit?.reason).toContain('引用扩展');

    const anchorHit = result.hits.find((hit) => hit.path === docAnchor.path);
    expect(anchorHit?.matchedBy).toContain('reference');
  });
});
