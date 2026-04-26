import type { AppStage, SkillPackage } from './types';
import { assertSafeFilePathSegment, normalizeSafeRelativePackagePath } from './resource-path-guard';

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

const ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml']);

function hasBlockedSegment(filePath: string) {
  const lowered = filePath.toLowerCase();
  if (lowered.includes('..')) return true;
  for (const segment of BLOCKED_SEGMENTS) {
    if (lowered.includes(segment)) return true;
  }
  return false;
}

function extensionOf(filePath: string) {
  const match = /\.[^.\\/]+$/.exec(filePath.toLowerCase());
  return match?.[0] ?? '';
}

function isStageList(value: unknown): value is AppStage[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function parseSkillPackage(raw: string) {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Skill 包必须是 JSON 对象。');
  }

  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
    throw new Error('Skill 包缺少合法 id。');
  }
  const skillId = assertSafeFilePathSegment(candidate.id.trim(), 'Skill id');
  if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
    throw new Error('Skill 包缺少合法 name。');
  }
  if (typeof candidate.version !== 'string' || !candidate.version.trim()) {
    throw new Error('Skill 包缺少合法 version。');
  }
  if (typeof candidate.description !== 'string') {
    throw new Error('Skill 包缺少合法 description。');
  }
  if (typeof candidate.source !== 'string' || !candidate.source.trim()) {
    throw new Error('Skill 包缺少合法 source。');
  }
  if (!isStageList(candidate.applicableStages)) {
    throw new Error('Skill 包缺少合法 applicableStages。');
  }
  if (!Array.isArray(candidate.files) || candidate.files.length === 0) {
    throw new Error('Skill 包至少需要一个文件。');
  }

  const files = candidate.files.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Skill 文件项格式非法。');
    }
    const file = entry as Record<string, unknown>;
    if (typeof file.path !== 'string' || typeof file.content !== 'string') {
      throw new Error('Skill 文件项必须包含 path 和 content。');
    }
    const normalizedPath = normalizeSafeRelativePackagePath(file.path, 'Skill file path');
    if (hasBlockedSegment(normalizedPath)) {
      throw new Error(`Skill 文件路径不安全：${file.path}`);
    }
    if (!ALLOWED_EXTENSIONS.has(extensionOf(normalizedPath))) {
      throw new Error(`Skill 文件类型不允许：${file.path}`);
    }
    return {
      path: normalizedPath,
      content: file.content
    };
  });

  return {
    id: skillId,
    name: candidate.name,
    version: candidate.version,
    description: candidate.description,
    source: candidate.source,
    applicableStages: candidate.applicableStages,
    files
  } satisfies SkillPackage;
}
