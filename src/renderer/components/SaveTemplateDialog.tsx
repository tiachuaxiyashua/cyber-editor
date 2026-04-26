import { Save, X } from 'lucide-react';
import type { ProjectTemplateDefinition, ProjectTemplateSaveInput } from '../../shared/types';
import { IconButton, SidebarHeader } from './ShellPrimitives';
import { OverlayPortal } from './OverlayPortal';

export function SaveTemplateDialog({
  open,
  draft,
  status,
  busy,
  onChange,
  onClose,
  onSubmit
}: {
  open: boolean;
  draft: ProjectTemplateSaveInput;
  status: string;
  busy: boolean;
  onChange: (draft: ProjectTemplateSaveInput) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;

  return (
    <OverlayPortal>
      <div className="modal-backdrop">
        <div className="modal dialog-surface save-template-dialog" data-testid="save-template-dialog">
        <SidebarHeader
          title="保存为模板"
          description="把当前工程的流程、角色、连接、工具和运行时规则沉淀到模板注册表。"
          actions={<IconButton title="关闭保存模板" onClick={onClose} icon={X} />}
        />
        <div className="provider-dialog-grid">
          <section className="provider-editor-panel">
            <div className="form-grid">
              <label>
                模板名称
                <input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} />
              </label>
              <label>
                模板 ID
                <input value={draft.id} onChange={(event) => onChange({ ...draft, id: event.target.value })} />
              </label>
              <label>
                简短说明
                <input value={draft.shortDescription} onChange={(event) => onChange({ ...draft, shortDescription: event.target.value })} />
              </label>
              <label>
                分类
                <select
                  value={draft.category}
                  onChange={(event) => onChange({ ...draft, category: event.target.value as ProjectTemplateDefinition['category'] })}
                >
                  <option value="product">产品/方案</option>
                  <option value="writing">写作/脚本</option>
                  <option value="planning">规划/攻略</option>
                </select>
              </label>
              <label>
                图标关键字
                <input value={draft.icon} onChange={(event) => onChange({ ...draft, icon: event.target.value })} placeholder="例如 workflow / book / map" />
              </label>
              <label>
                起始引导语
                <textarea value={draft.starterPrompt ?? ''} onChange={(event) => onChange({ ...draft, starterPrompt: event.target.value })} />
              </label>
              <label>
                详细说明
                <textarea value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} />
              </label>
            </div>
            <div className="provider-status-card">
              <div className="section-kicker">保存状态</div>
              <p>{status || '保存后会出现在“新建工程”的模板注册表中，可直接用来创建新工程。'}</p>
            </div>
          </section>
        </div>
        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>取消</button>
          <button
            type="button"
            className="button-primary icon-text"
            onClick={onSubmit}
            disabled={busy || !draft.name.trim() || !draft.id.trim() || !draft.shortDescription.trim()}
          >
            <Save size={14} strokeWidth={1.8} />
            <span>{busy ? '保存中…' : '保存模板'}</span>
          </button>
        </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
