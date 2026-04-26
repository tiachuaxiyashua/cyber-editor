import type { ProjectTemplateDefinition } from '../../shared/types';

export function templateUnavailableReason(template: ProjectTemplateDefinition | null | undefined) {
  if (!template) return '未找到模板。';
  if (template.health === 'corrupt') return template.issueMessage || '模板包已损坏，请先修复。';
  if (template.compatibility === 'incompatible') return '该模板与当前应用版本不兼容。';
  if (template.trust === 'blocked') return template.issueMessage || '该模板当前已被阻断使用。';
  return '';
}

export function templateIsUsable(template: ProjectTemplateDefinition | null | undefined) {
  return !templateUnavailableReason(template);
}
