import { Download, X } from 'lucide-react';
import { IconButton, SidebarHeader } from './ShellPrimitives';
import { OverlayPortal } from './OverlayPortal';

export function PackageUrlDialog({
  open,
  title,
  description,
  value,
  placeholder,
  actionLabel,
  status,
  onChange,
  onSubmit,
  onClose
}: {
  open: boolean;
  title: string;
  description: string;
  value: string;
  placeholder: string;
  actionLabel: string;
  status: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <OverlayPortal>
      <div className="modal-backdrop">
        <div className="modal dialog-surface package-url-dialog">
        <SidebarHeader
          title={title}
          description={description}
          actions={<IconButton title="关闭" onClick={onClose} icon={X} />}
        />
        <div className="package-url-layout">
          <label className="skill-source-field">
            <span>{actionLabel}地址</span>
            <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoFocus />
          </label>
          <div className="modal-actions">
            <button type="button" className="button-secondary" onClick={onClose}>取消</button>
            <button type="button" className="button-primary icon-text" onClick={onSubmit}>
              <Download size={14} strokeWidth={1.8} />
              <span>{actionLabel}</span>
            </button>
          </div>
          <div className="muted-line">{status || '输入地址后开始安装。'}</div>
        </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
