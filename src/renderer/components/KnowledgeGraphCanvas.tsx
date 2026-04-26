import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Move, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import type {
  KnowledgeGraphPathResult,
  KnowledgeGraphRelation
} from '../../shared/project-knowledge-graph';
import type { KnowledgeLinkNode } from '../../shared/types';

type CanvasNodeTone = 'selected' | 'inbound' | 'outbound' | 'path';

type CanvasNode = {
  id: string;
  node: KnowledgeLinkNode;
  x: number;
  y: number;
  tone: CanvasNodeTone;
};

type CanvasEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  tone: 'relation' | 'path';
};

const MIN_ZOOM = 0.72;
const MAX_ZOOM = 1.42;

function clampZoom(value: number) {
  return Number(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)).toFixed(2));
}

function buildCanvasModel(
  selectedNode: KnowledgeLinkNode | null,
  relations: KnowledgeGraphRelation[],
  path: KnowledgeGraphPathResult | null
) {
  if (!selectedNode) {
    return {
      width: 1120,
      height: 420,
      nodes: [] as CanvasNode[],
      edges: [] as CanvasEdge[]
    };
  }

  const nodes = new Map<string, CanvasNode>();
  const edges = new Map<string, CanvasEdge>();
  const centerX = 560;
  const centerY = 200;

  const upsertNode = (node: KnowledgeLinkNode, x: number, y: number, tone: CanvasNodeTone) => {
    const existing = nodes.get(node.id);
    if (!existing || tone === 'selected' || tone === 'path') {
      nodes.set(node.id, { id: node.id, node, x, y, tone });
    }
  };

  const upsertEdge = (edge: CanvasEdge) => {
    if (!edges.has(edge.id)) {
      edges.set(edge.id, edge);
    }
  };

  upsertNode(selectedNode, centerX, centerY, 'selected');

  const inbound = relations.filter((relation) => relation.direction === 'inbound');
  const outbound = relations.filter((relation) => relation.direction === 'outbound');

  const layoutColumn = (items: KnowledgeGraphRelation[], x: number, tone: CanvasNodeTone) => {
    const spacing = 112;
    const top = centerY - ((items.length - 1) * spacing) / 2;
    items.forEach((relation, index) => {
      upsertNode(relation.peerNode, x, top + index * spacing, tone);
      upsertEdge({
        id: relation.edge.id,
        sourceId: relation.direction === 'inbound' ? relation.peerNode.id : selectedNode.id,
        targetId: relation.direction === 'inbound' ? selectedNode.id : relation.peerNode.id,
        label: relation.edge.label || relation.edge.type,
        tone: 'relation'
      });
    });
  };

  layoutColumn(inbound, 180, 'inbound');
  layoutColumn(outbound, 940, 'outbound');

  const extraPathNodes = (path?.nodes ?? []).filter((node) => !nodes.has(node.id));
  extraPathNodes.forEach((node, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    upsertNode(node, 220 + col * 210, 380 + row * 116, 'path');
  });

  for (const step of path?.steps ?? []) {
    if (!nodes.has(step.fromNode.id)) {
      upsertNode(step.fromNode, 220, 380, 'path');
    }
    if (!nodes.has(step.toNode.id)) {
      upsertNode(step.toNode, 430, 380, 'path');
    }
    upsertEdge({
      id: `path:${step.edge.id}:${step.fromNode.id}:${step.toNode.id}`,
      sourceId: step.direction === 'outbound' ? step.fromNode.id : step.toNode.id,
      targetId: step.direction === 'outbound' ? step.toNode.id : step.fromNode.id,
      label: step.edge.label || step.edge.type,
      tone: 'path'
    });
  }

  const canvasNodes = [...nodes.values()];
  const canvasEdges = [...edges.values()];
  const maxY = canvasNodes.reduce((current, node) => Math.max(current, node.y), 0);
  return {
    width: 1120,
    height: Math.max(420, maxY + 120),
    nodes: canvasNodes,
    edges: canvasEdges
  };
}

function edgePath(source: CanvasNode, target: CanvasNode) {
  const controlOffset = Math.max(80, Math.abs(target.x - source.x) * 0.32);
  return `M ${source.x} ${source.y} C ${source.x + controlOffset} ${source.y}, ${target.x - controlOffset} ${target.y}, ${target.x} ${target.y}`;
}

function nodeKindLabel(kind: KnowledgeLinkNode['kind']) {
  switch (kind) {
    case 'flow':
      return '流程';
    case 'artifact':
      return '工件';
    case 'document':
      return '文档';
    case 'rule':
      return '规则';
    case 'accumulation':
      return '沉淀';
    case 'promotion':
      return '草案';
    case 'knowledge':
      return '知识';
    case 'skill':
      return 'Skill';
    case 'run':
      return '运行';
    default:
      return kind;
  }
}

export function KnowledgeGraphCanvas({
  selectedNode,
  relations,
  path,
  onSelectNode
}: {
  selectedNode: KnowledgeLinkNode | null;
  relations: KnowledgeGraphRelation[];
  path: KnowledgeGraphPathResult | null;
  onSelectNode: (nodeId: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const model = useMemo(() => buildCanvasModel(selectedNode, relations, path), [path, relations, selectedNode]);
  const nodeById = useMemo(() => new Map(model.nodes.map((node) => [node.id, node])), [model.nodes]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = shellRef.current;
    if (!current) return;
    if ((event.target as HTMLElement | null)?.closest('.rules-graph-canvas-node')) {
      return;
    }
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: current.scrollLeft,
      scrollTop: current.scrollTop
    };
    current.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = shellRef.current;
    const dragState = dragStateRef.current;
    if (!current || !dragState) return;
    current.scrollLeft = dragState.scrollLeft - (event.clientX - dragState.startX);
    current.scrollTop = dragState.scrollTop - (event.clientY - dragState.startY);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = shellRef.current;
    if (current?.hasPointerCapture(event.pointerId)) {
      current.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setDragging(false);
  };

  const fitView = () => {
    setZoom(1);
    if (shellRef.current) {
      shellRef.current.scrollLeft = 0;
      shellRef.current.scrollTop = 0;
    }
  };

  if (!selectedNode) {
    return <div className="thinking-chain-empty compact">当前没有可展示的知识图对象。</div>;
  }

  return (
    <section className="rules-graph-canvas-panel" data-testid="knowledge-graph-canvas">
      <div className="workspace-subhead">
        <div>
          <div className="section-kicker">图谱画布</div>
          <strong>围绕当前对象查看直接关系与路径节点</strong>
        </div>
        <div className="icon-actions">
          <button type="button" className="button-secondary icon-text" onClick={() => setZoom((current) => clampZoom(current - 0.1))}>
            <ZoomOut size={14} strokeWidth={1.8} />
            <span>缩小</span>
          </button>
          <button type="button" className="button-secondary icon-text" onClick={() => setZoom((current) => clampZoom(current + 0.1))}>
            <ZoomIn size={14} strokeWidth={1.8} />
            <span>放大</span>
          </button>
          <button type="button" className="button-secondary icon-text" onClick={fitView}>
            <RefreshCw size={14} strokeWidth={1.8} />
            <span>Fit View</span>
          </button>
        </div>
      </div>
      <div className="thinking-chain-pan-hint">
        <Move size={14} strokeWidth={1.8} />
        <span>拖动画布可平移，点击节点可切换当前对象。</span>
      </div>
      <div
        ref={shellRef}
        className={`rules-graph-canvas-shell ${dragging ? 'dragging' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div className="rules-graph-canvas" style={{ width: model.width, height: model.height, transform: `scale(${zoom})` }}>
          <svg className="rules-graph-canvas-svg" viewBox={`0 0 ${model.width} ${model.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            {model.edges.map((edge) => {
              const source = nodeById.get(edge.sourceId);
              const target = nodeById.get(edge.targetId);
              if (!source || !target) return null;
              const midX = (source.x + target.x) / 2;
              const midY = (source.y + target.y) / 2;
              return (
                <g key={edge.id}>
                  <path d={edgePath(source, target)} className={`rules-graph-canvas-edge ${edge.tone}`} />
                  <text x={midX} y={midY - 8} className="rules-graph-canvas-edge-label">
                    {edge.label}
                  </text>
                </g>
              );
            })}
          </svg>
          {model.nodes.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rules-graph-canvas-node tone-${item.tone} ${selectedNode.id === item.id ? 'selected' : ''}`}
              style={{ left: item.x, top: item.y }}
              onClick={() => onSelectNode(item.id)}
            >
              <span className="small-tag">{nodeKindLabel(item.node.kind)}</span>
              <strong>{item.node.title}</strong>
              <div className="muted-line">{item.node.summary}</div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
