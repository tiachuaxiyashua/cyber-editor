import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  useConversationRuntimeState,
  useOrchestrationState,
  useResourceCenterState,
  useSettingsState,
  useShellState,
  useWorkbenchState
} from '../../src/renderer/hooks/useAppDomainStates';
import type { SidebarLayout } from '../../src/shared/types';

const defaultSidebar: SidebarLayout = {
  leftWidth: 280,
  rightWidth: 368,
  leftCollapsed: false,
  rightCollapsed: false,
  activityView: 'project',
  processPanelOpen: false,
  processPanelTab: 'stage',
  documentSplitOpen: false,
  documentSplitRatio: 0.5
};

function Probe() {
  const settings = useSettingsState();
  const shell = useShellState(defaultSidebar, 1280);
  const orchestration = useOrchestrationState();
  const resources = useResourceCenterState();
  const conversation = useConversationRuntimeState();
  const workbench = useWorkbenchState();

  return (
    <pre>
      {JSON.stringify({
        theme: settings.settingsDraft,
        status: shell.status,
        topbarMenuOpen: shell.topbarMenuOpen,
        viewportWidth: shell.viewportWidth,
        draftSnapshotId: orchestration.draftSnapshotId,
        landingView: resources.landingView,
        resourceInstallKind: resources.resourceInstallKind,
        activeSessionId: conversation.activeSessionId,
        runtimeRuns: conversation.runtimeRuns.length,
        viewMode: workbench.viewMode,
        findOpen: workbench.findOpen,
        activeDocumentPath: workbench.activeDocumentPath
      })}
    </pre>
  );
}

describe('renderer domain hooks', () => {
  it('preserve the expected initial defaults after extraction', () => {
    const markup = renderToStaticMarkup(<Probe />);

    expect(markup).toContain('"status":"正在加载应用…"' );
    expect(markup).toContain('"viewportWidth":1280');
    expect(markup).toContain('"landingView":"welcome"');
    expect(markup).toContain('"resourceInstallKind":"template"');
    expect(markup).toContain('"runtimeRuns":0');
    expect(markup).toContain('"viewMode":"read"');
    expect(markup).toContain('"findOpen":false');
    expect(markup).toContain('"activeDocumentPath":""');
  });
});
