import { describe, expect, it } from 'vitest';
import { ModelRouter, type RoutableProviderProfile } from '../../src/main/services/model-router.js';

const profiles: RoutableProviderProfile[] = [
  {
    id: 'mock',
    name: 'Mock',
    provider: 'mock',
    baseUrl: '',
    model: 'mock-chat',
    apiKey: '',
    hasApiKey: false,
    apiKeyMasked: '',
    enabled: true,
    createdAt: '',
    updatedAt: '',
    capabilities: {
      tags: ['json-mode', 'structured-output'],
      maxContextTokens: 32000,
      privacy: 'local',
      costTier: 'low',
      latencyTier: 'low'
    },
    diagnostics: { status: 'unknown' }
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'deepseek',
    baseUrl: '',
    model: 'deepseek-chat',
    apiKey: 'secret',
    hasApiKey: true,
    apiKeyMasked: '••••1234',
    enabled: true,
    createdAt: '',
    updatedAt: '',
    capabilities: {
      tags: ['tools', 'json-mode', 'structured-output', 'streaming', 'long-context'],
      maxContextTokens: 64000,
      privacy: 'cloud',
      costTier: 'medium',
      latencyTier: 'medium'
    },
    diagnostics: { status: 'unknown' }
  },
  {
    id: 'ollama',
    name: 'Ollama',
    provider: 'ollama',
    baseUrl: '',
    model: 'qwen3:8b',
    apiKey: '',
    hasApiKey: false,
    apiKeyMasked: '',
    enabled: true,
    createdAt: '',
    updatedAt: '',
    capabilities: {
      tags: ['tools', 'json-mode', 'structured-output', 'local-runtime'],
      maxContextTokens: 32768,
      privacy: 'local',
      costTier: 'low',
      latencyTier: 'medium'
    },
    diagnostics: { status: 'unknown' }
  }
];

describe('ModelRouter', () => {
  const router = new ModelRouter();

  it('selects a fixed profile when present', () => {
    const result = router.select({
      mode: 'fixed',
      fixedProfileId: 'deepseek',
      preferredProfileIds: [],
      fallbackToActive: true
    }, profiles, 'mock');

    expect(result.profile?.id).toBe('deepseek');
  });

  it('matches required capabilities', () => {
    const result = router.select({
      mode: 'capability_match',
      preferredProfileIds: [],
      fallbackToActive: false,
      requiredProviderCapabilities: ['local-runtime', 'tools']
    }, profiles, 'mock');

    expect(result.profile?.id).toBe('ollama');
  });

  it('uses policy router preferences', () => {
    const result = router.select({
      mode: 'policy_router',
      preferredProfileIds: [],
      fallbackToActive: true,
      requiredProviderCapabilities: ['structured-output'],
      privacyPreference: 'local',
      costPreference: 'low',
      latencyPreference: 'low'
    }, profiles, 'deepseek');

    expect(result.profile?.id).toBe('mock');
  });
});
