import path from 'node:path';
import { EvidenceStoreService } from './evidence-store-service';
import { assertPublicHttpUrl } from './network-target-guard';
import { PlatformService } from './platform-service';
import { ProjectService } from './project-service';
import { SideEffectGovernanceService } from './side-effect-governance-service';
import type {
  ActionableErrorRecord,
  ArtifactSchemaAsset,
  CapabilityExecutionEvidence,
  CapabilityExecutionFailureClass,
  CapabilityExecutionLog,
  RuntimeCapabilityDefinition,
  RuntimeErrorCode,
  RuntimeEvent
} from '../../shared/types';
import { validateArtifact } from '../../shared/artifact-validators';
import { RuntimeError, retryWithBackoff } from './runtime-errors';

type CapabilityContext = {
  runId: string;
  emit: (event: Omit<RuntimeEvent, 'id' | 'createdAt' | 'runId'>) => void;
  approvalId?: string;
};

type CapabilityHookPhase = 'before' | 'after';

type CapabilityResultEnvelope = Record<string, unknown> & {
  __capabilityEvidence?: CapabilityExecutionEvidence;
};

type CapabilityExecutionResult = Record<string, unknown>;

const REVIEW_ARTIFACT_MIN_QUALITY_SCORE = 72;

class CapabilityExecutionRuntimeError extends RuntimeError {
  constructor(
    message: string,
    code: RuntimeErrorCode,
    public readonly evidence: CapabilityExecutionEvidence
  ) {
    super(message, code);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function makeRecordId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function appendCapabilityLog(
  logs: CapabilityExecutionLog[],
  phase: CapabilityExecutionLog['phase'],
  level: CapabilityExecutionLog['level'],
  message: string,
  metadata?: CapabilityExecutionLog['metadata']
) {
  const entry: CapabilityExecutionLog = {
    id: makeRecordId('cap-log'),
    createdAt: nowIso(),
    phase,
    level,
    message,
    metadata
  };
  logs.push(entry);
  return entry;
}

function sanitizeRequestedLimit(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

function buildBrowserFailure(
  message: string,
  fallbackCode: RuntimeErrorCode
): NonNullable<CapabilityExecutionEvidence['failure']> {
  const normalized = message.toLowerCase();
  let classification: CapabilityExecutionFailureClass = 'navigation_error';
  let code: RuntimeErrorCode = fallbackCode;
  let hint = 'Check that the public URL loads without auth and returns stable HTML for extraction.';
  let retryable = fallbackCode === 'network_error' || fallbackCode === 'rate_limit';

  if (normalized.includes('unavailable')) {
    classification = 'browser_unavailable';
    code = 'capability_error';
    hint = 'Install Playwright browsers and confirm Chromium can be launched in this environment.';
    retryable = false;
  } else if (normalized.includes('timeout') || normalized.includes('timed out')) {
    classification = normalized.includes('selector') ? 'selector_timeout' : 'navigation_timeout';
    code = 'network_error';
    hint = normalized.includes('selector')
      ? 'The selector did not resolve in time. Narrow the selector or allow body fallback.'
      : 'The page load hit the timeout. Increase timeoutMs or target a lighter public page.';
    retryable = true;
  } else if (normalized.includes('selector')) {
    classification = 'selector_timeout';
    code = 'network_error';
    hint = 'The selector could not be resolved. Verify the selector or use a broader container.';
    retryable = true;
  } else if (normalized.includes('extract') || normalized.includes('textcontent')) {
    classification = 'extraction_failed';
    code = 'network_error';
    hint = 'The page loaded but text extraction failed. Try a different selector or verify the page is not empty.';
    retryable = true;
  }

  return {
    classification,
    code,
    message,
    hint,
    retryable
  };
}

function isCapabilityExecutionRuntimeError(error: unknown): error is CapabilityExecutionRuntimeError {
  return error instanceof CapabilityExecutionRuntimeError;
}

function isCapabilityResultEnvelope(value: unknown): value is CapabilityResultEnvelope {
  return !!value && typeof value === 'object';
}

const capabilityAliases: Record<string, string> = {
  read_artifact: 'builtin:read_artifact',
  write_artifact: 'builtin:write_artifact',
  review_artifact: 'builtin:review_artifact',
  list_documents: 'builtin:list_documents',
  search_project: 'builtin:search_project',
  load_skills: 'builtin:load_skills',
  browse_web: 'network:headless_browser',
  research_web: 'network:headless_browser',
  headless_browser: 'network:headless_browser'
};

export class CapabilityRuntime {
  private readonly evidenceStore: EvidenceStoreService;
  private readonly sideEffectGovernance: SideEffectGovernanceService;

  constructor(
    private readonly projectService: ProjectService,
    private readonly platformService: PlatformService,
    evidenceStore?: EvidenceStoreService,
    sideEffectGovernance?: SideEffectGovernanceService
  ) {
    this.evidenceStore = evidenceStore ?? new EvidenceStoreService();
    this.sideEffectGovernance = sideEffectGovernance ?? new SideEffectGovernanceService(projectService, this.evidenceStore);
  }

  private resolveArtifactInputPath(input: Record<string, unknown>) {
    if (typeof input.path === 'string' && input.path.trim()) {
      return input.path.trim();
    }
    if (typeof input.artifactPath === 'string' && input.artifactPath.trim()) {
      return input.artifactPath.trim();
    }
    return '';
  }

  private buildReviewArtifactSchema(targetPath: string, requestedSchemaId?: unknown): ArtifactSchemaAsset {
    const schemaId = typeof requestedSchemaId === 'string' && requestedSchemaId.trim()
      ? requestedSchemaId.trim()
      : '';
    if (schemaId === 'workflow-review') {
      return {
        id: schemaId,
        title: 'Workflow review',
        kind: 'review-issues',
        qualityTier: 'assistive',
        minimumQualityScore: REVIEW_ARTIFACT_MIN_QUALITY_SCORE
      };
    }
    if (schemaId === 'delivery-summary') {
      return {
        id: schemaId,
        title: 'Delivery summary',
        kind: 'markdown',
        requiredHeadings: ['#', '##'],
        qualityTier: 'assistive',
        minimumQualityScore: REVIEW_ARTIFACT_MIN_QUALITY_SCORE
      };
    }
    if (schemaId === 'markdown-basic') {
      return {
        id: schemaId,
        title: 'Markdown artifact',
        kind: 'markdown',
        requiredHeadings: ['#'],
        qualityTier: 'assistive',
        minimumQualityScore: REVIEW_ARTIFACT_MIN_QUALITY_SCORE
      };
    }

    const extension = path.extname(targetPath).toLowerCase();
    if (!extension || extension === '.md' || extension === '.markdown') {
      return {
        id: 'markdown-basic',
        title: 'Markdown artifact',
        kind: 'markdown',
        requiredHeadings: ['#'],
        qualityTier: 'assistive',
        minimumQualityScore: REVIEW_ARTIFACT_MIN_QUALITY_SCORE
      };
    }

    return {
      id: schemaId || 'text-basic',
      title: 'Text artifact',
      kind: 'text',
      minimumLength: 80,
      qualityTier: 'assistive',
      minimumQualityScore: REVIEW_ARTIFACT_MIN_QUALITY_SCORE
    };
  }

  listCapabilities(rootPath: string): RuntimeCapabilityDefinition[] {
    const assets = this.platformService.loadAssets(rootPath);
    const builtins: RuntimeCapabilityDefinition[] = [
      { id: 'builtin:review_artifact', name: 'Review artifact', description: 'Read a project artifact and return a structured review summary.', kind: 'builtin', enabled: true, inputSchema: 'artifactPath+reviewCriteria', outputSchema: 'json' },
      { id: 'builtin:read_artifact', name: '读取工件', description: '读取工程内文本工件。', kind: 'builtin', enabled: true, inputSchema: 'path', outputSchema: 'text' },
      { id: 'builtin:write_artifact', name: '写入工件', description: '写入工程内文本工件。', kind: 'builtin', enabled: true, inputSchema: 'path+content', outputSchema: 'text' },
      { id: 'builtin:list_documents', name: '列出文档', description: '列出工程内 Markdown 文档。', kind: 'builtin', enabled: true, outputSchema: 'text' },
      { id: 'builtin:search_project', name: '工程搜索', description: '在工程内执行全文搜索。', kind: 'builtin', enabled: true, inputSchema: 'query', outputSchema: 'json' },
      { id: 'builtin:load_skills', name: '读取技能指令', description: '读取当前启用技能的说明。', kind: 'builtin', enabled: true, inputSchema: 'skillIds', outputSchema: 'text' },
      { id: 'network:validate_url', name: '联网验证', description: '对目标 URL 执行 GET 验证。', kind: 'network', enabled: true, inputSchema: 'url', outputSchema: 'json' },
      { id: 'network:headless_browser', name: '无头浏览器', description: '用无头浏览器读取公开网页的标题、正文摘要与链接。', kind: 'network', enabled: true, inputSchema: 'url+selector', outputSchema: 'json' }
    ];

    const connectorCapabilities = assets.connectors.map((connector) => ({
      id: `connector:${connector.id}`,
      name: connector.name,
      description: connector.description || '连接能力',
      kind: 'mcp' as const,
      enabled: connector.enabled,
      sourceId: connector.id,
      inputSchema: connector.transport === 'http' ? 'url' : 'command',
      outputSchema: 'json'
    }));

    const scriptCapabilities = assets.tools.map((tool) => ({
      id: `script:${tool.id}`,
      name: tool.name,
      description: tool.description || '受控脚本能力',
      kind: 'script' as const,
      enabled: tool.enabled,
      sourceId: tool.id,
      inputSchema: 'tool-args',
      outputSchema: 'text'
    }));

    return [...builtins, ...connectorCapabilities, ...scriptCapabilities];
  }

  async execute(rootPath: string, capabilityId: string, input: Record<string, unknown>, context: CapabilityContext) {
    const normalizedCapabilityId = capabilityAliases[capabilityId] ?? capabilityId;
    const definition = this.listCapabilities(rootPath).find((item) => item.id === normalizedCapabilityId) ?? null;
    if (!definition) {
      throw new RuntimeError(`未知能力：${capabilityId}`, 'capability_error');
    }
    if (!definition.enabled) {
      throw new RuntimeError(`能力已禁用：${definition.name}`, 'permission_error');
    }

    await this.runHook('before', definition, input, context);

    try {
      await this.assertPermission(rootPath, definition, input);
      const preview = this.sideEffectGovernance.resolveExecutionPreview(rootPath, definition.id, input, context.approvalId, context.runId);
      if (preview) {
        try {
          this.sideEffectGovernance.assertExecutionAllowed(rootPath, preview, context.approvalId);
          if (typeof this.projectService.appendAudit === 'function') {
            this.projectService.appendAudit(rootPath, {
              id: `${Date.now()}-${definition.id}`,
              createdAt: new Date().toISOString(),
              type: 'side-effect.preview.accepted',
              message: preview.summary,
              metadata: {
                capabilityId: definition.id,
                previewId: preview.id,
                approvalId: context.approvalId ?? null
              }
            });
          }
        } catch (error) {
          const actionableError = error && typeof error === 'object' && 'scope' in error && 'message' in error
            ? error as ActionableErrorRecord
            : this.sideEffectGovernance.createExecutionError(
              preview,
              'SIDE_EFFECT_EXECUTION_BLOCKED',
              error instanceof Error ? error.message : 'Side effect blocked.'
            );
          this.evidenceStore.persistActionableError(rootPath, actionableError);
          if (typeof this.projectService.appendAudit === 'function') {
            this.projectService.appendAudit(rootPath, {
              id: `${Date.now()}-${definition.id}-blocked`,
              createdAt: new Date().toISOString(),
              type: 'side-effect.blocked',
              message: actionableError.message,
              metadata: {
                capabilityId: definition.id,
                previewId: preview.id,
                actionableErrorId: actionableError.id
              }
            });
          }
          throw new RuntimeError(actionableError.message, 'permission_error');
        }
      }
      context.emit({ type: 'tool.requested', message: `调用能力 ${capabilityId}`, metadata: { capabilityId } });
      const rawResult = await retryWithBackoff(
        async () => this.executeDefinition(rootPath, definition, input),
        3,
        300,
        (error) => {
          if (error instanceof RuntimeError) {
            return error.code === 'network_error' || error.code === 'rate_limit';
          }
          return false;
        },
        (error, attempt) => {
          context.emit({
            type: 'tool.retry',
            message: error instanceof Error ? error.message : '能力调用重试',
            metadata: { capabilityId, attempt }
          });
        }
      );

      let result = rawResult;
      let capabilityEvidence: CapabilityExecutionEvidence | undefined;
      if (isCapabilityResultEnvelope(rawResult) && rawResult.__capabilityEvidence) {
        capabilityEvidence = rawResult.__capabilityEvidence;
        capabilityEvidence.runId = capabilityEvidence.runId ?? context.runId;
        this.evidenceStore.persistCapabilityExecution(rootPath, capabilityEvidence);
        const { __capabilityEvidence, ...publicResult } = rawResult;
        result = publicResult;
      }

      await this.runHook('after', definition, input, context, result);
      context.emit({
        type: 'tool.completed',
        message: `能力 ${capabilityId} 调用完成`,
        metadata: { capabilityId, evidenceId: capabilityEvidence?.id ?? null }
      });
      return result;
    } catch (error) {
      let runtimeError = error instanceof RuntimeError
        ? error
        : new RuntimeError(error instanceof Error ? error.message : '能力执行失败。', 'capability_error');
      let evidenceId: string | null = null;

      if (isCapabilityExecutionRuntimeError(error)) {
        error.evidence.runId = error.evidence.runId ?? context.runId;
        this.evidenceStore.persistCapabilityExecution(rootPath, error.evidence);
        evidenceId = error.evidence.id;
        runtimeError = new RuntimeError(error.message, error.code);

        if (error.evidence.failure) {
          const actionableError: ActionableErrorRecord = {
            id: makeRecordId('capability-error'),
            createdAt: nowIso(),
            scope: 'runtime',
            code: `capability.${definition.id}.${error.evidence.failure.classification}`,
            severity: error.evidence.failure.retryable ? 'warning' : 'error',
            message: error.evidence.failure.message,
            runId: context.runId,
            targetId: definition.id,
            retryable: error.evidence.failure.retryable,
            recoverable: true,
            suggestedActions: [error.evidence.failure.hint]
          };
          this.evidenceStore.persistActionableError(rootPath, actionableError);
        }
      }

      context.emit({
        type: runtimeError.code === 'permission_error' ? 'permission.blocked' : 'tool.failed',
        message: runtimeError.message,
        metadata: { capabilityId, errorCode: runtimeError.code, evidenceId }
      });
      throw runtimeError;
    }
  }

  private async runHook(
    phase: CapabilityHookPhase,
    definition: RuntimeCapabilityDefinition,
    input: Record<string, unknown>,
    context: CapabilityContext,
    result?: unknown
  ) {
    context.emit({
      type: phase === 'before' ? 'hook.before' : 'hook.after',
      message: phase === 'before' ? `准备执行 ${definition.name}` : `完成钩子 ${definition.name}`,
      metadata: {
        capabilityId: definition.id,
        phase,
        hasResult: result ? true : false,
        hasInput: Object.keys(input).length > 0
      }
    });
  }

  private async assertPermission(rootPath: string, definition: RuntimeCapabilityDefinition, input: Record<string, unknown>) {
    if (
      definition.id === 'builtin:read_artifact'
      || definition.id === 'builtin:write_artifact'
      || definition.id === 'builtin:review_artifact'
    ) {
      const targetPath = definition.id === 'builtin:review_artifact'
        ? this.resolveArtifactInputPath(input)
        : String(input.path ?? '');
      if (!targetPath) {
        throw new RuntimeError('能力缺少 path。', 'validation_error');
      }
      const resolved = this.projectService.resolveProjectPath(rootPath, targetPath);
      const runtimeRoot = path.join(rootPath, '.project');
      if (resolved.startsWith(runtimeRoot)) {
        throw new RuntimeError('禁止直接读写 .project 内部运行时目录。', 'permission_error');
      }
    }

    if (definition.id === 'network:validate_url') {
      await assertPublicHttpUrl(String(input.url ?? ''), 'Network validation');
    }

    if (definition.id === 'network:headless_browser') {
      await assertPublicHttpUrl(String(input.url ?? ''), 'Headless browser');
    }
  }

  private async executeDefinition(
    rootPath: string,
    definition: RuntimeCapabilityDefinition,
    input: Record<string, unknown>
  ): Promise<CapabilityExecutionResult> {
    if (definition.id === 'builtin:read_artifact') {
      const targetPath = String(input.path ?? '');
      if (!targetPath) throw new RuntimeError('读取工件缺少 path。', 'validation_error');
      const resolved = this.projectService.resolveProjectPath(rootPath, targetPath);
      return { path: resolved, content: this.projectService.readFile(resolved) };
    }

    if (definition.id === 'builtin:review_artifact') {
      const targetPath = this.resolveArtifactInputPath(input);
      if (!targetPath) throw new RuntimeError('Review artifact missing artifactPath.', 'validation_error');
      const resolved = this.projectService.resolveProjectPath(rootPath, targetPath);
      const content = this.projectService.readFile(resolved);
      const schema = this.buildReviewArtifactSchema(resolved, input.schemaId);
      const validation = validateArtifact(content, schema, {
        minimumQualityScore: schema.minimumQualityScore ?? REVIEW_ARTIFACT_MIN_QUALITY_SCORE
      });
      const reviewCriteria = Array.isArray(input.reviewCriteria)
        ? input.reviewCriteria.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
      const summary = validation.message
        ?? validation.qualityReasons[0]
        ?? (validation.ok ? 'Artifact review passed.' : 'Artifact review requires follow-up.');
      return {
        path: resolved,
        schemaId: schema.id,
        reviewFocus: typeof input.reviewFocus === 'string' ? input.reviewFocus : '',
        reviewCriteria,
        structuralOk: validation.structuralOk,
        qualityVerdict: validation.qualityVerdict,
        qualityScore: validation.qualityScore,
        summary,
        issues: validation.issues ?? [],
        repairHints: validation.repairHints ?? [],
        contentPreview: content.slice(0, 1200)
      };
    }

    if (definition.id === 'builtin:write_artifact') {
      const targetPath = String(input.path ?? '');
      const content = String(input.content ?? '');
      if (!targetPath) throw new RuntimeError('写入工件缺少 path。', 'validation_error');
      const resolved = this.projectService.resolveProjectPath(rootPath, targetPath);
      this.projectService.saveFile(resolved, content);
      return { path: resolved, ok: true };
    }

    if (definition.id === 'builtin:list_documents') {
      return { documents: this.projectService.listMarkdownFiles(rootPath) };
    }

    if (definition.id === 'builtin:search_project') {
      return { results: this.projectService.searchProjectContent(rootPath, String(input.query ?? '')) };
    }

    if (definition.id === 'builtin:load_skills') {
      return { requestedSkillIds: Array.isArray(input.skillIds) ? input.skillIds : [] };
    }

    if (definition.id === 'network:validate_url') {
      const url = (await assertPublicHttpUrl(String(input.url ?? ''), 'Network validation')).toString();
      let response: Response;
      try {
        response = await fetch(url, { method: 'GET' });
      } catch (error) {
        throw new RuntimeError(error instanceof Error ? error.message : '联网验证失败。', 'network_error');
      }
      return { ok: response.ok, status: response.status, statusText: response.statusText, url };
    }

    if (definition.id === 'network:headless_browser') {
      const targetUrl = (await assertPublicHttpUrl(String(input.url ?? ''), 'Headless browser')).toString();
      const selector = typeof input.selector === 'string' && input.selector.trim()
        ? input.selector.trim()
        : 'body';
      const requestedMaxLength = Number.isFinite(Number(input.maxTextLength ?? 4000))
        ? Math.trunc(Number(input.maxTextLength ?? 4000))
        : 4000;
      const maxTextLength = sanitizeRequestedLimit(input.maxTextLength, 4000, 500, 12000);
      const requestedTimeoutMs = Number.isFinite(Number(input.timeoutMs ?? 15000))
        ? Math.trunc(Number(input.timeoutMs ?? 15000))
        : 15000;
      const timeoutMs = sanitizeRequestedLimit(input.timeoutMs, 15000, 5000, 30000);
      const logs: CapabilityExecutionLog[] = [];
      appendCapabilityLog(logs, 'validate-input', 'info', `Validated public target ${targetUrl}`, {
        selector,
        timeoutMs,
        maxTextLength
      });

      let chromium: { launch: (options: { headless: boolean }) => Promise<any> };
      try {
        const playwrightModule = 'playwright';
        const playwright = await import(/* @vite-ignore */ playwrightModule);
        chromium = playwright.chromium;
      } catch (error) {
        const message = error instanceof Error
          ? `Headless browser is unavailable: ${error.message}`
          : 'Headless browser is unavailable.';
        appendCapabilityLog(logs, 'launch-browser', 'error', message);
        throw new CapabilityExecutionRuntimeError(
          message,
          'capability_error',
          {
            id: makeRecordId('capability-execution'),
            createdAt: nowIso(),
            runId: undefined,
            capabilityId: definition.id,
            status: 'failed',
            targetId: targetUrl,
            timeout: {
              requestedMs: requestedTimeoutMs,
              appliedMs: timeoutMs
            },
            selector: {
              requestedSelector: selector,
              usedSelector: selector,
              usedFallback: false
            },
            truncation: {
              requestedMaxLength,
              appliedMaxLength: maxTextLength,
              sourceTextLength: 0,
              returnedTextLength: 0,
              truncated: false
            },
            failure: buildBrowserFailure(message, 'capability_error'),
            logs
          }
        );
      }

      appendCapabilityLog(logs, 'launch-browser', 'info', 'Chromium launcher resolved for headless execution.');
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        appendCapabilityLog(logs, 'navigate', 'info', `Navigating to ${targetUrl}`, {
          timeoutMs
        });
        const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        const title = await page.title();
        let usedSelector = selector;
        let usedFallback = false;
        let bodyText = '';
        try {
          bodyText = String(await page.locator(selector).first().textContent({ timeout: 3000 }) ?? '');
        } catch (error) {
          usedSelector = 'body';
          usedFallback = selector !== 'body';
          appendCapabilityLog(logs, 'extract', 'warning', `Primary selector "${selector}" failed, falling back to body extraction.`, {
            requestedSelector: selector
          });
          bodyText = String(await page.locator('body').first().textContent({ timeout: 3000 }) ?? '');
        }
        const normalizedText = String(bodyText ?? '').replace(/\s+/g, ' ').trim();
        const text = normalizedText.slice(0, maxTextLength);
        const links = await page.$$eval('a[href]', (nodes: Element[]) => nodes
          .map((node) => ({
            href: (node as HTMLAnchorElement).href,
            text: (node.textContent ?? '').replace(/\s+/g, ' ').trim()
          }))
          .filter((item: { href: string; text: string }) => item.href)
          .slice(0, 20));

        appendCapabilityLog(logs, 'navigate', 'info', `Loaded ${page.url()}`, {
          status: response?.status() ?? null
        });
        appendCapabilityLog(logs, 'extract', 'info', `Extracted text with selector ${usedSelector}`, {
          requestedSelector: selector,
          usedFallback,
          sourceTextLength: normalizedText.length
        });

        const evidence: CapabilityExecutionEvidence = {
          id: makeRecordId('capability-execution'),
          createdAt: nowIso(),
          runId: undefined,
          capabilityId: definition.id,
          status: 'completed',
          targetId: page.url(),
          timeout: {
            requestedMs: requestedTimeoutMs,
            appliedMs: timeoutMs
          },
          selector: {
            requestedSelector: selector,
            usedSelector,
            usedFallback
          },
          truncation: {
            requestedMaxLength,
            appliedMaxLength: maxTextLength,
            sourceTextLength: normalizedText.length,
            returnedTextLength: text.length,
            truncated: normalizedText.length > text.length
          },
          response: {
            ok: response?.ok() ?? false,
            status: response?.status() ?? null,
            statusText: response?.statusText() ?? '',
            finalUrl: page.url(),
            title,
            linkCount: links.length
          },
          logs
        };

        appendCapabilityLog(logs, 'summarize', 'info', 'Prepared structured headless-browser result.', {
          truncated: evidence.truncation.truncated,
          linkCount: links.length
        });
        appendCapabilityLog(logs, 'persist', 'info', `Prepared capability execution evidence ${evidence.id}.`);

        return {
          ok: response?.ok() ?? false,
          status: response?.status() ?? null,
          statusText: response?.statusText() ?? '',
          url: page.url(),
          title,
          selector: usedSelector,
          text,
          truncated: normalizedText.length > text.length,
          links,
          evidenceId: evidence.id,
          timeout: evidence.timeout,
          selectorResolution: evidence.selector,
          truncation: evidence.truncation,
          logs,
          __capabilityEvidence: evidence
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Headless browser execution failed.';
        const failure = buildBrowserFailure(message, 'network_error');
        appendCapabilityLog(logs, 'navigate', 'error', message);
        throw new CapabilityExecutionRuntimeError(
          message,
          failure.code,
          {
            id: makeRecordId('capability-execution'),
            createdAt: nowIso(),
            runId: undefined,
            capabilityId: definition.id,
            status: 'failed',
            targetId: targetUrl,
            timeout: {
              requestedMs: requestedTimeoutMs,
              appliedMs: timeoutMs
            },
            selector: {
              requestedSelector: selector,
              usedSelector: selector,
              usedFallback: false
            },
            truncation: {
              requestedMaxLength,
              appliedMaxLength: maxTextLength,
              sourceTextLength: 0,
              returnedTextLength: 0,
              truncated: false
            },
            failure,
            logs
          }
        );
      } finally {
        await browser.close();
      }
    }

    if (definition.id.startsWith('script:')) {
      const toolId = definition.id.replace('script:', '');
      const payload = await this.platformService.runTool(rootPath, toolId);
      return payload.result;
    }

    if (definition.id.startsWith('connector:')) {
      const connectorId = definition.id.replace('connector:', '');
      const payload = await this.platformService.testConnector(rootPath, connectorId);
      return payload;
    }

    throw new RuntimeError(`未知能力：${definition.id}`, 'capability_error');
  }
}
