import type { ThinkingChainEdge, ThinkingChainNode, ThinkingChainNodeStage, ThinkingChainSnapshot } from '../../shared/types';

export type IdeaMapCanvasNode = {
  id: string;
  node: ThinkingChainNode;
  x: number;
  y: number;
  width: number;
  height: number;
  column: number;
  row: number;
};

export type IdeaMapCanvasEdge = {
  id: string;
  edge: ThinkingChainEdge;
  source: IdeaMapCanvasNode;
  target: IdeaMapCanvasNode;
  path: string;
  labelX: number;
  labelY: number;
};

export type IdeaMapLayoutModel = {
  width: number;
  height: number;
  nodes: IdeaMapCanvasNode[];
  edges: IdeaMapCanvasEdge[];
};

type EdgeAnchor = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  outLane: number;
  inLane: number;
};

type CanvasPoint = {
  x: number;
  y: number;
};

export const IDEA_MAP_MIN_ZOOM = 0.35;
export const IDEA_MAP_MAX_ZOOM = 2.4;
export const IDEA_MAP_NODE_WIDTH = 312;
export const IDEA_MAP_NODE_HEIGHT = 132;

const COLUMN_GAP = 440;
const ROW_GAP = 208;
const PADDING_X = 120;
const PADDING_Y = 96;
const EXTRA_CANVAS_X = 720;
const EXTRA_CANVAS_Y = 480;
const SWEEP_ITERATIONS = 6;
const CORNER_KAPPA = 0.5522847498307936;

function stageFloor(stage: ThinkingChainNodeStage) {
  switch (stage) {
    case 'core':
      return 0;
    case 'premise':
    case 'constraint':
      return 1;
    case 'conclusion':
      return 2;
    case 'exploration':
      return 5;
    case 'discarded':
      return 6;
    case 'materialized':
      return 4;
    default:
      return 0;
  }
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function nearestAvailableRow(usedRows: Set<number>, preferredRow: number) {
  const rounded = Math.max(0, Math.round(preferredRow));
  if (!usedRows.has(rounded)) return rounded;
  for (let delta = 1; delta < 256; delta += 1) {
    const upper = rounded + delta;
    if (!usedRows.has(upper)) return upper;
    const lower = rounded - delta;
    if (lower >= 0 && !usedRows.has(lower)) return lower;
  }
  return rounded + usedRows.size;
}

function manualRowHint(node: ThinkingChainNode) {
  return typeof node.manualPosition?.y === 'number' ? node.manualPosition.y / ROW_GAP : null;
}

function stagePriority(stage: ThinkingChainNodeStage) {
  switch (stage) {
    case 'core':
      return 0;
    case 'premise':
      return 1;
    case 'constraint':
      return 2;
    case 'conclusion':
      return 3;
    case 'exploration':
      return 4;
    case 'materialized':
      return 5;
    case 'discarded':
      return 6;
    default:
      return 0;
  }
}

function rowGapUnits(node: ThinkingChainNode, inboundCount: number, outboundCount: number) {
  const degree = inboundCount + outboundCount;
  if (degree >= 6 || inboundCount >= 3 || outboundCount >= 3) return 1;
  return 0;
}

function hubDropUnits(node: ThinkingChainNode, inboundCount: number, outboundCount: number) {
  if (node.stage !== 'conclusion') return 0;
  if (inboundCount < 2 || outboundCount < 2) return 0;
  return 1;
}

function buildRoundedTrackPath(points: CanvasPoint[], baseRadius: number) {
  if (points.length < 2) return '';

  const commands = [`M ${points[0].x} ${points[0].y}`];
  let current = points[0];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];

    const incomingX = Math.sign(corner.x - previous.x);
    const incomingY = Math.sign(corner.y - previous.y);
    const outgoingX = Math.sign(next.x - corner.x);
    const outgoingY = Math.sign(next.y - corner.y);
    const incomingLength = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoingLength = Math.hypot(next.x - corner.x, next.y - corner.y);

    if ((!incomingX && !incomingY) || (!outgoingX && !outgoingY) || incomingLength === 0 || outgoingLength === 0) {
      continue;
    }

    if (incomingX === outgoingX && incomingY === outgoingY) {
      continue;
    }

    const radius = Math.min(baseRadius, incomingLength / 2, outgoingLength / 2);
    const cornerStart = {
      x: corner.x - incomingX * radius,
      y: corner.y - incomingY * radius
    };
    const cornerEnd = {
      x: corner.x + outgoingX * radius,
      y: corner.y + outgoingY * radius
    };

    if (current.x !== cornerStart.x || current.y !== cornerStart.y) {
      commands.push(`L ${cornerStart.x} ${cornerStart.y}`);
    }

    const control1 = {
      x: cornerStart.x + incomingX * radius * CORNER_KAPPA,
      y: cornerStart.y + incomingY * radius * CORNER_KAPPA
    };
    const control2 = {
      x: cornerEnd.x - outgoingX * radius * CORNER_KAPPA,
      y: cornerEnd.y - outgoingY * radius * CORNER_KAPPA
    };

    commands.push(`C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${cornerEnd.x} ${cornerEnd.y}`);
    current = cornerEnd;
  }

  const last = points[points.length - 1];
  if (current.x !== last.x || current.y !== last.y) {
    commands.push(`L ${last.x} ${last.y}`);
  }

  return commands.join(' ');
}

export function clampIdeaMapZoom(value: number) {
  return Number(Math.min(IDEA_MAP_MAX_ZOOM, Math.max(IDEA_MAP_MIN_ZOOM, value)).toFixed(2));
}

export function buildIdeaMapLayout(snapshot: ThinkingChainSnapshot | null, nodes: ThinkingChainNode[]): IdeaMapLayoutModel {
  if (!snapshot || !nodes.length) {
    return {
      width: 1920,
      height: 1200,
      nodes: [],
      edges: []
    };
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const visibleEdges = snapshot.edges.filter((edge) => nodeById.has(edge.sourceId) && nodeById.has(edge.targetId));
  const inboundById = new Map<string, ThinkingChainEdge[]>();
  const outboundById = new Map<string, ThinkingChainEdge[]>();

  for (const node of nodes) {
    inboundById.set(node.id, []);
    outboundById.set(node.id, []);
  }
  for (const edge of visibleEdges) {
    inboundById.get(edge.targetId)?.push(edge);
    outboundById.get(edge.sourceId)?.push(edge);
  }

  const orderedNodes = [...nodes].sort((left, right) => left.order - right.order);
  const columnById = new Map<string, number>();

  for (const node of orderedNodes) {
    const inbound = inboundById.get(node.id) ?? [];
    const parentColumns = inbound.map((edge) => columnById.get(edge.sourceId) ?? 0);
    let column = stageFloor(node.stage);
    if (parentColumns.length) {
      column = Math.max(column, Math.max(...parentColumns) + 1);
    }
    if (node.stage === 'discarded') {
      column = Math.max(column, 5);
    }
    if (node.stage === 'materialized') {
      column = Math.max(column, 4);
    }
    columnById.set(node.id, column);
  }

  const nodesByColumn = new Map<number, ThinkingChainNode[]>();
  for (const node of orderedNodes) {
    const column = columnById.get(node.id) ?? 0;
    const bucket = nodesByColumn.get(column) ?? [];
    bucket.push(node);
    nodesByColumn.set(column, bucket);
  }

  const sortedColumns = [...nodesByColumn.keys()].sort((left, right) => left - right);
  const rankById = new Map<string, number>();

  const countExpandedCrossings = (positionById: Map<string, number>) => {
    const segmentsByColumn = new Map<number, Array<{ edgeId: string; y0: number; y1: number }>>();

    for (const edge of visibleEdges) {
      const sourceColumn = columnById.get(edge.sourceId) ?? 0;
      const targetColumn = columnById.get(edge.targetId) ?? 0;
      if (targetColumn <= sourceColumn) continue;

      const sourcePosition = positionById.get(edge.sourceId) ?? 0;
      const targetPosition = positionById.get(edge.targetId) ?? 0;
      const span = targetColumn - sourceColumn;

      for (let column = sourceColumn; column < targetColumn; column += 1) {
        const t0 = (column - sourceColumn) / span;
        const t1 = (column + 1 - sourceColumn) / span;
        const bucket = segmentsByColumn.get(column) ?? [];
        bucket.push({
          edgeId: edge.id,
          y0: sourcePosition + (targetPosition - sourcePosition) * t0,
          y1: sourcePosition + (targetPosition - sourcePosition) * t1
        });
        segmentsByColumn.set(column, bucket);
      }
    }

    let crossings = 0;
    for (const segments of segmentsByColumn.values()) {
      for (let index = 0; index < segments.length; index += 1) {
        const left = segments[index];
        for (let inner = index + 1; inner < segments.length; inner += 1) {
          const right = segments[inner];
          if (left.edgeId === right.edgeId) continue;
          const startDelta = left.y0 - right.y0;
          const endDelta = left.y1 - right.y1;
          if (startDelta === 0 || endDelta === 0) continue;
          if (Math.sign(startDelta) !== Math.sign(endDelta)) {
            crossings += 1;
          }
        }
      }
    }
    return crossings;
  };

  const applyBucketRanks = (bucket: ThinkingChainNode[]) => {
    bucket.forEach((node, index) => {
      rankById.set(node.id, index * 2);
    });
  };

  const initialPreferredRow = (node: ThinkingChainNode) => {
    const manualHint = manualRowHint(node);
    if (manualHint !== null) return manualHint;
    const inbound = inboundById.get(node.id) ?? [];
    if (!inbound.length) return node.order * 2;
    const parentHints = inbound
      .map((edge) => rankById.get(edge.sourceId))
      .filter((value): value is number => typeof value === 'number');
    if (parentHints.length) {
      return average(parentHints);
    }
    return node.order * 2;
  };

  for (const column of sortedColumns) {
    const bucket = [...(nodesByColumn.get(column) ?? [])].sort((left, right) => {
      const leftManual = manualRowHint(left);
      const rightManual = manualRowHint(right);
      if (leftManual !== null || rightManual !== null) {
        if (leftManual === null) return 1;
        if (rightManual === null) return -1;
        if (leftManual !== rightManual) return leftManual - rightManual;
      }
      const leftPreferred = initialPreferredRow(left);
      const rightPreferred = initialPreferredRow(right);
      if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;
      if (stagePriority(left.stage) !== stagePriority(right.stage)) {
        return stagePriority(left.stage) - stagePriority(right.stage);
      }
      return left.order - right.order;
    });
    nodesByColumn.set(column, bucket);
    applyBucketRanks(bucket);
  }

  const barycenter = (node: ThinkingChainNode, neighborIds: string[]) => {
    const manualHint = manualRowHint(node);
    const neighborRanks = neighborIds
      .map((id) => rankById.get(id))
      .filter((value): value is number => typeof value === 'number');
    if (neighborRanks.length) {
      return average(neighborRanks);
    }
    if (manualHint !== null) return manualHint;
    return rankById.get(node.id) ?? node.order * 2;
  };

  const reorderColumn = (column: number, direction: 'inbound' | 'outbound') => {
    const bucket = [...(nodesByColumn.get(column) ?? [])];
    bucket.sort((left, right) => {
      const leftManual = manualRowHint(left);
      const rightManual = manualRowHint(right);
      if (leftManual !== null || rightManual !== null) {
        if (leftManual === null) return 1;
        if (rightManual === null) return -1;
        if (leftManual !== rightManual) return leftManual - rightManual;
      }

      const leftNeighbors = direction === 'inbound'
        ? (inboundById.get(left.id) ?? []).map((edge) => edge.sourceId)
        : (outboundById.get(left.id) ?? []).map((edge) => edge.targetId);
      const rightNeighbors = direction === 'inbound'
        ? (inboundById.get(right.id) ?? []).map((edge) => edge.sourceId)
        : (outboundById.get(right.id) ?? []).map((edge) => edge.targetId);

      const leftBarycenter = barycenter(left, leftNeighbors);
      const rightBarycenter = barycenter(right, rightNeighbors);
      if (leftBarycenter !== rightBarycenter) return leftBarycenter - rightBarycenter;

      if (stagePriority(left.stage) !== stagePriority(right.stage)) {
        return stagePriority(left.stage) - stagePriority(right.stage);
      }
      return left.order - right.order;
    });
    nodesByColumn.set(column, bucket);
    applyBucketRanks(bucket);

    if (bucket.length < 2) {
      return;
    }

    let bestCrossings = countExpandedCrossings(rankById);
    let improved = true;

    while (improved) {
      improved = false;

      for (let index = 0; index < bucket.length - 1; index += 1) {
        const left = bucket[index];
        const right = bucket[index + 1];
        if (manualRowHint(left) !== null || manualRowHint(right) !== null) {
          continue;
        }

        bucket[index] = right;
        bucket[index + 1] = left;
        applyBucketRanks(bucket);

        const swappedCrossings = countExpandedCrossings(rankById);
        if (swappedCrossings < bestCrossings) {
          bestCrossings = swappedCrossings;
          improved = true;
          continue;
        }

        bucket[index] = left;
        bucket[index + 1] = right;
        applyBucketRanks(bucket);
      }
    }

    nodesByColumn.set(column, bucket);
  };

  for (let iteration = 0; iteration < SWEEP_ITERATIONS; iteration += 1) {
    for (let index = 1; index < sortedColumns.length; index += 1) {
      reorderColumn(sortedColumns[index], 'inbound');
    }
    for (let index = sortedColumns.length - 2; index >= 0; index -= 1) {
      reorderColumn(sortedColumns[index], 'outbound');
    }
  }

  const rowById = new Map<string, number>();
  for (const column of sortedColumns) {
    const bucket = nodesByColumn.get(column) ?? [];
    const usedRows = new Set<number>();
    let cursor = 0;
    for (const node of bucket) {
      const inbound = inboundById.get(node.id) ?? [];
      const outbound = outboundById.get(node.id) ?? [];
      const manualHint = manualRowHint(node);
      const neighborIds = [
        ...inbound.map((edge) => edge.sourceId),
        ...outbound.map((edge) => edge.targetId)
      ];
      const preferredBase = manualHint ?? barycenter(node, neighborIds);
      const dropUnits = hubDropUnits(node, inbound.length, outbound.length);
      const inboundRows = inbound
        .map((edge) => rowById.get(edge.sourceId))
        .filter((value): value is number => typeof value === 'number');
      const hubFloor = inboundRows.length >= 2 && dropUnits > 0
        ? Math.max(...inboundRows) + dropUnits
        : preferredBase;
      const preferred = Math.max(preferredBase, hubFloor);
      const row = nearestAvailableRow(usedRows, Math.max(cursor, preferred));
      usedRows.add(row);
      rowById.set(node.id, row);
      cursor = row + 1 + rowGapUnits(node, inbound.length, outbound.length);
    }
  }

  const layoutNodes: IdeaMapCanvasNode[] = orderedNodes.map((node) => {
    const column = columnById.get(node.id) ?? 0;
    const row = rowById.get(node.id) ?? 0;
    const autoX = PADDING_X + column * COLUMN_GAP;
    const autoY = PADDING_Y + row * ROW_GAP;
    return {
      id: node.id,
      node,
      column,
      row,
      x: node.manualPosition?.x ?? autoX,
      y: node.manualPosition?.y ?? autoY,
      width: IDEA_MAP_NODE_WIDTH,
      height: IDEA_MAP_NODE_HEIGHT
    };
  });

  const layoutById = new Map(layoutNodes.map((node) => [node.id, node]));
  const outgoingIndex = new Map<string, Map<string, number>>();
  const incomingIndex = new Map<string, Map<string, number>>();

  for (const node of nodes) {
    const outbound = [...(outboundById.get(node.id) ?? [])].sort((left, right) => {
      const leftTarget = layoutById.get(left.targetId);
      const rightTarget = layoutById.get(right.targetId);
      return (leftTarget?.y ?? 0) - (rightTarget?.y ?? 0);
    });
    outgoingIndex.set(node.id, new Map(outbound.map((edge, index) => [edge.id, index])));

    const inbound = [...(inboundById.get(node.id) ?? [])].sort((left, right) => {
      const leftSource = layoutById.get(left.sourceId);
      const rightSource = layoutById.get(right.sourceId);
      return (leftSource?.y ?? 0) - (rightSource?.y ?? 0);
    });
    incomingIndex.set(node.id, new Map(inbound.map((edge, index) => [edge.id, index])));
  }

  const edgeAnchorById = new Map<string, EdgeAnchor>();
  for (const edge of visibleEdges) {
    const source = layoutById.get(edge.sourceId);
    const target = layoutById.get(edge.targetId);
    if (!source || !target) continue;

    const outboundCount = (outboundById.get(source.id) ?? []).length;
    const inboundCount = (inboundById.get(target.id) ?? []).length;
    const outIndex = outgoingIndex.get(source.id)?.get(edge.id) ?? 0;
    const inIndex = incomingIndex.get(target.id)?.get(edge.id) ?? 0;
    const outLane = outIndex - (outboundCount - 1) / 2;
    const inLane = inIndex - (inboundCount - 1) / 2;
    const laneOffset = 14;
    edgeAnchorById.set(edge.id, {
      startX: source.x + source.width,
      startY: source.y + source.height / 2 + outLane * laneOffset,
      endX: target.x,
      endY: target.y + target.height / 2 + inLane * laneOffset,
      outLane,
      inLane
    });
  }

  const trackedGapRouting = new Map<string, { xLeft: number; xRight: number; trackY: number }>();
  const adjacentEdgeGroups = new Map<string, ThinkingChainEdge[]>();

  for (const edge of visibleEdges) {
    const source = layoutById.get(edge.sourceId);
    const target = layoutById.get(edge.targetId);
    if (!source || !target) continue;
    if (target.column !== source.column + 1) continue;
    const key = `${source.column}:${target.column}`;
    const bucket = adjacentEdgeGroups.get(key) ?? [];
    bucket.push(edge);
    adjacentEdgeGroups.set(key, bucket);
  }

  for (const group of adjacentEdgeGroups.values()) {
    if (group.length < 2) continue;

    let hasConflict = false;
    for (let index = 0; index < group.length; index += 1) {
      const left = group[index];
      const leftAnchor = edgeAnchorById.get(left.id);
      if (!leftAnchor) continue;
      for (let inner = index + 1; inner < group.length; inner += 1) {
        const right = group[inner];
        const rightAnchor = edgeAnchorById.get(right.id);
        if (!rightAnchor) continue;
        const sourceDelta = leftAnchor.startY - rightAnchor.startY;
        const targetDelta = leftAnchor.endY - rightAnchor.endY;
        if (sourceDelta === 0 || targetDelta === 0) continue;
        if (Math.sign(sourceDelta) !== Math.sign(targetDelta)) {
          hasConflict = true;
          break;
        }
      }
      if (hasConflict) break;
    }

    if (!hasConflict) continue;

    const groupAnchors = group
      .map((edge) => ({
        edge,
        anchor: edgeAnchorById.get(edge.id)
      }))
      .filter((item): item is { edge: ThinkingChainEdge; anchor: EdgeAnchor } => Boolean(item.anchor))
      .sort((left, right) => {
        const leftMid = (left.anchor.startY + left.anchor.endY) / 2;
        const rightMid = (right.anchor.startY + right.anchor.endY) / 2;
        if (leftMid !== rightMid) return leftMid - rightMid;
        if (left.anchor.startY !== right.anchor.startY) return left.anchor.startY - right.anchor.startY;
        return left.edge.id.localeCompare(right.edge.id);
      });

    const trackSpacing = 18;
    const naturalTracks = groupAnchors.map((item) => (item.anchor.startY + item.anchor.endY) / 2);
    const positionedTracks = [...naturalTracks];
    for (let index = 1; index < positionedTracks.length; index += 1) {
      positionedTracks[index] = Math.max(positionedTracks[index], positionedTracks[index - 1] + trackSpacing);
    }
    for (let index = positionedTracks.length - 2; index >= 0; index -= 1) {
      positionedTracks[index] = Math.min(positionedTracks[index], positionedTracks[index + 1] - trackSpacing);
    }

    const baseXLeft = Math.max(...groupAnchors.map((item) => item.anchor.startX)) + 18;
    const baseXRight = Math.min(...groupAnchors.map((item) => item.anchor.endX)) - 18;
    if (baseXRight <= baseXLeft + 12) continue;

    groupAnchors.forEach((item, index) => {
      trackedGapRouting.set(item.edge.id, {
        xLeft: baseXLeft,
        xRight: baseXRight,
        trackY: positionedTracks[index]
      });
    });
  }

  const layoutEdges: IdeaMapCanvasEdge[] = visibleEdges.flatMap((edge) => {
    const source = layoutById.get(edge.sourceId);
    const target = layoutById.get(edge.targetId);
    if (!source || !target) return [];

    const anchor = edgeAnchorById.get(edge.id);
    if (!anchor) return [];

    const { startX, startY, endX, endY, outLane, inLane } = anchor;
    const trackedRoute = trackedGapRouting.get(edge.id);
    if (trackedRoute) {
      const { xLeft, xRight, trackY } = trackedRoute;
      const cornerRadius = Math.max(
        6,
        Math.min(
          8,
          (xRight - xLeft) / 4,
          Math.abs(trackY - startY) / 2 || 8,
          Math.abs(endY - trackY) / 2 || 8
        )
      );
      return [{
        id: edge.id,
        edge,
        source,
        target,
        path: buildRoundedTrackPath([
          { x: startX, y: startY },
          { x: xLeft, y: startY },
          { x: xLeft, y: trackY },
          { x: xRight, y: trackY },
          { x: xRight, y: endY },
          { x: endX, y: endY }
        ], cornerRadius),
        labelX: (xLeft + xRight) / 2,
        labelY: trackY - 18
      }];
    }

    const span = Math.max(160, endX - startX);
    const handleReach = Math.max(48, Math.min(148, span * 0.28, span / 2 - 24));
    const controlX1 = startX + handleReach;
    const controlX2 = endX - handleReach;
    const midX = startX + span / 2;
    const midpointY = (startY + endY) / 2;
    const verticalDelta = endY - startY;
    const nearlyAligned = Math.abs(verticalDelta) < 10;
    // Keep a minimum bow for nearly horizontal edges so drag-time alignment
    // does not visually collapse a curved relation into a dead-straight line.
    const alignedCurveLift = nearlyAligned
      ? Math.max(18, Math.min(54, span * 0.12))
      : 0;
    const bowDirection = outLane !== inLane
      ? Math.sign(inLane - outLane) || -1
      : -1;
    const controlY1 = nearlyAligned ? startY + bowDirection * alignedCurveLift : startY;
    const controlY2 = nearlyAligned ? endY + bowDirection * alignedCurveLift : endY;
    const labelYOffset = 18 + Math.abs(outLane - inLane) * 4;

    return [{
      id: edge.id,
      edge,
      source,
      target,
      path: [
        `M ${startX} ${startY}`,
        `C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${endX} ${endY}`
      ].join(' '),
      labelX: midX,
      labelY: midpointY - labelYOffset - (nearlyAligned ? alignedCurveLift * 0.35 : 0)
    }];
  });

  const maxX = layoutNodes.reduce((current, node) => Math.max(current, node.x + node.width), 0);
  const maxY = layoutNodes.reduce((current, node) => Math.max(current, node.y + node.height), 0);

  return {
    width: Math.max(2400, maxX + EXTRA_CANVAS_X),
    height: Math.max(1600, maxY + EXTRA_CANVAS_Y),
    nodes: layoutNodes,
    edges: layoutEdges
  };
}
