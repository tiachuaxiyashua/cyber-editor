import { describe, expect, it } from 'vitest';
import { ConversationCompactionService } from '../../src/main/services/conversation-compaction-service.js';

describe('ConversationCompactionService', () => {
  it('keeps the latest 8 messages and emits a rolling summary for long sessions', () => {
    const service = new ConversationCompactionService();
    const messages = Array.from({ length: 14 }, (_, index) => ({
      id: `m-${index + 1}`,
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: index < 6
        ? `older message ${index + 1} with concrete detail ${index + 1}`
        : `recent message ${index + 1} with concrete detail ${index + 1}`,
      createdAt: `2026-04-20T00:00:${String(index).padStart(2, '0')}.000Z`
    }));

    const result = service.compact({
      id: 'session-1',
      title: 'Long session',
      stage: 'discover',
      summary: 'previous session summary that should be carried into the rolling summary',
      pinned: false,
      archived: false,
      messages
    });

    expect(result.compacted).toBe(true);
    expect(result.sourceMessageCount).toBe(14);
    expect(result.retainedMessageCount).toBe(8);
    expect(result.omittedMessageCount).toBe(6);
    expect(result.retainedMessages.map((message) => message.id)).toEqual([
      'm-7',
      'm-8',
      'm-9',
      'm-10',
      'm-11',
      'm-12',
      'm-13',
      'm-14'
    ]);
    expect(result.rollingSummary).toContain('previous session summary');
    expect(result.rollingSummary).toContain('older message 1');
    expect(result.rollingSummary).toContain('older message 2');
    expect(result.summary).toContain('recent message 14');
  });

  it('leaves short sessions un-compacted', () => {
    const service = new ConversationCompactionService();
    const result = service.compact({
      id: 'session-2',
      title: 'Short session',
      stage: 'discover',
      summary: '',
      pinned: false,
      archived: false,
      messages: [
        { id: 'm-1', role: 'user', content: 'first prompt', createdAt: '2026-04-20T00:00:00.000Z' },
        { id: 'm-2', role: 'assistant', content: 'first answer', createdAt: '2026-04-20T00:00:01.000Z' }
      ]
    });

    expect(result.compacted).toBe(false);
    expect(result.omittedMessageCount).toBe(0);
    expect(result.summary).toContain('user: first prompt');
    expect(result.summary).toContain('assistant: first answer');
  });
});
