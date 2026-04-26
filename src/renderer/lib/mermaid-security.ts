export const MERMAID_SECURITY_LEVEL = 'strict' as const;

const BLOCKED_SVG_BLOCKS = /<(script|iframe|object|embed)\b[\s\S]*?<\/\1>/gi;
const BLOCKED_SVG_SELF_CLOSING = /<(script|iframe|object|embed)\b[^>]*\/>/gi;
const EVENT_HANDLER_ATTRIBUTES = /\son[a-z-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi;
const SVG_LINK_ATTRIBUTES = /\s(xlink:href|href)\s*=\s*("([^"]*)"|'([^']*)')/gi;

function isSafeSvgReference(reference: string) {
  return reference.startsWith('#');
}

export function sanitizeRenderedMermaidSvg(svg: string) {
  return svg
    .replace(BLOCKED_SVG_BLOCKS, '')
    .replace(BLOCKED_SVG_SELF_CLOSING, '')
    .replace(EVENT_HANDLER_ATTRIBUTES, '')
    .replace(SVG_LINK_ATTRIBUTES, (match, attributeName: string, _quoted: string, doubleQuoted?: string, singleQuoted?: string) => {
      const reference = doubleQuoted ?? singleQuoted ?? '';
      if (isSafeSvgReference(reference)) {
        return ` ${attributeName}="${reference}"`;
      }
      return '';
    });
}
