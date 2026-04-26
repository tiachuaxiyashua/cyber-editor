import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { RuntimeService } from '../../src/main/services/runtime-service.js';
import { isRuntimePauseSignal } from '../../src/main/services/runtime-interrupts.js';

describe('runtime context and recovery', () => {
  it('persists a context pack and links it from the completed run', async () => {
    const saveRun = vi.fn();
    const appendEvent = vi.fn();
    const persistContextPack = vi.fn();
    const persistRunEvidence = vi.fn();
    const role = {
      id: 'role-1',
      name: 'Role',
      description: '',
      promptHint: 'hint',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };
    const selectedProfile = {
      id: 'profile-1',
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:8b',
      apiKey: '',
      enabled: true,
      createdAt: '',
      updatedAt: '',
      hasApiKey: false,
      apiKeyMasked: '',
      diagnostics: { status: 'unknown' },
      capabilities: {
        tags: ['json-mode'],
        maxContextTokens: 32000,
        privacy: 'local',
        costTier: 'low',
        latencyTier: 'low'
      }
    };

    const service = new RuntimeService(
      {
        openProject: vi.fn(() => ({ manifest: { templateId: 'template-1' } })),
        loadPlatformAssets: vi.fn(() => ({ template: { id: 'template-1' } })),
        loadSessions: vi.fn(() => [{
          id: 'session-1',
          title: 'Session',
          stage: 'discover',
          messages: [{ id: 'm1', role: 'user', content: 'hello', createdAt: '' }]
        }]),
        listKnowledgeFiles: vi.fn(() => [path.resolve('E:/project/01-requirements/doc.md')]),
        buildNoteReferenceGraph: vi.fn(() => ({
          documents: [
            {
              path: path.resolve('E:/project/01-requirements/doc.md'),
              title: 'Doc',
              outbound: [],
              inbound: []
            }
          ]
        })),
        getRelevantDocumentChanges: vi.fn(() => []),
        readFile: vi.fn(() => '# doc'),
        getDocumentMeta: vi.fn(() => ({ modifiedAt: 1 }))
      } as never,
      {
        saveRun,
        appendEvent,
        ensureProjectRuntime: vi.fn(),
        listEventsForRun: vi.fn(() => [])
      } as never,
      {
        select: vi.fn(() => ({ profile: selectedProfile, reason: 'selected' }))
      } as never,
      {
        generateText: vi.fn().mockResolvedValue({
          content: 'final answer',
          output: { kind: 'final', label: 'output', contentType: 'text', content: 'final answer' }
        })
      } as never,
      {
        execute: vi.fn()
      } as never,
      {} as never,
      {} as never,
      {
        persistContextPack,
        persistRunEvidence,
        persistActionableError: vi.fn()
      } as never
    );

    const result = await (service as any).runRoleLoop({
      rootPath: 'E:/project',
      kind: 'chat',
      sessionId: 'session-1',
      stage: 'discover',
      role,
      profiles: [selectedProfile],
      activeProviderProfileId: 'profile-1',
      system: 'system',
      user: 'user',
      allowedCapabilities: [],
      contextDocumentPaths: [path.resolve('E:/project/01-requirements/doc.md')],
      provenance: ['unit-test']
    });

    expect(persistContextPack).toHaveBeenCalledTimes(1);
    const persistedContextPack = persistContextPack.mock.calls[0]?.[1];
    expect(persistedContextPack?.provenance).toContain('unit-test');
    expect(persistedContextPack?.retrievalHits?.length).toBeGreaterThan(0);
    expect(persistedContextPack?.provenanceRecords?.length).toBeGreaterThan(0);
    expect(persistedContextPack?.budgetPlan?.selectedRetrievalHitCount).toBeGreaterThan(0);
    expect(persistedContextPack?.knowledgeIndexBuiltAt).toBeTruthy();
    expect(result.run.contextPackId).toBe(persistedContextPack?.id);
    expect(persistRunEvidence).toHaveBeenCalledTimes(1);
    expect(result.run.evidencePackageId).toBeTruthy();
  });

  it('resumes from the latest checkpoint and carries forward the previous context pack reference', async () => {
    const service = new RuntimeService(
      {
        loadPlatformAssets: vi.fn(() => ({
          roles: [{
            id: 'role-1',
            name: 'Role',
            description: '',
            promptHint: 'hint',
            allowedCapabilities: [],
            outputSchema: 'markdown',
            modelPolicy: {
              mode: 'fallback_to_active',
              preferredProfileIds: [],
              fallbackToActive: true
            }
          }]
        }))
      } as never,
      {
        saveRun: vi.fn(),
        appendEvent: vi.fn(),
        getRun: vi.fn(() => ({
          id: 'run-1',
          kind: 'chat',
          status: 'paused',
          createdAt: '2026-04-15T00:00:00.000Z',
          updatedAt: '2026-04-15T00:00:00.000Z',
          sessionId: 'session-1',
          stage: 'discover',
          roleId: 'role-1',
          contextPackId: 'context-old',
          diagnostics: [],
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
          outputs: [],
          checkpoints: [{ id: 'checkpoint-1', summary: 'latest checkpoint', createdAt: '', turn: 1, status: 'completed' }],
          resumeContext: {
            system: 'system',
            user: 'user',
            allowedCapabilities: []
          },
          recovery: {
            status: 'recoverable',
            savedAt: '2026-04-15T00:00:00.000Z',
            latestCheckpointId: 'checkpoint-1',
            approvalIds: [],
            branchGroupIds: []
          }
        }))
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);
    vi.spyOn(service, 'listRunEvents').mockReturnValue([]);
    const runRoleLoop = vi.spyOn(service as any, 'runRoleLoop').mockResolvedValue({
      run: {
        id: 'run-2',
        kind: 'chat',
        status: 'running',
        createdAt: '2026-04-15T00:00:01.000Z',
        updatedAt: '2026-04-15T00:00:01.000Z',
        diagnostics: [],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
        outputs: [],
        checkpoints: []
      }
    });

    await service.resumeRun('E:/project', 'run-1', [], '');

    expect(runRoleLoop).toHaveBeenCalledWith(expect.objectContaining({
      resumedFromRunId: 'run-1',
      provenance: ['resume-context-pack:context-old']
    }));
  });

  it('transitions pause-requested to paused when the next checkpoint is durably recorded', () => {
    let storedRun = {
      id: 'run-pause-checkpoint',
      kind: 'chat',
      status: 'running',
      createdAt: '2026-04-15T00:00:00.000Z',
      updatedAt: '2026-04-15T00:00:00.000Z',
      sessionId: 'session-1',
      stage: 'discover',
      roleId: 'role-1',
      diagnostics: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
      outputs: [],
      checkpoints: [],
      resumeContext: {
        system: 'system',
        user: 'user',
        allowedCapabilities: []
      }
    } as any;
    const saveRun = vi.fn((_rootPath: string, run: any) => {
      storedRun = structuredClone(run);
    });
    const appendEvent = vi.fn();
    const service = new RuntimeService(
      {
        loadPlatformAssets: vi.fn(() => ({ roles: [] }))
      } as never,
      {
        saveRun,
        appendEvent,
        getRun: vi.fn(() => storedRun),
        listEventsForRun: vi.fn(() => [])
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        readContextPack: vi.fn(() => ({ id: 'ctx-1' }))
      } as never
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);
    vi.spyOn(service, 'listRunEvents').mockReturnValue([]);

    service.pauseRun('E:/project', storedRun.id);

    let pauseSignal: unknown = null;
    try {
      (service as any).recordCheckpoint('E:/project', storedRun, {
        turn: 1,
        summary: 'Completed model turn 1',
        status: 'completed',
        currentStep: 'Completed model turn 1'
      });
    } catch (error) {
      pauseSignal = error;
    }

    expect(isRuntimePauseSignal(pauseSignal)).toBe(true);
    expect(storedRun.status).toBe('paused');
    expect(storedRun.latestCheckpointSummary).toBe('Completed model turn 1');
    expect(appendEvent).toHaveBeenCalledWith('E:/project', expect.objectContaining({
      runId: storedRun.id,
      type: 'run.paused'
    }));
  });

  it('blocks resume when the latest checkpoint context pack has drifted away', async () => {
    const service = new RuntimeService(
      {
        loadPlatformAssets: vi.fn(() => ({
          roles: [{
            id: 'role-1',
            name: 'Role',
            description: '',
            promptHint: 'hint',
            allowedCapabilities: [],
            outputSchema: 'markdown',
            modelPolicy: {
              mode: 'fallback_to_active',
              preferredProfileIds: [],
              fallbackToActive: true
            }
          }]
        }))
      } as never,
      {
        saveRun: vi.fn(),
        appendEvent: vi.fn(),
        getRun: vi.fn(() => ({
          id: 'run-ctx-missing',
          kind: 'chat',
          status: 'paused',
          createdAt: '2026-04-15T00:00:00.000Z',
          updatedAt: '2026-04-15T00:00:00.000Z',
          sessionId: 'session-1',
          stage: 'discover',
          roleId: 'role-1',
          diagnostics: [],
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
          outputs: [],
          checkpoints: [{
            id: 'checkpoint-missing-pack',
            summary: 'latest checkpoint',
            createdAt: '',
            turn: 1,
            status: 'completed',
            contextPackId: 'context-missing'
          }],
          resumeContext: {
            system: 'system',
            user: 'user',
            allowedCapabilities: []
          },
          recovery: {
            status: 'recoverable',
            savedAt: '2026-04-15T00:00:00.000Z',
            latestCheckpointId: 'checkpoint-missing-pack',
            approvalIds: [],
            branchGroupIds: []
          }
        })),
        listEventsForRun: vi.fn(() => [])
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        readContextPack: vi.fn(() => null)
      } as never
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);

    await expect(service.resumeRun('E:/project', 'run-ctx-missing', [], '')).rejects.toThrow(/context pack is missing/i);
  });

  it('applies pinned and excluded document controls to context packs and provenance', async () => {
    const saveRun = vi.fn();
    const appendEvent = vi.fn();
    const persistContextPack = vi.fn();
    const persistRunEvidence = vi.fn();
    const briefPath = path.resolve('E:/project/01-requirements/brief.md');
    const rulesPath = path.resolve('E:/project/02-rules/rules.md');
    const ignorePath = path.resolve('E:/project/99-trash/ignore.md');
    const role = {
      id: 'role-1',
      name: 'Role',
      description: '',
      promptHint: 'hint',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };
    const selectedProfile = {
      id: 'profile-1',
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:8b',
      apiKey: '',
      enabled: true,
      createdAt: '',
      updatedAt: '',
      hasApiKey: false,
      apiKeyMasked: '',
      diagnostics: { status: 'unknown' },
      capabilities: {
        tags: ['json-mode'],
        maxContextTokens: 32000,
        privacy: 'local',
        costTier: 'low',
        latencyTier: 'low'
      }
    };
    const fileMap: Record<string, string> = {
      [briefPath]: '# Brief\n\nproject outline and steps',
      [rulesPath]: '# Rules\n\nmust follow house style',
      [ignorePath]: '# Ignore\n\nstale notes'
    };

    const service = new RuntimeService(
      {
        openProject: vi.fn(() => ({ manifest: { templateId: 'template-1' } })),
        loadPlatformAssets: vi.fn(() => ({ template: { id: 'template-1' } })),
        loadSessions: vi.fn(() => [{
          id: 'session-1',
          title: 'Session',
          stage: 'discover',
          contextControls: {
            pinnedDocumentPaths: [rulesPath],
            excludedDocumentPaths: [ignorePath],
            updatedAt: '2026-04-14T00:00:00.000Z'
          },
          messages: [{ id: 'm1', role: 'user', content: 'hello', createdAt: '' }]
        }]),
        listKnowledgeFiles: vi.fn(() => [briefPath, rulesPath, ignorePath]),
        buildNoteReferenceGraph: vi.fn(() => ({
          documents: [
            { path: briefPath, title: 'Brief', outbound: [], inbound: [] },
            { path: rulesPath, title: 'Rules', outbound: [], inbound: [] },
            { path: ignorePath, title: 'Ignore', outbound: [], inbound: [] }
          ]
        })),
        getRelevantDocumentChanges: vi.fn(() => []),
        readFile: vi.fn((targetPath: string) => fileMap[targetPath] ?? ''),
        getDocumentMeta: vi.fn(() => ({ modifiedAt: 1 }))
      } as never,
      {
        saveRun,
        appendEvent,
        ensureProjectRuntime: vi.fn(),
        listEventsForRun: vi.fn(() => [])
      } as never,
      {
        select: vi.fn(() => ({ profile: selectedProfile, reason: 'selected' }))
      } as never,
      {
        generateText: vi.fn().mockResolvedValue({
          content: 'final answer',
          output: { kind: 'final', label: 'output', contentType: 'text', content: 'final answer' }
        })
      } as never,
      {
        execute: vi.fn()
      } as never,
      {} as never,
      {} as never,
      {
        persistContextPack,
        persistRunEvidence,
        persistActionableError: vi.fn()
      } as never
    );

    await (service as any).runRoleLoop({
      rootPath: 'E:/project',
      kind: 'chat',
      sessionId: 'session-1',
      stage: 'discover',
      role,
      profiles: [selectedProfile],
      activeProviderProfileId: 'profile-1',
      system: 'system',
      user: 'rules and brief',
      allowedCapabilities: [],
      contextDocumentPaths: [briefPath, ignorePath],
      provenance: ['unit-test']
    });

    const persistedContextPack = persistContextPack.mock.calls[0]?.[1];
    expect(persistedContextPack?.anchorPaths).toEqual(expect.arrayContaining([briefPath, rulesPath]));
    expect(persistedContextPack?.anchorPaths).not.toContain(ignorePath);
    expect(persistedContextPack?.pinnedDocumentPaths).toEqual([rulesPath]);
    expect(persistedContextPack?.excludedDocumentPaths).toEqual([ignorePath]);
    expect(persistedContextPack?.retrievalHits?.some((hit: any) => hit.path === rulesPath && hit.pinned)).toBe(true);
    expect(persistedContextPack?.retrievalHits?.some((hit: any) => hit.path === ignorePath)).toBe(false);
    expect(persistedContextPack?.provenanceRecords?.some((record: any) => record.kind === 'context-document' && record.sourcePath === rulesPath)).toBe(true);
    expect(persistedContextPack?.provenanceRecords?.some((record: any) => record.sourcePath === ignorePath)).toBe(false);
  });

  it('drops missing and out-of-project context documents before persisting the context pack', async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-runtime-context-'));
    const existingPath = path.join(rootPath, '01-requirements', 'brief.md');
    const missingPath = path.join(rootPath, '03-stage-plans', '01-discovery-stage-execution-plan.md');
    const outsidePath = path.join(path.dirname(rootPath), 'outside-brief.md');
    fs.mkdirSync(path.dirname(existingPath), { recursive: true });
    fs.writeFileSync(existingPath, '# Brief\n\nKeep only real project documents in runtime context.\n', 'utf8');

    const saveRun = vi.fn();
    const appendEvent = vi.fn();
    const persistContextPack = vi.fn();
    const persistRunEvidence = vi.fn();
    const role = {
      id: 'role-1',
      name: 'Role',
      description: '',
      promptHint: 'hint',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };
    const selectedProfile = {
      id: 'profile-1',
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:8b',
      apiKey: '',
      enabled: true,
      createdAt: '',
      updatedAt: '',
      hasApiKey: false,
      apiKeyMasked: '',
      diagnostics: { status: 'unknown' },
      capabilities: {
        tags: ['json-mode'],
        maxContextTokens: 32000,
        privacy: 'local',
        costTier: 'low',
        latencyTier: 'low'
      }
    };

    const service = new RuntimeService(
      {
        openProject: vi.fn(() => ({ manifest: { templateId: 'template-1' } })),
        loadPlatformAssets: vi.fn(() => ({ template: { id: 'template-1' } })),
        loadSessions: vi.fn(() => [{
          id: 'session-1',
          title: 'Session',
          stage: 'discover',
          contextControls: {
            pinnedDocumentPaths: [missingPath, outsidePath],
            excludedDocumentPaths: [],
            updatedAt: '2026-04-21T00:00:00.000Z'
          },
          messages: [{ id: 'm1', role: 'user', content: 'hello', createdAt: '' }]
        }]),
        listKnowledgeFiles: vi.fn(() => [existingPath]),
        buildNoteReferenceGraph: vi.fn(() => ({
          documents: [
            { path: existingPath, title: 'Brief', outbound: [], inbound: [] }
          ]
        })),
        getRelevantDocumentChanges: vi.fn(() => []),
        readFile: vi.fn((targetPath: string) => fs.readFileSync(targetPath, 'utf8')),
        getDocumentMeta: vi.fn(() => ({ modifiedAt: 1 })),
        resolveProjectPath: vi.fn((candidateRoot: string, targetPath: string) => {
          const resolved = path.resolve(targetPath);
          const relative = path.relative(path.resolve(candidateRoot), resolved);
          if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error('路径超出当前工程范围。');
          }
          return resolved;
        })
      } as never,
      {
        saveRun,
        appendEvent,
        ensureProjectRuntime: vi.fn(),
        listEventsForRun: vi.fn(() => [])
      } as never,
      {
        select: vi.fn(() => ({ profile: selectedProfile, reason: 'selected' }))
      } as never,
      {
        generateText: vi.fn().mockResolvedValue({
          content: 'final answer',
          output: { kind: 'final', label: 'output', contentType: 'text', content: 'final answer' }
        })
      } as never,
      {
        execute: vi.fn()
      } as never,
      {} as never,
      {} as never,
      {
        persistContextPack,
        persistRunEvidence,
        persistActionableError: vi.fn()
      } as never
    );

    await (service as any).runRoleLoop({
      rootPath,
      kind: 'chat',
      sessionId: 'session-1',
      stage: 'discover',
      role,
      profiles: [selectedProfile],
      activeProviderProfileId: 'profile-1',
      system: 'system',
      user: 'keep the context safe',
      allowedCapabilities: [],
      contextDocumentPaths: [existingPath, missingPath, outsidePath],
      provenance: ['unit-test']
    });

    const persistedContextPack = persistContextPack.mock.calls[0]?.[1];
    expect(persistedContextPack?.anchorPaths).toEqual([existingPath]);
    expect(persistedContextPack?.pinnedDocumentPaths).toEqual([]);
    expect(persistedContextPack?.provenanceRecords?.some((record: any) => record.kind === 'context-document' && record.sourcePath === existingPath)).toBe(true);
    expect(persistedContextPack?.provenanceRecords?.some((record: any) => record.sourcePath === missingPath || record.sourcePath === outsidePath)).toBe(false);
  });
});
