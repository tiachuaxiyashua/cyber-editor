import { Download, FolderOpen, Search, X } from 'lucide-react';
import type { ProjectTemplateDefinition } from '../../shared/types';
import { EmptyBlock, IconButton, SidebarHeader } from './ShellPrimitives';
import { OverlayPortal } from './OverlayPortal';

function groupRecentTemplates(templates: ProjectTemplateDefinition[], recentTemplateIds: string[]) {
  return recentTemplateIds
    .map((id) => templates.find((item) => item.id === id) ?? null)
    .filter((item): item is ProjectTemplateDefinition => Boolean(item));
}

export function TemplateCenterDialog({
  open,
  templates,
  recentTemplateIds,
  selectedTemplateId,
  query,
  packageUrl,
  status,
  onQueryChange,
  onPackageUrlChange,
  onSelect,
  onImportLocal,
  onInstallUrl,
  onClose
}: {
  open: boolean;
  templates: ProjectTemplateDefinition[];
  recentTemplateIds: string[];
  selectedTemplateId: string;
  query: string;
  packageUrl: string;
  status: string;
  onQueryChange: (value: string) => void;
  onPackageUrlChange: (value: string) => void;
  onSelect: (templateId: string) => void;
  onImportLocal: () => void;
  onInstallUrl: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
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
    <OverlayPortal>
      <div className="modal-backdrop">
        <div className="modal dialog-surface template-center-dialog" data-testid="template-center-dialog">
        <SidebarHeader
          title="模板中心"
          description="搜索、导入、下载和选择模板都在这里完成。"
          actions={<IconButton title="关闭模板中心" onClick={onClose} icon={X} />}
        />
        <div className="template-center-layout">
          <section className="template-center-list">
            <div className="template-center-toolbar">
              <label className="template-search-field">
                <Search size={14} strokeWidth={1.8} />
                <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索模板名称、分类或描述" />
              </label>
              <div className="icon-actions">
                <IconButton title="导入本地模板" onClick={onImportLocal} icon={FolderOpen} />
              </div>
            </div>
            <div className="template-center-install">
              <label className="template-url-field">
                <span>远程模板包地址</span>
                <input value={packageUrl} onChange={(event) => onPackageUrlChange(event.target.value)} placeholder="输入模板包地址后下载并安装" />
              </label>
              <button type="button" className="button-secondary icon-text" onClick={onInstallUrl}>
                <Download size={14} strokeWidth={1.8} />
                <span>下载模板</span>
              </button>
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
                <EmptyBlock title="没有匹配模板" description="调整搜索词，或通过左上角导入本地模板。" />
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
                    <span className="small-tag">{selected.source}</span>
                    <span className="small-tag">{selected.requirementDocName}</span>
                  </div>
                </>
              ) : (
                <p>尚未选择模板。</p>
              )}
            </div>
            <div className="template-summary-card">
              <div className="section-kicker">状态</div>
              <p>{status || '选择模板后会回填到新建工程表单中。'}</p>
            </div>
          </aside>
        </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
