import { OverlayPortal } from './OverlayPortal';

export type ConflictDialogState = {
  path: string;
  modifiedAt: number;
  externalContents: string;
};

export function ConflictDialog({
  conflict,
  onReload,
  onOverwrite,
  onLater
}: {
  conflict: ConflictDialogState | null;
  onReload: () => void;
  onOverwrite: () => void;
  onLater: () => void;
}) {
  if (!conflict) return null;

  return (
    <OverlayPortal>
      <div className="modal-backdrop">
        <div className="modal dialog-surface conflict-dialog" role="dialog" aria-modal="true" aria-label="外部变更冲突">
          <div className="sidebar-header">
            <div>
              <div className="sidebar-header-title">检测到外部变更</div>
              <div className="sidebar-header-description">
                当前文档在应用外被修改，且本地还有未保存内容。
              </div>
            </div>
          </div>
          <div className="conflict-body">
            <div className="meta-list">
              <div>
                <span>文档</span>
                <strong>{conflict.path}</strong>
              </div>
              <div>
                <span>外部修改时间</span>
                <strong>{new Date(conflict.modifiedAt).toLocaleString()}</strong>
              </div>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="button-secondary" onClick={onLater}>稍后处理</button>
            <button type="button" className="button-secondary" onClick={onReload}>重新加载外部版本</button>
            <button type="button" className="button-danger" onClick={onOverwrite}>保留当前内容并覆盖外部文件</button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
