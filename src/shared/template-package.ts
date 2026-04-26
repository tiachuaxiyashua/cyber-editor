import type { ProjectTemplatePackage } from './types';
import { assertSafeFilePathSegment } from './resource-path-guard';

const BLOCKED_SEGMENTS = new Set([
  '..',
  '.exe',
  '.dll',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.com',
  '.msi',
  '.jar'
]);

function hasBlockedSegment(filePath: string) {
  const lowered = filePath.toLowerCase();
  if (lowered.includes('..')) return true;
  for (const segment of BLOCKED_SEGMENTS) {
    if (lowered.includes(segment)) return true;
  }
  return false;
}

function validateNoBlockedPaths(templatePackage: ProjectTemplatePackage) {
  const paths = [
    ...templatePackage.platform.flows.flatMap((flow) => flow.nodes.map((node) => node.data.artifactPath).filter(Boolean)),
    ...templatePackage.platform.subflows.flatMap((flow) => flow.nodes.map((node) => node.data.artifactPath).filter(Boolean)),
    ...templatePackage.platform.tools.map((tool) => tool.cwd)
  ].filter((value): value is string => Boolean(value));

  for (const value of paths) {
    if (hasBlockedSegment(value)) {
      throw new Error(`模板包包含不安全路径：${value}`);
    }
  }
}

function validatePackageIds(templatePackage: ProjectTemplatePackage) {
  assertSafeFilePathSegment(templatePackage.definition.id, 'Template id');
  for (const flow of templatePackage.platform.flows) {
    assertSafeFilePathSegment(flow.id, 'Flow id');
  }
  for (const subflow of templatePackage.platform.subflows) {
    assertSafeFilePathSegment(subflow.id, 'Flow id');
  }
  for (const role of templatePackage.platform.roles) {
    assertSafeFilePathSegment(role.id, 'Role id');
  }
}

export function parseTemplatePackage(raw: string) {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('模板包必须是 JSON 对象。');
  }

  const candidate = parsed as ProjectTemplatePackage;
  if (!candidate.definition?.id || !candidate.definition?.name) {
    throw new Error('模板包缺少合法 definition。');
  }
  if (!candidate.platform || !candidate.runtime) {
    throw new Error('模板包缺少 platform 或 runtime。');
  }
  if (!Array.isArray(candidate.platform.flows) || !Array.isArray(candidate.platform.subflows)) {
    throw new Error('模板包缺少合法流程资产。');
  }
  if (!Array.isArray(candidate.platform.roles) || !Array.isArray(candidate.platform.connectors) || !Array.isArray(candidate.platform.tools)) {
    throw new Error('模板包缺少合法平台资产。');
  }
  if (!Array.isArray(candidate.runtime.promptProfiles) || !Array.isArray(candidate.runtime.artifactSchemas) || !candidate.runtime.template) {
    throw new Error('模板包缺少合法运行时资产。');
  }

  validateNoBlockedPaths(candidate);
  validatePackageIds(candidate);
  return candidate;
}
