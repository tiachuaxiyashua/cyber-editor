import { describe, expect, it } from 'vitest';
import { MERMAID_SECURITY_LEVEL, sanitizeRenderedMermaidSvg } from '../../src/renderer/lib/mermaid-security.js';

describe('mermaid-security', () => {
  it('keeps Mermaid on the strict security level', () => {
    expect(MERMAID_SECURITY_LEVEL).toBe('strict');
  });

  it('removes executable SVG payloads while preserving local marker references', () => {
    const raw = [
      '<svg onload="alert(1)">',
      '<script>alert(1)</script>',
      '<a xlink:href="https://evil.example">bad</a>',
      '<use xlink:href="#arrowhead"></use>',
      '<g onclick="steal()"><text>safe</text></g>',
      '</svg>'
    ].join('');

    const sanitized = sanitizeRenderedMermaidSvg(raw);

    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('onload=');
    expect(sanitized).not.toContain('onclick=');
    expect(sanitized).not.toContain('https://evil.example');
    expect(sanitized).toContain('xlink:href="#arrowhead"');
    expect(sanitized).toContain('<text>safe</text>');
  });
});
