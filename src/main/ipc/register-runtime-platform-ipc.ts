import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { dialog, ipcMain } from 'electron';
import type {
  ActionableErrorRecord,
  PlatformFlowAsset,
  PromotionTargetKind,
  RuleDefinition,
  RuleScope,
  RuntimeTemplateAsset
} from '../../shared/types';
import { validatePlatformFlow } from '../../shared/flow-validator';
import { isRuntimePauseSignal } from '../services/runtime-interrupts';
import { ThinkingChainProjector } from '../services/thinking-chain-projector';
import type { IpcRegistrationContext } from './context';

export function registerRuntimePlatformIpc(context: IpcRegistrationContext) {
  const thinkingChainProjector = new ThinkingChainProjector();

  ipcMain.handle('runtime:resume-run', async (_event, runId: string) => {
    const rootPath = context.requireActiveRoot();
    let result;
    try {
      result = await context.runtimeService.resumeRun(
        rootPath,
        runId,
        context.getProviderProfiles(),
        context.settingsStore.getSettings().activeProviderProfileId
      );
    } catch (error) {
      if (!isRuntimePauseSignal(error)) {
        throw error;
      }
      result = {
        paused: true,
        run: error.run,
        events: context.runtimeService.listRunEvents(rootPath, error.run.id)
      };
    }
    return {
      bootstrap: context.buildBootstrap(rootPath),
      result
    };
  });

  ipcMain.handle('runtime:pause-run', async (_event, runId: string) => {
    const rootPath = context.requireActiveRoot();
    const result = context.runtimeService.pauseRun(rootPath, runId);
    return {
      bootstrap: context.buildBootstrap(rootPath),
      result
    };
  });

  ipcMain.handle('runtime:retry-run', async (_event, runId: string) => {
    const rootPath = context.requireActiveRoot();
    let result;
    try {
      result = await context.runtimeService.retryRun(
        rootPath,
        runId,
        context.getProviderProfiles(),
        context.settingsStore.getSettings().activeProviderProfileId
      );
    } catch (error) {
      if (!isRuntimePauseSignal(error)) {
        throw error;
      }
      result = {
        paused: true,
        run: error.run,
        events: context.runtimeService.listRunEvents(rootPath, error.run.id)
      };
    }
    return {
      bootstrap: context.buildBootstrap(rootPath),
      result
    };
  });

  ipcMain.handle('runtime:stop-run', async (_event, runId: string) => {
    const rootPath = context.requireActiveRoot();
    const result = context.runtimeService.stopRun(rootPath, runId);
    return {
      bootstrap: context.buildBootstrap(rootPath),
      result
    };
  });

  ipcMain.handle('runtime:resolve-approval', async (_event, payload: {
    runId: string;
    approvalId: string;
    approved: boolean;
    reason?: string;
  }) => {
    const rootPath = context.requireActiveRoot();
    const result = context.runtimeService.resolveRuntimeApproval(
      rootPath,
      payload.runId,
      payload.approvalId,
      payload.approved,
      payload.reason
    );
    return {
      bootstrap: context.buildBootstrap(rootPath),
      result
    };
  });

  ipcMain.handle('runtime:debug-node', async (_event, payload: {
    kind: PlatformFlowAsset['kind'];
    flowId: string;
    nodeId: string;
    sessionId?: string;
  }) => {
    const rootPath = context.requireActiveRoot();
    let result;
    try {
      result = await context.runtimeService.debugFlowNode({
        rootPath,
        kind: payload.kind,
        flowId: payload.flowId,
        nodeId: payload.nodeId,
        sessionId: payload.sessionId,
        profiles: context.getProviderProfiles(),
        activeProviderProfileId: context.settingsStore.getSettings().activeProviderProfileId
      });
    } catch (error) {
      if (!isRuntimePauseSignal(error)) {
        throw error;
      }
      result = {
        paused: true,
        run: error.run,
        events: context.runtimeService.listRunEvents(rootPath, error.run.id)
      };
    }
    return {
      bootstrap: context.buildBootstrap(rootPath),
      result
    };
  });

  ipcMain.handle('runtime:preview-rerun', async (_event, payload: {
    kind: PlatformFlowAsset['kind'];
    flowId: string;
    nodeId: string;
    sourceRunId?: string;
    mode?: 'continue' | 'debug' | 'partial-rerun';
  }) => {
    const rootPath = context.requireActiveRoot();
    return context.runtimeService.previewFlowRerun({
      rootPath,
      kind: payload.kind,
      flowId: payload.flowId,
      nodeId: payload.nodeId,
      sourceRunId: payload.sourceRunId,
      mode: payload.mode
    });
  });

  ipcMain.handle('runtime:apply-rerun', async (_event, payload: {
    kind: PlatformFlowAsset['kind'];
    flowId: string;
    nodeId: string;
    sessionId?: string;
    sourceRunId?: string;
    mode?: 'continue' | 'debug' | 'partial-rerun';
  }) => {
    const rootPath = context.requireActiveRoot();
    let result;
    try {
      result = await context.runtimeService.applyFlowRerun({
        rootPath,
        kind: payload.kind,
        flowId: payload.flowId,
        nodeId: payload.nodeId,
        sessionId: payload.sessionId,
        sourceRunId: payload.sourceRunId,
        mode: payload.mode,
        profiles: context.getProviderProfiles(),
        activeProviderProfileId: context.settingsStore.getSettings().activeProviderProfileId
      });
    } catch (error) {
      if (!isRuntimePauseSignal(error)) {
        throw error;
      }
      result = {
        paused: true,
        run: error.run,
        events: context.runtimeService.listRunEvents(rootPath, error.run.id)
      };
    }
    return {
      bootstrap: context.buildBootstrap(rootPath),
      result
    };
  });

  ipcMain.handle('runtime:save-template', async (_event, template: RuntimeTemplateAsset) => {
    const rootPath = context.requireActiveRoot();
    const result = context.runtimeService.saveRuntimeTemplate(rootPath, template);
    return {
      bootstrap: context.buildBootstrap(rootPath),
      result
    };
  });

  ipcMain.handle('runtime:validate-flow', async (_event, kind: PlatformFlowAsset['kind'], flowId: string) => {
    const rootPath = context.requireActiveRoot();
    return context.runtimeService.validateFlow(rootPath, kind, flowId);
  });

  ipcMain.handle('knowledge:get-status', async () => {
    const rootPath = context.requireActiveRoot();
    return context.runtimeService.getKnowledgeIndexState(rootPath);
  });

  ipcMain.handle('knowledge:refresh', async (_event, mode: 'manual' | 'incremental' = 'manual') => {
    const rootPath = context.requireActiveRoot();
    context.runtimeService.refreshKnowledgeIndex(rootPath, mode);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('runtime.thinkingChain.get', async (_event, payload?: { sessionId?: string }) => {
    const rootPath = context.requireActiveRoot();
    return thinkingChainProjector.getSnapshot({
      rootPath,
      sessionId: payload?.sessionId,
      projectService: context.projectService,
      runtimeService: context.runtimeService
    });
  });

  ipcMain.handle('runtime.thinkingChain.save-layout', async (_event, payload: {
    sessionId: string;
    payload: {
      nodes?: Record<string, { x: number; y: number; pinned?: boolean }>;
      view?: { zoom?: number; scrollLeft?: number; scrollTop?: number };
    };
  }) => {
    const rootPath = context.requireActiveRoot();
    return thinkingChainProjector.saveLayout(rootPath, payload.sessionId, payload.payload);
  });

  ipcMain.handle('runtime.thinkingChain.reset-layout', async (_event, payload: { sessionId: string }) => {
    const rootPath = context.requireActiveRoot();
    thinkingChainProjector.resetLayout(rootPath, payload.sessionId);
    return true;
  });

  ipcMain.handle('platform:save-flow', async (_event, flow: PlatformFlowAsset) => {
    const rootPath = context.requireActiveRoot();
    const assets = context.projectService.loadPlatformAssets(rootPath);
    const project = context.projectService.openProject(rootPath);
    const templateId = project.manifest.templateId ?? assets.template?.id;
    const runtimeTemplate = templateId
      ? context.runtimeService.getRuntimeTemplate(rootPath, templateId)
      : null;
    const findings = validatePlatformFlow(flow, {
      template: runtimeTemplate,
      subflows: assets.subflows,
      roles: assets.roles,
      taskTemplates: assets.taskTemplates,
      agentProfiles: assets.agentProfiles,
      connectors: assets.connectors,
      tools: assets.tools
    });
    const blocking = findings.find((item) => item.severity === 'error');
    if (blocking) {
      throw new Error(blocking.message);
    }
    context.platformService.saveFlow(rootPath, flow);
    context.runtimeService.ensureProjectRuntime(rootPath);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('platform:delete-flow', async (_event, kind: PlatformFlowAsset['kind'], flowId: string) => {
    const rootPath = context.requireActiveRoot();
    context.platformService.deleteFlow(rootPath, kind, flowId);
    context.runtimeService.ensureProjectRuntime(rootPath);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('platform:duplicate-flow', async (_event, kind: PlatformFlowAsset['kind'], flowId: string) => {
    const rootPath = context.requireActiveRoot();
    context.platformService.duplicateFlow(rootPath, kind, flowId);
    context.runtimeService.ensureProjectRuntime(rootPath);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('platform:import-flow', async (_event, kind: PlatformFlowAsset['kind']) => {
    const rootPath = context.requireActiveRoot();
    const result = await dialog.showOpenDialog(context.getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'Flow Package', extensions: ['json'] }]
    });
    if (!result.canceled && result.filePaths[0]) {
      context.platformService.importFlow(rootPath, result.filePaths[0], kind);
      context.runtimeService.ensureProjectRuntime(rootPath);
    }
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('platform:export-flow', async (_event, kind: PlatformFlowAsset['kind'], flowId: string) => {
    const rootPath = context.requireActiveRoot();
    const assets = context.projectService.loadPlatformAssets(rootPath);
    const flow = (kind === 'subflow' ? assets.subflows : assets.flows).find((item) => item.id === flowId);
    if (!flow) {
      throw new Error('Target flow not found.');
    }
    const result = await dialog.showSaveDialog(context.getMainWindow(), {
      defaultPath: path.join(rootPath, `${flow.name}.json`),
      filters: [{ name: 'Flow Package', extensions: ['json'] }]
    });
    if (!result.canceled && result.filePath) {
      context.platformService.exportFlow(rootPath, kind, flowId, result.filePath);
    }
    return {
      bootstrap: context.buildBootstrap(rootPath),
      exportPath: result.canceled ? null : result.filePath
    };
  });

  ipcMain.handle('platform:restore-flow-version', async (_event, kind: PlatformFlowAsset['kind'], flowId: string, versionId: string) => {
    const rootPath = context.requireActiveRoot();
    context.platformService.restoreFlowVersion(rootPath, kind, flowId, versionId);
    context.runtimeService.ensureProjectRuntime(rootPath);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('platform:save-roles', async (_event, roles) => {
    const rootPath = context.requireActiveRoot();
    context.platformService.saveRoles(rootPath, roles);
    context.runtimeService.ensureProjectRuntime(rootPath);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('platform:save-task-templates', async (_event, taskTemplates) => {
    const rootPath = context.requireActiveRoot();
    context.platformService.saveTaskTemplates(rootPath, taskTemplates);
    context.runtimeService.ensureProjectRuntime(rootPath);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('platform:save-agent-profiles', async (_event, agentProfiles) => {
    const rootPath = context.requireActiveRoot();
    context.platformService.saveAgentProfiles(rootPath, agentProfiles);
    context.runtimeService.ensureProjectRuntime(rootPath);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('platform:save-connectors', async (_event, connectors) => {
    const rootPath = context.requireActiveRoot();
    context.platformService.saveConnectors(rootPath, connectors);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('platform:save-tools', async (_event, tools) => {
    const rootPath = context.requireActiveRoot();
    context.platformService.saveTools(rootPath, tools);
    return context.buildBootstrap(rootPath);
  });

  ipcMain.handle('platform:test-connector', async (_event, connectorId: string) => {
    const rootPath = context.requireActiveRoot();
    const result = await context.platformService.testConnector(rootPath, connectorId);
    return {
      bootstrap: context.buildBootstrap(rootPath),
      result
    };
  });

  ipcMain.handle('platform:run-tool', async (_event, toolId: string, approvalId?: string) => {
    const rootPath = context.requireActiveRoot();
    const preview = context.sideEffectGovernance.resolveExecutionPreview(rootPath, `script:${toolId}`, {}, approvalId);
    if (preview) {
      try {
        context.sideEffectGovernance.assertExecutionAllowed(rootPath, preview, approvalId);
      } catch (error) {
        if (error && typeof error === 'object' && 'scope' in error && 'message' in error) {
          const actionableError = error as ActionableErrorRecord;
          context.evidenceStore.persistActionableError(rootPath, actionableError);
          context.projectService.appendAudit(rootPath, {
            id: randomUUID(),
            createdAt: new Date().toISOString(),
            type: 'side-effect.blocked',
            message: actionableError.message,
            metadata: {
              capabilityId: preview.capabilityId,
              previewId: preview.id,
              approvalId: approvalId ?? null,
              actionableErrorId: actionableError.id
            }
          });
          throw new Error(actionableError.message);
        }
        throw error;
      }
      context.projectService.appendAudit(rootPath, {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        type: 'side-effect.executed',
        message: preview.summary,
        metadata: {
          capabilityId: preview.capabilityId,
          previewId: preview.id,
          approvalId: approvalId ?? null
        }
      });
    }
    const result = await context.platformService.runTool(rootPath, toolId);
    return {
      bootstrap: context.buildBootstrap(rootPath),
      result
    };
  });

  ipcMain.handle('side-effects:preview', async (_event, capabilityId: string, input: Record<string, unknown>, runId?: string) => {
    const rootPath = context.requireActiveRoot();
    return context.sideEffectGovernance.previewCapability(rootPath, capabilityId, input, runId);
  });

  ipcMain.handle('side-effects:approve', async (_event, previewId: string, approved: boolean, reason?: string) => {
    const rootPath = context.requireActiveRoot();
    const approval = context.sideEffectGovernance.approvePreview(rootPath, previewId, approved, reason);
    context.projectService.appendAudit(rootPath, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: approved ? 'side-effect.approved' : 'side-effect.rejected',
      message: `${approved ? 'Approved' : 'Rejected'} side effect ${previewId}`,
      metadata: { previewId, approvalId: approval.id, reason: reason ?? null }
    });
    return approval;
  });

  ipcMain.handle('rules:save-rule', async (_event, rule: Partial<RuleDefinition> & Pick<RuleDefinition, 'name' | 'body' | 'scope'>) => {
    const snapshot = context.rulesDistillationService.saveRule(context.getActiveProjectRoot(), rule);
    return {
      bootstrap: context.buildBootstrap(context.getActiveProjectRoot()),
      snapshot
    };
  });

  ipcMain.handle('rules:delete-rule', async (_event, ruleId: string) => {
    const snapshot = context.rulesDistillationService.deleteRule(context.getActiveProjectRoot(), ruleId);
    return {
      bootstrap: context.buildBootstrap(context.getActiveProjectRoot()),
      snapshot
    };
  });

  ipcMain.handle('rules:set-enabled', async (_event, payload: { ruleId: string; enabled: boolean }) => {
    const snapshot = context.rulesDistillationService.setRuleEnabled(context.getActiveProjectRoot(), payload.ruleId, payload.enabled);
    return {
      bootstrap: context.buildBootstrap(context.getActiveProjectRoot()),
      snapshot
    };
  });

  ipcMain.handle('rules:save-accumulation', async (_event, entry) => {
    const rootPath = context.requireActiveRoot();
    const snapshot = context.rulesDistillationService.saveAccumulationEntry(rootPath, entry);
    return {
      bootstrap: context.buildBootstrap(rootPath),
      snapshot
    };
  });

  ipcMain.handle('rules:delete-accumulation', async (_event, entryId: string) => {
    const rootPath = context.requireActiveRoot();
    const snapshot = context.rulesDistillationService.deleteAccumulationEntry(rootPath, entryId);
    return {
      bootstrap: context.buildBootstrap(rootPath),
      snapshot
    };
  });

  ipcMain.handle('rules:create-promotion', async (_event, payload: { entryId: string; targetKind: PromotionTargetKind; proposedName?: string }) => {
    const rootPath = context.requireActiveRoot();
    const snapshot = context.rulesDistillationService.createPromotionDraft(rootPath, payload);
    return {
      bootstrap: context.buildBootstrap(rootPath),
      snapshot
    };
  });

  ipcMain.handle('rules:apply-promotion', async (_event, payload: { draftId: string; reviewNote?: string }) => {
    const rootPath = context.requireActiveRoot();
    const snapshot = context.rulesDistillationService.applyPromotionDraft(rootPath, payload.draftId, payload.reviewNote);
    return {
      bootstrap: context.buildBootstrap(rootPath),
      snapshot
    };
  });

  ipcMain.handle('rules:export', async (_event, scope: RuleScope) => {
    const rootPath = scope === 'global' ? context.getActiveProjectRoot() : context.requireActiveRoot();
    const result = await dialog.showSaveDialog(context.getMainWindow(), {
      defaultPath: path.join(rootPath ?? process.cwd(), `${scope}-rules.json`),
      filters: [{ name: 'Rule Package', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) {
      return {
        bootstrap: context.buildBootstrap(context.getActiveProjectRoot()),
        exportPath: null
      };
    }
    const exported = context.rulesDistillationService.exportRules(context.getActiveProjectRoot(), result.filePath, scope);
    return {
      bootstrap: context.buildBootstrap(context.getActiveProjectRoot()),
      exportPath: exported.exportPath,
      count: exported.count
    };
  });

  ipcMain.handle('rules:import', async (_event, scope: RuleScope) => {
    const result = await dialog.showOpenDialog(context.getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'Rule Package', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths[0]) {
      return {
        bootstrap: context.buildBootstrap(context.getActiveProjectRoot()),
        importedCount: 0
      };
    }
    const imported = context.rulesDistillationService.importRules(context.getActiveProjectRoot(), result.filePaths[0], scope);
    return {
      bootstrap: context.buildBootstrap(context.getActiveProjectRoot()),
      importedCount: imported.count
    };
  });

  ipcMain.handle('rules:sync-experience', async (_event, payload?: { rootPath?: string; sourcePath?: string } | string) => {
    const resolvedPayload = typeof payload === 'string'
      ? { sourcePath: payload }
      : (payload ?? {});
    const rootPath = context.requireActiveRoot();
    const synced = context.rulesDistillationService.syncExperienceSources(rootPath, resolvedPayload.sourcePath);
    return {
      bootstrap: context.buildBootstrap(rootPath),
      snapshot: synced.snapshot,
      summary: {
        sourcePath: synced.sourcePath,
        lessonCount: synced.lessonCount,
        globalRuleCount: synced.globalRuleCount,
        projectRuleCount: synced.projectRuleCount,
        nodeRuleCount: synced.nodeRuleCount,
        accumulationEntryCount: synced.accumulationEntryCount
      }
    };
  });
}
