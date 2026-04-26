import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from '../../src/renderer/components/MarkdownContent.js';

describe('MarkdownContent', () => {
  it('rewrites wiki links into clickable local artifact entries', () => {
    const markup = renderToStaticMarkup(
      React.createElement(MarkdownContent, {
        value: '# Links\n\n[[note-a|需求笔记]]\n',
        documentPath: 'E:/workspace/project/01-requirements/index.md'
      })
    );

    expect(markup).toContain('inline-artifact-link');
    expect(markup).toContain('需求笔记');
  });

  it('keeps fenced code blocks untouched when normalizing wiki links', () => {
    const markup = renderToStaticMarkup(
      React.createElement(MarkdownContent, {
        value: '```md\n[[do-not-touch]]\n```\n',
        documentPath: 'E:/workspace/project/01-requirements/index.md'
      })
    );

    expect(markup).toContain('[[do-not-touch]]');
  });
});
