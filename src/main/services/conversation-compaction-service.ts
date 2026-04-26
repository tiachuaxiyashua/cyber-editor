import type {
  AiMessage,
  AiSession
} from '../../shared/types';

export type ConversationCompactionResult = {
  summary: string;
  compacted: boolean;
  rollingSummary?: string;
  sourceMessageCount: number;
  retainedMessageCount: number;
  omittedMessageCount: number;
  retainedMessages: AiMessage[];
};

function trimSentence(value: string, maxChars = 120) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function buildRoleHighlights(messages: AiMessage[], role: AiMessage['role'], label: string) {
  const items = messages
    .filter((message) => message.role === role)
    .map((message) => trimSentence(message.content))
    .filter(Boolean)
    .slice(0, 3);
  if (!items.length) return '';
  return `${label}：${items.join('；')}`;
}

export class ConversationCompactionService {
  compact(session: AiSession | null | undefined): ConversationCompactionResult {
    if (!session) {
      return {
        summary: '',
        compacted: false,
        sourceMessageCount: 0,
        retainedMessageCount: 0,
        omittedMessageCount: 0,
        retainedMessages: []
      };
    }

    const retainedMessages = session.messages.slice(-8);
    const omittedMessageCount = Math.max(0, session.messages.length - retainedMessages.length);
    if (session.messages.length <= 12) {
      return {
        summary: retainedMessages.map((message) => `${message.role}: ${message.content}`).join('\n'),
        compacted: false,
        sourceMessageCount: session.messages.length,
        retainedMessageCount: retainedMessages.length,
        omittedMessageCount,
        retainedMessages
      };
    }

    const olderMessages = session.messages.slice(0, -8);
    const rollingSummary = [
      session.summary ? `历史摘要：${trimSentence(session.summary, 180)}` : '',
      buildRoleHighlights(olderMessages, 'user', '早期用户目标'),
      buildRoleHighlights(olderMessages, 'assistant', '早期助手建议')
    ].filter(Boolean).join('\n');

    return {
      summary: [
        '[已压缩较早会话]',
        rollingSummary,
        ...retainedMessages.map((message) => `${message.role}: ${message.content}`)
      ].filter(Boolean).join('\n'),
      compacted: true,
      rollingSummary,
      sourceMessageCount: session.messages.length,
      retainedMessageCount: retainedMessages.length,
      omittedMessageCount,
      retainedMessages
    };
  }
}
