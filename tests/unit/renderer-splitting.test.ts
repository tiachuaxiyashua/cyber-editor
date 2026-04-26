import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import rendererConfig from '../../vite.renderer.config';

describe('renderer splitting', () => {
  it('lazy-loads heavy workspace pages from App.tsx', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'App.tsx'), 'utf8');

    expect(source).toContain("lazy(() =>\n  import('./components/OrchestrationWorkspace.js').then");
    expect(source).toContain("lazy(() =>\n  import('./components/ResourceCenterPage.js').then");
    expect(source).toContain("lazy(() =>\n  import('./components/RulesWorkspacePage.js').then");
    expect(source).toContain("lazy(() =>\n  import('./components/SettingsWorkspacePage.js').then");
    expect(source).toContain("lazy(() =>\n  import('./components/ThinkingChainPage.js').then");
    expect(source).toContain('Suspense');
  });

  it('splits heavy renderer vendors into dedicated manual chunks', () => {
    const manualChunks = (rendererConfig as { build?: { rollupOptions?: { output?: { manualChunks?: unknown } } } })
      .build?.rollupOptions?.output?.manualChunks;

    expect(typeof manualChunks).toBe('function');
    const split = manualChunks as (id: string) => string | undefined;

    expect(split('/repo/node_modules/@xyflow/react/dist/index.js')).toBe('orchestration-vendor');
    expect(split('/repo/node_modules/mermaid/dist/mermaid.core.mjs')).toBe('diagram-core-vendor');
    expect(split('/repo/node_modules/react-markdown/index.js')).toBe('document-vendor');
    expect(split('/repo/node_modules/lucide-react/dist/esm/icons.js')).toBe('chrome-vendor');
  });
});
