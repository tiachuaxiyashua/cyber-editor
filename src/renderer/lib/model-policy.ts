import type { AppSettings, PlatformModelPolicy, PlatformRole, ProviderProfile } from '../../shared/types';

export type ModelPolicyPreview = {
  profile: ProviderProfile | null;
  reason: string;
};

export function resolveModelPolicyPreview(
  role: PlatformRole | null | undefined,
  settings: Pick<AppSettings, 'providerProfiles' | 'activeProviderProfileId'>
): ModelPolicyPreview {
  if (!role) {
    return {
      profile: null,
      reason: '当前节点还没有绑定角色。'
    };
  }

  const activeProfile = settings.providerProfiles.find((item) => item.id === settings.activeProviderProfileId) ?? null;
  const preferred = role.modelPolicy.preferredProfileIds
    .map((profileId) => settings.providerProfiles.find((item) => item.id === profileId) ?? null)
    .find((item) => item?.enabled);

  if (preferred) {
    return {
      profile: preferred,
      reason: `角色优先级命中了 ${preferred.name}。`
    };
  }

  if (role.modelPolicy.fallbackToActive && activeProfile) {
    return {
      profile: activeProfile,
      reason: `未命中角色优先级，回退到当前激活配置 ${activeProfile.name}。`
    };
  }

  if (activeProfile) {
    return {
      profile: activeProfile,
      reason: '使用当前激活模型配置。'
    };
  }

  return {
    profile: null,
    reason: '当前没有可用的模型配置。'
  };
}
