import { useEffect, useMemo, useState } from 'react';
import { OverlayPortal } from './OverlayPortal';

type ArtifactReferenceItem = {
  path: string;
  label: string;
  description: string;
};

export function ArtifactReferenceDialog({
  open,
  mode,
  items,
  onClose,
  onInsert
}: {
  open: boolean;
  mode: 'link' | 'embed';
  items: ArtifactReferenceItem[];
  onClose: () => void;
  onInsert: (targetPath: string, label?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [label, setLabel] = useState('');

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      item.label.toLowerCase().includes(normalized)
      || item.description.toLowerCase().includes(normalized)
      || item.path.toLowerCase().includes(normalized)
    );
  }, [items, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedPath('');
      setLabel('');
      return;
    }
    setSelectedPath((current) => current || items[0]?.path || '');
  }, [items, open]);

  const selectedItem = filteredItems.find((item) => item.path === selectedPath) ?? filteredItems[0] ?? null;

  useEffect(() => {
    if (!selectedItem) return;
    setSelectedPath(selectedItem.path);
    setLabel((current) => current || selectedItem.label);
  }, [selectedItem]);

  if (!open) return null;

  return (
    <OverlayPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal dialog-surface artifact-reference-dialog" onClick={(event) => event.stopPropagation()}>
          <div className="sidebar-header">
            <div className="sidebar-header-copy">
              <strong>{mode === 'embed' ? '插入工件嵌入' : '插入工件链接'}</strong>
              <div className="muted-line">选择当前工程中的文件，系统会自动写入稳定的 Markdown 引用。</div>
            </div>
          </div>
          <div className="form-grid">
            <label>
              搜索
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件名或路径" />
            </label>
            <label>
              显示标签
              <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="为空则使用文件名" />
            </label>
          </div>
          <div className="asset-list">
            {filteredItems.length ? filteredItems.map((item) => (
              <button
                key={item.path}
                type="button"
                className={`asset-list-item selectable ${selectedPath === item.path ? 'active' : ''}`}
                onClick={() => {
                  setSelectedPath(item.path);
                  setLabel(item.label);
                }}
              >
                <strong>{item.label}</strong>
                <span className="muted-line">{item.description}</span>
              </button>
            )) : <div className="empty-note">没有匹配的工件文件。</div>}
          </div>
          <div className="modal-actions">
            <button type="button" className="button-secondary" onClick={onClose}>取消</button>
            <button type="button" className="button-primary" onClick={() => selectedItem && onInsert(selectedItem.path, label)} disabled={!selectedItem}>
              {mode === 'embed' ? '插入嵌入' : '插入链接'}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
