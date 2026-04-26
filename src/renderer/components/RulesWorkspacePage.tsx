import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { collectKnowledgeGraphRelations, findKnowledgeGraphPath } from '../../shared/project-knowledge-graph';
import { resolveEffectiveRulesFromSnapshot } from '../../shared/rule-resolution';
import type {
  KnowledgeLinkNode,
  PlatformAssets,
  RuleDefinition,
  RuleScope,
  RulesDistillationSnapshot
} from '../../shared/types';
import { KnowledgeGraphCanvas } from './KnowledgeGraphCanvas';

type RulesWorkspacePageProps = {
  projectName?: string;
  snapshot: RulesDistillationSnapshot;
  platform: PlatformAssets | null;
  onSaveRule: (rule: Partial<RuleDefinition> & Pick<RuleDefinition, 'name' | 'body' | 'scope'>) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
  onSetRuleEnabled: (ruleId: string, enabled: boolean) => Promise<void>;
  onSaveAccumulationEntry: (entry: Record<string, unknown>) => Promise<void>;
  onDeleteAccumulationEntry: (entryId: string) => Promise<void>;
  onCreatePromotionDraft: (entryId: string, targetKind: 'rule' | 'skill' | 'knowledge', proposedName?: string) => Promise<void>;
  onApplyPromotionDraft: (draftId: string, reviewNote?: string) => Promise<void>;
  onImportRules: (scope: RuleScope) => void;
  onExportRules: (scope: RuleScope) => void;
  onOpenKnowledgeNode?: (node: KnowledgeLinkNode) => void;
  onClose: () => void;
};

const graphKinds: KnowledgeLinkNode['kind'][] = [
  'flow',
  'artifact',
  'document',
  'rule',
  'accumulation',
  'promotion',
  'knowledge',
  'skill',
  'run'
];

function scopeLabel(scope: RuleScope) {
  switch (scope) {
    case 'global':
      return '全局';
    case 'project':
      return '工程';
    case 'node':
      return '节点';
    default:
      return scope;
  }
}

function graphKindLabel(kind: KnowledgeLinkNode['kind']) {
  switch (kind) {
    case 'flow':
      return '流程';
    case 'artifact':
      return '工件';
    case 'document':
      return '文档';
    case 'rule':
      return '规则';
    case 'accumulation':
      return '沉淀';
    case 'promotion':
      return '草案';
    case 'knowledge':
      return '知识';
    case 'skill':
      return 'Skill';
    case 'run':
      return '运行';
    default:
      return kind;
  }
}

function graphStatusLabel(status?: KnowledgeLinkNode['status']) {
  switch (status) {
    case 'accepted':
      return '已接受';
    case 'draft':
      return '草稿';
    case 'archived':
      return '归档';
    default:
      return '活跃';
  }
}

function createGraphKindFilters() {
  return {
    flow: true,
    artifact: true,
    document: true,
    rule: true,
    accumulation: true,
    promotion: true,
    knowledge: true,
    skill: true,
    run: true
  } satisfies Record<KnowledgeLinkNode['kind'], boolean>;
}

function canOpenKnowledgeNode(node: KnowledgeLinkNode | null) {
  if (!node) return false;
  return node.kind === 'document' || node.kind === 'artifact' || node.kind === 'flow' || node.kind === 'skill';
}

export function RulesWorkspacePage(props: RulesWorkspacePageProps) {
  const {
    projectName,
    snapshot,
    platform,
    onSaveRule,
    onDeleteRule,
    onSetRuleEnabled,
    onSaveAccumulationEntry,
    onDeleteAccumulationEntry,
    onCreatePromotionDraft,
    onApplyPromotionDraft,
    onImportRules,
    onExportRules,
    onOpenKnowledgeNode,
    onClose
  } = props;
  const projectAvailable = Boolean(projectName);
  const [scope, setScope] = useState<RuleScope>('global');
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftTargetKey, setDraftTargetKey] = useState('');
  const [draftAppliesTo, setDraftAppliesTo] = useState<'all' | 'bound-only'>('all');
  const [draftCategory, setDraftCategory] = useState<RuleDefinition['category']>('style');
  const [draftFlowId, setDraftFlowId] = useState('');
  const [draftNodeId, setDraftNodeId] = useState('');
  const [accumulationTitle, setAccumulationTitle] = useState('');
  const [accumulationSummary, setAccumulationSummary] = useState('');
  const [accumulationDetails, setAccumulationDetails] = useState('');
  const [accumulationCategory, setAccumulationCategory] = useState<'writing-pattern' | 'project-decision' | 'domain-knowledge' | 'tooling' | 'risk' | 'quality'>('writing-pattern');
  const [graphQuery, setGraphQuery] = useState('');
  const [graphKindFilters, setGraphKindFilters] = useState<Record<KnowledgeLinkNode['kind'], boolean>>(createGraphKindFilters);
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState('');
  const [pathStartId, setPathStartId] = useState('');
  const [pathEndId, setPathEndId] = useState('');

  const visibleRules = useMemo(() => {
    if (scope === 'global') return snapshot.globalRules;
    if (scope === 'project') return snapshot.projectRules;
    return snapshot.nodeRules;
  }, [scope, snapshot.globalRules, snapshot.nodeRules, snapshot.projectRules]);

  const baseConflicts = useMemo(
    () => resolveEffectiveRulesFromSnapshot(snapshot, {}),
    [snapshot]
  );

  const nodeOptions = useMemo(() => {
    if (!draftFlowId) return [];
    const flow = [...(platform?.flows ?? []), ...(platform?.subflows ?? [])].find((item) => item.id === draftFlowId);
    return flow?.nodes ?? [];
  }, [draftFlowId, platform?.flows, platform?.subflows]);

  const graphNodesById = useMemo(
    () => new Map(snapshot.knowledgeGraph.nodes.map((node) => [node.id, node])),
    [snapshot.knowledgeGraph.nodes]
  );

  const visibleGraphNodes = useMemo(() => {
    const normalizedQuery = graphQuery.trim().toLowerCase();
    return [...snapshot.knowledgeGraph.nodes]
      .filter((node) => graphKindFilters[node.kind])
      .filter((node) => {
        if (!normalizedQuery) return true;
        const haystack = [
          node.title,
          node.summary,
          node.sourceId ?? '',
          ...Object.values(node.metadata ?? {})
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) =>
        left.title.localeCompare(right.title, 'zh-CN') || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
      );
  }, [graphKindFilters, graphQuery, snapshot.knowledgeGraph.nodes]);

  const selectedGraphNode = useMemo(
    () => graphNodesById.get(selectedGraphNodeId) ?? visibleGraphNodes[0] ?? null,
    [graphNodesById, selectedGraphNodeId, visibleGraphNodes]
  );

  const graphRelations = useMemo(
    () => (selectedGraphNode ? collectKnowledgeGraphRelations(snapshot.knowledgeGraph, selectedGraphNode.id) : []),
    [selectedGraphNode, snapshot.knowledgeGraph]
  );

  const pathStartNode = pathStartId ? graphNodesById.get(pathStartId) ?? null : null;
  const pathEndNode = pathEndId ? graphNodesById.get(pathEndId) ?? null : null;
  const graphPath = useMemo(
    () => (pathStartId && pathEndId ? findKnowledgeGraphPath(snapshot.knowledgeGraph, pathStartId, pathEndId) : null),
    [pathEndId, pathStartId, snapshot.knowledgeGraph]
  );

  useEffect(() => {
    if (scope !== 'node') return;
    if (!platform?.flows.length && !platform?.subflows.length) {
      setDraftFlowId('');
      setDraftNodeId('');
      return;
    }
    const flowId = draftFlowId || platform.flows[0]?.id || platform.subflows[0]?.id || '';
    if (flowId !== draftFlowId) {
      setDraftFlowId(flowId);
      return;
    }
    const nodeId = draftNodeId || nodeOptions[0]?.id || '';
    if (nodeId !== draftNodeId) {
      setDraftNodeId(nodeId);
    }
  }, [draftFlowId, draftNodeId, nodeOptions, platform?.flows, platform?.subflows, scope]);

  useEffect(() => {
    if (!visibleGraphNodes.length) {
      if (selectedGraphNodeId) {
        setSelectedGraphNodeId('');
      }
      return;
    }
    if (!visibleGraphNodes.some((node) => node.id === selectedGraphNodeId)) {
      setSelectedGraphNodeId(visibleGraphNodes[0]!.id);
    }
  }, [selectedGraphNodeId, visibleGraphNodes]);

  return (
    <div className="resource-center-page rules-workspace-page" data-testid="rules-workspace">
      <section className="document-workspace-bar">
        <div className="document-workspace-copy">
          <div className="section-kicker">规则与沉淀中心</div>
          <div className="document-workspace-headline">
            <strong>{projectName ? `${projectName} 规则工作台` : '全局规则工作台'}</strong>
            <span>规则、沉淀条目、提升草案和知识链接网络统一管理。</span>
          </div>
          <div className="document-workspace-meta">
            <span className="small-tag">全局 {snapshot.globalRules.length}</span>
            <span className="small-tag">工程 {snapshot.projectRules.length}</span>
            <span className="small-tag">节点 {snapshot.nodeRules.length}</span>
            <span className="small-tag">沉淀 {snapshot.accumulationEntries.length}</span>
            <span className="small-tag">草案 {snapshot.promotionDrafts.length}</span>
          </div>
        </div>
        <div className="document-workspace-actions">
          <button type="button" className="button-secondary icon-text" onClick={() => onImportRules(scope)}>
            <Upload size={14} strokeWidth={1.8} />
            <span>导入{scopeLabel(scope)}规则</span>
          </button>
          <button type="button" className="button-secondary icon-text" onClick={() => onExportRules(scope)}>
            <Download size={14} strokeWidth={1.8} />
            <span>导出{scopeLabel(scope)}规则</span>
          </button>
          <button type="button" className="button-secondary" onClick={onClose}>返回</button>
        </div>
      </section>

      <div className="segmented compact" style={{ marginBottom: 16 }}>
        <button type="button" className={scope === 'global' ? 'active' : ''} onClick={() => setScope('global')}>全局规则</button>
        <button type="button" className={scope === 'project' ? 'active' : ''} onClick={() => setScope('project')} disabled={!projectAvailable}>工程规则</button>
        <button type="button" className={scope === 'node' ? 'active' : ''} onClick={() => setScope('node')} disabled={!projectAvailable}>节点规则</button>
      </div>

      <div
        className="rules-workspace-grid"
        style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1.1fr) minmax(360px, 0.9fr)', gap: 16, alignItems: 'start' }}
      >
        <div className="rules-workspace-column rules-workspace-column-main" style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <section className="inspector-card" data-testid="rules-panel-list">
            <div className="section-kicker">{scopeLabel(scope)}规则</div>
            <div className="muted-line" style={{ marginBottom: 12 }}>
              当前生效冲突 {baseConflicts.conflicts.length} 项，覆盖链 {baseConflicts.overrides.length} 条。
            </div>
            <div className="asset-list">
              {visibleRules.length ? visibleRules.map((rule) => (
                <div key={rule.id} className="asset-list-item">
                  <div className="rules-entry-row">
                    <div className="rules-entry-copy">
                      <strong>{rule.name}</strong>
                      <div className="muted-line">{rule.description || rule.body.slice(0, 120)}</div>
                      <div className="tag-cloud compact">
                        <span className="small-tag">{scopeLabel(rule.scope)}</span>
                        <span className="small-tag">{rule.category}</span>
                        <span className="small-tag">{rule.appliesTo === 'all' ? '默认生效' : '节点绑定'}</span>
                        {rule.targetKey ? <span className="small-tag">target:{rule.targetKey}</span> : null}
                        {rule.nodeId ? <span className="small-tag">node:{rule.nodeId}</span> : null}
                      </div>
                    </div>
                    <div className="icon-actions rules-entry-actions">
                      <button type="button" className={`button-secondary ${rule.enabled ? 'active' : ''}`} onClick={() => void onSetRuleEnabled(rule.id, !rule.enabled)}>
                        {rule.enabled ? '停用' : '启用'}
                      </button>
                      <button type="button" className="button-secondary" onClick={() => void onDeleteRule(rule.id)} aria-label={`删除规则 ${rule.name}`}>
                        <Trash2 size={14} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                </div>
              )) : <div className="muted-line">当前作用域还没有规则。</div>}
            </div>
          </section>

          <section className="inspector-card">
            <div className="section-kicker">沉淀条目</div>
            <div className="asset-list">
              {snapshot.accumulationEntries.length ? snapshot.accumulationEntries.map((entry) => (
                <div key={entry.id} className="asset-list-item">
                  <div className="rules-entry-row">
                    <div className="rules-entry-copy">
                      <strong>{entry.title}</strong>
                      <div className="muted-line">{entry.summary}</div>
                      <div className="tag-cloud compact">
                        <span className="small-tag">{entry.category}</span>
                        <span className="small-tag">{entry.source}</span>
                        {entry.sourceDocumentPaths.slice(0, 2).map((documentPath) => (
                          <span key={documentPath} className="small-tag">{documentPath.split(/[\\/]/).pop()}</span>
                        ))}
                      </div>
                    </div>
                    <div className="icon-actions rules-entry-actions">
                      <button type="button" className="button-secondary" onClick={() => void onCreatePromotionDraft(entry.id, 'rule', `${entry.title} 规则`)}>升为规则</button>
                      <button type="button" className="button-secondary" onClick={() => void onCreatePromotionDraft(entry.id, 'knowledge', `${entry.title} 知识`)}>升为知识</button>
                      <button type="button" className="button-secondary" onClick={() => void onCreatePromotionDraft(entry.id, 'skill', `${entry.title} Skill`)}>升为Skill</button>
                      <button type="button" className="button-secondary" onClick={() => void onDeleteAccumulationEntry(entry.id)} aria-label={`删除沉淀 ${entry.title}`}>
                        <Trash2 size={14} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                </div>
              )) : <div className="muted-line">当前工程还没有沉淀条目。</div>}
            </div>
          </section>

          <section className="inspector-card">
            <div className="section-kicker">提升草案</div>
            <div className="asset-list">
              {snapshot.promotionDrafts.length ? snapshot.promotionDrafts.map((draft) => (
                <div key={draft.id} className="asset-list-item">
                  <strong>{draft.proposedName}</strong>
                  <div className="muted-line">{draft.summary}</div>
                  <div className="tag-cloud compact">
                    <span className="small-tag">{draft.targetKind}</span>
                    <span className="small-tag">{draft.status}</span>
                    {draft.appliedSkillId ? <span className="small-tag">Skill:{draft.appliedSkillId}</span> : null}
                    {draft.appliedRuleId ? <span className="small-tag">Rule:{draft.appliedRuleId}</span> : null}
                    {draft.appliedKnowledgeNodeId ? <span className="small-tag">Knowledge</span> : null}
                  </div>
                  {draft.appliedSkillPackagePath ? <div className="muted-line">包路径：{draft.appliedSkillPackagePath}</div> : null}
                  {draft.status === 'draft' ? (
                    <button type="button" className="button-secondary" onClick={() => void onApplyPromotionDraft(draft.id)}>
                      接受草案
                    </button>
                  ) : null}
                </div>
              )) : <div className="muted-line">当前没有待审的提升草案。</div>}
            </div>
          </section>

          <section className="inspector-card" data-testid="knowledge-graph-panel">
            <div className="section-kicker">知识网络导航</div>
            <div className="muted-line" style={{ marginBottom: 12 }}>
              知识网络节点 {snapshot.knowledgeGraph.nodes.length} 个，连接 {snapshot.knowledgeGraph.edges.length} 条。
            </div>
            <div className="form-grid compact-form">
              <label className="full-span">
                搜索对象
                <input aria-label="搜索对象" value={graphQuery} onChange={(event) => setGraphQuery(event.target.value)} placeholder="搜索流程、工件、规则、沉淀或 Skill" />
              </label>
            </div>
            <div className="tag-cloud compact rules-graph-filter-bar">
              {graphKinds.map((kind) => (
                <button key={kind} type="button" className={`button-secondary ${graphKindFilters[kind] ? 'active' : ''}`} onClick={() => setGraphKindFilters((current) => ({ ...current, [kind]: !current[kind] }))}>
                  {graphKindLabel(kind)}
                </button>
              ))}
            </div>
            <KnowledgeGraphCanvas
              selectedNode={selectedGraphNode}
              relations={graphRelations}
              path={graphPath}
              onSelectNode={setSelectedGraphNodeId}
            />
            <div className="rules-graph-layout">
              <div className="asset-list rules-graph-node-list">
                {visibleGraphNodes.length ? visibleGraphNodes.map((node) => (
                  <button key={node.id} type="button" className={`asset-list-item rules-graph-node ${selectedGraphNode?.id === node.id ? 'selected' : ''}`} onClick={() => setSelectedGraphNodeId(node.id)}>
                    <div className="list-card-header">
                      <div>
                        <strong>{node.title}</strong>
                        <div className="muted-line">{graphKindLabel(node.kind)}</div>
                      </div>
                      <span className="small-tag">{graphStatusLabel(node.status)}</span>
                    </div>
                    <div className="muted-line">{node.summary}</div>
                  </button>
                )) : <div className="muted-line">没有匹配的知识对象。</div>}
              </div>
              <div className="rules-graph-detail">
                {selectedGraphNode ? (
                  <>
                    <div className="section-kicker">对象详情</div>
                    <div className="list-card">
                      <div className="list-card-header">
                        <div>
                          <strong>{selectedGraphNode.title}</strong>
                          <div className="muted-line">{graphKindLabel(selectedGraphNode.kind)}</div>
                        </div>
                        <span className="small-tag">{graphStatusLabel(selectedGraphNode.status)}</span>
                      </div>
                      <div className="muted-line">{selectedGraphNode.summary}</div>
                      {selectedGraphNode.metadata ? (
                        <div className="tag-cloud compact">
                          {Object.entries(selectedGraphNode.metadata).map(([key, value]) => (
                            <span key={`${selectedGraphNode.id}:${key}`} className="small-tag">{key}:{value}</span>
                          ))}
                        </div>
                      ) : null}
                        <div className="context-inline-actions">
                          {canOpenKnowledgeNode(selectedGraphNode) ? (
                            <button type="button" className="button-secondary" onClick={() => void onOpenKnowledgeNode?.(selectedGraphNode)}>
                              打开对象
                            </button>
                          ) : null}
                        <button type="button" className={`button-secondary ${pathStartId === selectedGraphNode.id ? 'active' : ''}`} onClick={() => setPathStartId(selectedGraphNode.id)}>设为起点</button>
                        <button type="button" className={`button-secondary ${pathEndId === selectedGraphNode.id ? 'active' : ''}`} onClick={() => setPathEndId(selectedGraphNode.id)}>设为终点</button>
                        {(pathStartId || pathEndId) ? <button type="button" className="button-secondary" onClick={() => { setPathStartId(''); setPathEndId(''); }}>清空路径</button> : null}
                      </div>
                    </div>
                    <div className="section-kicker">直接关系</div>
                    <div className="asset-list">
                      {graphRelations.length ? graphRelations.map((relation) => (
                        <div key={`${relation.edge.id}:${relation.peerNode.id}`} className="asset-list-item">
                          <strong>{relation.peerNode.title}</strong>
                          <div className="muted-line">{relation.direction === 'outbound' ? '出链' : '入链'} · {relation.edge.label || relation.edge.type}</div>
                          <div className="tag-cloud compact">
                            <span className="small-tag">{graphKindLabel(relation.peerNode.kind)}</span>
                            <span className="small-tag">{relation.edge.type}</span>
                          </div>
                          <div className="context-inline-actions">
                            <button type="button" className="button-secondary" onClick={() => setSelectedGraphNodeId(relation.peerNode.id)}>
                              查看节点
                            </button>
                            {canOpenKnowledgeNode(relation.peerNode) ? (
                              <button type="button" className="button-secondary" onClick={() => void onOpenKnowledgeNode?.(relation.peerNode)}>
                                打开对象
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )) : <div className="muted-line">当前对象还没有可展示的直接关系。</div>}
                    </div>
                  </>
                ) : <div className="muted-line">选择一个对象查看详情。</div>}
                <div className="section-kicker">路径导航</div>
                <div className="tag-cloud compact">
                  <span className="small-tag">起点：{pathStartNode?.title ?? '未选择'}</span>
                  <span className="small-tag">终点：{pathEndNode?.title ?? '未选择'}</span>
                  {(pathStartNode && pathEndNode) ? <button type="button" className="button-secondary" onClick={() => { setPathStartId(pathEndNode.id); setPathEndId(pathStartNode.id); }}>交换</button> : null}
                </div>
                <div className="asset-list" data-testid="knowledge-graph-path">
                  {!pathStartNode || !pathEndNode ? (
                    <div className="muted-line">先从对象详情里分别设置起点和终点。</div>
                  ) : graphPath ? (
                    graphPath.steps.map((step, index) => (
                      <div key={`${step.edge.id}:${index}`} className="asset-list-item">
                        <strong>{step.fromNode.title}</strong>
                        <div className="muted-line">{step.direction === 'outbound' ? `${step.edge.label || step.edge.type} -> ${step.toNode.title}` : `${step.edge.label || step.edge.type} <- ${step.toNode.title}`}</div>
                        <div className="tag-cloud compact">
                          <span className="small-tag">{graphKindLabel(step.toNode.kind)}</span>
                          <span className="small-tag">{step.edge.type}</span>
                        </div>
                        <div className="context-inline-actions">
                          <button type="button" className="button-secondary" onClick={() => setSelectedGraphNodeId(step.toNode.id)}>
                            查看节点
                          </button>
                          {canOpenKnowledgeNode(step.toNode) ? (
                            <button type="button" className="button-secondary" onClick={() => void onOpenKnowledgeNode?.(step.toNode)}>
                              打开对象
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="muted-line">当前两者之间没有可解释的关系路径。</div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="rules-workspace-column rules-workspace-column-side" style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <section className="inspector-card" data-testid="rules-panel-create-rule">
            <div className="section-kicker">新增规则</div>
            <div className="form-grid">
              <label>
                规则名称
                <input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="例如：输出必须保留标题层级" />
              </label>
              <label>
                规则说明
                <input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} placeholder="对这条规则的简短解释" />
              </label>
              <label>
                分类
                <select value={draftCategory} onChange={(event) => setDraftCategory(event.target.value as RuleDefinition['category'])}>
                  <option value="style">style</option>
                  <option value="quality">quality</option>
                  <option value="safety">safety</option>
                  <option value="structure">structure</option>
                  <option value="domain">domain</option>
                </select>
              </label>
              <label>
                作用方式
                <select value={draftAppliesTo} onChange={(event) => setDraftAppliesTo(event.target.value as 'all' | 'bound-only')}>
                  <option value="all">默认生效</option>
                  <option value="bound-only">仅绑定节点生效</option>
                </select>
              </label>
              <label>
                覆盖目标键
                <input value={draftTargetKey} onChange={(event) => setDraftTargetKey(event.target.value)} placeholder="例如：writing-style / output-format" />
              </label>
              {scope === 'node' ? (
                <>
                  <label>
                    所属流程
                    <select value={draftFlowId} onChange={(event) => setDraftFlowId(event.target.value)}>
                      <option value="">选择流程</option>
                      {[...(platform?.flows ?? []), ...(platform?.subflows ?? [])].map((flow) => (
                        <option key={flow.id} value={flow.id}>{flow.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    所属节点
                    <select value={draftNodeId} onChange={(event) => setDraftNodeId(event.target.value)}>
                      <option value="">选择节点</option>
                      {nodeOptions.map((node) => (
                        <option key={node.id} value={node.id}>{node.data.label}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
              <label className="full-span">
                规则正文
                <textarea value={draftBody} onChange={(event) => setDraftBody(event.target.value)} placeholder="写清楚这条规则要求 AI 或节点必须遵守什么。" />
              </label>
            </div>
            <button type="button" className="button-primary icon-text" disabled={!draftName.trim() || !draftBody.trim() || (scope === 'node' && (!draftFlowId || !draftNodeId))} onClick={() => {
              void onSaveRule({
                name: draftName,
                description: draftDescription,
                body: draftBody,
                scope,
                category: draftCategory,
                appliesTo: draftAppliesTo,
                targetKey: draftTargetKey,
                flowId: scope === 'node' ? draftFlowId : undefined,
                nodeId: scope === 'node' ? draftNodeId : undefined
              }).then(() => {
                setDraftName('');
                setDraftDescription('');
                setDraftBody('');
                setDraftTargetKey('');
              });
            }}>
              <Plus size={14} strokeWidth={1.8} />
              <span>保存规则</span>
            </button>
          </section>

          <section className="inspector-card" data-testid="rules-panel-create-accumulation">
            <div className="section-kicker">新增沉淀条目</div>
            <div className="form-grid">
              <label>
                标题
                <input value={accumulationTitle} onChange={(event) => setAccumulationTitle(event.target.value)} placeholder="例如：评审反馈归纳" />
              </label>
              <label>
                分类
                <select value={accumulationCategory} onChange={(event) => setAccumulationCategory(event.target.value as typeof accumulationCategory)}>
                  <option value="writing-pattern">writing-pattern</option>
                  <option value="project-decision">project-decision</option>
                  <option value="domain-knowledge">domain-knowledge</option>
                  <option value="tooling">tooling</option>
                  <option value="risk">risk</option>
                  <option value="quality">quality</option>
                </select>
              </label>
              <label className="full-span">
                摘要
                <textarea value={accumulationSummary} onChange={(event) => setAccumulationSummary(event.target.value)} placeholder="概括这条沉淀的核心内容。" />
              </label>
              <label className="full-span">
                详细内容
                <textarea value={accumulationDetails} onChange={(event) => setAccumulationDetails(event.target.value)} placeholder="补充上下文、适用条件或原始观察。" />
              </label>
            </div>
            <button type="button" className="button-primary" disabled={!projectAvailable || !accumulationTitle.trim() || !accumulationSummary.trim()} onClick={() => {
              void onSaveAccumulationEntry({
                title: accumulationTitle,
                summary: accumulationSummary,
                details: accumulationDetails,
                category: accumulationCategory,
                source: 'user'
              }).then(() => {
                setAccumulationTitle('');
                setAccumulationSummary('');
                setAccumulationDetails('');
              });
            }}>
              保存沉淀条目
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
