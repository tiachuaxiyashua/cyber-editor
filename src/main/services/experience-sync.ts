import { createHash } from 'node:crypto';
import path from 'node:path';
import { normalizeExperienceBindings } from '../../shared/runtime-experience-bindings';
import type {
  AccumulationEntry,
  ExperienceBindingAsset,
  PlatformAssets,
  PlatformFlowAsset,
  PlatformRole,
  RuleDefinition
} from '../../shared/types';

type ExperienceSection =
  | 'correction'
  | 'user-preference'
  | 'pattern-work'
  | 'pattern-avoid'
  | 'domain-note'
  | 'session-note';

type ParsedExperienceLesson = {
  idBase: string;
  section: ExperienceSection;
  title: string;
  summary: string;
  details: string;
  sourceKind: AccumulationEntry['source'];
  sourcePath: string;
  date?: string;
  tags: string[];
};

export type ExperienceSyncPlan = {
  globalRules: RuleDefinition[];
  projectRules: RuleDefinition[];
  nodeRules: RuleDefinition[];
  accumulationEntries: AccumulationEntry[];
  lessonCount: number;
};

type ExperienceSyncAssets = Pick<PlatformAssets, 'flows' | 'subflows' | 'roles'>;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function summarize(value: string, maxLength = 72) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(8, maxLength - 1)).trim()}…`;
}

function stableId(prefix: string, ...parts: string[]) {
  const hash = createHash('sha1');
  for (const part of parts) {
    hash.update(part);
    hash.update('\n');
  }
  return `${prefix}${hash.digest('hex').slice(0, 16)}`;
}

function containsAny(text: string, keywords: readonly string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function countKeywordMatches(text: string, keywords: readonly string[]) {
  return keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);
}

function inferTags(text: string, section: ExperienceSection) {
  const normalized = text.toLowerCase();
  const tags = new Set<string>([`section:${section}`, 'experience-sync']);
  const tagGroups: Array<[string, string[]]> = [
    ['ui', ['ui', 'layout', 'sidebar', 'toolbar', 'canvas', 'screenshot', 'viewport', 'responsive', 'workbench']],
    ['testing', ['test', 'playwright', 'smoke', 'e2e', 'unit', 'oracle', 'validation', 'regression']],
    ['runtime', ['runtime', 'rerun', 'checkpoint', 'resume', 'stage', 'artifact', 'context pack', 'knowledge index']],
    ['docs', ['docs', 'document', 'trace', 'matrix', 'backwrite', 'spec']],
    ['model', ['ollama', 'qwen', 'deepseek', 'provider', 'model', 'prompt', 'fallback', 'repair']],
    ['packaging', ['package', 'forge', 'installer', 'packaged']],
    ['orchestration', ['flow', 'orchestration', 'subflow', 'node', 'react flow']]
  ];
  for (const [tag, keywords] of tagGroups) {
    if (containsAny(normalized, keywords)) {
      tags.add(tag);
    }
  }
  return Array.from(tags.values());
}

function inferAccumulationCategory(text: string): AccumulationEntry['category'] {
  const normalized = text.toLowerCase();
  if (containsAny(normalized, ['risk', 'safety', 'permission', 'approval', 'blocked', 'damage'])) {
    return 'risk';
  }
  if (containsAny(normalized, ['quality', 'validation', 'oracle', 'fallback', 'placeholder', 'review', 'regression'])) {
    return 'quality';
  }
  if (containsAny(normalized, ['tool', 'electron', 'playwright', 'package', 'forge', 'ollama', 'skill'])) {
    return 'tooling';
  }
  if (containsAny(normalized, ['domain', 'artifact', 'context', 'knowledge', 'workflow', 'orchestration'])) {
    return 'domain-knowledge';
  }
  if (containsAny(normalized, ['decision', 'boundary', 'scope', 'project', 'cyber editor', 'resource center'])) {
    return 'project-decision';
  }
  return 'writing-pattern';
}

function inferRuleCategory(text: string): RuleDefinition['category'] {
  const normalized = text.toLowerCase();
  if (containsAny(normalized, ['risk', 'safety', 'permission', 'approval', 'damage'])) {
    return 'safety';
  }
  if (containsAny(normalized, ['quality', 'validation', 'oracle', 'fallback', 'placeholder', 'review', 'regression', 'user journey'])) {
    return 'quality';
  }
  if (containsAny(normalized, ['structure', 'contract', 'schema', 'artifact', 'trace', 'flow', 'orchestration', 'context'])) {
    return 'structure';
  }
  if (containsAny(normalized, ['ollama', 'electron', 'playwright', 'package', 'forge', 'provider', 'model', 'tool'])) {
    return 'domain';
  }
  return 'style';
}

function parseSectionHeading(heading: string): ExperienceSection | null {
  const normalized = heading.trim().toLowerCase();
  if (normalized.startsWith('corrections')) return 'correction';
  if (normalized.startsWith('user preferences')) return 'user-preference';
  if (normalized.startsWith('patterns that work')) return 'pattern-work';
  if (normalized.startsWith("patterns that don't work")) return 'pattern-avoid';
  if (normalized.startsWith('domain notes')) return 'domain-note';
  if (normalized.startsWith('session notes')) return 'session-note';
  return null;
}

function parseTableRow(line: string) {
  const columns = line
    .split('|')
    .slice(1, -1)
    .map((value) => normalizeWhitespace(value));
  if (columns.length < 4) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(columns[0] ?? '')) {
    return null;
  }
  return {
    date: columns[0]!,
    source: columns[1]!,
    problem: columns[2]!,
    remedy: columns[3]!
  };
}

export function parseNapkinExperience(markdown: string, sourcePath: string): ParsedExperienceLesson[] {
  const lessons: ParsedExperienceLesson[] = [];
  const lines = markdown.split(/\r?\n/);
  let section: ExperienceSection | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const correctionRow = parseTableRow(line);
    if (correctionRow) {
      const composite = `${correctionRow.problem}\n${correctionRow.remedy}`;
      const title = summarize(correctionRow.remedy || correctionRow.problem, 64);
      lessons.push({
        idBase: stableId('lesson-correction-', correctionRow.date, correctionRow.problem, correctionRow.remedy),
        section: 'correction',
        title,
        summary: summarize(correctionRow.remedy || correctionRow.problem, 120),
        details: `问题：${correctionRow.problem}\n建议：${correctionRow.remedy}`,
        sourceKind: correctionRow.source.toLowerCase().includes('self') ? 'assistant-experience' : 'interaction',
        sourcePath,
        date: correctionRow.date,
        tags: inferTags(composite, 'correction')
      });
      continue;
    }
    if (line.startsWith('## ')) {
      section = parseSectionHeading(line.slice(3));
      continue;
    }
    if (!section) continue;

    if (!line.startsWith('- ')) {
      continue;
    }
    const content = normalizeWhitespace(line.slice(2));
    if (!content) continue;
    lessons.push({
      idBase: stableId(`lesson-${section}-`, content),
      section,
      title: summarize(content, 64),
      summary: summarize(content, 120),
      details: content,
      sourceKind: section === 'user-preference' ? 'interaction' : 'assistant-experience',
      sourcePath,
      tags: inferTags(content, section)
    });
  }
  return lessons;
}

function roleSemanticText(roleMap: Map<string, PlatformRole>, roleId?: string) {
  if (!roleId) return '';
  const role = roleMap.get(roleId);
  if (!role) return '';
  return normalizeWhitespace([
    role.name,
    role.domain ?? '',
    role.description,
    ...(role.responsibilities ?? [])
  ].filter(Boolean).join(' ')).toLowerCase();
}

function scoreProjectNodeBinding(
  target: ExperienceBindingAsset,
  flow: PlatformFlowAsset,
  roleMap: Map<string, PlatformRole>,
  node: PlatformFlowAsset['nodes'][number]
) {
  const flowText = normalizeWhitespace([
    flow.name,
    flow.description,
    node.data.label,
    node.data.description ?? '',
    node.data.notes ?? '',
    roleSemanticText(roleMap, node.data.roleId),
    ...(node.data.skillIds ?? []),
    ...(node.data.toolIds ?? []),
    ...(node.data.outputArtifactPaths ?? []),
    ...(node.data.inputArtifactPaths ?? [])
  ].filter(Boolean).join(' ')).toLowerCase();
  const keywordScore = countKeywordMatches(flowText, target.keywords);
  if (!keywordScore) {
    return null;
  }
  const localText = normalizeWhitespace([
    node.data.label,
    node.data.description ?? '',
    node.data.notes ?? ''
  ].filter(Boolean).join(' ')).toLowerCase();
  const localBoost = countKeywordMatches(localText, target.keywords);
  const typeBoost = target.preferredNodeTypes?.includes(node.type) ? 2 : 0;
  return {
    flowId: flow.id,
    nodeId: node.id,
    targetKey: target.targetKey,
    priority: target.priority,
    score: keywordScore + localBoost + typeBoost
  };
}

function inferNodeBinding(text: string, platform?: ExperienceSyncAssets, experienceBindings?: ExperienceBindingAsset[]) {
  const normalized = text.toLowerCase();
  const target = normalizeExperienceBindings(experienceBindings)
    .map((item) => ({ item, score: countKeywordMatches(normalized, item.keywords) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.item.priority - left.item.priority)[0]?.item;
  if (!target || !platform) {
    return null;
  }
  const roleMap = new Map(platform.roles.map((role) => [role.id, role] as const));
  const candidates = [...platform.flows, ...platform.subflows]
    .flatMap((flow) => flow.nodes.map((node) => scoreProjectNodeBinding(target, flow, roleMap, node)))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((left, right) => right.score - left.score || right.priority - left.priority || left.flowId.localeCompare(right.flowId));
  const best = candidates[0];
  if (!best) {
    return null;
  }
  return {
    flowId: best.flowId,
    nodeId: best.nodeId,
    targetKey: best.targetKey,
    priority: best.priority
  };
}

function shouldPromoteToGlobalRule(lesson: ParsedExperienceLesson, normalized: string) {
  if (!['correction', 'pattern-work', 'pattern-avoid'].includes(lesson.section)) {
    return false;
  }
  return containsAny(normalized, [
    'false-green',
    'fallback',
    'placeholder',
    'runtime evidence',
    'contract',
    'schema',
    'user journey',
    'regression',
    'playwright',
    'electron',
    'packaged',
    'ollama',
    'provider',
    'model',
    'selector',
    'viewport',
    'responsive'
  ]);
}

function shouldPromoteToProjectRule(lesson: ParsedExperienceLesson, normalized: string) {
  if (lesson.section === 'user-preference' || lesson.section === 'domain-note') {
    return true;
  }
  return containsAny(normalized, [
    'cyber editor',
    'resource center',
    'workbench',
    'rules center',
    '编排',
    '规则与沉淀',
    'source of truth',
    'docs/'
  ]);
}

function buildRuleFromLesson(
  lesson: ParsedExperienceLesson,
  scope: RuleDefinition['scope'],
  targetKey: string,
  priority: number,
  extras?: Partial<Pick<RuleDefinition, 'flowId' | 'nodeId'>>
): RuleDefinition {
  const createdAt = lesson.date ? `${lesson.date}T00:00:00.000Z` : '2026-04-16T00:00:00.000Z';
  return {
    id: stableId(`sync-rule-${scope}-`, lesson.idBase, targetKey),
    name: lesson.title,
    description: lesson.summary,
    body: lesson.details,
    scope,
    enabled: false,
    category: inferRuleCategory(`${lesson.title}\n${lesson.details}`),
    targetKey,
    appliesTo: 'all',
    priority,
    source: 'sync',
    tags: Array.from(new Set([...lesson.tags, `scope:${scope}`, 'needs-curation'])),
    flowId: extras?.flowId,
    nodeId: extras?.nodeId,
    createdAt,
    updatedAt: new Date().toISOString()
  };
}

function buildAccumulationEntryFromLesson(lesson: ParsedExperienceLesson): AccumulationEntry {
  const createdAt = lesson.date ? `${lesson.date}T00:00:00.000Z` : '2026-04-16T00:00:00.000Z';
  return {
    id: stableId('sync-entry-', lesson.idBase),
    title: lesson.title,
    summary: lesson.summary,
    details: lesson.details,
    category: inferAccumulationCategory(`${lesson.title}\n${lesson.details}`),
    source: lesson.sourceKind,
    sourceDocumentPaths: [path.normalize(lesson.sourcePath)],
    tags: Array.from(new Set([...lesson.tags, 'auto-synced'])),
    status: 'active',
    createdAt,
    updatedAt: new Date().toISOString()
  };
}

export function buildExperienceSyncPlan(
  markdown: string,
  sourcePath: string,
  platform?: ExperienceSyncAssets,
  experienceBindings?: ExperienceBindingAsset[]
): ExperienceSyncPlan {
  const lessons = parseNapkinExperience(markdown, sourcePath);
  const globalRules: RuleDefinition[] = [];
  const projectRules: RuleDefinition[] = [];
  const nodeRules: RuleDefinition[] = [];
  const accumulationEntries = lessons.map(buildAccumulationEntryFromLesson);

  for (const lesson of lessons) {
    const normalized = `${lesson.title}\n${lesson.summary}\n${lesson.details}`.toLowerCase();
    const nodeBinding = inferNodeBinding(normalized, platform, experienceBindings);
    if (nodeBinding) {
      nodeRules.push(
        buildRuleFromLesson(lesson, 'node', nodeBinding.targetKey, nodeBinding.priority, {
          flowId: nodeBinding.flowId,
          nodeId: nodeBinding.nodeId
        })
      );
      continue;
    }
    if (shouldPromoteToProjectRule(lesson, normalized)) {
      projectRules.push(
        buildRuleFromLesson(
          lesson,
          'project',
          `experience.project.${stableId('', lesson.idBase).replace(/^-+/, '')}`,
          84
        )
      );
      continue;
    }
    if (shouldPromoteToGlobalRule(lesson, normalized)) {
      globalRules.push(
        buildRuleFromLesson(
          lesson,
          'global',
          `experience.global.${stableId('', lesson.idBase).replace(/^-+/, '')}`,
          82
        )
      );
    }
  }

  return {
    globalRules: Array.from(new Map(globalRules.map((rule) => [rule.id, rule])).values()),
    projectRules: Array.from(new Map(projectRules.map((rule) => [rule.id, rule])).values()),
    nodeRules: Array.from(new Map(nodeRules.map((rule) => [rule.id, rule])).values()),
    accumulationEntries: Array.from(new Map(accumulationEntries.map((entry) => [entry.id, entry])).values()),
    lessonCount: lessons.length
  };
}
