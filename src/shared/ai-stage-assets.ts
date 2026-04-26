import type { AppStage } from './types';

export const STAGE_PROMPTS: Record<AppStage, string> = {
  discover: '你负责先把一句话目标拆成可确认的目标、用户和缺口，再提出最少必要的补充问题。',
  clarify: '你负责把当前输入补成可执行的约束、使用方式、边界、输入输出与风险说明。',
  plan: '你负责把当前目标拆成结构化方案，明确对象、模块、依赖、风险和后续动作。',
  draft: '你负责产出当前阶段的正式文档草稿，要求结构清晰、可直接进入下一步。',
  review: '你负责审查当前输出，指出缺口、冲突、风险和需要回补的地方。',
  finalize: '你负责给出最终结论、交付摘要和下一步执行建议。'
};

export function getStagePrompt(stage: AppStage) {
  return STAGE_PROMPTS[stage];
}
