import { randomUUID } from 'node:crypto';
import { getStagePrompt } from '../../shared/ai-stage-assets';
import { DEFAULT_MOCK_MARKDOWN_HEADINGS, buildMockSectionBullets, type MockPromptContext } from '../../shared/mock-markdown-assets';
import type { AiRequest, AiResponse, ProviderKind } from '../../shared/types';
import { providerAllowsEmptyApiKey } from '../../shared/provider-registry';

export type ProviderSettings = {
  profileId?: string;
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
const DEEPSEEK_REQUEST_TIMEOUT_MS = 300000;
const OLLAMA_REQUEST_TIMEOUT_MS = 300000;
const MAX_COMPLETE_ATTEMPTS = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractMockDelayMs(input: { system: string; user: string }) {
  const match = `${input.system}\n${input.user}`.match(/\[mock-delay:(\d{1,5})\]/i);
  if (!match) return 0;
  const parsed = Number.parseInt(match[1] ?? '0', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.min(parsed, 10_000);
}

function buildRequestBody(settings: ProviderSettings, input: { system: string; user: string }) {
  const baseBody: Record<string, unknown> = {
    model: settings.model,
    stream: false,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.user }
    ]
  };

  if (settings.provider === 'ollama') {
    return {
      ...baseBody,
      max_tokens: 900,
      reasoning_effort: 'none',
      temperature: 0.2,
      keep_alive: '10m'
    };
  }

  return baseBody;
}

function requiresApiKey(provider: ProviderKind) {
  return !providerAllowsEmptyApiKey(provider);
}

function normalizeBaseUrl(provider: ProviderKind, baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/$/, '');
  const normalized = provider === 'ollama' && !trimmed.endsWith('/v1')
    ? `${trimmed}/v1`
    : trimmed;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('AI provider base URL must be a valid http/https URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('AI provider base URL must use http/https.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('AI provider base URL does not allow embedded credentials.');
  }
  return parsed.toString().replace(/\/$/, '');
}

function requestTimeoutMs(settings: ProviderSettings) {
  switch (settings.provider) {
    case 'deepseek':
      return DEEPSEEK_REQUEST_TIMEOUT_MS;
    case 'ollama':
      return OLLAMA_REQUEST_TIMEOUT_MS;
    default:
      return DEFAULT_REQUEST_TIMEOUT_MS;
  }
}

function buildTimeoutError(timeoutMs: number) {
  return new Error(`AI 请求超时，${timeoutMs / 1000} 秒内未完成。`);
}

function buildHeaders(settings: ProviderSettings) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }
  return headers;
}

function extractRequiredHeadings(system: string) {
  return Array.from(new Set(
    system
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^#{1,6}\s+\S+/.test(line))
  ));
}

function extractTaggedLine(user: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = user.match(new RegExp(`${escaped}：([^\\n]+)`));
  return match?.[1]?.trim() ?? '';
}

function extractSummary(user: string) {
  const marker = '当前会话摘要：';
  const start = user.indexOf(marker);
  if (start < 0) return '';
  const remainder = user.slice(start + marker.length).trim();
  return remainder
    .split(/\n{2,}/)[0]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(' / ');
}

function buildMockPromptContext(user: string): MockPromptContext {
  return {
    productIntent: extractTaggedLine(user, '产品意图'),
    constraints: extractTaggedLine(user, '约束'),
    stageInstructions: extractTaggedLine(user, '阶段补充指令'),
    targetPurpose: extractTaggedLine(user, '工件目标'),
    summary: extractSummary(user)
  };
}

function buildMockIntroParagraphs(context: MockPromptContext) {
  const intent = context.productIntent || context.summary || 'the current project goal';
  const purpose = context.targetPurpose || 'generate a stable artifact that the next stage can continue from directly';
  return [
    `This draft turns "${intent}" into a structured artifact that the next stage can continue from directly.`,
    '当前输入会统一落到模板声明的输入目录、阶段工件路径与导出目录映射中，并显式记录 `input contract`、`output contract`、`evidence path`、`review owner`、责任边界与 `rollback` 入口，保证后续阶段可以直接复用。',
    '执行步骤：1. verify 当前范围与验收口径；2. recover 或 merge 冲突后再写回；3. export 当前结果并保留 evidence、review owner 与 rollback 入口。',
    '当前阶段文档至少要写清用户角色、工件路径、输入输出格式、验收标准、异常恢复和下一步动作，确保人工复核与后续生成都能直接落地。',
    `交付要求：当前文档必须直接服务于“${purpose}”，同时写清 output contract、失败恢复、验证方式和下一步动作，避免只停留在摘要层。`
  ];
}

function buildMockMarkdown(system: string, user: string) {
  const context = buildMockPromptContext(user);
  let headings = extractRequiredHeadings(system);
  if (!headings.length) {
    headings = [...DEFAULT_MOCK_MARKDOWN_HEADINGS];
  }
  if (!headings.some((heading) => /^##\s+/.test(heading))) {
    headings = [headings[0]!, ...DEFAULT_MOCK_MARKDOWN_HEADINGS.slice(1)];
  }

  const lines: string[] = [];
  headings.forEach((heading, index) => {
    lines.push(heading, '');
    if (index === 0) {
      lines.push(...buildMockIntroParagraphs(context), '');
      return;
    }
    for (const bullet of buildMockSectionBullets(heading, context)) {
      lines.push(`- ${bullet}`);
    }
    lines.push('');
  });
  return lines.join('\n').trim();
}
function buildMockReviewIssues() {
  return [
    '- 当前文档仍需明确失败恢复路径、审批拒绝后的清理动作以及对应的证据记录。',
    '- 需要补充写回冲突时的显式 merge 决策说明，避免用户误以为 AI 可以直接覆盖人工修改。',
    '- 需要补充主链路回归入口，证明按钮可见性、运行状态和最终工件落盘是一致的。',
    '- 需要补充下一阶段输入与完成标准，避免当前文档只是描述现状而无法承接后续开发。'
  ].join('\n');
}

function buildMockMermaid() {
  return [
    'flowchart TD',
    '  Start[用户输入目标] --> Draft[生成阶段草稿]',
    '  Draft --> Gate{质量校验通过?}',
    '  Gate -- 否 --> Repair[人工修订或重试]',
    '  Gate -- 是 --> Merge{存在本地修改冲突?}',
    '  Merge -- 是 --> Review[进入 merge 决策]',
    '  Merge -- 否 --> Save[写回工件并记录证据]',
    '  Review --> Save',
    '  Save --> Next[进入下一阶段]'
  ].join('\n');
}

function buildMockUiPreview() {
  return JSON.stringify({
    version: 1,
    theme: 'light',
    layout: {
      type: 'workspace',
      leftRail: ['welcome', 'workbench', 'orchestration', 'resources', 'rules', 'settings'],
      panes: ['sidebar', 'document', 'assistant']
    }
  }, null, 2);
}

function buildMockCompletion(input: { system: string; user: string }) {
  const system = input.system;
  if (/Markdown 列表|输出 Markdown 列表|审查员/.test(system)) {
    return buildMockReviewIssues();
  }
  if (/Mermaid|流程图/.test(system)) {
    return buildMockMermaid();
  }
  if (/UI Preview|ui preview|JSON/.test(system) && /layout|columns|sidebar/i.test(system)) {
    return buildMockUiPreview();
  }
  if (/Markdown|markdown|#\s+/.test(system)) {
    return buildMockMarkdown(system, input.user);
  }
  return [
    '已读取当前输入。',
    `当前目标：${buildMockPromptContext(input.user).productIntent || '继续推进当前工程任务。'}`,
    '下一步建议：先确认边界与验收口径，再执行生成或审查动作。'
  ].join('\n');
}

export class AiService {
  async complete(settings: ProviderSettings, input: { system: string; user: string }) {
    if (settings.provider === 'mock') {
      const delayMs = extractMockDelayMs(input);
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      return buildMockCompletion(input);
    }

    if (requiresApiKey(settings.provider) && !settings.apiKey) {
      throw new Error('当前模型配置缺少 API Key。');
    }

    const baseUrl = normalizeBaseUrl(settings.provider, settings.baseUrl);
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_COMPLETE_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeoutMs = requestTimeoutMs(settings);
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: buildHeaders(settings),
          body: JSON.stringify(buildRequestBody(settings, input)),
          signal: controller.signal
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`AI 请求失败：${response.status} ${response.statusText}\n${errorText}`);
          if (attempt < MAX_COMPLETE_ATTEMPTS && (response.status >= 500 || response.status === 429)) {
            lastError = error;
            await sleep(600 * attempt);
            continue;
          }
          throw error;
        }

        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        return payload.choices?.[0]?.message?.content ?? '未收到有效回复。';
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        const retryable =
          normalized.name === 'AbortError'
          || /fetch failed/i.test(normalized.message)
          || /ECONNRESET/i.test(normalized.message)
          || /forcibly closed/i.test(normalized.message)
          || /api_error/i.test(normalized.message);
        if (attempt < MAX_COMPLETE_ATTEMPTS && retryable) {
          lastError = normalized.name === 'AbortError'
            ? buildTimeoutError(timeoutMs)
            : normalized;
          await sleep(600 * attempt);
          continue;
        }
        if (normalized.name === 'AbortError') {
          throw buildTimeoutError(timeoutMs);
        }
        throw normalized;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? new Error('AI 请求失败，已达到最大重试次数。');
  }

  async testConnection(settings: ProviderSettings) {
    if (settings.provider === 'mock') {
      return { ok: true, message: '当前服务可用。', latencyMs: 0 };
    }
    if (requiresApiKey(settings.provider) && !settings.apiKey) {
      throw new Error('当前模型配置缺少 API Key。');
    }

    const baseUrl = normalizeBaseUrl(settings.provider, settings.baseUrl);
    const startedAt = Date.now();
    const timeoutMs = requestTimeoutMs(settings);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : undefined,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`AI 连接失败：${response.status} ${response.statusText}`);
    }
    return { ok: true, message: '连接成功。', latencyMs: Date.now() - startedAt };
    } catch (error) {
      if ((error as { name?: string } | undefined)?.name === 'AbortError') {
        throw new Error(`AI connection check timed out after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async sendMessage(settings: ProviderSettings, request: AiRequest): Promise<AiResponse> {
    if (settings.provider === 'mock') {
      return {
        message: {
          id: randomUUID(),
          role: 'assistant',
          content: [
            `当前阶段：${request.stage}`,
            '这是一个本地 mock 响应，用于验证会话、上下文和测试入口。',
            `你的输入是：${request.content}`,
            request.contextDocuments.length
              ? `已附带文档：${request.contextDocuments.join(', ')}`
              : '本轮未附带文档。'
          ].join('\n'),
          createdAt: new Date().toISOString()
        },
        diagnostics: ['mock-provider']
      };
    }

    return {
      message: {
        id: randomUUID(),
        role: 'assistant',
        content: await this.complete(settings, {
          system: `${getStagePrompt(request.stage)}\n当前引用文档：${request.contextDocuments.join(', ') || '无'}`,
          user: request.content
        }),
        createdAt: new Date().toISOString()
      }
    };
  }
}
