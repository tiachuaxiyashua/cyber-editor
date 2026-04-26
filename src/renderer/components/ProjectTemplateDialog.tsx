import { AlertTriangle, FolderOpen, FolderPlus, LayoutTemplate, Plus, RefreshCw, ShieldAlert, X } from 'lucide-react';
import type { ProjectCreateValidation, ProjectTemplateDefinition } from '../../shared/types';

export type ProjectTemplateDraft = {
  name: string;
  locationPath: string;
  directoryMode: 'create-in-parent' | 'use-existing-directory';
  templateId: string;
};

function previewProjectPath(draft: ProjectTemplateDraft) {
  if (!draft.locationPath) return '';
  if (draft.directoryMode === 'use-existing-directory') return draft.locationPath;
  if (!draft.name.trim()) return draft.locationPath;
  const separator = draft.locationPath.includes('\\') ? '\\' : '/';
  return `${draft.locationPath}${separator}${draft.name.trim()}`;
}

function sourceLabel(template: ProjectTemplateDefinition) {
  if (template.source === 'builtin') return '内置';
  if (template.source === 'remote') return '远程';
  return '本地';
}

function trustLabel(template: ProjectTemplateDefinition | null) {
  if (!template) return '';
  if (template.trust === 'trusted') return '可信';
  if (template.trust === 'blocked') return '已阻断';
  if (template.trust === 'review') return '待复核';
  return '未知';
}

function compatibilityLabel(template: ProjectTemplateDefinition | null) {
  if (!template) return '';
  if (template.compatibility === 'current') return '兼容当前版本';
  if (template.compatibility === 'incompatible') return '版本不兼容';
  if (template.compatibility === 'review') return '兼容性待验证';
  return '兼容性未知';
}

function healthLabel(template: ProjectTemplateDefinition | null) {
  if (!template) return '';
  if (template.health === 'corrupt') return '模板损坏';
  if (template.health === 'update-available') return '可更新';
  return '健康';
}

function templateUnavailableReason(template: ProjectTemplateDefinition | null) {
  if (!template) return '未找到模板。';
  if (template.health === 'corrupt') return template.issueMessage || '模板包已损坏，请先修复后再创建工程。';
  if (template.compatibility === 'incompatible') return '该模板与当前应用版本不兼容，不能直接用于创建工程。';
  if (template.trust === 'blocked') return template.issueMessage || '该模板当前被阻断使用。';
  return '';
}

export function ProjectTemplateDialog({
  open,
  templates,
  selectedTemplateOverride,
  draft,
  status,
  validation,
  busy,
  onChange,
  onChooseLocation,
  onOpenTemplateCenter,
  onClose,
  onSubmit
}: {
  open: boolean;
  templates: ProjectTemplateDefinition[];
  selectedTemplateOverride?: ProjectTemplateDefinition | null;
  draft: ProjectTemplateDraft;
  status: string;
  validation?: ProjectCreateValidation | null;
  busy: boolean;
  onChange: (draft: ProjectTemplateDraft) => void;
  onChooseLocation: (mode: ProjectTemplateDraft['directoryMode']) => void;
  onOpenTemplateCenter: () => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;

  const selectedTemplate = selectedTemplateOverride
    ?? templates.find((item) => item.id === draft.templateId)
    ?? templates[0]
    ?? null;
  const unavailableReason = templateUnavailableReason(selectedTemplate);
  const finalPath = validation?.finalPath || previewProjectPath(draft);
  const validationIssues = validation?.issues ?? [];
  const submitDisabled = busy
    || !draft.name.trim()
    || !draft.locationPath
    || !selectedTemplate
    || Boolean(unavailableReason)
    || Boolean(validation && !validation.ok);

  return (
    <section className="project-template-page" data-testid="project-template-dialog">
      <div className="workspace-page-head project-template-head">
        <div className="workspace-page-copy">
          <div className="section-kicker">创建工程</div>
          <h1>从模板落地到真实目录</h1>
          <p>模板决定默认流程、工件目录和导出规则。导入、下载和更多筛选进入资源中心，不占用当前首屏决策位。</p>
        </div>
        <div className="workspace-page-actions">
          <button type="button" className="button-secondary icon-text" data-testid="project-dialog-open-resource-center" onClick={onOpenTemplateCenter}>
            <LayoutTemplate size={14} strokeWidth={1.8} />
            <span>打开资源中心</span>
          </button>
          <button type="button" className="button-ghost icon-text" data-testid="project-dialog-close" onClick={onClose}>
            <X size={14} strokeWidth={1.8} />
            <span>返回</span>
          </button>
        </div>
      </div>

      <div className="project-template-grid">
        <aside className="project-template-catalog">
          <div className="workspace-subhead">
            <div>
              <div className="section-kicker">模板列表</div>
              <strong>先定默认工作流</strong>
            </div>
            <span className="small-tag">{templates.length} 个模板</span>
          </div>
          <div className="template-list">
            {templates.map((template) => {
              const active = selectedTemplate?.id === template.id;
              const blocked = Boolean(templateUnavailableReason(template));
              return (
                <button
                  key={template.id}
                  type="button"
                  className={`template-list-item ${active ? 'active' : ''}`}
                  data-template-id={template.id}
                  onClick={() => onChange({ ...draft, templateId: template.id })}
                >
                  <div className="template-list-item-head">
                    <strong>{template.name}</strong>
                    <span className={`small-tag ${blocked ? 'state-bad' : template.health === 'update-available' ? 'state-warn' : ''}`}>
                      {healthLabel(template)}
                    </span>
                  </div>
                  <div className="muted-line">{template.shortDescription || template.description}</div>
                  <div className="tag-cloud compact">
                    <span className="small-tag">{sourceLabel(template)}</span>
                    <span className="small-tag">{template.category}</span>
                    {template.version ? <span className="small-tag">v{template.version}</span> : null}
                    {blocked ? <span className="small-tag state-bad">不可直接使用</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="project-template-main project-create-main">
          <div className="project-template-summary">
            <div className="workspace-subhead">
              <div>
                <div className="section-kicker">已选模板</div>
                <strong>{selectedTemplate?.name ?? '尚未选择模板'}</strong>
              </div>
              {selectedTemplate ? (
                <span className={`small-tag ${unavailableReason ? 'state-bad' : 'state-good'}`}>
                  {unavailableReason ? '不可创建' : '可创建'}
                </span>
              ) : null}
            </div>
            {selectedTemplate ? (
              <>
                <p>{selectedTemplate.shortDescription || selectedTemplate.description}</p>
                <div className="tag-cloud">
                  <span className="small-tag">{sourceLabel(selectedTemplate)}</span>
                  {selectedTemplate.version ? <span className="small-tag">v{selectedTemplate.version}</span> : null}
                  <span className={`small-tag ${selectedTemplate.trust === 'blocked' ? 'state-bad' : selectedTemplate.trust === 'trusted' ? 'state-good' : ''}`}>
                    {trustLabel(selectedTemplate)}
                  </span>
                  <span className={`small-tag ${selectedTemplate.compatibility === 'incompatible' ? 'state-bad' : ''}`}>
                    {compatibilityLabel(selectedTemplate)}
                  </span>
                  <span className={`small-tag ${selectedTemplate.health === 'corrupt' ? 'state-bad' : selectedTemplate.health === 'update-available' ? 'state-warn' : 'state-good'}`}>
                    {healthLabel(selectedTemplate)}
                  </span>
                </div>
                <div className="project-template-meta-grid">
                  <div className="meta-tile">
                    <span>分类</span>
                    <strong>{selectedTemplate.category}</strong>
                  </div>
                  <div className="meta-tile">
                    <span>默认流程</span>
                    <strong>{selectedTemplate.defaultFlowName || '未指定'}</strong>
                  </div>
                  <div className="meta-tile">
                    <span>版本</span>
                    <strong>{selectedTemplate.version || '1.0.0'}</strong>
                  </div>
                  <div className="meta-tile">
                    <span>启动提示</span>
                    <strong>{selectedTemplate.starterPrompt ? '已定义' : '未定义'}</strong>
                  </div>
                </div>
                {selectedTemplate.artifactPreview?.length ? (
                  <div className="project-template-block">
                    <div className="section-kicker">默认工件</div>
                    <div className="tag-cloud">
                      {selectedTemplate.artifactPreview.map((artifact) => <span key={artifact} className="small-tag">{artifact}</span>)}
                    </div>
                  </div>
                ) : null}
                {selectedTemplate.issueMessage ? (
                  <div className="workspace-inline-note">
                    <strong>{selectedTemplate.health === 'corrupt' ? '损坏说明' : '状态说明'}</strong>
                    <span>{selectedTemplate.issueMessage}</span>
                  </div>
                ) : null}
                {unavailableReason ? (
                  <div className="workspace-inline-note">
                    <strong>当前阻断</strong>
                    <span>{unavailableReason}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <p>选择一个模板后，右侧会显示它的流程摘要和当前工程创建表单。</p>
            )}
          </div>

          <div className="project-template-form-card">
            <div className="workspace-subhead">
              <div>
                <div className="section-kicker">工程表单</div>
                <strong>再决定要落在哪个目录</strong>
              </div>
              <span className="small-tag">{draft.directoryMode === 'create-in-parent' ? '创建新文件夹' : '使用已有目录'}</span>
            </div>

            <div className="project-template-form-grid">
              <label>
                工程名称
                <input
                  value={draft.name}
                  onChange={(event) => onChange({ ...draft, name: event.target.value })}
                  placeholder="例如：客户调研方案"
                />
              </label>

              <div className="field-stack">
                <span>目录模式</span>
                <div className="segmented icon-segmented">
                  <button
                    type="button"
                    className={draft.directoryMode === 'create-in-parent' ? 'active' : ''}
                    title="选择父目录后创建新文件夹"
                    aria-label="选择父目录后创建新文件夹"
                    onClick={() => onChange({ ...draft, directoryMode: 'create-in-parent' })}
                  >
                    <FolderPlus size={16} strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    className={draft.directoryMode === 'use-existing-directory' ? 'active' : ''}
                    title="直接使用已有空目录"
                    aria-label="直接使用已有空目录"
                    onClick={() => onChange({ ...draft, directoryMode: 'use-existing-directory' })}
                  >
                    <FolderOpen size={16} strokeWidth={1.8} />
                  </button>
                </div>
              </div>

              <label className="project-template-location">
                目标目录
                <div className="inline-field">
                  <input
                    value={draft.locationPath}
                    readOnly
                    placeholder={draft.directoryMode === 'create-in-parent' ? '请选择父目录' : '请选择空目录'}
                  />
                  <button type="button" className="button-secondary icon-text" data-testid="project-dialog-choose-location" onClick={() => onChooseLocation(draft.directoryMode)}>
                    <FolderOpen size={14} strokeWidth={1.8} />
                    <span>{draft.directoryMode === 'create-in-parent' ? '选择父目录' : '选择目录'}</span>
                  </button>
                </div>
              </label>
            </div>

            <div className="project-template-path-card">
              <div className="section-kicker">最终落盘路径</div>
              <strong className="path-preview">{finalPath || '尚未选择目录'}</strong>
              <p>
                {draft.directoryMode === 'create-in-parent'
                  ? '会在所选父目录下创建一个与工程同名的新文件夹。'
                  : '会直接在你选中的空目录中初始化工程。'}
              </p>
            </div>

            {validationIssues.length ? (
              <div className="workspace-inline-note" data-testid="project-create-validation">
                <strong><AlertTriangle size={14} strokeWidth={1.8} /> 创建前检查</strong>
                <span>{validationIssues[0]?.message}</span>
                <div className="tag-cloud">
                  {validationIssues.map((issue) => (
                    <span key={`${issue.code}:${issue.field}:${issue.message}`} className="small-tag state-bad">
                      {issue.message}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="workspace-inline-note">
              <strong>当前状态</strong>
              <span>{status || '这里负责完成工程落盘，安装、下载和深层筛选统一进入资源中心。'}</span>
            </div>

            <div className="workspace-page-actions">
              <button type="button" className="button-ghost" onClick={onClose}>取消</button>
              <button
                type="button"
                className="button-primary icon-text"
                data-testid="project-dialog-submit"
                onClick={onSubmit}
                disabled={submitDisabled}
              >
                {unavailableReason ? <ShieldAlert size={14} strokeWidth={1.8} /> : busy ? <RefreshCw size={14} strokeWidth={1.8} /> : <Plus size={14} strokeWidth={1.8} />}
                <span>{busy ? '创建中…' : unavailableReason ? '模板不可用' : '创建工程'}</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
