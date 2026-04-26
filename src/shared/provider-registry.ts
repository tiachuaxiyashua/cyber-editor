import type { ProviderCapabilityMetadata, ProviderDiagnostic, ProviderKind } from './types';

export type ProviderApiKeyMode = 'required' | 'optional';

export type ProviderDefinition = {
  kind: ProviderKind;
  label: string;
  defaultProfileId: string;
  defaultProfileName: string;
  defaultBaseUrl: string;
  defaultModel: string;
  apiKeyMode: ProviderApiKeyMode;
  capabilities: ProviderCapabilityMetadata;
};

const PROVIDER_ORDER: ProviderKind[] = ['mock', 'openai-compatible', 'deepseek', 'ollama'];

const PROVIDER_REGISTRY: Record<ProviderKind, ProviderDefinition> = {
  mock: {
    kind: 'mock',
    label: '模拟服务',
    defaultProfileId: 'profile-mock',
    defaultProfileName: 'Mock',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'mock-chat',
    apiKeyMode: 'optional',
    capabilities: {
      tags: ['structured-output', 'json-mode'],
      maxContextTokens: 32000,
      privacy: 'local',
      costTier: 'low',
      latencyTier: 'low'
    }
  },
  'openai-compatible': {
    kind: 'openai-compatible',
    label: 'OpenAI 兼容',
    defaultProfileId: 'profile-openai-compatible',
    defaultProfileName: 'OpenAI Compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    apiKeyMode: 'required',
    capabilities: {
      tags: ['tools', 'structured-output', 'json-mode', 'streaming', 'long-context'],
      maxContextTokens: 128000,
      privacy: 'cloud',
      costTier: 'high',
      latencyTier: 'medium'
    }
  },
  deepseek: {
    kind: 'deepseek',
    label: 'DeepSeek',
    defaultProfileId: 'profile-deepseek',
    defaultProfileName: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    apiKeyMode: 'required',
    capabilities: {
      tags: ['tools', 'structured-output', 'json-mode', 'streaming', 'long-context'],
      maxContextTokens: 64000,
      privacy: 'cloud',
      costTier: 'medium',
      latencyTier: 'medium'
    }
  },
  ollama: {
    kind: 'ollama',
    label: 'Ollama',
    defaultProfileId: 'profile-ollama',
    defaultProfileName: 'Ollama',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen3:8b',
    apiKeyMode: 'optional',
    capabilities: {
      tags: ['tools', 'structured-output', 'json-mode', 'local-runtime'],
      maxContextTokens: 32768,
      privacy: 'local',
      costTier: 'low',
      latencyTier: 'medium'
    }
  }
};

export function listProviderDefinitions(): ProviderDefinition[] {
  return PROVIDER_ORDER.map((kind) => PROVIDER_REGISTRY[kind]);
}

export function getProviderDefinition(provider?: string | null): ProviderDefinition | null {
  if (!provider) return null;
  return Object.prototype.hasOwnProperty.call(PROVIDER_REGISTRY, provider)
    ? PROVIDER_REGISTRY[provider as ProviderKind]
    : null;
}

export function getProviderLabel(provider?: string | null) {
  return getProviderDefinition(provider)?.label ?? provider ?? '未配置';
}

export function defaultProviderCapabilities(provider: ProviderKind): ProviderCapabilityMetadata {
  const definition = PROVIDER_REGISTRY[provider];
  return {
    ...definition.capabilities,
    tags: [...definition.capabilities.tags]
  };
}

export function defaultProviderDiagnostic(): ProviderDiagnostic {
  return { status: 'unknown' };
}

export function providerAllowsEmptyApiKey(provider: ProviderKind) {
  return PROVIDER_REGISTRY[provider].apiKeyMode !== 'required';
}

export function createProviderSeed(provider: ProviderKind, overrides?: Partial<Pick<ProviderDefinition, 'defaultProfileId' | 'defaultProfileName' | 'defaultBaseUrl' | 'defaultModel'>>) {
  const definition = PROVIDER_REGISTRY[provider];
  return {
    id: overrides?.defaultProfileId ?? definition.defaultProfileId,
    name: overrides?.defaultProfileName ?? definition.defaultProfileName,
    provider,
    baseUrl: overrides?.defaultBaseUrl ?? definition.defaultBaseUrl,
    model: overrides?.defaultModel ?? definition.defaultModel,
    enabled: true,
    capabilities: defaultProviderCapabilities(provider),
    diagnostics: defaultProviderDiagnostic()
  };
}
