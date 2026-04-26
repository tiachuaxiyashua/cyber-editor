import { ipcMain } from 'electron';
import type {
  AiRequest,
  AppSettingsInput,
  FlowPatch,
  PlatformFlowAsset,
  ProviderProfileInput,
  ReviewIssueState,
  SessionContextControls
} from '../../shared/types';
import { isRuntimePauseSignal } from '../services/runtime-interrupts';
import type { IpcRegistrationContext } from './context';

export function registerSettingsSessionAiIpc(context: IpcRegistrationContext) {
  const normalizePaths = (value: string[] | undefined) =>
    Array.from(new Set((value ?? []).filter(Boolean)));

  ipcMain.handle('settings:get', () => context.settingsStore.getSettings());
  ipcMain.handle('settings:save', (_event, input: AppSettingsInput) => {
    const saved = context.settingsStore.saveSettings(input);
    context.refreshMenu();
    context.onSettingsSaved(saved);
    return saved;
  });
  ipcMain.handle('settings:test-ai', async (_event, payload?: { profileId?: string; draft?: ProviderProfileInput }) => {
    const providerSettings = context.getProviderSettings(payload);
    const result = await context.aiService.testConnection(providerSettings);
    if (!payload?.draft && providerSettings.profileId) {
      context.updateProfileDiagnostic(providerSettings.profileId, result);
    }
    return result;
  });

  ipcMain.handle('layout:update', (_event, sidebar) => {
    const settings = context.settingsStore.getSettings();
    context.settingsStore.saveSettings({
      theme: settings.theme,
      sidebar,
      activeProviderProfileId: settings.activeProviderProfileId
    });
    return true;
  });

  ipcMain.handle('sessions:save', (_event, sessions) => {
    const rootPath = context.getActiveProjectRoot();
    if (!rootPath) return false;
    context.projectService.saveSessions(rootPath, sessions);
    return true;
  });

  ipcMain.handle('knowledge:update-session-context-controls', (_event, sessionId: string, controls: SessionContextControls) => {
    const rootPath = context.requireActiveRoot();
    const sessions = context.projectService.loadSessions(rootPath).map((session) => session.id === sessionId
      ? {
          ...session,
          contextControls: {
            pinnedDocumentPaths: normalizePaths(controls?.pinnedDocumentPaths),
            excludedDocumentPaths: normalizePaths(controls?.excludedDocumentPaths),
            updatedAt: new Date().toISOString()
          }
        }
      : session);
    context.projectService.saveSessions(rootPath, sessions);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('ai:send', async (_event, request: AiRequest) => {
    const rootPath = context.requireActiveRoot();
    const response = await context.runtimeService.sendMessage(
      rootPath,
      request,
      context.getProviderProfiles(),
      context.settingsStore.getSettings().activeProviderProfileId
    );

    if (response.message) {
      context.projectService.appendConversationLog(rootPath, {
        type: 'chat.reply',
        sessionId: request.sessionId,
        createdAt: new Date().toISOString(),
        stage: request.stage,
        diagnostics: response.diagnostics ?? []
      });
    }

    return {
      ...response,
      bootstrap: context.buildBootstrap(rootPath)
    };
  });

  ipcMain.handle('conversation-flow:plan', async (_event, prompt: string) => {
    const roles = context.getActiveProjectRoot() ? context.projectService.loadPlatformAssets(context.getActiveProjectRoot()!).roles : [];
    return context.conversationFlowService.planFromPrompt({
      prompt,
      roles,
      profiles: context.getProviderProfiles(),
      activeProviderProfileId: context.settingsStore.getSettings().activeProviderProfileId
    });
  });

  ipcMain.handle('conversation-flow:draft', async (_event, payload: { prompt: string; kind?: PlatformFlowAsset['kind'] }) => {
    const roles = context.getActiveProjectRoot() ? context.projectService.loadPlatformAssets(context.getActiveProjectRoot()!).roles : [];
    const plan = await context.conversationFlowService.planFromPrompt({
      prompt: payload.prompt,
      roles,
      profiles: context.getProviderProfiles(),
      activeProviderProfileId: context.settingsStore.getSettings().activeProviderProfileId
    });
    return {
      plan,
      draft: context.conversationFlowService.draftFromPlan(plan, payload.kind ?? 'flow')
    };
  });

  ipcMain.handle('conversation-flow:patch', async (_event, payload: { flow: PlatformFlowAsset; prompt: string }) => {
    return context.conversationFlowService.patchFromPrompt({
      flow: payload.flow,
      prompt: payload.prompt,
      profiles: context.getProviderProfiles(),
      activeProviderProfileId: context.settingsStore.getSettings().activeProviderProfileId
    });
  });

  ipcMain.handle('conversation-flow:apply-patch', async (_event, payload: { flow: PlatformFlowAsset; patch: FlowPatch }) => {
    return context.conversationFlowService.applyPatch(payload.flow, payload.patch);
  });

  ipcMain.handle('workflow:generate-stage', async (_event, sessionId: string, instructions?: string) => {
    const rootPath = context.requireActiveRoot();
    try {
      await context.runtimeService.generateStageDraft(
        rootPath,
        sessionId,
        context.getProviderProfiles(),
        context.settingsStore.getSettings().activeProviderProfileId,
        instructions
      );
      return {
        bootstrap: context.buildBootstrap(rootPath)
      };
    } catch (error) {
      if (!isRuntimePauseSignal(error)) {
        throw error;
      }
      return {
        bootstrap: context.buildBootstrap(rootPath),
        pausedRunId: error.run.id,
        paused: true
      };
    }
  });

  ipcMain.handle('workflow:get-stage-guard', async (_event, sessionId: string, stage?: string) => {
    const rootPath = context.requireActiveRoot();
    return context.runtimeService.evaluateStageGuard(rootPath, sessionId, stage as any);
  });

  ipcMain.handle('workflow:confirm-stage', async (_event, sessionId: string, stage) => {
    const rootPath = context.requireActiveRoot();
    const guard = context.runtimeService.evaluateStageGuard(rootPath, sessionId, stage);
    if (!guard.ok) {
      throw new Error(guard.blockers[0] ?? 'Current stage does not satisfy confirmation requirements.');
    }
    const workflow = context.orchestrator.confirmStage(rootPath, stage);
    const sessions = context.projectService.loadSessions(rootPath).map((session) =>
      session.stage === stage ? { ...session, stage: workflow.stage } : session
    );
    context.projectService.saveSessions(rootPath, sessions);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('workflow:revisit-stage', async (_event, stage) => {
    const rootPath = context.requireActiveRoot();
    const workflow = context.orchestrator.revisitStage(rootPath, stage);
    const sessions = context.projectService.loadSessions(rootPath).map((session) => ({ ...session, stage: workflow.stage }));
    context.projectService.saveSessions(rootPath, sessions);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('review:run', async (_event, sessionId: string, documentPath: string) => {
    const rootPath = context.requireActiveRoot();
    try {
      await context.runtimeService.runReviewRound(
        rootPath,
        sessionId,
        documentPath,
        context.getProviderProfiles(),
        context.settingsStore.getSettings().activeProviderProfileId
      );
      return {
        bootstrap: context.buildBootstrap(rootPath)
      };
    } catch (error) {
      if (!isRuntimePauseSignal(error)) {
        throw error;
      }
      return {
        bootstrap: context.buildBootstrap(rootPath),
        pausedRunId: error.run.id,
        paused: true
      };
    }
  });

  ipcMain.handle('review:update-issue', async (_event, roundId: string, issueId: string, state: ReviewIssueState) => {
    const rootPath = context.requireActiveRoot();
    context.orchestrator.updateReviewIssueState(rootPath, roundId, issueId, state);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('consistency:run', async () => {
    const rootPath = context.requireActiveRoot();
    context.orchestrator.runConsistency(rootPath);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('handoff:generate-openspec', async () => {
    const rootPath = context.requireActiveRoot();
    const result = await context.runtimeService.generateOpenSpec(rootPath);
    return {
      bootstrap: context.buildBootstrap(rootPath),
      result
    };
  });
}
