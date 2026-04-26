import type {
  PlatformModelPolicy,
  ProviderCapabilityTag,
  ProviderProfile
} from '../../shared/types';

export type RoutableProviderProfile = ProviderProfile & {
  apiKey?: string;
};

export type ModelRouteResult = {
  profile: RoutableProviderProfile | null;
  reason: string;
  candidates: string[];
};

function hasRequiredCapabilities(profile: RoutableProviderProfile, required: ProviderCapabilityTag[]) {
  return required.every((tag) => profile.capabilities.tags.includes(tag));
}

function scoreProfile(profile: RoutableProviderProfile, policy: PlatformModelPolicy) {
  let score = 0;
  if (policy.privacyPreference === 'local' && profile.capabilities.privacy === 'local') score += 6;
  if (policy.privacyPreference === 'cloud' && profile.capabilities.privacy === 'cloud') score += 6;
  if (policy.costPreference === 'low' && profile.capabilities.costTier === 'low') score += 4;
  if (policy.costPreference === 'quality' && profile.capabilities.costTier === 'high') score += 3;
  if (policy.latencyPreference === 'low' && profile.capabilities.latencyTier === 'low') score += 4;
  if (policy.latencyPreference === 'quality' && profile.capabilities.latencyTier === 'high') score += 2;
  score += profile.enabled ? 2 : -100;
  return score;
}

export class ModelRouter {
  select(policy: PlatformModelPolicy | undefined, profiles: RoutableProviderProfile[], activeProfileId: string): ModelRouteResult {
    const enabledProfiles = profiles.filter((profile) => profile.enabled);
    const activeProfile = enabledProfiles.find((profile) => profile.id === activeProfileId) ?? profiles.find((profile) => profile.id === activeProfileId) ?? null;
    const safePolicy: PlatformModelPolicy = policy ?? {
      mode: 'fallback_to_active',
      preferredProfileIds: [],
      fallbackToActive: true
    };

    if (!profiles.length) {
      return {
        profile: null,
        reason: '当前没有可用的 Provider profile。',
        candidates: []
      };
    }

    if (safePolicy.mode === 'fixed' && safePolicy.fixedProfileId) {
      const fixed = enabledProfiles.find((profile) => profile.id === safePolicy.fixedProfileId) ?? null;
      if (fixed) {
        return {
          profile: fixed,
          reason: `按 fixed 策略命中 ${fixed.name}。`,
          candidates: [fixed.id]
        };
      }
    }

    if (safePolicy.mode === 'prefer_list') {
      const preferred = safePolicy.preferredProfileIds
        .map((profileId) => enabledProfiles.find((profile) => profile.id === profileId) ?? null)
        .find((profile): profile is RoutableProviderProfile => Boolean(profile));
      if (preferred) {
        return {
          profile: preferred,
          reason: `按 prefer_list 策略命中 ${preferred.name}。`,
          candidates: safePolicy.preferredProfileIds
        };
      }
    }

    if (safePolicy.mode === 'capability_match') {
      const required = safePolicy.requiredProviderCapabilities ?? [];
      const match = enabledProfiles.find((profile) => hasRequiredCapabilities(profile, required)) ?? null;
      if (match) {
        return {
          profile: match,
          reason: `按 capability_match 命中 ${match.name}。`,
          candidates: enabledProfiles.map((profile) => profile.id)
        };
      }
    }

    if (safePolicy.mode === 'policy_router') {
      const required = safePolicy.requiredProviderCapabilities ?? [];
      const ranked = enabledProfiles
        .filter((profile) => hasRequiredCapabilities(profile, required))
        .map((profile) => ({ profile, score: scoreProfile(profile, safePolicy) }))
        .sort((left, right) => right.score - left.score);
      if (ranked[0]) {
        return {
          profile: ranked[0].profile,
          reason: `按 policy_router 选择 ${ranked[0].profile.name}。`,
          candidates: ranked.map((item) => item.profile.id)
        };
      }
    }

    if (safePolicy.fallbackToActive && activeProfile) {
      return {
        profile: activeProfile,
        reason: `未命中专用策略，回退到当前激活配置 ${activeProfile.name}。`,
        candidates: [activeProfile.id]
      };
    }

    const fallback = enabledProfiles[0] ?? profiles[0] ?? null;
    return {
      profile: fallback,
      reason: fallback ? `回退到首个可用配置 ${fallback.name}。` : '没有可路由的模型。',
      candidates: fallback ? [fallback.id] : []
    };
  }
}
