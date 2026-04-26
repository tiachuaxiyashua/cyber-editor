export type MarkdownBlockCommandId =
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'quote'
  | 'code-block'
  | 'mermaid'
  | 'mindmap';

export type MarkdownRange = {
  start: number;
  end: number;
};

export type MarkdownBlockCommand = {
  id: MarkdownBlockCommandId;
  label: string;
  description: string;
  keywords: string[];
};

export type MarkdownSlashTrigger = MarkdownRange & {
  query: string;
};

export type ApplyMarkdownBlockCommandResult = {
  value: string;
  selection: MarkdownRange;
  changed: boolean;
  blockedBy?: 'fenced-code-block' | 'unknown-command';
};

const LINE_PREFIX_PATTERN = /^\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|-\s\[(?: |x)\]\s+|>\s+)+/;

export const MARKDOWN_BLOCK_COMMANDS: MarkdownBlockCommand[] = [
  { id: 'heading-1', label: 'H1', description: '一级标题', keywords: ['h1', 'heading', 'title'] },
  { id: 'heading-2', label: 'H2', description: '二级标题', keywords: ['h2', 'heading'] },
  { id: 'heading-3', label: 'H3', description: '三级标题', keywords: ['h3', 'heading'] },
  { id: 'heading-4', label: 'H4', description: '四级标题', keywords: ['h4', 'heading'] },
  { id: 'bullet-list', label: 'List', description: '无序列表', keywords: ['list', 'bullet', 'ul'] },
  { id: 'ordered-list', label: '1.', description: '有序列表', keywords: ['ordered', 'numbered', 'ol'] },
  { id: 'task-list', label: 'Task', description: '任务清单', keywords: ['task', 'todo', 'checklist'] },
  { id: 'quote', label: 'Quote', description: '引用块', keywords: ['quote', 'blockquote'] },
  { id: 'code-block', label: 'Code', description: '代码块', keywords: ['code', 'fence', 'snippet'] },
  { id: 'mermaid', label: 'Mermaid', description: 'Mermaid 图表', keywords: ['mermaid', 'diagram', 'graph'] },
  { id: 'mindmap', label: 'Mindmap', description: 'Mermaid 思维导图', keywords: ['mindmap', 'mind-map', 'map'] }
];

function clampIndex(markdown: string, index: number) {
  return Math.max(0, Math.min(markdown.length, index));
}

function findLineStart(markdown: string, index: number) {
  const safeIndex = clampIndex(markdown, index);
  return markdown.lastIndexOf('\n', Math.max(0, safeIndex - 1)) + 1;
}

function findLineEnd(markdown: string, index: number) {
  const safeIndex = clampIndex(markdown, index);
  const nextBreak = markdown.indexOf('\n', safeIndex);
  return nextBreak === -1 ? markdown.length : nextBreak;
}

function replaceRange(markdown: string, range: MarkdownRange, nextText: string) {
  return `${markdown.slice(0, range.start)}${nextText}${markdown.slice(range.end)}`;
}

function normalizeLineBody(line: string) {
  return line.replace(LINE_PREFIX_PATTERN, '').trimStart();
}

function normalizeSelectionAfterRemoval(selection: MarkdownRange, removedRange: MarkdownRange): MarkdownRange {
  const removedLength = removedRange.end - removedRange.start;
  const adjustIndex = (index: number) => {
    if (index <= removedRange.start) return index;
    if (index <= removedRange.end) return removedRange.start;
    return index - removedLength;
  };
  return {
    start: adjustIndex(selection.start),
    end: adjustIndex(selection.end)
  };
}

function unchanged(markdown: string, selection: MarkdownRange, blockedBy?: ApplyMarkdownBlockCommandResult['blockedBy']) {
  return {
    value: markdown,
    selection,
    changed: false,
    blockedBy
  } satisfies ApplyMarkdownBlockCommandResult;
}

function applyLinePrefixCommand(
  markdown: string,
  selection: MarkdownRange,
  prefixForLine: (index: number) => string
): ApplyMarkdownBlockCommandResult {
  const blockStart = findLineStart(markdown, selection.start);
  const blockEnd = findLineEnd(markdown, selection.end);
  const currentBlock = markdown.slice(blockStart, blockEnd);
  const lines = currentBlock.split('\n');
  const activeLineIndex = currentBlock.slice(0, Math.max(0, selection.start - blockStart)).split('\n').length - 1;
  const transformed = lines.map((line, index) => {
    const prefix = prefixForLine(index);
    const body = normalizeLineBody(line);
    return body ? `${prefix}${body}` : prefix;
  });
  const nextBlock = transformed.join('\n');
  const nextValue = replaceRange(markdown, { start: blockStart, end: blockEnd }, nextBlock);

  if (selection.start === selection.end) {
    const previousLines = transformed.slice(0, activeLineIndex);
    const lineOffset = previousLines.length ? `${previousLines.join('\n')}\n`.length : 0;
    const nextCursor = blockStart + lineOffset + (transformed[activeLineIndex] ?? '').length;
    return {
      value: nextValue,
      selection: { start: nextCursor, end: nextCursor },
      changed: nextBlock !== currentBlock
    };
  }

  return {
    value: nextValue,
    selection: { start: blockStart, end: blockStart + nextBlock.length },
    changed: nextBlock !== currentBlock
  };
}

function applyFencedTemplateCommand(
  markdown: string,
  selection: MarkdownRange,
  language: string,
  defaultBody: string,
  placeholderLength: number
): ApplyMarkdownBlockCommandResult {
  const selectedText = markdown.slice(selection.start, selection.end);
  const innerBody = selectedText || defaultBody;
  const template = `\`\`\`${language}\n${innerBody}\n\`\`\``;
  const nextValue = replaceRange(markdown, selection, template);
  const bodyStart = selection.start + 4 + language.length;
  const bodyEnd = selectedText
    ? bodyStart + selectedText.length
    : bodyStart + placeholderLength;

  return {
    value: nextValue,
    selection: { start: bodyStart, end: bodyEnd },
    changed: true
  };
}

export function listMarkdownBlockCommands(query = '') {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return MARKDOWN_BLOCK_COMMANDS;
  }
  return MARKDOWN_BLOCK_COMMANDS.filter((command) =>
    [command.id, command.label, ...command.keywords].some((token) => token.toLowerCase().includes(normalizedQuery))
  );
}

export function isInsideFencedCodeBlock(markdown: string, cursor: number) {
  const prefix = markdown.slice(0, clampIndex(markdown, cursor));
  const lines = prefix.split(/\r?\n/);
  let insideFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      insideFence = !insideFence;
    }
  }
  return insideFence;
}

export function detectMarkdownSlashCommand(markdown: string, selection: MarkdownRange): MarkdownSlashTrigger | null {
  const normalizedSelection = {
    start: clampIndex(markdown, selection.start),
    end: clampIndex(markdown, selection.end)
  };
  if (normalizedSelection.start !== normalizedSelection.end) {
    return null;
  }
  if (isInsideFencedCodeBlock(markdown, normalizedSelection.start)) {
    return null;
  }
  const lineStart = findLineStart(markdown, normalizedSelection.start);
  const linePrefix = markdown.slice(lineStart, normalizedSelection.start);
  const match = /^\s*\/([a-z0-9-]*)$/i.exec(linePrefix);
  if (!match) {
    return null;
  }
  const slashIndex = linePrefix.lastIndexOf('/');
  return {
    start: lineStart + slashIndex,
    end: normalizedSelection.start,
    query: match[1].toLowerCase()
  };
}

export function applyMarkdownBlockCommand(
  markdown: string,
  selection: MarkdownRange,
  commandId: MarkdownBlockCommandId,
  options?: {
    replaceRange?: MarkdownRange;
  }
): ApplyMarkdownBlockCommandResult {
  const command = MARKDOWN_BLOCK_COMMANDS.find((item) => item.id === commandId);
  if (!command) {
    return unchanged(markdown, selection, 'unknown-command');
  }

  let nextMarkdown = markdown;
  let nextSelection = {
    start: clampIndex(markdown, selection.start),
    end: clampIndex(markdown, selection.end)
  };

  const guardCursor = options?.replaceRange ? clampIndex(markdown, options.replaceRange.start) : nextSelection.start;
  if (isInsideFencedCodeBlock(markdown, guardCursor)) {
    return unchanged(markdown, nextSelection, 'fenced-code-block');
  }

  if (options?.replaceRange) {
    const normalizedRange = {
      start: clampIndex(markdown, options.replaceRange.start),
      end: clampIndex(markdown, options.replaceRange.end)
    };
    nextMarkdown = replaceRange(markdown, normalizedRange, '');
    nextSelection = normalizeSelectionAfterRemoval(nextSelection, normalizedRange);
  }

  switch (commandId) {
    case 'heading-1':
      return applyLinePrefixCommand(nextMarkdown, nextSelection, () => '# ');
    case 'heading-2':
      return applyLinePrefixCommand(nextMarkdown, nextSelection, () => '## ');
    case 'heading-3':
      return applyLinePrefixCommand(nextMarkdown, nextSelection, () => '### ');
    case 'heading-4':
      return applyLinePrefixCommand(nextMarkdown, nextSelection, () => '#### ');
    case 'bullet-list':
      return applyLinePrefixCommand(nextMarkdown, nextSelection, () => '- ');
    case 'ordered-list':
      return applyLinePrefixCommand(nextMarkdown, nextSelection, (index) => `${index + 1}. `);
    case 'task-list':
      return applyLinePrefixCommand(nextMarkdown, nextSelection, () => '- [ ] ');
    case 'quote':
      return applyLinePrefixCommand(nextMarkdown, nextSelection, () => '> ');
    case 'code-block':
      return applyFencedTemplateCommand(nextMarkdown, nextSelection, 'text', '', 0);
    case 'mermaid':
      return applyFencedTemplateCommand(
        nextMarkdown,
        nextSelection,
        'mermaid',
        'graph TD\n  A[Start] --> B[Next]',
        'graph TD'.length
      );
    case 'mindmap':
      return applyFencedTemplateCommand(
        nextMarkdown,
        nextSelection,
        'mermaid',
        'mindmap\n  root((主题))\n    分支A\n    分支B',
        'mindmap'.length
      );
    default:
      return unchanged(nextMarkdown, nextSelection, 'unknown-command');
  }
}
