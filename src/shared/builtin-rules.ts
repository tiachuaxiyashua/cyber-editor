import type { RuleDefinition } from './types';

const BUILTIN_RULE_TIMESTAMP = '2026-04-16T00:00:00.000Z';

export const BUILTIN_GLOBAL_RULES: RuleDefinition[] = [
  {
    id: 'builtin-global-no-false-green',
    name: '禁止伪成功判定',
    description: '不能因为文件存在、接口返回成功或流程走完，就把变更判定为成功。',
    body: '任何功能、阶段或 change 的完成判定，都必须同时检查用户可见结果、结构校验、质量结果和运行证据。禁止用“文件已生成”“返回值为 ok”“流程未报错”替代真实成功。',
    scope: 'global',
    enabled: true,
    category: 'quality',
    targetKey: 'validation.false-green',
    appliesTo: 'all',
    priority: 100,
    source: 'manual',
    tags: ['builtin', 'quality', 'validation', 'engineering'],
    createdAt: BUILTIN_RULE_TIMESTAMP,
    updatedAt: BUILTIN_RULE_TIMESTAMP
  },
  {
    id: 'builtin-global-runtime-evidence-required',
    name: '高风险变更必须有真实运行证据',
    description: '涉及 UI、运行时、AI 或导出的改动，不能只靠静态阅读判定完成。',
    body: '凡是修改 UI、运行时、模型接入、上下文拼装、导出链路、规则系统或持久化行为，必须执行真实运行路径或等价自动化验证，并保留证据后才能标记完成。',
    scope: 'global',
    enabled: true,
    category: 'quality',
    targetKey: 'validation.runtime-evidence',
    appliesTo: 'all',
    priority: 95,
    source: 'manual',
    tags: ['builtin', 'runtime', 'evidence', 'testing'],
    createdAt: BUILTIN_RULE_TIMESTAMP,
    updatedAt: BUILTIN_RULE_TIMESTAMP
  },
  {
    id: 'builtin-global-contract-driven-logic',
    name: '共享逻辑必须依赖显式契约',
    description: '禁止写只对某个测试案例或某个模板有效的临时分支。',
    body: '共享行为必须依赖 schema、runtime template、stage contract、规则作用域或明确的数据契约实现，禁止把测试用例、单一模板名称、单个文档路径或临时上下文写进通用逻辑。',
    scope: 'global',
    enabled: true,
    category: 'structure',
    targetKey: 'architecture.contract-driven',
    appliesTo: 'all',
    priority: 92,
    source: 'manual',
    tags: ['builtin', 'architecture', 'contracts'],
    createdAt: BUILTIN_RULE_TIMESTAMP,
    updatedAt: BUILTIN_RULE_TIMESTAMP
  },
  {
    id: 'builtin-global-core-artifact-quality-gate',
    name: '核心工件必须通过质量门',
    description: '严格核心工件不能靠占位文本或 deterministic fallback 过关。',
    body: '被定义为 strict/core 的 Markdown 工件，若命中占位符、deterministic fallback、长度不足、结构缺失或质量分低于阈值，必须阻断写入、阶段推进和后续交付，直到重新生成或人工修复通过。',
    scope: 'global',
    enabled: true,
    category: 'quality',
    targetKey: 'artifact.strict-quality-gate',
    appliesTo: 'all',
    priority: 98,
    source: 'manual',
    tags: ['builtin', 'artifact', 'quality-gate'],
    createdAt: BUILTIN_RULE_TIMESTAMP,
    updatedAt: BUILTIN_RULE_TIMESTAMP
  },
  {
    id: 'builtin-global-user-visible-regression-check',
    name: '完成前必须做用户视角回归',
    description: '开发者自测不能只测存在性，还要测用户实际操作路径。',
    body: '每次完成重要改动后，必须先明确哪些功能可测、预期效果是什么，再按用户路径做点击、输入、切换、异常与边界场景验证；若结果只是“能运行”而非“输出质量达标”，不得判为完成。',
    scope: 'global',
    enabled: true,
    category: 'quality',
    targetKey: 'validation.user-journey',
    appliesTo: 'all',
    priority: 94,
    source: 'manual',
    tags: ['builtin', 'ux', 'testing', 'regression'],
    createdAt: BUILTIN_RULE_TIMESTAMP,
    updatedAt: BUILTIN_RULE_TIMESTAMP
  }
];

export function mergeRuleDefinitions(baseRules: RuleDefinition[], overridingRules: RuleDefinition[]) {
  const merged = new Map<string, RuleDefinition>();
  for (const rule of baseRules) {
    merged.set(rule.id, rule);
  }
  for (const rule of overridingRules) {
    merged.set(rule.id, rule);
  }
  return Array.from(merged.values()).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name)
  );
}
