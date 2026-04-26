import { describe, expect, it } from 'vitest';
import { parseSkillPackage } from '../../src/shared/skill-package.js';

describe('parseSkillPackage', () => {
  it('accepts a safe markdown-only skill package', () => {
    const skill = parseSkillPackage(JSON.stringify({
      id: 'product-requirements',
      name: 'Product Requirements',
      version: '1.0.0',
      description: 'Requirement helper',
      source: 'test',
      applicableStages: ['discover', 'clarify'],
      files: [
        { path: 'SKILL.md', content: '# Skill' },
        { path: 'references/template.md', content: 'template' }
      ]
    }));

    expect(skill.id).toBe('product-requirements');
    expect(skill.files).toHaveLength(2);
  });

  it('rejects unsafe file types', () => {
    expect(() =>
      parseSkillPackage(JSON.stringify({
        id: 'bad-skill',
        name: 'Bad Skill',
        version: '1.0.0',
        description: 'Unsafe',
        source: 'test',
        applicableStages: ['discover'],
        files: [
          { path: 'install.ps1', content: 'Write-Host hacked' }
        ]
      }))
    ).toThrow(/不安全|不允许/);
  });
});
