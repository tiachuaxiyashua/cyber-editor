import { FileText, History, X } from 'lucide-react';

export type DocumentTabItem = {
  path: string;
  title: string;
  dirty: boolean;
};

export function DocumentTabs({
  tabs,
  activePath,
  canReopen,
  onSelect,
  onClose,
  onReopenLastClosed
}: {
  tabs: DocumentTabItem[];
  activePath: string;
  canReopen: boolean;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onReopenLastClosed: () => void;
}) {
  return (
    <div className="document-tabs">
      <div className="document-tab-strip workbench-tab-strip">
        {tabs.map((tab) => (
          <div key={tab.path} className={`document-tab tab-chip ${tab.path === activePath ? 'active' : ''}`}>
            <button type="button" className="document-tab-main" onClick={() => onSelect(tab.path)}>
              <FileText size={14} strokeWidth={1.8} />
              <span>{tab.title}</span>
              {tab.dirty ? <em className="document-tab-dirty" aria-label="未保存">●</em> : null}
            </button>
            <button
              type="button"
              className="document-tab-close"
              onClick={() => onClose(tab.path)}
              aria-label={`关闭文档 ${tab.title}`}
              title={`关闭文档 ${tab.title}`}
            >
              <X size={14} strokeWidth={1.8} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="icon-button"
        onClick={onReopenLastClosed}
        disabled={!canReopen}
        aria-label="重新打开已关闭文档"
        title="重新打开已关闭文档"
      >
        <History size={14} strokeWidth={1.8} />
      </button>
    </div>
  );
}
