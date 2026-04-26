import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ThinkingChainLayoutStore } from '../../src/main/services/thinking-chain-layout-store.js';

const roots: string[] = [];

function createTempRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

describe('ThinkingChainLayoutStore', () => {
  afterEach(() => {
    while (roots.length) {
      fs.rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  it('persists node positions and viewport state under the per-session layout file', () => {
    const rootPath = createTempRoot('cyber-editor-idea-map-layout-');
    const store = new ThinkingChainLayoutStore();

    const saved = store.save(rootPath, 'session-layout', {
      nodes: {
        'decision:workbench-shell': {
          x: 1460,
          y: 420,
          pinned: true
        }
      },
      view: {
        zoom: 0.92,
        scrollLeft: 640,
        scrollTop: 180
      }
    });

    expect(saved.sessionId).toBe('session-layout');
    expect(saved.nodes['decision:workbench-shell']).toEqual({
      x: 1460,
      y: 420,
      pinned: true
    });
    expect(saved.view).toEqual({
      zoom: 0.92,
      scrollLeft: 640,
      scrollTop: 180,
      detailPaneWidth: 360
    });

    const loaded = store.load(rootPath, 'session-layout');
    expect(loaded).toEqual(saved);

    store.reset(rootPath, 'session-layout');
    expect(store.load(rootPath, 'session-layout')).toBeNull();
  });
});
