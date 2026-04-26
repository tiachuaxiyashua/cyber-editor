import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import {
  collectRuleScopeSummary,
  resolveEffectiveRulesFromSnapshot
} from '../../shared/rule-resolution';
import { BUILTIN_GLOBAL_RULES, mergeRuleDefinitions } from '../../shared/builtin-rules';
import type {
  AccumulationEntry,
  EffectiveRuleSet,
  KnowledgeLinkNode,
  PlatformAssets,
  PromotionDraft,
  PromotionTargetKind,
  ProjectKnowledgeGraph,
  RuleDefinition,
  RuleScope,
  RulesDistillationSnapshot
} from '../../shared/types';
import { buildExperienceSyncPlan } from './experience-sync';
import { PlatformService } from './platform-service';
import { ProjectKnowledgeGraphBuilder } from './project-knowledge-graph-builder';
import { SkillRegistryService } from './skill-registry-service';
import { RuntimeAssetService } from './runtime-asset-service';

type RuleInput = Partial<RuleDefinition> & Pick<RuleDefinition, 'name' | 'body' | 'scope'>;

type AccumulationEntryInput = Partial<AccumulationEntry> & Pick<AccumulationEntry, 'title' | 'summary' | 'category' | 'source'>;

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function nowIso() {
  return new Date().toISOString();
}

function emptyKnowledgeGraph(): ProjectKnowledgeGraph {
  return {
    generatedAt: nowIso(),
    nodes: [],
    edges: []
  };
}

function uniqueStrings(values: string[] | undefined) {
  return Array.from(new Set((values ?? []).map((item) => item.trim()).filter(Boolean)));
}

function isSyncedRule(rule: RuleDefinition) {
  return rule.source === 'sync' || rule.id.startsWith('sync-rule-');
}

function isSyncedAccumulationEntry(entry: AccumulationEntry) {
  return entry.id.startsWith('sync-entry-') || entry.tags.includes('auto-synced');
}

function categoryFromAccumulation(entry: AccumulationEntry): RuleDefinition['category'] {
  switch (entry.category) {
    case 'risk':
      return 'safety';
    case 'quality':
      return 'quality';
    case 'project-decision':
      return 'structure';
    case 'tooling':
      return 'domain';
    case 'domain-knowledge':
      return 'domain';
    case 'writing-pattern':
    default:
      return 'style';
  }
}

const ALL_SKILL_STAGES = ['discover', 'clarify', 'plan', 'draft', 'review', 'finalize'] as const;

function slugifySkillId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'promoted-skill';
}

export class RulesDistillationService {
  constructor(
    private readonly graphBuilder = new ProjectKnowledgeGraphBuilder(),
    private readonly platformService?: Pick<PlatformService, 'loadAssets'>,
    private readonly skillRegistry?: Pick<SkillRegistryService, 'installPackage'>,
    private readonly runtimeAssets: Pick<RuntimeAssetService, 'listRuns' | 'loadTemplate'> = new RuntimeAssetService()
  ) {}

  getSnapshot(rootPath: string | null): RulesDistillationSnapshot {
    const globalRules = this.loadGlobalRules(rootPath);
    const projectRules = rootPath ? this.loadProjectRules(rootPath) : [];
    const nodeRules = rootPath ? this.loadNodeRules(rootPath) : [];
    const accumulationEntries = rootPath ? this.loadAccumulationEntries(rootPath) : [];
    const promotionDrafts = rootPath ? this.loadPromotionDrafts(rootPath) : [];
    const knowledgeGraph = rootPath ? this.rebuildKnowledgeGraph(rootPath) : emptyKnowledgeGraph();
    return {
      scopes: collectRuleScopeSummary({ globalRules, projectRules, nodeRules }),
      globalRules,
      projectRules,
      nodeRules,
      accumulationEntries,
      promotionDrafts,
      knowledgeGraph
    };
  }

  resolveEffectiveRules(
    rootPath: string | null,
    input: {
      flowId?: string;
      nodeId?: string;
      boundRuleIds?: string[];
    }
  ): EffectiveRuleSet {
    const snapshot = this.getSnapshot(rootPath);
    return resolveEffectiveRulesFromSnapshot(snapshot, input);
  }

  saveRule(rootPath: string | null, input: RuleInput) {
    const existing = input.id ? this.findRule(rootPath, input.id) : null;
    const now = nowIso();
    const normalized: RuleDefinition = {
      id: existing?.id ?? input.id ?? randomUUID(),
      name: input.name.trim(),
      description: input.description?.trim() || input.body.trim().slice(0, 120),
      body: input.body.trim(),
      scope: input.scope,
      enabled: input.enabled ?? existing?.enabled ?? true,
      category: input.category ?? existing?.category ?? 'style',
      targetKey: input.targetKey?.trim() || existing?.targetKey,
      appliesTo: input.appliesTo ?? existing?.appliesTo ?? 'all',
      priority: input.priority ?? existing?.priority ?? 0,
      source: input.source ?? existing?.source ?? 'manual',
      tags: uniqueStrings(input.tags ?? existing?.tags),
      flowId: input.scope === 'node' ? (input.flowId ?? existing?.flowId) : undefined,
      nodeId: input.scope === 'node' ? (input.nodeId ?? existing?.nodeId) : undefined,
      provenanceEntryId: input.provenanceEntryId ?? existing?.provenanceEntryId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    if (normalized.scope !== 'global' && !rootPath) {
      throw new Error('Project-scoped rules require an active project.');
    }
    if (normalized.scope === 'node' && !normalized.nodeId) {
      throw new Error('Node-scoped rules must specify a nodeId.');
    }

    if (normalized.scope === 'global') {
      const rules = this.loadStoredGlobalRules().filter((item) => item.id !== normalized.id);
      rules.push({ ...normalized, source: existing?.source === 'import' ? 'import' : 'manual' });
      this.writeStoredGlobalRules(rules);
    } else {
      const rules = this.readRulesForScope(rootPath, normalized.scope).filter((item) => item.id !== normalized.id);
      rules.push(normalized);
      this.writeRulesForScope(rootPath, normalized.scope, rules);
    }
    if (rootPath) {
      this.rebuildKnowledgeGraph(rootPath);
    }
    return this.getSnapshot(rootPath);
  }

  deleteRule(rootPath: string | null, ruleId: string) {
    const match = this.findRule(rootPath, ruleId);
    if (!match) {
      return this.getSnapshot(rootPath);
    }
    if (match.scope === 'global') {
      const rules = this.loadStoredGlobalRules().filter((item) => item.id !== ruleId);
      this.writeStoredGlobalRules(rules);
    } else {
      const rules = this.readRulesForScope(rootPath, match.scope).filter((item) => item.id !== ruleId);
      this.writeRulesForScope(rootPath, match.scope, rules);
    }
    if (rootPath) {
      this.rebuildKnowledgeGraph(rootPath);
    }
    return this.getSnapshot(rootPath);
  }

  setRuleEnabled(rootPath: string | null, ruleId: string, enabled: boolean) {
    const match = this.findRule(rootPath, ruleId);
    if (!match) {
      return this.getSnapshot(rootPath);
    }
    if (match.scope === 'global') {
      const stored = this.loadStoredGlobalRules();
      const override = stored.find((item) => item.id === ruleId);
      const next = stored.filter((item) => item.id !== ruleId);
      next.push({
        ...(override ?? match),
        enabled,
        source: override?.source ?? (match.source === 'import' ? 'import' : 'manual'),
        updatedAt: nowIso()
      });
      this.writeStoredGlobalRules(next);
    } else {
      const rules = this.readRulesForScope(rootPath, match.scope).map((item) =>
        item.id === ruleId
          ? { ...item, enabled, updatedAt: nowIso() }
          : item
      );
      this.writeRulesForScope(rootPath, match.scope, rules);
    }
    if (rootPath) {
      this.rebuildKnowledgeGraph(rootPath);
    }
    return this.getSnapshot(rootPath);
  }

  saveAccumulationEntry(rootPath: string | null, input: AccumulationEntryInput) {
    const projectRoot = this.requireProject(rootPath);
    const entries = this.loadAccumulationEntries(projectRoot);
    const existing = input.id ? entries.find((item) => item.id === input.id) ?? null : null;
    const now = nowIso();
    const entry: AccumulationEntry = {
      id: existing?.id ?? input.id ?? randomUUID(),
      title: input.title.trim(),
      summary: input.summary.trim(),
      details: input.details?.trim() || existing?.details,
      category: input.category,
      source: input.source,
      sourceDocumentPaths: uniqueStrings(input.sourceDocumentPaths ?? existing?.sourceDocumentPaths),
      sourceRunId: input.sourceRunId ?? existing?.sourceRunId,
      sourceNodeId: input.sourceNodeId ?? existing?.sourceNodeId,
      tags: uniqueStrings(input.tags ?? existing?.tags),
      status: input.status ?? existing?.status ?? 'active',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    const next = entries.filter((item) => item.id !== entry.id);
    next.push(entry);
    writeJson(this.projectEntriesFile(projectRoot), next.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    this.rebuildKnowledgeGraph(projectRoot);
    return this.getSnapshot(projectRoot);
  }

  deleteAccumulationEntry(rootPath: string | null, entryId: string) {
    const projectRoot = this.requireProject(rootPath);
    const next = this.loadAccumulationEntries(projectRoot).filter((item) => item.id !== entryId);
    writeJson(this.projectEntriesFile(projectRoot), next);
    this.rebuildKnowledgeGraph(projectRoot);
    return this.getSnapshot(projectRoot);
  }

  createPromotionDraft(rootPath: string | null, payload: {
    entryId: string;
    targetKind: PromotionTargetKind;
    proposedName?: string;
  }) {
    const projectRoot = this.requireProject(rootPath);
    const entry = this.loadAccumulationEntries(projectRoot).find((item) => item.id === payload.entryId);
    if (!entry) {
      throw new Error('Accumulation entry not found.');
    }
    const drafts = this.loadPromotionDrafts(projectRoot);
    const now = nowIso();
    drafts.unshift({
      id: randomUUID(),
      entryId: entry.id,
      targetKind: payload.targetKind,
      status: 'draft',
      proposedName: payload.proposedName?.trim() || `${entry.title} ${payload.targetKind}`,
      summary: entry.summary,
      createdAt: now,
      updatedAt: now
    });
    writeJson(this.projectPromotionsFile(projectRoot), drafts);
    this.rebuildKnowledgeGraph(projectRoot);
    return this.getSnapshot(projectRoot);
  }

  applyPromotionDraft(rootPath: string | null, draftId: string, reviewNote?: string) {
    const projectRoot = this.requireProject(rootPath);
    const drafts = this.loadPromotionDrafts(projectRoot);
    const index = drafts.findIndex((item) => item.id === draftId);
    if (index === -1) {
      throw new Error('Promotion draft not found.');
    }
    const draft = drafts[index]!;
    const entry = this.loadAccumulationEntries(projectRoot).find((item) => item.id === draft.entryId);
    if (!entry) {
      throw new Error('Promotion source entry not found.');
    }

    let appliedRuleId: string | undefined;
    let appliedKnowledgeNodeId: string | undefined;
    let appliedSkillId: string | undefined;
    let appliedSkillPackagePath: string | undefined;

    if (draft.targetKind === 'rule') {
      const snapshot = this.saveRule(projectRoot, {
        name: draft.proposedName,
        description: entry.summary,
        body: entry.details?.trim() || entry.summary,
        scope: 'project',
        category: categoryFromAccumulation(entry),
        source: 'promotion',
        provenanceEntryId: entry.id
      });
      appliedRuleId = snapshot.projectRules[0]?.id;
    } else if (draft.targetKind === 'knowledge') {
      const knowledgeGraph = this.loadKnowledgeGraph(projectRoot);
      appliedKnowledgeNodeId = `knowledge:${randomUUID()}`;
      knowledgeGraph.nodes.push({
        id: appliedKnowledgeNodeId,
        kind: 'knowledge',
        title: draft.proposedName,
        summary: entry.details?.trim() || entry.summary,
        sourceId: entry.id,
        status: 'accepted',
        metadata: {
          category: entry.category
        }
      });
      writeJson(this.projectKnowledgeGraphFile(projectRoot), knowledgeGraph);
    } else if (draft.targetKind === 'skill') {
      const skillMaterialization = this.materializePromotedSkill(projectRoot, draft, entry);
      appliedSkillId = skillMaterialization.skillId;
      appliedSkillPackagePath = skillMaterialization.packagePath;
    }

    drafts[index] = {
      ...draft,
      status: 'accepted',
      reviewNote: reviewNote?.trim() || draft.reviewNote,
      appliedRuleId,
      appliedKnowledgeNodeId,
      appliedSkillId,
      appliedSkillPackagePath,
      updatedAt: nowIso()
    };
    writeJson(this.projectPromotionsFile(projectRoot), drafts);
    this.rebuildKnowledgeGraph(projectRoot);
    return this.getSnapshot(projectRoot);
  }

  exportRules(rootPath: string | null, targetPath: string, scope: RuleScope) {
    const rules = this.readRulesForScope(rootPath, scope);
    writeJson(targetPath, {
      version: 1,
      scope,
      exportedAt: nowIso(),
      rules
    });
    return { snapshot: this.getSnapshot(rootPath), exportPath: targetPath, count: rules.length };
  }

  importRules(rootPath: string | null, sourcePath: string, scope: RuleScope) {
    const parsed = readJsonSafe<{ rules?: RuleDefinition[] } | RuleDefinition[]>(sourcePath, []);
    const importedRules = Array.isArray(parsed) ? parsed : parsed.rules ?? [];
    const existing = this.readRulesForScope(rootPath, scope);
    const now = nowIso();
    const merged = [...existing];

    for (const rule of importedRules) {
      const normalized: RuleDefinition = {
        ...rule,
        id: rule.id || randomUUID(),
        scope,
        enabled: rule.enabled ?? true,
        category: rule.category ?? 'style',
        appliesTo: rule.appliesTo ?? 'all',
        priority: rule.priority ?? 0,
        source: 'import',
        createdAt: rule.createdAt ?? now,
        updatedAt: now,
        flowId: scope === 'node' ? rule.flowId : undefined,
        nodeId: scope === 'node' ? rule.nodeId : undefined
      };
      const index = merged.findIndex((item) => item.id === normalized.id);
      if (index >= 0) merged[index] = normalized;
      else merged.push(normalized);
    }

    this.writeRulesForScope(rootPath, scope, merged);
    if (rootPath) {
      this.rebuildKnowledgeGraph(rootPath);
    }
    return { snapshot: this.getSnapshot(rootPath), count: importedRules.length };
  }

  syncExperienceSources(rootPath: string | null, sourcePath?: string) {
    const projectRoot = this.requireProject(rootPath);
    const resolvedSourcePath = sourcePath
      ? path.resolve(sourcePath)
      : path.join(projectRoot, '.scratch', 'napkin.md');
    const resolvedProjectRoot = path.resolve(projectRoot);
    if (resolvedSourcePath !== resolvedProjectRoot && !resolvedSourcePath.startsWith(`${resolvedProjectRoot}${path.sep}`)) {
      throw new Error('Experience sync source must stay inside the active project root.');
    }
    if (!fs.existsSync(resolvedSourcePath)) {
      throw new Error(`Experience source not found: ${resolvedSourcePath}`);
    }
    const platform = this.loadPlatformAssets(projectRoot);
    let runtimeTemplate = null;
    const templateId = platform.template?.id;
    if (templateId) {
      try {
        runtimeTemplate = this.runtimeAssets.loadTemplate(projectRoot, templateId);
      } catch {
        runtimeTemplate = null;
      }
    }
    const plan = buildExperienceSyncPlan(
      fs.readFileSync(resolvedSourcePath, 'utf8'),
      resolvedSourcePath,
      platform,
      runtimeTemplate?.experienceBindings
    );

    const workspaceGlobalRules = this.mergeSyncedRules(
      this.loadWorkspaceGlobalRules(projectRoot),
      plan.globalRules
    );
    const projectRules = this.mergeSyncedRules(
      this.loadProjectRules(projectRoot),
      plan.projectRules
    );
    const nodeRules = this.mergeSyncedRules(
      this.loadNodeRules(projectRoot),
      plan.nodeRules
    );
    const accumulationEntries = this.mergeSyncedAccumulationEntries(
      this.loadAccumulationEntries(projectRoot),
      plan.accumulationEntries
    );

    writeJson(this.workspaceGlobalRulesFile(projectRoot), workspaceGlobalRules);
    writeJson(this.projectRulesFile(projectRoot), projectRules);
    writeJson(this.projectNodeRulesFile(projectRoot), nodeRules);
    writeJson(this.projectEntriesFile(projectRoot), accumulationEntries);
    this.rebuildKnowledgeGraph(projectRoot);

    return {
      sourcePath: resolvedSourcePath,
      lessonCount: plan.lessonCount,
      globalRuleCount: plan.globalRules.length,
      projectRuleCount: plan.projectRules.length,
      nodeRuleCount: plan.nodeRules.length,
      accumulationEntryCount: plan.accumulationEntries.length,
      snapshot: this.getSnapshot(projectRoot)
    };
  }

  private rebuildKnowledgeGraph(rootPath: string) {
    const currentGraph = this.loadKnowledgeGraph(rootPath);
    const platform = this.loadPlatformAssets(rootPath);
    const graph = this.graphBuilder.build({
      rootPath,
      existingKnowledgeNodes: currentGraph.nodes.filter((item) => item.kind === 'knowledge'),
      rules: [...this.loadGlobalRules(rootPath), ...this.loadProjectRules(rootPath), ...this.loadNodeRules(rootPath)],
      accumulationEntries: this.loadAccumulationEntries(rootPath),
      promotionDrafts: this.loadPromotionDrafts(rootPath),
      platform,
      runtimeRuns: this.runtimeAssets.listRuns(rootPath, 40)
    });
    writeJson(this.projectKnowledgeGraphFile(rootPath), graph);
    return graph;
  }

  private materializePromotedSkill(rootPath: string, draft: PromotionDraft, entry: AccumulationEntry) {
    const skillId = `${slugifySkillId(draft.proposedName)}-${draft.id.slice(0, 8)}`;
    const packagePath = path.join(this.projectRootDir(rootPath), 'promoted-skills', skillId);
    fs.rmSync(packagePath, { recursive: true, force: true });
    ensureDir(packagePath);

    const skillPackage = {
      id: skillId,
      name: draft.proposedName,
      version: '1.0.0',
      description: entry.summary,
      source: `promotion:${draft.id}`,
      applicableStages: [...ALL_SKILL_STAGES],
      files: [
        {
          path: 'SKILL.md',
          content: [
            `# ${draft.proposedName}`,
            '',
            '## Purpose',
            entry.summary,
            '',
            '## Working Rules',
            entry.details?.trim() || entry.summary,
            '',
            '## Provenance',
            `- Promotion Draft: ${draft.id}`,
            `- Accumulation Entry: ${entry.id}`
          ].join('\n')
        },
        {
          path: 'manifest.json',
          content: JSON.stringify({
            id: skillId,
            name: draft.proposedName,
            version: '1.0.0',
            description: entry.summary,
            source: `promotion:${draft.id}`,
            applicableStages: [...ALL_SKILL_STAGES],
            files: ['SKILL.md'],
            provenance: {
              promotionDraftId: draft.id,
              accumulationEntryId: entry.id
            }
          }, null, 2)
        },
        {
          path: 'references/provenance.md',
          content: [
            `# ${draft.proposedName} Provenance`,
            '',
            `- Promotion Draft: ${draft.id}`,
            `- Accumulation Entry: ${entry.id}`,
            `- Summary: ${entry.summary}`,
            '',
            entry.details?.trim() || ''
          ].filter(Boolean).join('\n')
        }
      ]
    };

    for (const file of skillPackage.files) {
      const targetPath = path.join(packagePath, file.path);
      ensureDir(path.dirname(targetPath));
      fs.writeFileSync(targetPath, file.content, 'utf8');
    }

    try {
      this.loadSkillRegistry().installPackage(skillPackage, `local:${packagePath}`, {
        provenance: {
          kind: 'promotion',
          promotionDraftId: draft.id,
          accumulationEntryId: entry.id,
          packagePath
        }
      });
      return { skillId, packagePath };
    } catch (error) {
      fs.rmSync(packagePath, { recursive: true, force: true });
      throw error;
    }
  }

  private loadPlatformAssets(rootPath: string): Pick<PlatformAssets, 'template' | 'flows' | 'subflows' | 'roles'> {
    if (this.platformService) {
      return this.platformService.loadAssets(rootPath);
    }
    try {
      return new PlatformService().loadAssets(rootPath);
    } catch {
      return {
        template: null,
        flows: [],
        subflows: [],
        roles: []
      };
    }
  }

  private loadSkillRegistry(): Pick<SkillRegistryService, 'installPackage'> {
    if (this.skillRegistry) {
      return this.skillRegistry;
    }
    return new SkillRegistryService();
  }

  private mergeSyncedRules(existing: RuleDefinition[], generated: RuleDefinition[]) {
    const manualRules = existing.filter((item) => !isSyncedRule(item));
    return [...manualRules, ...generated].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  private mergeSyncedAccumulationEntries(existing: AccumulationEntry[], generated: AccumulationEntry[]) {
    const manualEntries = existing.filter((item) => !isSyncedAccumulationEntry(item));
    return [...manualEntries, ...generated].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  private findRule(rootPath: string | null, ruleId: string): RuleDefinition | null {
    const availableScopes: RuleScope[] = rootPath ? ['global', 'project', 'node'] : ['global'];
    for (const scope of availableScopes) {
      const match = this.readRulesForScope(rootPath, scope).find((item) => item.id === ruleId);
      if (match) return match;
    }
    return null;
  }

  private readRulesForScope(rootPath: string | null, scope: RuleScope) {
    if (scope === 'global') return this.loadGlobalRules(rootPath);
    const projectRoot = this.requireProject(rootPath);
    return scope === 'project' ? this.loadProjectRules(projectRoot) : this.loadNodeRules(projectRoot);
  }

  private writeRulesForScope(rootPath: string | null, scope: RuleScope, rules: RuleDefinition[]) {
    if (scope === 'global') {
      this.writeStoredGlobalRules(rules);
      return;
    }
    const projectRoot = this.requireProject(rootPath);
    const targetPath = scope === 'project' ? this.projectRulesFile(projectRoot) : this.projectNodeRulesFile(projectRoot);
    writeJson(targetPath, rules.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
  }

  private loadGlobalRules(rootPath: string | null = null) {
    const workspace = rootPath ? this.loadWorkspaceGlobalRules(rootPath) : [];
    const stored = this.loadStoredGlobalRules();
    return mergeRuleDefinitions(BUILTIN_GLOBAL_RULES, [...workspace, ...stored]);
  }

  private loadStoredGlobalRules() {
    return readJsonSafe<RuleDefinition[]>(this.globalRulesFile(), []);
  }

  private writeStoredGlobalRules(rules: RuleDefinition[]) {
    writeJson(this.globalRulesFile(), rules.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
  }

  private loadWorkspaceGlobalRules(rootPath: string) {
    return readJsonSafe<RuleDefinition[]>(this.workspaceGlobalRulesFile(rootPath), []);
  }

  private loadProjectRules(rootPath: string) {
    return readJsonSafe<RuleDefinition[]>(this.projectRulesFile(rootPath), []);
  }

  private loadNodeRules(rootPath: string) {
    return readJsonSafe<RuleDefinition[]>(this.projectNodeRulesFile(rootPath), []);
  }

  private loadAccumulationEntries(rootPath: string) {
    return readJsonSafe<AccumulationEntry[]>(this.projectEntriesFile(rootPath), []);
  }

  private loadPromotionDrafts(rootPath: string) {
    return readJsonSafe<PromotionDraft[]>(this.projectPromotionsFile(rootPath), []);
  }

  private loadKnowledgeGraph(rootPath: string) {
    return readJsonSafe<ProjectKnowledgeGraph>(this.projectKnowledgeGraphFile(rootPath), emptyKnowledgeGraph());
  }

  private requireProject(rootPath: string | null) {
    if (!rootPath) {
      throw new Error('This action requires an active project.');
    }
    return rootPath;
  }

  private globalRulesFile() {
    return path.join(this.globalRootDir(), 'global-rules.json');
  }

  private globalRootDir() {
    const userDataRoot = process.env.CYBER_EDITOR_USER_DATA || this.resolveUserDataRoot();
    return path.join(userDataRoot, 'rules-distillation');
  }

  private resolveUserDataRoot() {
    try {
      if (app && typeof app.getPath === 'function') {
        return app.getPath('userData');
      }
    } catch {
      // Fallback for unit tests and non-Electron execution.
    }
    return path.join(os.tmpdir(), 'cyber-editor-user-data');
  }

  private projectRootDir(rootPath: string) {
    return path.join(rootPath, '.project', 'runtime', 'rules-distillation');
  }

  private workspaceGlobalRulesFile(rootPath: string) {
    return path.join(this.projectRootDir(rootPath), 'global-rules.json');
  }

  private projectRulesFile(rootPath: string) {
    return path.join(this.projectRootDir(rootPath), 'project-rules.json');
  }

  private projectNodeRulesFile(rootPath: string) {
    return path.join(this.projectRootDir(rootPath), 'node-rules.json');
  }

  private projectEntriesFile(rootPath: string) {
    return path.join(this.projectRootDir(rootPath), 'accumulation-entries.json');
  }

  private projectPromotionsFile(rootPath: string) {
    return path.join(this.projectRootDir(rootPath), 'promotion-drafts.json');
  }

  private projectKnowledgeGraphFile(rootPath: string) {
    return path.join(this.projectRootDir(rootPath), 'knowledge-graph.json');
  }
}
