import { Download, FolderOpen, Search, X } from 'lucide-react';
import type { ProjectTemplateDefinition } from '../../shared/types';
import { EmptyBlock, IconButton, SidebarHeader } from './ShellPrimitives';

function groupRecentTemplates(templates: ProjectTemplateDefinition[], recentTemplateIds: string[]) {
  return recentTemplateIds
    .map((id) => templates.find((item) => item.id === id) ?? null)
    .filter((item): item is ProjectTemplateDefinition => Boolean(item));
}

function templateSourceLabel(template: ProjectTemplateDefinition) {
  if (template.source === 'builtin') return '内置模板';
  if (template.source === 'remote') return '远程模板';
  return '本地模板';
}

export function TemplateCenterPage({
  templates,
  recentTemplateIds,
  selectedTemplateId,
  query,
  status,
  onQueryChange,
  onSelect,
  onImportLocal,
  onOpenInstallDialog,
  onClose
}: {
  templates: ProjectTemplateDefinition[];
  recentTemplateIds: string[];
  selectedTemplateId: string;
  query: string;
  status: string;
  onQueryChange: (value: string) => void;
  onSelect: (templateId: string) => void;
  onImportLocal: () => void;
  onOpenInstallDialog: () => void;
  onClose: () => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTemplates = normalizedQuery
    ? templates.filter((item) =>
        [item.name, item.shortDescription, item.description, item.category, item.source]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : templates;
  const recentTemplates = groupRecentTemplates(templates, recentTemplateIds);
  const selected = templates.find((item) => item.id === selectedTemplateId) ?? visibleTemplates[0] ?? null;

  return (
    <section className="template-center-page" data-testid="template-center-page">
      <div className="template-center-page-shell">
        <SidebarHeader
          title="模板中心"
          description="搜索、导入、下载和复用模板。这里是模板入口，不再把模板塞进新建工程弹层。"
          actions={
            <>
              <IconButton title="导入本地模板" onClick={onImportLocal} icon={FolderOpen} />
              <IconButton title="下载远程模板" onClick={onOpenInstallDialog} icon={Download} />
              <IconButton title="返回" onClick={onClose} icon={X} />
            </>
          }
        />
        <div className="template-center-layout page">
          <section className="template-center-list">
            <div className="template-center-toolbar">
              <label className="template-search-field">
                <Search size={14} strokeWidth={1.8} />
                <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索模板名称、分类、场景或说明" />
              </label>
            </div>
            {recentTemplates.length ? (
              <div className="template-center-section">
                <div className="section-kicker">最近使用</div>
                <div className="template-list">
                  {recentTemplates.map((template) => (
                    <button
                      key={`recent-${template.id}`}
                      type="button"
                      className={`template-list-item ${selectedTemplateId === template.id ? 'active' : ''}`}
                      onClick={() => onSelect(template.id)}
                    >
                      <div className="template-list-item-head">
                        <strong>{template.name}</strong>
                        <span className="small-tag">最近</span>
                      </div>
                      <div className="muted-line">{template.shortDescription}</div>
                      <div className="muted-inline">{template.category}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="template-center-section">
              <div className="section-kicker">全部模板</div>
              {visibleTemplates.length ? (
                <div className="template-list">
                  {visibleTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={`template-list-item ${selectedTemplateId === template.id ? 'active' : ''}`}
                      onClick={() => onSelect(template.id)}
                    >
                      <div className="template-list-item-head">
                        <strong>{template.name}</strong>
                        <span className="small-tag">{template.source === 'builtin' ? '内置' : template.source === 'remote' ? '远程' : '本地'}</span>
                      </div>
                      <div className="muted-line">{template.shortDescription}</div>
                      <div className="muted-inline">{template.category}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyBlock title="没有匹配模板" description="调整搜索词，或使用右上角的导入/下载入口添加模板。" />
              )}
            </div>
          </section>
          <aside className="template-center-preview">
            <div className="template-summary-card">
              <div className="section-kicker">模板详情</div>
              {selected ? (
                <>
                  <strong>{selected.name}</strong>
                  <p>{selected.description}</p>
                  <div className="tag-cloud compact">
                    <span className="small-tag">{selected.category}</span>
                    <span className="small-tag">{templateSourceLabel(selected)}</span>
                    <span className="small-tag">{selected.requirementDocName}</span>
                    {selected.defaultFlowName ? <span className="small-tag">默认流程：{selected.defaultFlowName}</span> : null}
                  </div>
                  <div className="meta-list">
                    <div><span>主流程</span><strong>{selected.flowCount ?? 0}</strong></div>
                    <div><span>子流程</span><strong>{selected.subflowCount ?? 0}</strong></div>
                    <div><span>角色</span><strong>{selected.roleCount ?? 0}</strong></div>
                    <div><span>工件</span><strong>{selected.artifactCount ?? 0}</strong></div>
                  </div>
                  {selected.artifactPreview?.length ? (
                    <div className="tag-cloud compact">
                      {selected.artifactPreview.map((artifact) => <span key={artifact} className="small-tag">{artifact}</span>)}
                    </div>
                  ) : null}
                  <button type="button" className="button-primary full-width" onClick={() => onSelect(selected.id)}>使用这个模板</button>
                </>
              ) : (
                <p>尚未选择模板。</p>
              )}
            </div>
            <div className="template-summary-card">
              <div className="section-kicker">当前状态</div>
              <p>{status || '选择模板后会回到新建工程表单。模板导入和下载都收在右上角图标入口。'}</p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
