import fs from 'node:fs';
import path from 'node:path';
import type { ThinkingChainLayoutState, ThinkingChainManualPosition } from '../../shared/types';

type ThinkingChainLayoutSaveInput = {
  nodes?: Record<string, ThinkingChainManualPosition>;
  view?: Partial<ThinkingChainLayoutState['view']>;
};

function ensureDir(targetPath: string) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function emptyLayout(sessionId: string): ThinkingChainLayoutState {
  return {
    version: 1,
    sessionId,
    updatedAt: new Date().toISOString(),
    nodes: {},
    view: {
      zoom: 1,
      scrollLeft: 0,
      scrollTop: 0,
      detailPaneWidth: 360
    }
  };
}

export class ThinkingChainLayoutStore {
  private layoutFile(rootPath: string, sessionId: string) {
    return path.join(rootPath, '.project', 'runtime', 'idea-map-layouts', `${sessionId}.json`);
  }

  load(rootPath: string, sessionId: string): ThinkingChainLayoutState | null {
    const targetFile = this.layoutFile(rootPath, sessionId);
    if (!fs.existsSync(targetFile)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(targetFile, 'utf8')) as Partial<ThinkingChainLayoutState>;
      return {
        version: 1,
        sessionId,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        nodes: parsed.nodes && typeof parsed.nodes === 'object' ? parsed.nodes : {},
        view: {
          zoom: typeof parsed.view?.zoom === 'number' ? parsed.view.zoom : 1,
          scrollLeft: typeof parsed.view?.scrollLeft === 'number' ? parsed.view.scrollLeft : 0,
          scrollTop: typeof parsed.view?.scrollTop === 'number' ? parsed.view.scrollTop : 0,
          detailPaneWidth: typeof parsed.view?.detailPaneWidth === 'number' ? parsed.view.detailPaneWidth : 360
        }
      };
    } catch {
      return null;
    }
  }

  save(rootPath: string, sessionId: string, input: ThinkingChainLayoutSaveInput): ThinkingChainLayoutState {
    const targetFile = this.layoutFile(rootPath, sessionId);
    const current = this.load(rootPath, sessionId) ?? emptyLayout(sessionId);
    const next: ThinkingChainLayoutState = {
      version: 1,
      sessionId,
      updatedAt: new Date().toISOString(),
      nodes: {
        ...current.nodes,
        ...(input.nodes ?? {})
      },
      view: {
        zoom: typeof input.view?.zoom === 'number' ? input.view.zoom : current.view.zoom,
        scrollLeft: typeof input.view?.scrollLeft === 'number' ? input.view.scrollLeft : current.view.scrollLeft,
        scrollTop: typeof input.view?.scrollTop === 'number' ? input.view.scrollTop : current.view.scrollTop,
        detailPaneWidth: typeof input.view?.detailPaneWidth === 'number'
          ? input.view.detailPaneWidth
          : current.view.detailPaneWidth
      }
    };
    ensureDir(path.dirname(targetFile));
    fs.writeFileSync(targetFile, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  reset(rootPath: string, sessionId: string) {
    const targetFile = this.layoutFile(rootPath, sessionId);
    if (fs.existsSync(targetFile)) {
      fs.rmSync(targetFile, { force: true });
    }
  }
}
