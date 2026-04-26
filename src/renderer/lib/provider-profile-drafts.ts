import type { AppSettings, ProviderProfileInput } from '../../shared/types';
import { createProviderSeed } from '../../shared/provider-registry';
import type { ProviderProfileDraft } from '../components/ProviderProfilesDialog';

export function toProviderProfileDrafts(settings: Pick<AppSettings, 'providerProfiles'>): ProviderProfileDraft[] {
  return settings.providerProfiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    model: profile.model,
    apiKey: '',
    enabled: profile.enabled,
    capabilities: profile.capabilities,
    diagnostics: profile.diagnostics
  }));
}

export function toProviderProfileInputs(drafts: ProviderProfileDraft[]): ProviderProfileInput[] {
  return drafts.map((profile) => ({
    id: profile.id,
    name: profile.name,
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    model: profile.model,
    apiKey: profile.apiKey || undefined,
    enabled: profile.enabled,
    capabilities: profile.capabilities,
    diagnostics: profile.diagnostics
  }));
}

export function createProviderProfileDraftSeed(nextId: string): ProviderProfileDraft {
  return {
    ...createProviderSeed('mock', {
      defaultProfileId: nextId,
      defaultProfileName: '新配置'
    }),
    apiKey: ''
  };
}
