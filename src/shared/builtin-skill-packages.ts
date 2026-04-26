import type { RemoteSkillCatalogItem, SkillPackage } from './types';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const BUILTIN_SKILL_PACKAGES: Record<string, SkillPackage> = {
  'product-requirements': {
    id: 'product-requirements',
    name: '产品需求分析',
    version: '1.0.0',
    description: '用于需求澄清、需求拆解和 PRD 草拟。',
    source: 'builtin',
    applicableStages: ['discover', 'clarify', 'draft'],
    files: [
      {
        path: 'SKILL.md',
        content: '# 产品需求分析\n\n- 聚焦目标用户、场景、约束和成功标准。\n- 输出结构化需求说明、问题清单和待确认项。\n'
      },
      {
        path: 'references/checklist.md',
        content: '# 检查清单\n\n- 目标用户\n- 主要场景\n- 功能边界\n- 非功能约束\n- 风险与假设\n'
      }
    ]
  },
  'solution-planner': {
    id: 'solution-planner',
    name: '方案规划',
    version: '1.0.0',
    description: '用于技术方案、功能树和实现路径整理。',
    source: 'builtin',
    applicableStages: ['plan', 'draft', 'review'],
    files: [
      {
        path: 'SKILL.md',
        content: '# 方案规划\n\n- 将需求拆成功能树、原子功能与基础设施。\n- 明确实现顺序、依赖和测试要点。\n'
      },
      {
        path: 'references/template.md',
        content: '# 输出模板\n\n## 功能树\n## 原子功能\n## 依赖关系\n## 测试方案\n'
      }
    ]
  },
  'market-strategy': {
    id: 'market-strategy',
    name: '市场策略',
    version: '1.0.0',
    description: '用于市场定位、竞品视角和价值主张补充。',
    source: 'builtin',
    applicableStages: ['discover', 'clarify', 'review'],
    files: [
      {
        path: 'SKILL.md',
        content: '# 市场策略\n\n- 辅助识别目标市场、竞品替代方案和价值主张。\n- 仅补充与当前文本工件相关的市场分析内容。\n'
      }
    ]
  }
};

export function listBuiltinSkillPackages() {
  return Object.values(BUILTIN_SKILL_PACKAGES).map((item) => clone(item));
}

export function getBuiltinSkillPackage(skillId: string) {
  const skillPackage = BUILTIN_SKILL_PACKAGES[skillId];
  return skillPackage ? clone(skillPackage) : null;
}

export function getBuiltinSkillCatalog(): RemoteSkillCatalogItem[] {
  return listBuiltinSkillPackages().map((item) => ({
    id: item.id,
    name: item.name,
    version: item.version,
    description: item.description,
    source: '内置目录',
    packageUrl: `builtin://${item.id}`,
    applicableStages: [...item.applicableStages]
  }));
}
