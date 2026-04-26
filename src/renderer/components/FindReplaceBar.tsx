import { ChevronDown, ChevronUp, Replace, Search, X } from 'lucide-react';

export function FindReplaceBar({
  open,
  query,
  replaceText,
  matchCount,
  currentIndex,
  canReplace,
  onQueryChange,
  onReplaceTextChange,
  onPrev,
  onNext,
  onReplaceCurrent,
  onReplaceAll,
  onClose
}: {
  open: boolean;
  query: string;
  replaceText: string;
  matchCount: number;
  currentIndex: number;
  canReplace: boolean;
  onQueryChange: (value: string) => void;
  onReplaceTextChange: (value: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="find-replace-bar">
      <div className="find-replace-row">
        <div className="find-replace-field">
          <Search size={14} strokeWidth={1.8} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="查找当前文档"
            aria-label="查找当前文档"
          />
        </div>
        <div className="find-replace-meta">
          <span>{matchCount ? `${currentIndex + 1} / ${matchCount}` : '0 / 0'}</span>
          <button type="button" className="icon-button" onClick={onPrev} disabled={!matchCount} title="上一个">
            <ChevronUp size={14} strokeWidth={1.8} />
          </button>
          <button type="button" className="icon-button" onClick={onNext} disabled={!matchCount} title="下一个">
            <ChevronDown size={14} strokeWidth={1.8} />
          </button>
          <button type="button" className="icon-button" onClick={onClose} title="关闭查找">
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      <div className="find-replace-row">
        <div className="find-replace-field">
          <Replace size={14} strokeWidth={1.8} />
          <input
            value={replaceText}
            onChange={(event) => onReplaceTextChange(event.target.value)}
            placeholder="替换为"
            aria-label="替换为"
          />
        </div>
        <div className="button-row">
          <button type="button" className="button-secondary" onClick={onReplaceCurrent} disabled={!canReplace || !matchCount}>替换当前</button>
          <button type="button" className="button-secondary" onClick={onReplaceAll} disabled={!canReplace || !matchCount}>全部替换</button>
        </div>
      </div>
    </div>
  );
}
