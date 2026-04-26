import type { ExperienceBindingAsset } from './types';

export const DEFAULT_EXPERIENCE_BINDINGS: ExperienceBindingAsset[] = [
  {
    id: 'discover',
    targetKey: 'experience.discover',
    priority: 90,
    keywords: ['discover', 'clarify', '澄清', '目标', '用户', '痛点', '一句话'],
    preferredNodeTypes: ['agent', 'subflow', 'artifact']
  },
  {
    id: 'plan',
    targetKey: 'experience.plan',
    priority: 88,
    keywords: ['plan', '方案', '规划', '设计', '依赖', '实施', 'solution', 'context pack'],
    preferredNodeTypes: ['agent', 'subflow', 'artifact']
  },
  {
    id: 'review',
    targetKey: 'experience.review',
    priority: 87,
    keywords: ['review', '审查', '红蓝', '裁判', 'issue', 'adoption'],
    preferredNodeTypes: ['subflow', 'approval', 'agent']
  },
  {
    id: 'openspec',
    targetKey: 'experience.openspec',
    priority: 86,
    keywords: ['openspec', 'export', '交付', '导出', 'handoff'],
    preferredNodeTypes: ['artifact', 'subflow', 'end']
  }
];

export function normalizeExperienceBindings(bindings?: ExperienceBindingAsset[]) {
  if (!bindings?.length) {
    return DEFAULT_EXPERIENCE_BINDINGS.map((item) => ({
      ...item,
      keywords: [...item.keywords],
      preferredNodeTypes: item.preferredNodeTypes ? [...item.preferredNodeTypes] : undefined
    }));
  }
  return bindings
    .map((item) => ({
      ...item,
      keywords: item.keywords.map((keyword) => keyword.trim()).filter(Boolean),
      preferredNodeTypes: item.preferredNodeTypes ? [...item.preferredNodeTypes] : undefined
    }))
    .filter((item) => item.targetKey.trim() && item.keywords.length > 0)
    .sort((left, right) => right.priority - left.priority || left.targetKey.localeCompare(right.targetKey));
}
