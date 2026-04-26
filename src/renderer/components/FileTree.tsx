import { ArrowRightLeft, Columns2, FilePlus2, FileText, FolderOpen, FolderPlus, Pencil, SquareArrowOutUpRight, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FileNode } from '../../shared/types';

export function FileTree({
  nodes,
  activePath,
  onOpen,
  onOpenInSplit,
  onOpenInWindow,
  onCreateFile,
  onCreateDirectory,
  onRename,
  onMove,
  onDelete,
  depth = 0
}: {
  nodes: FileNode[];
  activePath?: string;
  onOpen: (filePath: string) => void;
  onOpenInSplit: (filePath: string) => void;
  onOpenInWindow: (filePath: string) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateDirectory: (parentPath: string) => void;
  onRename: (targetPath: string) => void;
  onMove: (targetPath: string) => void;
  onDelete: (targetPath: string) => void;
  depth?: number;
}) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: FileNode;
  } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [contextMenu]);

  const renderActions = (node: FileNode) => (
    <div className="tree-node-actions" onMouseDown={(event) => event.stopPropagation()}>
      {node.type === 'directory' ? (
        <>
          <button type="button" title="新建文件" aria-label="新建文件" onClick={() => onCreateFile(node.path)}>
            <FilePlus2 size={12} strokeWidth={1.8} />
          </button>
          <button type="button" title="新建目录" aria-label="新建目录" onClick={() => onCreateDirectory(node.path)}>
            <FolderPlus size={12} strokeWidth={1.8} />
          </button>
        </>
      ) : (
        <button type="button" title="在新窗口打开" aria-label="在新窗口打开" onClick={() => onOpenInWindow(node.path)}>
          <SquareArrowOutUpRight size={12} strokeWidth={1.8} />
        </button>
      )}
      <button type="button" title="重命名" aria-label="重命名" onClick={() => onRename(node.path)}>
        <Pencil size={12} strokeWidth={1.8} />
      </button>
      <button type="button" title="移动" aria-label="移动" onClick={() => onMove(node.path)}>
        <ArrowRightLeft size={12} strokeWidth={1.8} />
      </button>
      <button type="button" title="删除" aria-label="删除" onClick={() => onDelete(node.path)}>
        <Trash2 size={12} strokeWidth={1.8} />
      </button>
    </div>
  );

  return (
    <div className="file-tree">
      {nodes.map((node) => {
        if (node.type === 'directory') {
          return (
            <div key={node.path}>
              <div
                className="tree-node tree-node-directory"
                style={{ paddingLeft: 12 + depth * 12 }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextMenu({ x: event.clientX, y: event.clientY, node });
                }}
              >
                <div className="tree-node-main">
                  <FolderOpen size={14} strokeWidth={1.8} />
                  <span>{node.name}</span>
                </div>
                {renderActions(node)}
              </div>
              <FileTree
                nodes={node.children ?? []}
                activePath={activePath}
                onOpen={onOpen}
                onOpenInSplit={onOpenInSplit}
                onOpenInWindow={onOpenInWindow}
                onCreateFile={onCreateFile}
                onCreateDirectory={onCreateDirectory}
                onRename={onRename}
                onMove={onMove}
                onDelete={onDelete}
                depth={depth + 1}
              />
            </div>
          );
        }
        return (
          <div
            key={node.path}
            className={`tree-node tree-node-file ${activePath === node.path ? 'active' : ''}`}
            style={{ paddingLeft: 12 + depth * 12 }}
            onContextMenu={(event) => {
              event.preventDefault();
              setContextMenu({ x: event.clientX, y: event.clientY, node });
            }}
          >
            <button type="button" className="tree-node-main tree-node-main-button" onClick={() => onOpen(node.path)}>
              <FileText size={14} strokeWidth={1.8} />
              <span>{node.name}</span>
            </button>
            {renderActions(node)}
          </div>
        );
      })}
      {contextMenu ? (
        <div className="tree-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextMenu.node.type === 'file' ? (
            <>
              <button type="button" onClick={() => { onOpen(contextMenu.node.path); setContextMenu(null); }}>
                <FileText size={14} strokeWidth={1.8} />
                <span>打开文件</span>
              </button>
              <button type="button" onClick={() => { onOpenInSplit(contextMenu.node.path); setContextMenu(null); }}>
                <Columns2 size={14} strokeWidth={1.8} />
                <span>在分屏中打开</span>
              </button>
              <button type="button" onClick={() => { onOpenInWindow(contextMenu.node.path); setContextMenu(null); }}>
                <SquareArrowOutUpRight size={14} strokeWidth={1.8} />
                <span>在新窗口打开</span>
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { onCreateFile(contextMenu.node.path); setContextMenu(null); }}>
                <FilePlus2 size={14} strokeWidth={1.8} />
                <span>新建文件</span>
              </button>
              <button type="button" onClick={() => { onCreateDirectory(contextMenu.node.path); setContextMenu(null); }}>
                <FolderPlus size={14} strokeWidth={1.8} />
                <span>新建目录</span>
              </button>
            </>
          )}
          <button type="button" onClick={() => { onRename(contextMenu.node.path); setContextMenu(null); }}>
            <Pencil size={14} strokeWidth={1.8} />
            <span>重命名</span>
          </button>
          <button type="button" onClick={() => { onMove(contextMenu.node.path); setContextMenu(null); }}>
            <ArrowRightLeft size={14} strokeWidth={1.8} />
            <span>移动</span>
          </button>
          <button type="button" onClick={() => { onDelete(contextMenu.node.path); setContextMenu(null); }}>
            <Trash2 size={14} strokeWidth={1.8} />
            <span>删除</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
