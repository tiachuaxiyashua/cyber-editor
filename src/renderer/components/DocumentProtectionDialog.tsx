import { useEffect, useState } from 'react';
import type { DocumentSnapshotInfo, PendingDocumentWrite } from '../../shared/types';
import { OverlayPortal } from './OverlayPortal';

export function DocumentProtectionDialog({
  open,
  documentName,
  snapshots,
  pendingWrite,
  busy,
  onClose,
  onCreateSnapshot,
  onRestoreSnapshot,
  onResolvePendingWrite
}: {
  open: boolean;
  documentName: string;
  snapshots: DocumentSnapshotInfo[];
  pendingWrite: PendingDocumentWrite | null;
  busy: boolean;
  onClose: () => void;
  onCreateSnapshot: (label?: string) => void;
  onRestoreSnapshot: (snapshotId: string) => void;
  onResolvePendingWrite: (
    proposalId: string,
    input: { decision: 'accept-ai' | 'keep-human' | 'manual-merge'; chunkSelections?: Record<string, 'human' | 'ai'> }
  ) => void;
}) {
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [chunkSelections, setChunkSelections] = useState<Record<string, 'human' | 'ai'>>({});

  useEffect(() => {
    if (!pendingWrite) {
      setChunkSelections({});
      return;
    }
    setChunkSelections(Object.fromEntries(pendingWrite.chunks.map((chunk) => [chunk.id, 'human'])));
  }, [pendingWrite]);

  if (!open) return null;

  return (
    <OverlayPortal>
      <div className="modal-backdrop">
        <div className="modal dialog-surface document-protection-dialog" role="dialog" aria-modal="true" aria-label="文档保护">
          <div className="sidebar-header">
            <div>
              <div className="sidebar-header-title">文档保护</div>
              <div className="sidebar-header-description">
                管理当前文档快照，并处理待确认的 AI 写入。
              </div>
            </div>
          </div>

          <div className="document-protection-grid">
            <section className="document-protection-section">
              <div className="workspace-subhead">
                <div>
                  <div className="section-kicker">文档快照</div>
                  <strong>{documentName || '当前文档'}</strong>
                </div>
              </div>
              <div className="document-snapshot-create">
                <input
                  value={snapshotLabel}
                  onChange={(event) => setSnapshotLabel(event.target.value)}
                  placeholder="可选：输入快照名称"
                />
                <button type="button" className="button-secondary" onClick={() => onCreateSnapshot(snapshotLabel.trim() || undefined)} disabled={busy}>
                  创建快照
                </button>
              </div>
              <div className="document-snapshot-list">
                {snapshots.length ? snapshots.map((snapshot) => (
                  <div key={snapshot.id} className="list-card compact-row">
                    <div>
                      <strong>{snapshot.label}</strong>
                      <div className="muted-line">{snapshot.summary}</div>
                      <div className="muted-line">{new Date(snapshot.createdAt).toLocaleString()}</div>
                    </div>
                    <button type="button" className="button-secondary" onClick={() => onRestoreSnapshot(snapshot.id)} disabled={busy}>
                      恢复
                    </button>
                  </div>
                )) : <div className="empty-note">当前文档还没有快照。</div>}
              </div>
            </section>

            <section className="document-protection-section">
              <div className="workspace-subhead">
                <div>
                  <div className="section-kicker">AI 写入提案</div>
                  <strong>{pendingWrite ? pendingWrite.title : '暂无待确认写入'}</strong>
                </div>
              </div>
              {pendingWrite ? (
                <>
                  <div className="finding-card warning">
                    <strong>{pendingWrite.changeSummary}</strong>
                    <div className="muted-line">
                      {pendingWrite.hasConflicts ? '检测到最近人工或外部修改，已阻止 AI 直接写入。' : '当前提案没有冲突。'}
                    </div>
                  </div>
                  <div className="merge-chunk-list">
                    {pendingWrite.chunks.map((chunk, index) => (
                      <div key={chunk.id} className="merge-chunk-card">
                        <div className="list-card-header">
                          <div>
                            <strong>{`区块 ${index + 1}`}</strong>
                            <div className="muted-line">{`从第 ${chunk.startLine} 行开始`}</div>
                          </div>
                          <div className="segmented compact">
                            <button
                              type="button"
                              className={chunkSelections[chunk.id] === 'human' ? 'active' : ''}
                              onClick={() => setChunkSelections((current) => ({ ...current, [chunk.id]: 'human' }))}
                            >
                              保留人工
                            </button>
                            <button
                              type="button"
                              className={chunkSelections[chunk.id] === 'ai' ? 'active' : ''}
                              onClick={() => setChunkSelections((current) => ({ ...current, [chunk.id]: 'ai' }))}
                            >
                              使用 AI
                            </button>
                          </div>
                        </div>
                        <div className="merge-chunk-compare">
                          <div>
                            <div className="section-kicker">人工当前内容</div>
                            <pre>{chunk.humanText || '(空)'}</pre>
                          </div>
                          <div>
                            <div className="section-kicker">AI 提议内容</div>
                            <pre>{chunk.aiText || '(空)'}</pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="button-secondary" onClick={() => onResolvePendingWrite(pendingWrite.id, { decision: 'keep-human' })} disabled={busy}>
                      保留人工
                    </button>
                    <button type="button" className="button-secondary" onClick={() => onResolvePendingWrite(pendingWrite.id, { decision: 'manual-merge', chunkSelections })} disabled={busy}>
                      应用逐块合并
                    </button>
                    <button type="button" className="button-primary" onClick={() => onResolvePendingWrite(pendingWrite.id, { decision: 'accept-ai' })} disabled={busy}>
                      接受 AI
                    </button>
                  </div>
                </>
              ) : <div className="empty-note">当前没有待确认的 AI 写入提案。</div>}
            </section>
          </div>

          <div className="modal-actions">
            <button type="button" className="button-secondary" onClick={onClose} disabled={busy}>关闭</button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
