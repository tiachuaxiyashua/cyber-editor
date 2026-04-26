import type {
  KnowledgeIndexState,
  RetrievalHit,
  RetrievalMode
} from '../../shared/types';
import { KnowledgeIndexService } from './knowledge-index-service';

function tokenize(value: string) {
  return Array.from(new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
  ));
}

function countMatches(haystack: string, queryTokens: string[]) {
  const lower = haystack.toLowerCase();
  return queryTokens.reduce((count, token) => count + (lower.includes(token) ? 1 : 0), 0);
}

function semanticOverlap(queryTokens: string[], documentTokens: string[]) {
  if (!queryTokens.length || !documentTokens.length) return 0;
  const documentSet = new Set(documentTokens);
  const intersection = queryTokens.filter((token) => documentSet.has(token)).length;
  return intersection / Math.max(queryTokens.length, documentSet.size);
}

export class HybridRetrievalService {
  constructor(private readonly knowledgeIndex: KnowledgeIndexService) {}

  retrieve(rootPath: string, query: string, anchorPaths: string[], limit = 6) {
    const indexState = this.knowledgeIndex.refresh(rootPath, 'incremental');
    const queryTokens = tokenize(query);
    const anchorSet = new Set(anchorPaths.filter(Boolean));
    if (!queryTokens.length && !anchorSet.size) {
      return { indexState, hits: [] as RetrievalHit[] };
    }

    const scored = indexState.units.map((unit) => {
      const matchedBy: RetrievalMode[] = [];
      const reasons: string[] = [];
      let score = 0;

      const keywordMatches = countMatches(`${unit.title}\n${unit.excerpt}\n${unit.keywords.join(' ')}`, queryTokens);
      if (keywordMatches > 0) {
        matchedBy.push('keyword');
        score += keywordMatches * 5;
        reasons.push(`关键词命中 ${keywordMatches} 项`);
      }

      const semanticScore = semanticOverlap(queryTokens, tokenize(`${unit.title}\n${unit.excerpt}\n${unit.keywords.join(' ')}`));
      if (semanticScore > 0) {
        matchedBy.push('semantic');
        score += Math.round(semanticScore * 8);
        reasons.push(`语义重叠 ${(semanticScore * 100).toFixed(0)}%`);
      }

      const directlyAnchored = anchorSet.has(unit.path);
      const linkedToAnchor = unit.outboundPaths.some((item) => anchorSet.has(item))
        || unit.inboundPaths.some((item) => anchorSet.has(item));
      if (directlyAnchored || linkedToAnchor) {
        matchedBy.push('reference');
        score += directlyAnchored ? 6 : 4;
        reasons.push(directlyAnchored ? '固定上下文文档' : '与固定上下文存在引用关系');
      }

      return {
        unit,
        score,
        matchedBy: Array.from(new Set(matchedBy)),
        reason: reasons.join('；')
      };
    });

    const topUnitPaths = new Set(
      scored
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.max(3, limit))
        .map((item) => item.unit.path)
    );

    const expanded = scored.map((item) => {
      if (item.score > 0) return item;
      const linkedToTop = item.unit.outboundPaths.some((value) => topUnitPaths.has(value))
        || item.unit.inboundPaths.some((value) => topUnitPaths.has(value));
      if (!linkedToTop) return item;
      return {
        ...item,
        score: 3,
        matchedBy: ['reference' satisfies RetrievalMode],
        reason: '与高相关命中文档存在引用扩展关系'
      };
    });

    const hits = expanded
      .filter((item) => item.score > 0)
      .sort((left, right) =>
        right.score - left.score
        || left.unit.path.localeCompare(right.unit.path)
      )
      .slice(0, limit)
      .map<RetrievalHit>((item) => ({
        unitId: item.unit.id,
        path: item.unit.path,
        title: item.unit.title,
        excerpt: item.unit.excerpt,
        score: item.score,
        matchedBy: item.matchedBy as RetrievalMode[],
        reason: item.reason,
        relatedChangeRecordIds: item.unit.relatedChangeRecordIds
      }));

    return { indexState, hits };
  }
}
