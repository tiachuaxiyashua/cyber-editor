import { describe, expect, it } from 'vitest';
import type { AppSettings } from '../../src/shared/types.js';
import { resolveModelPolicyPreview } from '../../src/renderer/lib/model-policy.js';

describe('resolveModelPolicyPreview', () => {
  const settings: Pick<AppSettings, 'providerProfiles' | 'activeProviderProfileId'> = {
    activeProviderProfileId: 'active',
    providerProfiles: [
      {
        id: 'active',
        name: 'Active',
        provider: 'mock' as const,
        baseUrl: '',
        model: 'mock-chat',
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
        id: 'preferred',
        name: 'Preferred',
        provider: 'deepseek' as const,
        baseUrl: '',
        model: 'deepseek-chat',
        hasApiKey: true,
        apiKeyMasked: '••••1234',
        enabled: true,
        createdAt: '',
        updatedAt: '',
        capabilities: {
          tags: ['tools', 'json-mode', 'structured-output', 'long-context'],
          maxContextTokens: 64000,
          privacy: 'cloud',
          costTier: 'medium',
          latencyTier: 'medium'
        },
        diagnostics: { status: 'unknown' }
      }
    ]
  };

  it('uses preferred profile when available', () => {
    const preview = resolveModelPolicyPreview({
      id: 'role',
      name: '角色',
      description: '',
      promptHint: '',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'prefer_list',
        preferredProfileIds: ['preferred'],
        fallbackToActive: true
      }
    }, settings);

    expect(preview.profile?.id).toBe('preferred');
    expect(preview.reason).toContain('Preferred');
  });

  it('falls back to active profile when preferred profiles do not exist', () => {
    const preview = resolveModelPolicyPreview({
      id: 'role',
      name: '角色',
      description: '',
      promptHint: '',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: ['missing'],
        fallbackToActive: true
      }
    }, settings);

    expect(preview.profile?.id).toBe('active');
  });
});
