import { randomUUID } from 'node:crypto';
import type {
  KnowledgeLinkNode,
  RuleDefinition,
  ProvenanceRecord,
  RetrievalHit
} from '../../shared/types';

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export class ProvenanceService {
  buildRecords(input: {
    retrievalHits: RetrievalHit[];
    contextDocumentPaths: string[];
    pinnedDocumentPaths?: string[];
    rollingSummary?: string;
    resumedFromRunId?: string;
    effectiveRules?: RuleDefinition[];
    promotedKnowledge?: KnowledgeLinkNode[];
    baseProvenance?: string[];
  }): ProvenanceRecord[] {
    const records: ProvenanceRecord[] = [];
    const pinnedPaths = new Set(uniqueStrings(input.pinnedDocumentPaths ?? []));

    if (input.rollingSummary) {
      records.push({
        id: randomUUID(),
        kind: 'conversation-summary',
        label: '滚动摘要',
        detail: input.rollingSummary
      });
    }

    for (const documentPath of uniqueStrings(input.contextDocumentPaths)) {
      records.push({
        id: randomUUID(),
        kind: 'context-document',
        label: pinnedPaths.has(documentPath) ? '用户固定上下文' : '上下文文档',
        detail: documentPath,
        sourcePath: documentPath
      });
    }

    for (const hit of input.retrievalHits) {
      records.push({
        id: randomUUID(),
        kind: 'knowledge-hit',
        label: hit.title,
        detail: hit.reason,
        sourcePath: hit.path,
        score: hit.score
      });
      for (const changeRecordId of hit.relatedChangeRecordIds) {
        records.push({
          id: randomUUID(),
          kind: 'recent-change',
          label: '相关最近变更',
          detail: changeRecordId,
          sourcePath: hit.path
        });
      }
    }

    if (input.resumedFromRunId) {
      records.push({
        id: randomUUID(),
        kind: 'run-resume',
        label: '继续上次运行',
        detail: input.resumedFromRunId
      });
    }

    for (const rule of input.effectiveRules ?? []) {
      records.push({
        id: randomUUID(),
        kind: 'effective-rule',
        label: rule.name,
        detail: rule.targetKey ?? rule.scope
      });
    }

    for (const knowledge of input.promotedKnowledge ?? []) {
      records.push({
        id: randomUUID(),
        kind: 'promoted-knowledge',
        label: knowledge.title,
        detail: knowledge.summary
      });
    }

    for (const token of uniqueStrings(input.baseProvenance ?? [])) {
      records.push({
        id: randomUUID(),
        kind: 'recent-change',
        label: '运行来源',
        detail: token
      });
    }

    return records;
  }

  toLegacyTokens(records: ProvenanceRecord[], baseTokens: string[] = []) {
    const tokens = [...baseTokens];
    for (const record of records) {
      switch (record.kind) {
        case 'knowledge-hit':
          tokens.push(`knowledge-hit:${record.sourcePath ?? record.id}`);
          break;
        case 'context-document':
          tokens.push(`context-document:${record.sourcePath ?? record.id}`);
          break;
        case 'conversation-summary':
          tokens.push('conversation-summary');
          break;
        case 'run-resume':
          tokens.push(`resume:${record.detail}`);
          break;
        case 'recent-change':
          tokens.push(`recent-change:${record.detail}`);
          break;
        case 'effective-rule':
          tokens.push(`rule:${record.label}`);
          break;
        case 'promoted-knowledge':
          tokens.push(`knowledge:${record.label}`);
          break;
      }
    }
    return uniqueStrings(tokens);
  }
}
