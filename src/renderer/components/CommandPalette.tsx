import { Search, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { OverlayPortal } from './OverlayPortal';

export type CommandPaletteItem = {
  id: string;
  label: string;
  description: string;
  disabled?: boolean;
  run: () => void;
};

export function CommandPalette({
  open,
  query,
  items,
  onQueryChange,
  onClose
}: {
  open: boolean;
  query: string;
  items: CommandPaletteItem[];
  onQueryChange: (value: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  if (!open) return null;

  return (
    <OverlayPortal>
      <div className="modal-backdrop command-palette-backdrop" onClick={onClose}>
        <div
          className="modal command-palette"
          role="dialog"
          aria-modal="true"
          aria-label="命令面板"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="command-palette-header">
            <Search size={16} strokeWidth={1.8} />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索命令，例如“工程搜索”或“保存文档”"
              aria-label="搜索命令"
            />
            <button type="button" className="icon-button" onClick={onClose} aria-label="关闭命令面板" title="关闭命令面板">
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>
          <div className="command-palette-results">
            {items.length ? items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="command-palette-item"
                onClick={() => item.run()}
                disabled={item.disabled}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            )) : <div className="empty-note">没有匹配的命令。</div>}
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
