import { PlugZap, RefreshCw, Search, ShieldAlert, Wrench } from 'lucide-react';
import type { ResourceDescriptor, ResourceKind } from '../../shared/types';
import { EmptyBlock } from './ShellPrimitives';

type ResourceSourceFilter = 'all' | 'builtin' | 'local' | 'remote';

function sourceLabel(source: ResourceSourceFilter | ResourceDescriptor['source']) {
  switch (source) {
    case 'builtin':
      return '内置';
    case 'local':
      return '本地';
    case 'remote':
      return '远程';
    default:
      return '全部来源';
  }
}

function kindLabel(kind: ResourceKind | 'all') {
  switch (kind) {
    case 'template':
      return '模板';
    case 'skill':
      return 'Skill';
    case 'role-package':
      return '角色包';
    case 'connector':
      return '连接';
    default:
      return '全部资源';
  }
}

function importLabel(kind: ResourceKind | 'all') {
  switch (kind) {
    case 'skill':
      return '导入本地 Skill';
    case 'role-package':
      return '导入本地角色包';
    case 'connector':
      return '连接不支持导入包';
    case 'template':
    default:
      return '导入本地模板';
  }
}

function downloadLabel(kind: ResourceKind | 'all') {
  switch (kind) {
    case 'skill':
      return '下载远程 Skill';
    case 'role-package':
      return '下载远程角色包';
    case 'connector':
      return '连接不支持远程包下载';
    case 'template':
    default:
      return '下载远程模板';
  }
}

function matchesQuery(resource: ResourceDescriptor, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    resource.name,
    resource.description,
    resource.kind,
    resource.source,
    resource.health || '',
    resource.issueMessage || '',
    ...resource.tags,
    ...resource.metadata.map((item) => `${item.label} ${item.value}`)
  ].join(' ').toLowerCase().includes(normalized);
}

function groupRecentResources(resources: ResourceDescriptor[], recentResourceIds: string[]) {
  const seen = new Set<string>();
  return recentResourceIds
    .filter((resourceKey) => {
      if (seen.has(resourceKey)) return false;
      seen.add(resourceKey);
      return true;
    })
    .map((resourceKey) => resources.find((item) => `${item.kind}:${item.id}` === resourceKey) ?? null)
    .filter((item): item is ResourceDescriptor => Boolean(item));
}

function trustLabel(resource: ResourceDescriptor | null) {
  if (!resource) return '-';
  if (resource.trust === 'trusted') return '已校验';
  if (resource.trust === 'blocked') return '已阻断';
  if (resource.trust === 'review') return '待复核';
  return '未知';
}

function compatibilityLabel(resource: ResourceDescriptor | null) {
  if (!resource) return '-';
  if (resource.compatibility === 'current') return '兼容当前版本';
  if (resource.compatibility === 'incompatible') return '版本不兼容';
  if (resource.compatibility === 'review') return '兼容性待验证';
  return '兼容性未知';
}

function healthLabel(resource: ResourceDescriptor | null) {
  if (!resource) return '';
  if (resource.health === 'corrupt') return '已损坏';
  if (resource.health === 'error') return '错误';
  if (resource.health === 'warning') return '待检查';
  if (resource.health === 'update-available') return '可更新';
  return '健康';
}

function resourceUnavailableReason(resource: ResourceDescriptor | null) {
  if (!resource || resource.kind !== 'template') return '';
  if (resource.health === 'corrupt') return resource.issueMessage || '模板包已损坏，请先修复。';
  if (resource.compatibility === 'incompatible') return '该模板与当前应用版本不兼容。';
  if (resource.trust === 'blocked') return resource.issueMessage || '该模板当前被阻断使用。';
  return '';
}

function metadataValue(resource: ResourceDescriptor | null, labels: string[]) {
  if (!resource) return '';
  const match = resource.metadata.find((item) =>
    labels.some((label) => item.label.toLowerCase() === label.toLowerCase())
  );
  return match?.value ?? '';
}

export function ResourceCenterPage({
  resources,
  recentResourceIds,
  selectedResourceId,
  activeKind,
  activeSource,
  query,
  status,
  onKindChange,
  onSourceChange,
  onQueryChange,
  onSelect,
  onImportLocal,
  onOpenInstallDialog,
  onUseTemplateInProject,
  onStartDraftFromTemplate,
  onCheckTemplateUpdate,
  onRepairTemplate,
  onUpdateTemplate,
  onTestConnector,
  onClose
}: {
  resources: ResourceDescriptor[];
  recentResourceIds: string[];
  selectedResourceId: string;
  activeKind: ResourceKind | 'all';
  activeSource: ResourceSourceFilter;
  query: string;
  status: string;
  onKindChange: (kind: ResourceKind | 'all') => void;
  onSourceChange: (source: ResourceSourceFilter) => void;
  onQueryChange: (value: string) => void;
  onSelect: (resourceId: string) => void;
  onImportLocal: (kind: ResourceKind | 'all') => void;
  onOpenInstallDialog: (kind: ResourceKind | 'all') => void;
  onUseTemplateInProject: (templateId: string) => void;
  onStartDraftFromTemplate: (templateId: string) => void;
  onCheckTemplateUpdate: (templateId: string) => void;
  onRepairTemplate: (templateId: string) => void;
  onUpdateTemplate: (templateId: string) => void;
  onTestConnector: (connectorId: string) => Promise<{ ok: boolean; message: string }>;
  onClose: () => void;
}) {
  const filteredResources = resources.filter((item) =>
    (activeKind === 'all' || item.kind === activeKind)
    && (activeSource === 'all' || item.source === activeSource)
    && matchesQuery(item, query)
  );
  const recentResources = groupRecentResources(resources, recentResourceIds)
    .filter((item) => activeKind === 'all' || item.kind === activeKind)
    .filter((item) => activeSource === 'all' || item.source === activeSource)
    .filter((item) => matchesQuery(item, query));
  const selected = resources.find((item) => `${item.kind}:${item.id}` === selectedResourceId)
    ?? filteredResources[0]
    ?? null;
  const unavailableReason = resourceUnavailableReason(selected);
  const showPackageActions = activeKind !== 'connector';
  const selectedTypeLabel = activeKind === 'all'
    ? kindLabel(selected?.kind ?? 'all')
    : kindLabel(activeKind);
  const listSearchSummary = query.trim()
    || filteredResources.slice(0, 4).map((item) => item.name).join(' / ')
    || '软件工厂 / GStack / 小说创作 / 旅行攻略';
  const resourceTypeCards: Array<{ kind: ResourceKind; title: string; note: string }> = [
    { kind: 'template', title: '外部模板', note: '开始编排、从模板创建工程、查看 Flow 与输出结构。' },
    { kind: 'skill', title: '外部 Skill', note: '安装能力、管理启用范围、补充审查动作与输出约束。' },
    { kind: 'role-package', title: '角色包', note: '维护角色集、绑定边界与工程内默认角色入口。' },
    { kind: 'connector', title: '连接', note: '检查授权、运行状态和外部服务接入健康度。' }
  ];
  const detailSections = selected ? [
    {
      label: selected.kind === 'template' ? '默认 Flow' : selected.kind === 'skill' ? '默认能力' : selected.kind === 'connector' ? '默认连接' : '默认角色包',
      title: metadataValue(selected, ['默认流程', 'default flow', '默认能力']) || selected.tags.slice(0, 3).join(' / ') || selected.name,
      text: selected.description
    },
    {
      label: '输出结构',
      title: metadataValue(selected, ['输出结构', '目录', 'outputs', 'manifest']) || selected.metadata.slice(0, 2).map((item) => item.value).join(' / ') || sourceLabel(selected.source),
      text: unavailableReason || selected.issueMessage || '当前资源保留元数据、标签和状态，并把导入、下载、修复和更新放在同一页承接。'
    },
    {
      label: '适合场景',
      title: selected.tags.slice(0, 4).join('、') || selectedTypeLabel,
      text: `适合需要 ${kindLabel(selected.kind)} 能力接入、版本校验和统一入口管理的工作流。`
    },
    {
      label: selected.kind === 'connector' ? '连接诊断' : '建议搭配',
      title: metadataValue(selected, ['skill', '建议搭配', 'recommended skill']) || selected.sourceLabel || trustLabel(selected),
      text: selected.kind === 'connector'
        ? '连接资源需要把授权状态、最近诊断和运行健康度集中在同一页查看。'
        : '模板、Skill、角色包和连接共享一套壳层，不再分裂为多个独立入口。'
    }
  ] : [];

  return (
    <section className="resource-center-page center-workspace" data-testid="resource-center-page">
      <section className="center-toolbar resource-toolbar">
        <div className="resource-toolbar-actions">
          <button type="button" className="ghost-action" onClick={onClose}>返回工作台</button>
          {showPackageActions ? (
            <>
              <button
                type="button"
                className="ghost-action"
                title={importLabel(activeKind)}
                aria-label={importLabel(activeKind)}
                onClick={() => onImportLocal(activeKind)}
              >
                {importLabel(activeKind)}
              </button>
              <button
                type="button"
                className="ghost-action"
                title={downloadLabel(activeKind)}
                aria-label={downloadLabel(activeKind)}
                onClick={() => onOpenInstallDialog(activeKind)}
              >
                {downloadLabel(activeKind)}
              </button>
            </>
          ) : null}
        </div>
      </section>

      <div className="center-grid resource-center-grid">
        <aside className="resource-type-pane">
          <div className="resource-type-group">
            <div>
              <div className="panel-kicker">首层类型</div>
              <strong>当前支持</strong>
            </div>
            {resourceTypeCards.map((item) => (
              <button
                key={item.kind}
                type="button"
                className={`resource-type-item ${activeKind === item.kind ? 'active' : ''}`}
                onClick={() => onKindChange(item.kind)}
              >
                <strong>{item.title}</strong>
                <span>{item.note}</span>
              </button>
            ))}
          </div>

          <div className="resource-type-group resource-type-group-muted">
            <div>
              <div className="panel-kicker">未来扩展</div>
            </div>
            <button type="button" className="resource-type-item disabled" disabled>
              <strong>外部文档</strong>
              <span>未来用于接入文档包、知识快照和参考资料集。</span>
            </button>
            <button type="button" className="resource-type-item disabled" disabled>
              <strong>外部角色</strong>
              <span>未来用于接入角色包、权限边界和角色设定。</span>
            </button>
          </div>
        </aside>

        <aside className="resource-list-pane">
          <label className="template-search-field resource-list-query">
            <Search size={14} strokeWidth={1.8} />
            <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索名称、标签、说明或能力" />
          </label>
          <div className="resource-list-controls template-center-toolbar">
            <div className="segmented compact" role="group" aria-label="资源类型筛选" data-testid="resource-kind-filter">
              <button type="button" className={activeKind === 'all' ? 'active' : ''} aria-pressed={activeKind === 'all'} data-testid="resource-kind-all" onClick={() => onKindChange('all')}>全部</button>
              <button type="button" className={activeKind === 'template' ? 'active' : ''} aria-pressed={activeKind === 'template'} data-testid="resource-kind-template" onClick={() => onKindChange('template')}>模板</button>
              <button type="button" className={activeKind === 'skill' ? 'active' : ''} aria-pressed={activeKind === 'skill'} data-testid="resource-kind-skill" onClick={() => onKindChange('skill')}>Skill</button>
              <button type="button" className={activeKind === 'role-package' ? 'active' : ''} aria-pressed={activeKind === 'role-package'} data-testid="resource-kind-role-package" onClick={() => onKindChange('role-package')}>角色包</button>
              <button type="button" className={activeKind === 'connector' ? 'active' : ''} aria-pressed={activeKind === 'connector'} data-testid="resource-kind-connector" onClick={() => onKindChange('connector')}>连接</button>
            </div>
            <select className="resource-source-select" value={activeSource} onChange={(event) => onSourceChange(event.target.value as ResourceSourceFilter)}>
              <option value="all">全部来源</option>
              <option value="builtin">内置</option>
              <option value="local">本地</option>
              <option value="remote">远程</option>
            </select>
          </div>
          <div className="search-input resource-list-search">{listSearchSummary}</div>
          <div className="list-pane-head">
            <div>
              <div className="panel-kicker">当前类型</div>
              <strong>{selectedTypeLabel}</strong>
            </div>
            <span className="pane-meta">{filteredResources.length} 项</span>
          </div>
          {filteredResources.length ? (
            <div className="resource-list">
              {recentResources.length ? (
                <>
                  <div className="panel-kicker">最近命中</div>
                  {recentResources.map((resource) => (
                    <button
                      key={`recent-${resource.kind}:${resource.id}`}
                      type="button"
                      className={`resource-list-item template-list-item ${selectedResourceId === `${resource.kind}:${resource.id}` ? 'active' : ''}`}
                      data-resource-id={`${resource.kind}:${resource.id}`}
                      onClick={() => onSelect(`${resource.kind}:${resource.id}`)}
                    >
                      <strong>{resource.name}</strong>
                      <span>{resource.description}</span>
                    </button>
                  ))}
                </>
              ) : null}
              {recentResources.length ? <div className="panel-kicker">全部资源</div> : null}
              {filteredResources.map((resource) => (
                <button
                  key={`${resource.kind}:${resource.id}`}
                  type="button"
                  className={`resource-list-item template-list-item ${selectedResourceId === `${resource.kind}:${resource.id}` ? 'active' : ''}`}
                  data-resource-id={`${resource.kind}:${resource.id}`}
                  onClick={() => onSelect(`${resource.kind}:${resource.id}`)}
                >
                  <strong>{resource.name}</strong>
                  <span>{resource.description}</span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyBlock title="没有匹配资源" description="调整搜索词或筛选条件，或者通过上方动作导入本地包 / 下载远程包。" />
          )}
        </aside>

        <section className="resource-detail-pane">
          <div className="detail-head">
            <div>
              <div className="panel-kicker">当前选中资源</div>
              <h3>{selected?.name ?? '尚未选择资源'}</h3>
              <p>{selected?.description ?? '左侧选择一个模板、Skill、角色包或连接后，这里会显示详细信息与下一步动作。'}</p>
            </div>
            <div className="detail-head-actions">
              <button type="button" className="ghost-action">查看详情</button>
              {selected?.kind === 'template' ? (
                <button
                  type="button"
                  className="ghost-action"
                  data-testid="resource-center-start-draft"
                  onClick={() => onStartDraftFromTemplate(selected.id)}
                  disabled={Boolean(unavailableReason)}
                >
                  开始编排
                </button>
              ) : selected?.kind === 'connector' ? (
                <button
                  type="button"
                  className="ghost-action"
                  data-testid="resource-center-test-connector"
                  onClick={() => void onTestConnector(selected.id)}
                >
                  检查连接
                </button>
              ) : (
                <button type="button" className="ghost-action" onClick={() => onImportLocal(selected?.kind ?? activeKind)}>导入资源</button>
              )}
              {selected?.kind === 'template' ? (
                <button
                  type="button"
                  className="primary-action small"
                  data-testid="resource-center-use-template"
                  onClick={() => onUseTemplateInProject(selected.id)}
                  disabled={Boolean(unavailableReason)}
                >
                  从模板创建工程
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-action small"
                  onClick={() => onOpenInstallDialog(selected?.kind ?? activeKind)}
                >
                  下载资源
                </button>
              )}
            </div>
          </div>

          <div className="detail-meta-grid">
            <div className="detail-meta-card">
              <span>来源</span>
              <strong>{selected ? sourceLabel(selected.source) : '-'}</strong>
            </div>
            <div className="detail-meta-card">
              <span>版本</span>
              <strong>{selected?.version ? `v${selected.version}` : '未标注'}</strong>
            </div>
            <div className="detail-meta-card">
              <span>信任</span>
              <strong>{trustLabel(selected)}</strong>
            </div>
            <div className="detail-meta-card">
              <span>兼容</span>
              <strong>{compatibilityLabel(selected)}</strong>
            </div>
          </div>

          <div className="detail-section-grid">
            {detailSections.map((section) => (
              <div key={section.label} className="detail-section-card">
                <span>{section.label}</span>
                <strong>{section.title}</strong>
                <p>{section.text}</p>
              </div>
            ))}
          </div>

          {selected?.kind === 'template' && unavailableReason ? (
            <div className="workspace-inline-note" data-testid="resource-center-template-blocked">
              <strong><ShieldAlert size={14} strokeWidth={1.8} /> 当前阻断</strong>
              <span>{unavailableReason}</span>
            </div>
          ) : null}

          {selected?.issueMessage && !unavailableReason ? (
            <div className="workspace-inline-note">
              <strong>{selected.health === 'corrupt' ? '损坏说明' : '状态说明'}</strong>
              <span>{selected.issueMessage}</span>
            </div>
          ) : null}

          {(selected?.kind === 'template' || selected?.kind === 'connector') ? (
            <div className="resource-detail-extra-actions">
              {selected?.kind === 'template' && (selected.source === 'remote' || selected.updatable) ? (
                <button
                  type="button"
                  className="button-secondary icon-text"
                  data-testid="resource-center-check-update"
                  onClick={() => onCheckTemplateUpdate(selected.id)}
                >
                  <RefreshCw size={14} strokeWidth={1.8} />
                  <span>检查更新</span>
                </button>
              ) : null}
              {selected?.kind === 'template' && selected.repairable ? (
                <button
                  type="button"
                  className="button-secondary icon-text"
                  data-testid="resource-center-repair-template"
                  onClick={() => onRepairTemplate(selected.id)}
                >
                  <Wrench size={14} strokeWidth={1.8} />
                  <span>修复模板</span>
                </button>
              ) : null}
              {selected?.kind === 'template' && (selected.updatable || selected.health === 'update-available') ? (
                <button
                  type="button"
                  className="button-secondary icon-text"
                  data-testid="resource-center-update-template"
                  onClick={() => onUpdateTemplate(selected.id)}
                >
                  <RefreshCw size={14} strokeWidth={1.8} />
                  <span>更新模板</span>
                </button>
              ) : null}
              {selected?.kind === 'connector' ? (
                <button
                  type="button"
                  className="button-secondary icon-text"
                  data-testid="resource-center-test-connector-secondary"
                  onClick={() => void onTestConnector(selected.id)}
                >
                  <PlugZap size={14} strokeWidth={1.8} />
                  <span>再次检查连接</span>
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="workspace-inline-note">
            <strong>当前状态</strong>
            <span>{status || '模板、Skill、角色包和连接共用一套资源页骨架；更深动作再进入导入、下载或诊断弹层。'}</span>
          </div>
        </section>
      </div>
    </section>
  );
}
