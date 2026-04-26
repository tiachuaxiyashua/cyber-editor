import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesPath = path.resolve(__dirname, '../../src/renderer/styles.css');

function readStylesheet() {
  return fs.readFileSync(stylesPath, 'utf8');
}

describe('workbench shell stylesheet regressions', () => {
  it('does not shrink the root app shell away from the desktop viewport', () => {
    const css = readStylesheet();

    expect(css).not.toContain('width: calc(100% - 56px);');
    expect(css).not.toContain('height: calc(100% - 56px);');
    expect(css).not.toContain('margin: 28px;');
    expect(css).not.toContain('width: calc(100% - 28px);');
    expect(css).not.toContain('height: calc(100% - 28px);');
    expect(css).not.toContain('margin: 14px;');
  });

  it('does not keep an expensive full-shell blur on the root workbench surface', () => {
    const css = readStylesheet();
    expect(css).not.toContain('backdrop-filter: blur(24px);');
  });

  it('does not hide the document tab close control in project view', () => {
    const css = readStylesheet();
    expect(css).not.toMatch(/\.app-shell\.view-project\s+\.document-tab-close\s*\{[^}]*display:\s*none;/s);
  });

  it('keeps the project editor textarea visually aligned with the white document surface', () => {
    const css = readStylesheet();
    expect(css).toMatch(/\.app-shell\.view-project\s+\.editor\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*border-radius:\s*0;/s);
  });
});
