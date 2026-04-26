import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function collectLocalHookOwners(source: string, hook: 'useState' | 'useRef') {
  const pattern =
    hook === 'useState'
      ? /const\s+\[\s*([A-Za-z0-9_]+)\s*,\s*[A-Za-z0-9_]+\s*\]\s*=\s*useState\b/g
      : /const\s+([A-Za-z0-9_]+)\s*=\s*useRef\b/g;
  return Array.from(source.matchAll(pattern), (match) => match[1]).sort();
}

describe('renderer architecture invariants', () => {
  it('keeps App.tsx as a shell with only transient view-state ownership', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'App.tsx'), 'utf8');

    expect(source).toContain("from './hooks/useAppDomainStates'");
    expect(source).toContain("from './components/AppShellSections'");
    expect(source).toContain('useShellState(');
    expect(source).toContain('useWorkbenchState(');
    expect(source).toContain('useOrchestrationState(');
    expect(source).toContain('useResourceCenterState(');
    expect(source).toContain('useSettingsState(');
    expect(source).toContain('useConversationRuntimeState(');
    expect(source).toContain('<SidebarView ');
    expect(source).toContain('<ContextPane ');
    expect(source).toContain('<ProcessPanel ');
    expect(source).not.toContain('function renderSidebarView');
    expect(source).not.toContain('function renderContextPane');
    expect(source).not.toContain('function renderProcessPanel');

    expect(collectLocalHookOwners(source, 'useState')).toEqual([
      'artifactReferenceDialogOpen',
      'artifactReferenceMode',
      'markdownSlashMenu',
      'orchestrationFocusRequest',
      'selectedThinkingNodeId',
      'thinkingChainHideRejected',
      'thinkingChainLoading',
      'thinkingChainSnapshot',
      'thinkingChainZoom'
    ]);
    expect(collectLocalHookOwners(source, 'useRef')).toEqual(['documentSurfaceRef', 'windowContextRef']);
  });
});
