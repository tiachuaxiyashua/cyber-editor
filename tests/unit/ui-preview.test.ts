import { describe, expect, it } from 'vitest';
import { parseUiPreviewSpec } from '../../src/shared/ui-preview.js';

describe('parseUiPreviewSpec', () => {
  it('parses a valid UI preview JSON block', () => {
    const spec = parseUiPreviewSpec(JSON.stringify({
      title: 'Workbench',
      description: 'Three-column layout',
      sections: [
        {
          id: 'main',
          title: 'Main',
          regions: [
            { id: 'left', title: 'Files', target: '#files' },
            { id: 'center', title: 'Document' }
          ]
        }
      ]
    }));

    expect(spec?.title).toBe('Workbench');
    expect(spec?.sections[0]?.regions).toHaveLength(2);
  });

  it('returns null for invalid JSON', () => {
    expect(parseUiPreviewSpec('not-json')).toBeNull();
  });
});
