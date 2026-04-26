import { describe, expect, it } from 'vitest';
import { getBuiltinSkillCatalog, getBuiltinSkillPackage } from '../../src/shared/builtin-skill-packages.js';

describe('builtin skill packages', () => {
  it('exposes builtin skill packages as shared assets', () => {
    const catalog = getBuiltinSkillCatalog();

    expect(catalog.map((item) => item.id)).toEqual(expect.arrayContaining([
      'product-requirements',
      'solution-planner',
      'market-strategy'
    ]));
    expect(getBuiltinSkillPackage('product-requirements')?.files.some((file) => file.path === 'SKILL.md')).toBe(true);
    expect(getBuiltinSkillPackage('missing-skill')).toBeNull();
  });
});
