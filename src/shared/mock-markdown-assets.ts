export type MockPromptContext = {
  productIntent: string;
  constraints: string;
  stageInstructions: string;
  targetPurpose: string;
  summary: string;
};

export const DEFAULT_MOCK_MARKDOWN_HEADINGS = [
  '# 结构化文档',
  '## 当前目标',
  '## 关键约束',
  '## 风险与恢复',
  '## 下一步'
];

function normalizeHeadingTitle(heading: string) {
  return heading.replace(/^#{1,6}\s+/, '').trim();
}

export function buildMockSectionBullets(heading: string, context: MockPromptContext) {
  const title = normalizeHeadingTitle(heading);
  const intent = context.productIntent || context.summary || '把模糊想法沉淀成可继续推进的结构化文档。';
  const constraints = context.constraints || '保持本地优先、可回退、可人工确认。';
  const purpose = context.targetPurpose || '生成当前阶段的稳定工件并为下一阶段提供输入。';
  const stageInstruction = context.stageInstructions || '优先保证结构清晰、边界明确、下一步可执行。';

  if (title === '目标用户') {
    return [
      `主要服务对象需要围绕“${intent}”快速看清目标、场景与交付方向，而不是继续停留在模糊表述。`,
      '协作成员需要基于同一份文档理解当前范围、约束、成功标准与遗留问题，降低返工风险。',
      '后续会进入编排、规则与资源配置的用户，也需要把这份文档作为共同基线。'
    ];
  }
  if (title === '核心问题') {
    return [
      '当前输入通常只有零散想法，缺少明确用户、场景、边界与输入输出契约。',
      '如果没有显式写明约束、冲突与待确认问题，后续实现和评审只能反复猜测。',
      '一旦 AI 输出与人工编辑并行发生，没有清晰基线就容易出现覆盖、漂移和证据丢失。'
    ];
  }
  if (title === '核心价值') {
    return [
      `把“${intent}”沉淀成可执行的 Markdown 基线，便于继续推进方案、编排、测试与交付。`,
      '让团队一次性看到目标、边界、风险、验证方式和下一步动作，减少重复沟通。',
      '成功标准：后续阶段可以直接基于这份文档继续推进，而不需要重新解释项目目标。'
    ];
  }
  if (title === '显性限制') {
    return [
      `当前阶段必须优先满足“${constraints}”，并保持文档可编辑、可保存、可回退。`,
      '当前交付以文本工件为主，但要为表格、图表、导出包等后续产物保留结构位置。',
      '不允许把关键判断藏在隐式上下文里，必要信息必须落到文档、契约或证据中。'
    ];
  }
  if (title === '待确认问题') {
    return [
      '是否需要把模板、规则、Skill 和知识沉淀同时纳入当前工程，还是允许部分复用全局资产？',
      '输出是否固定为 md、txt、pdf、openspec 组合，还是由当前模板自定义最小交付集？',
      `下一步是否围绕“${purpose}”继续补齐输入输出契约、失败恢复路径和验收标准？`
    ];
  }
  if (title === '使用方式') {
    return [
      '用户从欢迎页进入工程或编排页后，应能直接继续当前文档沉淀，而不是重新解释背景。',
      'AI 生成、人工编辑、审查与恢复动作必须共享同一份上下文基线和状态记录。',
      `本轮工作重点：${stageInstruction}`
    ];
  }
  if (title === '输入与输出') {
    return [
      '输入包括一句话目标、已有文档、阶段补充指令、当前规则约束与会话摘要。',
      '输出至少包括当前阶段的 Markdown 工件、运行事件和可追踪的质量结果。',
      '如果项目已经绑定模板或资源，还需要保留输出与模板契约之间的映射关系。'
    ];
  }
  if (title === '关键约束') {
    return [
      `必须遵守“${constraints}”，同时保留人工确认、质量闸门与写回保护。`,
      '任何不满足质量或契约要求的输出，都不能静默进入下一阶段。',
      '跨页面和跨阶段的关键信息必须可追踪、可回退、可解释。'
    ];
  }
  if (title === '风险与恢复' || title === '风险与边界') {
    return [
      '如果文档结构缺失、质量过低或与当前基线冲突，系统应阻断写回并提供恢复入口。',
      '如果用户刚修改过目标文档，后续写回应进入显式合并决策，而不是静默覆盖。',
      '当前边界不包含未经授权的外部执行、不可审计写入和无证据自动批准。'
    ];
  }
  if (title === '完成标准') {
    return [
      '文档结构完整，能说明目标、问题、价值、限制、待确认问题与下一步。',
      '输出可被后续阶段直接消费，并能通过当前模板或校验器要求。',
      '人工能从当前结果判断是否继续推进，而不是再次回到模糊描述。'
    ];
  }
  if (title === '当前目标') {
    return [
      `当前目标是围绕“${intent}”形成一份结构清晰、可以继续推进的阶段文档。`,
      `该文档应直接服务于“${purpose}”，而不是只给出泛泛描述。`,
      `本轮写作要求：${stageInstruction}`
    ];
  }
  if (title === '下一步') {
    return [
      `继续围绕“${purpose}”补齐更细的输入输出契约、流程约束和验证条件。`,
      '进入下一阶段前，先确认当前文档已通过必要结构和质量检查。',
      '如果还有关键问题未确认，先把问题显式列出，再决定是否推进。'
    ];
  }

  return [
    `本节需要围绕“${intent}”补足和“${title}”相关的关键信息。`,
    `写作时要遵守“${constraints}”，并确保当前输出服务于“${purpose}”。`,
    `执行要求：${stageInstruction}`
  ];
}
