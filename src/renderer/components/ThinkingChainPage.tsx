import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LayoutGrid, Move, ZoomIn, ZoomOut } from 'lucide-react';
import type {
  ThinkingChainEdge,
  ThinkingChainEvidenceRef,
  ThinkingChainManualPosition,
  ThinkingChainNodeStage,
  ThinkingChainSnapshot
} from '../../shared/types';
import {
  IDEA_MAP_MAX_ZOOM,
  buildIdeaMapLayout,
  clampIdeaMapZoom
} from '../lib/idea-map-layout';

type ThinkingChainPageProps = {
  snapshot: ThinkingChainSnapshot | null;
  loading: boolean;
  hideRejected: boolean;
  zoom: number;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  onToggleHideRejected: () => void;
  onZoomChange: (zoom: number) => void | Promise<void>;
  onPersistNodePosition: (semanticKey: string, position: ThinkingChainManualPosition) => void | Promise<void>;
  onPersistView: (view: { zoom?: number; scrollLeft?: number; scrollTop?: number; detailPaneWidth?: number }) => void | Promise<void>;
  onResetLayout: () => void | Promise<void>;
  onJumpEvidence: (ref: ThinkingChainEvidenceRef) => void;
  onClose: () => void;
};

type NodeDragState = {
  pointerId: number;
  semanticKey: string;
  nodeId: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  moved: boolean;
};

type CanvasPanState = {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};

type DetailResizeState = {
  pointerId: number;
  startClientX: number;
  startWidth: number;
};

type ViewPersistenceInput = {
  zoom?: number;
  scrollLeft?: number;
  scrollTop?: number;
  detailPaneWidth?: number;
};

type PendingViewportAdjustment = {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
};

const DEFAULT_DETAIL_PANE_WIDTH = 320;
const MIN_DETAIL_PANE_WIDTH = 280;
const MAX_DETAIL_PANE_WIDTH = 420;

function kindLabel(kind: NonNullable<ThinkingChainSnapshot>['nodes'][number]['kind']) {
  switch (kind) {
    case 'goal':
      return '命题';
    case 'branch':
      return '思路';
    case 'criterion':
      return '约束';
    case 'decision':
      return '结论';
    case 'artifact':
      return '产物';
    case 'rejected':
      return '废弃';
    case 'summary':
      return '总结';
    default:
      return kind;
  }
}

function stageLabel(stage: ThinkingChainNodeStage) {
  switch (stage) {
    case 'core':
      return '核心命题';
    case 'premise':
      return '拆解前提';
    case 'constraint':
      return '约束条件';
    case 'conclusion':
      return '推导结论';
    case 'exploration':
      return '探索分支';
    case 'discarded':
      return '废弃分支';
    case 'materialized':
      return '文档沉淀';
    default:
      return stage;
  }
}

function statusLabel(status: NonNullable<ThinkingChainSnapshot>['nodes'][number]['status']) {
  switch (status) {
    case 'accepted':
      return '已采纳';
    case 'rejected':
      return '已废弃';
    case 'abandoned':
      return '已放弃';
    case 'orphaned':
      return '来源缺失';
    default:
      return '进行中';
  }
}

function evidenceKindLabel(kind: ThinkingChainEvidenceRef['kind']) {
  switch (kind) {
    case 'session-message':
      return '会话消息';
    case 'runtime-run':
      return '运行记录';
    case 'runtime-event':
      return '运行事件';
    case 'review-round':
      return '审查轮次';
    case 'review-issue':
      return '审查问题';
    case 'artifact-revision':
      return '工件修订';
    case 'document-change':
      return '文档变更';
    case 'document':
      return '文档';
    case 'artifact':
      return '工件';
    default:
      return kind;
  }
}

function edgeToneClass(edge: ThinkingChainEdge) {
  switch (edge.kind) {
    case 'lands-into':
    case 'materializes':
      return 'tone-landed';
    case 'replaces':
      return 'tone-discarded';
    case 'constrains':
      return 'tone-constraint';
    case 'explores':
      return 'tone-exploration';
    default:
      return 'tone-default';
  }
}

export function ThinkingChainPage(props: ThinkingChainPageProps) {
  const {
    snapshot,
    loading,
    hideRejected,
    zoom,
    selectedNodeId,
    onSelectNode,
    onToggleHideRejected,
    onZoomChange,
    onPersistNodePosition,
    onPersistView,
    onResetLayout,
    onJumpEvidence
  } = props;

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<CanvasPanState | null>(null);
  const nodeDragRef = useRef<NodeDragState | null>(null);
  const detailResizeRef = useRef<DetailResizeState | null>(null);
  const suppressClickNodeIdRef = useRef<string>('');
  const zoomRef = useRef(zoom);
  const detailPaneWidthRef = useRef(DEFAULT_DETAIL_PANE_WIDTH);
  const pendingViewportAdjustmentRef = useRef<PendingViewportAdjustment | null>(null);
  const queuedViewRef = useRef<ViewPersistenceInput | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const [draggingCanvas, setDraggingCanvas] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState('');
  const [manualPositions, setManualPositions] = useState<Record<string, ThinkingChainManualPosition>>({});
  const [detailPaneWidth, setDetailPaneWidth] = useState(DEFAULT_DETAIL_PANE_WIDTH);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    detailPaneWidthRef.current = detailPaneWidth;
  }, [detailPaneWidth]);

  useEffect(() => {
    const next = Object.fromEntries(
      (snapshot?.nodes ?? [])
        .filter((node) => node.manualPosition)
        .map((node) => [node.semanticKey, node.manualPosition as ThinkingChainManualPosition])
    );
    setManualPositions(next);
    setDetailPaneWidth(snapshot?.layoutState?.view.detailPaneWidth ?? DEFAULT_DETAIL_PANE_WIDTH);
  }, [snapshot?.generatedAt, snapshot?.layoutState?.updatedAt, snapshot?.sessionId]);

  const visibleNodes = useMemo(
    () => (snapshot?.nodes ?? [])
      .filter((node) => !(hideRejected && node.stage === 'discarded'))
      .map((node) => ({
        ...node,
        manualPosition: manualPositions[node.semanticKey] ?? node.manualPosition
      })),
    [hideRejected, manualPositions, snapshot?.nodes]
  );

  const selectedNode = visibleNodes.find((node) => node.id === selectedNodeId) ?? null;
  const model = useMemo(() => buildIdeaMapLayout(snapshot, visibleNodes), [snapshot, visibleNodes]);
  const viewportStyle = useMemo(() => ({
    width: Math.max(model.width * IDEA_MAP_MAX_ZOOM + 640, 3200),
    height: Math.max(model.height * IDEA_MAP_MAX_ZOOM + 520, 2200)
  } as CSSProperties), [model.height, model.width]);
  const workspaceStyle = {
    gridTemplateColumns: `minmax(0, 1fr) 8px ${Math.round(detailPaneWidth)}px`
  } as CSSProperties;

  function clearQueuedViewPersistence() {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
  }

  function persistViewNow(next: ViewPersistenceInput = {}) {
    const current = canvasRef.current;
    if (!current) return;
    void onPersistView({
      zoom: next.zoom ?? zoomRef.current,
      scrollLeft: next.scrollLeft ?? current.scrollLeft,
      scrollTop: next.scrollTop ?? current.scrollTop,
      detailPaneWidth: next.detailPaneWidth ?? detailPaneWidthRef.current
    });
  }

  function queueViewPersistence(next: ViewPersistenceInput = {}, delay = 120) {
    const current = canvasRef.current;
    if (!current) return;
    queuedViewRef.current = {
      zoom: next.zoom ?? zoomRef.current,
      scrollLeft: next.scrollLeft ?? current.scrollLeft,
      scrollTop: next.scrollTop ?? current.scrollTop,
      detailPaneWidth: next.detailPaneWidth ?? detailPaneWidthRef.current
    };
    clearQueuedViewPersistence();
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      const queued = queuedViewRef.current;
      queuedViewRef.current = null;
      if (queued) {
        void onPersistView(queued);
      }
    }, delay);
  }

  function persistCurrentView(next: ViewPersistenceInput = {}) {
    clearQueuedViewPersistence();
    queuedViewRef.current = null;
    persistViewNow(next);
  }

  useEffect(() => () => {
    clearQueuedViewPersistence();
  }, []);

  useLayoutEffect(() => {
    const current = canvasRef.current;
    if (!current || !snapshot?.layoutState || pendingViewportAdjustmentRef.current) return;
    current.scrollLeft = snapshot.layoutState.view.scrollLeft ?? 0;
    current.scrollTop = snapshot.layoutState.view.scrollTop ?? 0;
  }, [snapshot?.layoutState?.updatedAt, snapshot?.sessionId]);

  useLayoutEffect(() => {
    const current = canvasRef.current;
    const pending = pendingViewportAdjustmentRef.current;
    if (!current || !pending || pending.zoom !== zoom) return;
    current.scrollLeft = pending.scrollLeft;
    current.scrollTop = pending.scrollTop;
    pendingViewportAdjustmentRef.current = null;
    queueViewPersistence({
      zoom,
      scrollLeft: current.scrollLeft,
      scrollTop: current.scrollTop
    });
  }, [zoom]);

  function requestZoom(nextZoom: number, anchor?: { localX: number; localY: number }) {
    const current = canvasRef.current;
    const currentZoom = zoomRef.current;
    if (!current || nextZoom === currentZoom) return;
    const localX = anchor?.localX ?? current.clientWidth / 2;
    const localY = anchor?.localY ?? current.clientHeight / 2;
    const contentX = (current.scrollLeft + localX) / currentZoom;
    const contentY = (current.scrollTop + localY) / currentZoom;
    pendingViewportAdjustmentRef.current = {
      zoom: nextZoom,
      scrollLeft: Math.max(0, contentX * nextZoom - localX),
      scrollTop: Math.max(0, contentY * nextZoom - localY)
    };
    void onZoomChange(nextZoom);
  }

  useEffect(() => {
    const current = canvasRef.current;
    if (!current) return undefined;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const currentZoom = zoomRef.current;
      const nextZoom = clampIdeaMapZoom(currentZoom + (event.deltaY < 0 ? 0.12 : -0.12));
      if (nextZoom === currentZoom) {
        return;
      }

      const rect = current.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      requestZoom(nextZoom, { localX, localY });
    };

    current.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      current.removeEventListener('wheel', handleWheel);
    };
  }, [requestZoom]);

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const current = canvasRef.current;
    if (!current) return;
    if ((event.target as HTMLElement | null)?.closest('.thinking-chain-node')) {
      return;
    }
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: current.scrollLeft,
      scrollTop: current.scrollTop
    };
    current.setPointerCapture(event.pointerId);
    setDraggingCanvas(true);
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const current = canvasRef.current;
    const panState = panStateRef.current;
    if (!current || !panState || panState.pointerId !== event.pointerId) return;
    current.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
    current.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
  };

  const handleCanvasPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const current = canvasRef.current;
    const panState = panStateRef.current;
    if (current?.hasPointerCapture(event.pointerId)) {
      current.releasePointerCapture(event.pointerId);
    }
    panStateRef.current = null;
    if (panState?.pointerId === event.pointerId) {
      persistCurrentView();
    }
    setDraggingCanvas(false);
  };

  const handleDetailResizerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    detailResizeRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startWidth: detailPaneWidth
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDetailResizerPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const detailResize = detailResizeRef.current;
    if (!detailResize || detailResize.pointerId !== event.pointerId) return;
    const nextWidth = Math.max(
      MIN_DETAIL_PANE_WIDTH,
      Math.min(MAX_DETAIL_PANE_WIDTH, Math.round(detailResize.startWidth - (event.clientX - detailResize.startClientX)))
    );
    detailPaneWidthRef.current = nextWidth;
    setDetailPaneWidth(nextWidth);
  };

  const handleDetailResizerPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const detailResize = detailResizeRef.current;
    if (!detailResize || detailResize.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    detailResizeRef.current = null;
    persistCurrentView({ detailPaneWidth: detailPaneWidthRef.current });
  };

  const handleDetailResizerPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    detailResizeRef.current = null;
  };

  const handleNodePointerDown = (
    semanticKey: string,
    nodeId: string,
    startX: number,
    startY: number,
    event: ReactPointerEvent<HTMLElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectNode(nodeId);
    nodeDragRef.current = {
      pointerId: event.pointerId,
      semanticKey,
      nodeId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingNodeId(nodeId);
  };

  const handleNodePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = nodeDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const dx = (event.clientX - dragState.startClientX) / zoomRef.current;
    const dy = (event.clientY - dragState.startClientY) / zoomRef.current;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      dragState.moved = true;
    }
    const nextPosition = {
      x: Math.max(24, Math.round(dragState.startX + dx)),
      y: Math.max(24, Math.round(dragState.startY + dy)),
      pinned: true
    };
    dragState.currentX = nextPosition.x;
    dragState.currentY = nextPosition.y;
    setManualPositions((currentState) => ({
      ...currentState,
      [dragState.semanticKey]: nextPosition
    }));
  };

  const handleNodePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = nodeDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    nodeDragRef.current = null;
    setDraggingNodeId('');
    if (dragState.moved) {
      suppressClickNodeIdRef.current = dragState.nodeId;
      void onPersistNodePosition(dragState.semanticKey, {
        x: dragState.currentX,
        y: dragState.currentY,
        pinned: true
      });
      persistCurrentView();
    }
  };

  const handleNodeClick = (nodeId: string) => {
    if (suppressClickNodeIdRef.current === nodeId) {
      suppressClickNodeIdRef.current = '';
      return;
    }
    onSelectNode(nodeId);
  };

  const pageTitle = snapshot?.sessionTitle ? `${snapshot.sessionTitle}的思路沉淀` : '思路沉淀';
  const detailItems = selectedNode?.detailItems ?? [];
  const detailDescription = detailItems.find((item) => item.label !== '分区')?.value ?? selectedNode?.summary ?? '';
  const detailCards = detailItems
    .filter((item) => item.value !== detailDescription)
    .slice(0, 2);

  return (
    <div className="thinking-chain-page" data-testid="thinking-chain-page">
      <section className="thinking-chain-toolbar">
        <div className="thinking-toolbar-copy">
          <h3>{pageTitle}</h3>
        </div>
        <div className="thinking-toolbar-side">
          <div className="thinking-toolbar-icons" aria-label="思路地图工具">
            <button type="button" className="icon-button thinking-toolbar-icon active" aria-label="拖动画布" title="拖动画布">
              <Move size={15} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="icon-button thinking-toolbar-icon"
              onClick={() => requestZoom(clampIdeaMapZoom(zoom + 0.1))}
              aria-label="放大"
              title="放大"
            >
              <ZoomIn size={15} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="icon-button thinking-toolbar-icon"
              onClick={() => requestZoom(clampIdeaMapZoom(zoom - 0.1))}
              aria-label="缩小"
              title="缩小"
            >
              <ZoomOut size={15} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="icon-button thinking-toolbar-icon"
              onClick={() => void onResetLayout()}
              aria-label="重新布局"
              title="重新布局"
            >
              <LayoutGrid size={15} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="icon-button thinking-toolbar-icon"
              onClick={onToggleHideRejected}
              aria-label={hideRejected ? '显示已废弃' : '隐藏已废弃'}
              title={hideRejected ? '显示已废弃' : '隐藏已废弃'}
            >
              {hideRejected ? <Eye size={15} strokeWidth={1.8} /> : <EyeOff size={15} strokeWidth={1.8} />}
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="thinking-chain-empty">正在生成思路地图快照…</div>
      ) : !visibleNodes.length ? (
        <div className="thinking-chain-empty">当前还没有可投影的思路节点。</div>
      ) : (
        <section className="thinking-chain-board">
          <div className="thinking-chain-board-head">
            <span className="panel-kicker">缩放</span>
            <strong>{Math.round(zoom * 100)}%</strong>
          </div>
          <section className="thinking-map-workspace" style={workspaceStyle}>
            <section
              ref={canvasRef}
              className={`thinking-chain-canvas-shell thinking-map-graph-shell ${draggingCanvas ? 'dragging' : ''}`}
              data-zoom={String(zoom)}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
            >
              <div className="thinking-chain-canvas-viewport thinking-map-viewport" style={viewportStyle}>
                <div
                  className="thinking-chain-canvas thinking-map-graph"
                  style={{
                    width: model.width,
                    height: model.height,
                    transform: `scale(${zoom})`
                  }}
                >
                  <svg className="thinking-map-svg" width={model.width} height={model.height} viewBox={`0 0 ${model.width} ${model.height}`} aria-hidden="true">
                    <defs>
                      <marker id="thinking-map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                      </marker>
                    </defs>
                    {model.edges.map((edge) => (
                      <g key={edge.id} className={`thinking-map-edge ${edgeToneClass(edge.edge)}`}>
                        <path d={edge.path} className="thinking-map-edge-path" markerEnd="url(#thinking-map-arrow)" />
                        {edge.edge.label ? (
                          <text x={edge.labelX} y={edge.labelY} className="thinking-map-edge-label">
                            {edge.edge.label}
                          </text>
                        ) : null}
                      </g>
                    ))}
                  </svg>

                  {model.nodes.map((canvasNode) => (
                    <button
                      key={canvasNode.id}
                      type="button"
                      data-node-id={canvasNode.id}
                      data-node-semantic-key={canvasNode.node.semanticKey}
                      className={`thinking-chain-node thinking-map-node stage-${canvasNode.node.stage} lane-${canvasNode.node.lane} kind-${canvasNode.node.kind} status-${canvasNode.node.status} ${selectedNode?.id === canvasNode.id ? 'selected' : ''} ${draggingNodeId === canvasNode.id ? 'dragging' : ''}`}
                      style={{
                        left: canvasNode.x,
                        top: canvasNode.y,
                        width: canvasNode.width,
                        minHeight: canvasNode.height
                      }}
                      onPointerDown={(event) => handleNodePointerDown(canvasNode.node.semanticKey, canvasNode.id, canvasNode.x, canvasNode.y, event)}
                      onPointerMove={handleNodePointerMove}
                      onPointerUp={handleNodePointerUp}
                      onPointerCancel={handleNodePointerUp}
                      onClick={() => handleNodeClick(canvasNode.id)}
                    >
                      <strong>{canvasNode.node.title}</strong>
                      <p>{canvasNode.node.summary}</p>
                      <span className="thinking-map-node-hint">
                        {canvasNode.node.kind === 'artifact' ? '沉淀文档' : '思路单元'} · {canvasNode.node.evidenceRefs.length} 条来源
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="thinking-chain-board-note">
                滚轮缩放以鼠标为中心；拖动画布和节点只调整布局，不改语义。已废弃分支默认可隐藏，但不会从底层关系中删除。
              </div>
            </section>

            <div
              className="thinking-map-detail-resizer"
              onPointerDown={handleDetailResizerPointerDown}
              onPointerMove={handleDetailResizerPointerMove}
              onPointerUp={handleDetailResizerPointerUp}
              onPointerCancel={handleDetailResizerPointerCancel}
              role="separator"
              aria-orientation="vertical"
              aria-label="调整详情栏宽度"
            />

            <aside className="thinking-map-detail-pane">
              {selectedNode ? (
                <>
                  <div className="thinking-map-panel-head">
                    <div className="panel-kicker">当前选中节点</div>
                    <strong>{selectedNode.title}</strong>
                    <p>{selectedNode.summary}</p>
                  </div>

                  <div className="thinking-detail-stats">
                    <div className="detail-meta-card thinking-detail-stat-card">
                      <span>类型</span>
                      <strong>{kindLabel(selectedNode.kind)}</strong>
                    </div>
                    <div className="detail-meta-card thinking-detail-stat-card">
                      <span>阶段</span>
                      <strong>{stageLabel(selectedNode.stage)}</strong>
                    </div>
                    <div className="detail-meta-card thinking-detail-stat-card">
                      <span>状态</span>
                      <strong>{statusLabel(selectedNode.status)}</strong>
                    </div>
                    <div className="detail-meta-card thinking-detail-stat-card">
                      <span>来源</span>
                      <strong>{snapshot?.sessionTitle ?? '当前会话'}</strong>
                    </div>
                  </div>

                  <div className="thinking-detail-section">
                    <span className="panel-kicker">决策内容</span>
                    <div className="overlay-item static thinking-detail-rich-card">
                      <strong>决策描述</strong>
                      <span>{detailDescription || selectedNode.summary}</span>
                    </div>
                  </div>

                  <div className="thinking-detail-section">
                    <span className="panel-kicker">决策理由与思路</span>
                    <div className="overlay-list compact-overlay-list">
                      {(detailCards.length ? detailCards : [
                        { id: `${selectedNode.id}:thought`, label: '思路描述', value: selectedNode.summary },
                        {
                          id: `${selectedNode.id}:reason`,
                          label: '为什么这样收敛',
                          value: `当前节点位于${stageLabel(selectedNode.stage)}，状态为${statusLabel(selectedNode.status)}，并挂接了 ${selectedNode.evidenceRefs.length} 条证据来源。`
                        }
                      ]).map((item) => (
                        <div key={item.id} className="overlay-item static thinking-detail-rich-card">
                          <strong>{item.label}</strong>
                          <span>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="thinking-detail-section">
                    <span className="panel-kicker">引用证据全文与上下文</span>
                    <div className="overlay-list">
                      {selectedNode.evidenceRefs.map((ref) => (
                        <button key={ref.id} type="button" className="overlay-item thinking-evidence-item" onClick={() => onJumpEvidence(ref)}>
                          <em className="thinking-evidence-kicker">{evidenceKindLabel(ref.kind)}</em>
                          <strong>{ref.label}</strong>
                          <span>{ref.summary || '这条证据没有摘要，点击可直接回跳查看原文或记录。'}</span>
                          <span className="thinking-evidence-context">
                            {[ref.path, ref.createdAt ? new Date(ref.createdAt).toLocaleString() : '', ref.missing ? '来源缺失' : '']
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                          <span className="thinking-evidence-action">
                            <span>打开来源</span>
                            <ArrowRight size={14} strokeWidth={1.8} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="thinking-chain-empty compact">选择一个节点后，右侧会显示它的决策内容、理由和证据上下文。</div>
              )}
            </aside>
          </section>
        </section>
      )}
    </div>
  );
}
