import { describe, expect, it } from 'vitest';
import {
  applyMarkdownBlockCommand,
  detectMarkdownSlashCommand,
  isInsideFencedCodeBlock,
  listMarkdownBlockCommands
} from '../../src/renderer/lib/markdown-editor-adapter.js';

describe('markdown-editor-adapter', () => {
  it('detects slash commands only when the cursor is on a clean editable line', () => {
    const trigger = detectMarkdownSlashCommand('# Title\n/mer', { start: 12, end: 12 });
    expect(trigger).toEqual({
      start: 8,
      end: 12,
      query: 'mer'
    });
  });

  it('does not open slash commands inside fenced code blocks', () => {
    const markdown = '```ts\n/mer\n```\n';
    expect(isInsideFencedCodeBlock(markdown, 8)).toBe(true);
    expect(detectMarkdownSlashCommand(markdown, { start: 8, end: 8 })).toBeNull();
  });

  it('inserts a mermaid block from a slash trigger and keeps pure markdown output', () => {
    const result = applyMarkdownBlockCommand(
      '/mer',
      { start: 4, end: 4 },
      'mermaid',
      { replaceRange: { start: 0, end: 4 } }
    );

    expect(result.changed).toBe(true);
    expect(result.value).toBe('```mermaid\ngraph TD\n  A[Start] --> B[Next]\n```');
    expect(result.value.includes('/mer')).toBe(false);
    expect(result.selection).toEqual({
      start: '```mermaid\n'.length,
      end: '```mermaid\ngraph TD'.length
    });
  });

  it('prefixes task list items through the shared adapter', () => {
    const result = applyMarkdownBlockCommand('Plan next step', { start: 14, end: 14 }, 'task-list');

    expect(result.value).toBe('- [ ] Plan next step');
    expect(result.selection).toEqual({
      start: '- [ ] Plan next step'.length,
      end: '- [ ] Plan next step'.length
    });
  });

  it('blocks structured insertion when the cursor is already inside a fenced block', () => {
    const markdown = '```md\nexisting\n```';
    const result = applyMarkdownBlockCommand(markdown, { start: 8, end: 8 }, 'heading-2');

    expect(result.changed).toBe(false);
    expect(result.blockedBy).toBe('fenced-code-block');
    expect(result.value).toBe(markdown);
  });

  it('filters slash commands by query without dropping the shared command registry', () => {
    const commands = listMarkdownBlockCommands('mind');
    expect(commands.map((command) => command.id)).toEqual(['mindmap']);
  });
});
