import { describe, expect, it } from 'vitest';
import type { AppSettings } from '../../src/shared/types.js';
import {
  createProviderSeed,
  getProviderLabel,
  listProviderDefinitions,
  providerAllowsEmptyApiKey
} from '../../src/shared/provider-registry.js';
import {
  createProviderProfileDraftSeed,
  toProviderProfileDrafts,
  toProviderProfileInputs
} from '../../src/renderer/lib/provider-profile-drafts.js';

describe('provider registry integration', () => {
  it('creates new provider drafts from the shared registry defaults', () => {
    const registrySeed = createProviderSeed('mock');
    const draftSeed = createProviderProfileDraftSeed('profile-local');

    expect(draftSeed.id).toBe('profile-local');
    expect(draftSeed.name).toBe('新配置');
    expect(draftSeed.provider).toBe(registrySeed.provider);
    expect(draftSeed.baseUrl).toBe(registrySeed.baseUrl);
    expect(draftSeed.model).toBe(registrySeed.model);
    expect(draftSeed.capabilities).toEqual(registrySeed.capabilities);
    expect(draftSeed.diagnostics).toEqual(registrySeed.diagnostics);
    expect(draftSeed.apiKey).toBe('');
  });

  it('keeps provider labels and api-key policy in one registry', () => {
    for (const definition of listProviderDefinitions()) {
      expect(getProviderLabel(definition.kind)).toBe(definition.label);
      expect(providerAllowsEmptyApiKey(definition.kind)).toBe(definition.apiKeyMode !== 'required');
    }
  });

  it('round-trips settings profiles through renderer drafts without duplicating defaults', () => {
    const deepseekSeed = createProviderSeed('deepseek');
    const settings = {
      providerProfiles: [
        {
          ...deepseekSeed,
          hasApiKey: true,
          apiKeyMasked: '***1234',
          createdAt: '2026-04-17T00:00:00.000Z',
          updatedAt: '2026-04-17T00:00:00.000Z'
        }
      ]
    } satisfies Pick<AppSettings, 'providerProfiles'>;

    const drafts = toProviderProfileDrafts(settings);
    const inputs = toProviderProfileInputs(drafts);

    expect(drafts[0]?.apiKey).toBe('');
    expect(inputs[0]).toMatchObject({
      provider: 'deepseek',
      baseUrl: deepseekSeed.baseUrl,
      model: deepseekSeed.model,
      capabilities: deepseekSeed.capabilities,
      diagnostics: deepseekSeed.diagnostics
    });
    expect(inputs[0]?.apiKey).toBeUndefined();
  });
});
