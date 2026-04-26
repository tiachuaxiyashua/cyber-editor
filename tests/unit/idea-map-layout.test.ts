import { describe, expect, it } from 'vitest';
import type { ThinkingChainNode, ThinkingChainSnapshot } from '../../src/shared/types.js';
import {
  IDEA_MAP_MAX_ZOOM,
  IDEA_MAP_MIN_ZOOM,
  buildIdeaMapLayout,
  clampIdeaMapZoom
} from '../../src/renderer/lib/idea-map-layout.js';

function node(
  partial: Partial<ThinkingChainNode> &
  Pick<ThinkingChainNode, 'id' | 'title' | 'summary' | 'kind' | 'status' | 'lane' | 'order' | 'level' | 'stage'>
): ThinkingChainNode {
  return {
    evidenceRefs: [],
    semanticKey: partial.semanticKey ?? partial.id,
    ...partial
  };
}

function countSameSpanCrossings(model: ReturnType<typeof buildIdeaMapLayout>) {
  let crossings = 0;
  for (let index = 0; index < model.edges.length; index += 1) {
    const left = model.edges[index];
    for (let inner = index + 1; inner < model.edges.length; inner += 1) {
      const right = model.edges[inner];
      if (left.source.column !== right.source.column || left.target.column !== right.target.column) {
        continue;
      }
      const sourceDelta = left.source.y - right.source.y;
      const targetDelta = left.target.y - right.target.y;
      if (sourceDelta === 0 || targetDelta === 0) continue;
      if (Math.sign(sourceDelta) !== Math.sign(targetDelta)) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

function countCubicSegments(path: string) {
  return (path.match(/\bC\b/g) ?? []).length;
}

function maxVerticalDeviationFromChord(edge: ReturnType<typeof buildIdeaMapLayout>['edges'][number]) {
  const segments = pathSegments(edge.path, 20);
  if (!segments.length) return 0;

  const startY = edge.source.y + edge.source.height / 2;
  const endY = edge.target.y + edge.target.height / 2;
  const spanX = edge.target.x - (edge.source.x + edge.source.width);
  if (Math.abs(spanX) < 0.001) return 0;

  const expectedYAt = (x: number) => {
    const t = (x - (edge.source.x + edge.source.width)) / spanX;
    return startY + (endY - startY) * t;
  };

  let maxDeviation = 0;
  for (const segment of segments) {
    const deviationStart = Math.abs(segment.y1 - expectedYAt(segment.x1));
    const deviationEnd = Math.abs(segment.y2 - expectedYAt(segment.x2));
    maxDeviation = Math.max(maxDeviation, deviationStart, deviationEnd);
  }
  return maxDeviation;
}

function countExpandedLayerCrossings(model: ReturnType<typeof buildIdeaMapLayout>) {
  const segments = model.edges.flatMap((edge) => {
    const startColumn = edge.source.column;
    const endColumn = edge.target.column;
    if (endColumn <= startColumn) return [];

    const sourceRow = edge.source.row;
    const targetRow = edge.target.row;
    const span = endColumn - startColumn;

    return Array.from({ length: span }, (_, offset) => {
      const column = startColumn + offset;
      const t0 = offset / span;
      const t1 = (offset + 1) / span;
      return {
        edgeId: edge.id,
        column,
        y0: sourceRow + (targetRow - sourceRow) * t0,
        y1: sourceRow + (targetRow - sourceRow) * t1
      };
    });
  });

  let crossings = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const left = segments[index];
    for (let inner = index + 1; inner < segments.length; inner += 1) {
      const right = segments[inner];
      if (left.column !== right.column || left.edgeId === right.edgeId) continue;
      const startDelta = left.y0 - right.y0;
      const endDelta = left.y1 - right.y1;
      if (startDelta === 0 || endDelta === 0) continue;
      if (Math.sign(startDelta) !== Math.sign(endDelta)) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

function pathSegments(path: string, curveSteps = 12) {
  const tokens = path.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) ?? [];
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  let index = 0;
  let currentX = 0;
  let currentY = 0;

  while (index < tokens.length) {
    const command = tokens[index];
    index += 1;

    if (command === 'M') {
      currentX = Number(tokens[index]);
      currentY = Number(tokens[index + 1]);
      index += 2;
      continue;
    }

    if (command === 'L') {
      const nextX = Number(tokens[index]);
      const nextY = Number(tokens[index + 1]);
      index += 2;
      segments.push({ x1: currentX, y1: currentY, x2: nextX, y2: nextY });
      currentX = nextX;
      currentY = nextY;
      continue;
    }

    if (command === 'C') {
      const controlX1 = Number(tokens[index]);
      const controlY1 = Number(tokens[index + 1]);
      const controlX2 = Number(tokens[index + 2]);
      const controlY2 = Number(tokens[index + 3]);
      const nextX = Number(tokens[index + 4]);
      const nextY = Number(tokens[index + 5]);
      index += 6;

      let previousX = currentX;
      let previousY = currentY;
      for (let step = 1; step <= curveSteps; step += 1) {
        const t = step / curveSteps;
        const inverse = 1 - t;
        const sampleX = (inverse ** 3 * currentX)
          + (3 * inverse ** 2 * t * controlX1)
          + (3 * inverse * t ** 2 * controlX2)
          + (t ** 3 * nextX);
        const sampleY = (inverse ** 3 * currentY)
          + (3 * inverse ** 2 * t * controlY1)
          + (3 * inverse * t ** 2 * controlY2)
          + (t ** 3 * nextY);
        segments.push({ x1: previousX, y1: previousY, x2: sampleX, y2: sampleY });
        previousX = sampleX;
        previousY = sampleY;
      }
      currentX = nextX;
      currentY = nextY;
    }
  }

  return segments;
}

function countPathCrossings(model: ReturnType<typeof buildIdeaMapLayout>) {
  const edges = model.edges.map((edge) => ({
    edgeId: edge.id,
    segments: pathSegments(edge.path)
  }));
  const epsilon = 0.001;

  const orientation = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
    ((bx - ax) * (cy - ay)) - ((by - ay) * (cx - ax));

  const intersects = (
    left: { x1: number; y1: number; x2: number; y2: number },
    right: { x1: number; y1: number; x2: number; y2: number }
  ) => {
    const o1 = orientation(left.x1, left.y1, left.x2, left.y2, right.x1, right.y1);
    const o2 = orientation(left.x1, left.y1, left.x2, left.y2, right.x2, right.y2);
    const o3 = orientation(right.x1, right.y1, right.x2, right.y2, left.x1, left.y1);
    const o4 = orientation(right.x1, right.y1, right.x2, right.y2, left.x2, left.y2);

    if (Math.abs(o1) < epsilon || Math.abs(o2) < epsilon || Math.abs(o3) < epsilon || Math.abs(o4) < epsilon) {
      return false;
    }

    return Math.sign(o1) !== Math.sign(o2) && Math.sign(o3) !== Math.sign(o4);
  };

  let crossings = 0;
  for (let index = 0; index < edges.length; index += 1) {
    const left = edges[index];
    for (let inner = index + 1; inner < edges.length; inner += 1) {
      const right = edges[inner];
      for (const leftSegment of left.segments) {
        for (const rightSegment of right.segments) {
          if (intersects(leftSegment, rightSegment)) {
            crossings += 1;
          }
        }
      }
    }
  }
  return crossings;
}

describe('idea map layout', () => {
  it('keeps the idea progression layered and lets documents materialize from their adopted thought nodes', () => {
    const snapshot: ThinkingChainSnapshot = {
      sessionId: 's1',
      sessionTitle: 'complex map',
      generatedAt: '2026-04-18T00:00:00.000Z',
      counts: {
        totalNodes: 10,
        rejectedNodes: 1,
        orphanedNodes: 0
      },
      sourceRefs: [],
      layoutState: null,
      nodes: [
        node({ id: 'goal', title: 'Core idea', summary: 'Build a Europe trip planning workbench', kind: 'goal', status: 'active', lane: 'focus', stage: 'core', order: 0, level: 0 }),
        node({ id: 'user-profile', title: 'User profile', summary: 'First-time independent traveler needs a clear plan', kind: 'branch', status: 'accepted', lane: 'formed', stage: 'premise', order: 1, level: 1 }),
        node({ id: 'risk', title: 'Budget constraint', summary: 'Budget must stay controllable and offline-readable', kind: 'criterion', status: 'accepted', lane: 'formed', stage: 'constraint', order: 2, level: 1 }),
        node({ id: 'itinerary', title: 'Itinerary skeleton', summary: 'Countries, cities, and daily route first', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 3, level: 2 }),
        node({ id: 'budget', title: 'Budget strategy', summary: 'Cap flight and hotel first, then split daily budget', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 4, level: 2 }),
        node({ id: 'shell', title: 'Workbench shell', summary: 'Editor-like shell that carries itinerary and budget decisions', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 5, level: 3 }),
        node({ id: 'explore', title: 'Explore direction', summary: 'Should collaboration be supported later?', kind: 'branch', status: 'active', lane: 'exploration', stage: 'exploration', order: 6, level: 4 }),
        node({ id: 'rejected', title: 'Discarded direction', summary: 'Pure chatbot shell is abandoned', kind: 'rejected', status: 'rejected', lane: 'discarded', stage: 'discarded', order: 7, level: 4 }),
        node({ id: 'itinerary-doc', title: 'Document: itinerary.md', summary: 'Materialized from itinerary skeleton', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 8, level: 5 }),
        node({ id: 'budget-doc', title: 'Document: budget.md', summary: 'Materialized from budget strategy', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 9, level: 5 })
      ],
      edges: [
        { id: 'e1', sourceId: 'goal', targetId: 'user-profile', kind: 'supports', label: '拆解' },
        { id: 'e2', sourceId: 'goal', targetId: 'risk', kind: 'constrains', label: '约束' },
        { id: 'e3', sourceId: 'user-profile', targetId: 'itinerary', kind: 'derives', label: '推导' },
        { id: 'e4', sourceId: 'risk', targetId: 'budget', kind: 'constrains', label: '约束' },
        { id: 'e5', sourceId: 'itinerary', targetId: 'shell', kind: 'derives', label: '推导' },
        { id: 'e6', sourceId: 'budget', targetId: 'shell', kind: 'constrains', label: '约束' },
        { id: 'e7', sourceId: 'shell', targetId: 'explore', kind: 'explores', label: '延伸探索' },
        { id: 'e8', sourceId: 'shell', targetId: 'rejected', kind: 'replaces', label: '替代/已废弃' },
        { id: 'e9', sourceId: 'itinerary', targetId: 'itinerary-doc', kind: 'materializes', label: '落地到' },
        { id: 'e10', sourceId: 'budget', targetId: 'budget-doc', kind: 'materializes', label: '落地到' }
      ]
    };

    const model = buildIdeaMapLayout(snapshot, snapshot.nodes);

    const goal = model.nodes.find((item) => item.id === 'goal');
    const userProfile = model.nodes.find((item) => item.id === 'user-profile');
    const risk = model.nodes.find((item) => item.id === 'risk');
    const itinerary = model.nodes.find((item) => item.id === 'itinerary');
    const budget = model.nodes.find((item) => item.id === 'budget');
    const shell = model.nodes.find((item) => item.id === 'shell');
    const explore = model.nodes.find((item) => item.id === 'explore');
    const rejected = model.nodes.find((item) => item.id === 'rejected');
    const itineraryDoc = model.nodes.find((item) => item.id === 'itinerary-doc');
    const budgetDoc = model.nodes.find((item) => item.id === 'budget-doc');

    expect(goal && userProfile && risk && itinerary && budget && shell && explore && rejected && itineraryDoc && budgetDoc).toBeTruthy();
    expect(userProfile!.x).toBeGreaterThan(goal!.x);
    expect(Math.abs(risk!.x - userProfile!.x)).toBeLessThanOrEqual(120);
    expect(itinerary!.x).toBeGreaterThan(userProfile!.x);
    expect(budget!.x).toBeGreaterThan(risk!.x);
    expect(shell!.x).toBeGreaterThan(Math.max(itinerary!.x, budget!.x));
    expect(explore!.x).toBeGreaterThan(shell!.x);
    expect(rejected!.x).toBeGreaterThan(explore!.x);
    expect(itineraryDoc!.x).toBeGreaterThan(itinerary!.x);
    expect(budgetDoc!.x).toBeGreaterThan(budget!.x);
    expect(Math.abs(itineraryDoc!.y - itinerary!.y)).toBeLessThanOrEqual(220);
    expect(Math.abs(budgetDoc!.y - budget!.y)).toBeLessThanOrEqual(220);

    const shellInbound = model.edges.filter((edge) => edge.target.id === 'shell');
    expect(shellInbound).toHaveLength(2);
  });

  it('drops multi-parent distribution hubs below their inbound cluster to reduce fan-in overlap', () => {
    const snapshot: ThinkingChainSnapshot = {
      sessionId: 's1',
      sessionTitle: 'hub layout',
      generatedAt: '2026-04-18T00:00:00.000Z',
      counts: {
        totalNodes: 10,
        rejectedNodes: 1,
        orphanedNodes: 0
      },
      sourceRefs: [],
      layoutState: null,
      nodes: [
        node({ id: 'goal', title: 'Core idea', summary: 'Build a Europe trip planning workbench', kind: 'goal', status: 'active', lane: 'focus', stage: 'core', order: 0, level: 0 }),
        node({ id: 'user-profile', title: 'User profile', summary: 'First-time independent traveler needs a clear plan', kind: 'branch', status: 'accepted', lane: 'formed', stage: 'premise', order: 1, level: 1 }),
        node({ id: 'risk', title: 'Budget constraint', summary: 'Budget must stay controllable and offline-readable', kind: 'criterion', status: 'accepted', lane: 'formed', stage: 'constraint', order: 2, level: 1 }),
        node({ id: 'itinerary', title: 'Itinerary skeleton', summary: 'Countries, cities, and daily route first', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 3, level: 2 }),
        node({ id: 'budget', title: 'Budget strategy', summary: 'Cap flight and hotel first, then split daily budget', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 4, level: 2 }),
        node({ id: 'shell', title: 'Workbench shell', summary: 'Editor-like shell that carries itinerary and budget decisions', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 5, level: 3 }),
        node({ id: 'explore', title: 'Explore direction', summary: 'Should collaboration be supported later?', kind: 'branch', status: 'active', lane: 'exploration', stage: 'exploration', order: 6, level: 4 }),
        node({ id: 'rejected', title: 'Discarded direction', summary: 'Pure chatbot shell is abandoned', kind: 'rejected', status: 'rejected', lane: 'discarded', stage: 'discarded', order: 7, level: 4 }),
        node({ id: 'itinerary-doc', title: 'Document: itinerary.md', summary: 'Materialized from itinerary skeleton', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 8, level: 5 }),
        node({ id: 'budget-doc', title: 'Document: budget.md', summary: 'Materialized from budget strategy', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 9, level: 5 })
      ],
      edges: [
        { id: 'e1', sourceId: 'goal', targetId: 'user-profile', kind: 'supports', label: '拆解' },
        { id: 'e2', sourceId: 'goal', targetId: 'risk', kind: 'constrains', label: '约束' },
        { id: 'e3', sourceId: 'user-profile', targetId: 'itinerary', kind: 'derives', label: '推导' },
        { id: 'e4', sourceId: 'risk', targetId: 'budget', kind: 'constrains', label: '约束' },
        { id: 'e5', sourceId: 'itinerary', targetId: 'shell', kind: 'derives', label: '推导' },
        { id: 'e6', sourceId: 'budget', targetId: 'shell', kind: 'constrains', label: '约束' },
        { id: 'e7', sourceId: 'shell', targetId: 'explore', kind: 'explores', label: '延伸探索' },
        { id: 'e8', sourceId: 'shell', targetId: 'rejected', kind: 'replaces', label: '替代/已废弃' },
        { id: 'e9', sourceId: 'itinerary', targetId: 'itinerary-doc', kind: 'materializes', label: '落地到' },
        { id: 'e10', sourceId: 'budget', targetId: 'budget-doc', kind: 'materializes', label: '落地到' }
      ]
    };

    const model = buildIdeaMapLayout(snapshot, snapshot.nodes);
    const itinerary = model.nodes.find((item) => item.id === 'itinerary');
    const budget = model.nodes.find((item) => item.id === 'budget');
    const shell = model.nodes.find((item) => item.id === 'shell');

    expect(itinerary && budget && shell).toBeTruthy();
    expect(shell!.y).toBeGreaterThan(Math.max(itinerary!.y, budget!.y));
  });

  it('clamps zoom to the extended stable range', () => {
    expect(clampIdeaMapZoom(0.1)).toBe(IDEA_MAP_MIN_ZOOM);
    expect(clampIdeaMapZoom(9)).toBe(IDEA_MAP_MAX_ZOOM);
    expect(clampIdeaMapZoom(1.37)).toBe(1.37);
  });

  it('reduces same-span edge crossings for a multi-parent and multi-document map', () => {
    const snapshot: ThinkingChainSnapshot = {
      sessionId: 's2',
      sessionTitle: 'crossing pressure',
      generatedAt: '2026-04-18T00:00:00.000Z',
      counts: {
        totalNodes: 11,
        rejectedNodes: 1,
        orphanedNodes: 0
      },
      sourceRefs: [],
      layoutState: null,
      nodes: [
        node({ id: 'goal', title: 'Core', summary: 'Europe planner workbench', kind: 'goal', status: 'active', lane: 'focus', stage: 'core', order: 0, level: 0 }),
        node({ id: 'user', title: 'User profile', summary: 'First-time independent traveler', kind: 'branch', status: 'accepted', lane: 'formed', stage: 'premise', order: 1, level: 1 }),
        node({ id: 'risk', title: 'Risk constraint', summary: 'Budget and offline readability', kind: 'criterion', status: 'accepted', lane: 'formed', stage: 'constraint', order: 2, level: 1 }),
        node({ id: 'itinerary', title: 'Itinerary skeleton', summary: 'Country and city sequence', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 3, level: 2 }),
        node({ id: 'budget', title: 'Budget strategy', summary: 'Cap flight and hotel first', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 4, level: 2 }),
        node({ id: 'shell', title: 'Workbench shell', summary: 'Carries traveler, budget and itinerary', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 5, level: 2 }),
        node({ id: 'doc-root', title: 'Document: requirement.md', summary: 'Materialized from shell', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 6, level: 3 }),
        node({ id: 'doc-itinerary', title: 'Document: itinerary.md', summary: 'Materialized from itinerary', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 7, level: 3 }),
        node({ id: 'doc-budget', title: 'Document: budget.md', summary: 'Materialized from budget', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 8, level: 3 }),
        node({ id: 'explore', title: 'Explore direction', summary: 'Should collaboration be added?', kind: 'branch', status: 'active', lane: 'exploration', stage: 'exploration', order: 9, level: 4 }),
        node({ id: 'rejected', title: 'Discarded direction', summary: 'Pure chatbot shell', kind: 'rejected', status: 'rejected', lane: 'discarded', stage: 'discarded', order: 10, level: 5 })
      ],
      edges: [
        { id: 'e1', sourceId: 'goal', targetId: 'user', kind: 'supports', label: '拆解' },
        { id: 'e2', sourceId: 'goal', targetId: 'risk', kind: 'constrains', label: '约束' },
        { id: 'e3', sourceId: 'user', targetId: 'itinerary', kind: 'derives', label: '推导' },
        { id: 'e4', sourceId: 'risk', targetId: 'itinerary', kind: 'constrains', label: '约束' },
        { id: 'e5', sourceId: 'risk', targetId: 'budget', kind: 'constrains', label: '约束' },
        { id: 'e6', sourceId: 'user', targetId: 'shell', kind: 'derives', label: '推导' },
        { id: 'e7', sourceId: 'risk', targetId: 'shell', kind: 'constrains', label: '约束' },
        { id: 'e8', sourceId: 'itinerary', targetId: 'doc-itinerary', kind: 'materializes', label: '落地到' },
        { id: 'e9', sourceId: 'budget', targetId: 'doc-budget', kind: 'materializes', label: '落地到' },
        { id: 'e10', sourceId: 'shell', targetId: 'doc-root', kind: 'materializes', label: '落地到' },
        { id: 'e11', sourceId: 'shell', targetId: 'explore', kind: 'explores', label: '延伸探索' },
        { id: 'e12', sourceId: 'explore', targetId: 'rejected', kind: 'replaces', label: '替代/已废弃' }
      ]
    };

    const model = buildIdeaMapLayout(snapshot, snapshot.nodes);
    expect(countSameSpanCrossings(model)).toBeLessThanOrEqual(1);
  });

  it('routes edges as a single smooth curve instead of a double-wave path', () => {
    const snapshot: ThinkingChainSnapshot = {
      sessionId: 's3',
      sessionTitle: 'edge path style',
      generatedAt: '2026-04-18T00:00:00.000Z',
      counts: {
        totalNodes: 4,
        rejectedNodes: 0,
        orphanedNodes: 0
      },
      sourceRefs: [],
      layoutState: null,
      nodes: [
        node({ id: 'goal', title: 'Core', summary: 'Core idea', kind: 'goal', status: 'active', lane: 'focus', stage: 'core', order: 0, level: 0 }),
        node({ id: 'premise', title: 'Premise', summary: 'Premise input', kind: 'branch', status: 'accepted', lane: 'formed', stage: 'premise', order: 1, level: 1 }),
        node({ id: 'constraint', title: 'Constraint', summary: 'Constraint input', kind: 'criterion', status: 'accepted', lane: 'formed', stage: 'constraint', order: 2, level: 1 }),
        node({ id: 'decision', title: 'Decision', summary: 'Derived conclusion', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 3, level: 2 })
      ],
      edges: [
        { id: 'e1', sourceId: 'goal', targetId: 'premise', kind: 'supports', label: '拆解' },
        { id: 'e2', sourceId: 'goal', targetId: 'constraint', kind: 'constrains', label: '约束' },
        { id: 'e3', sourceId: 'premise', targetId: 'decision', kind: 'derives', label: '推导' },
        { id: 'e4', sourceId: 'constraint', targetId: 'decision', kind: 'constrains', label: '约束' }
      ]
    };

    const model = buildIdeaMapLayout(snapshot, snapshot.nodes);

    expect(model.edges).not.toHaveLength(0);
    for (const edge of model.edges) {
      expect(countCubicSegments(edge.path)).toBe(1);
    }
  });

  it('keeps same-row adjacent-column edges curved instead of degenerating into a straight line while dragging', () => {
    const snapshot: ThinkingChainSnapshot = {
      sessionId: 's3a',
      sessionTitle: 'same row drag curvature',
      generatedAt: '2026-04-19T00:00:00.000Z',
      counts: {
        totalNodes: 2,
        rejectedNodes: 0,
        orphanedNodes: 0
      },
      sourceRefs: [],
      layoutState: null,
      nodes: [
        node({
          id: 'left',
          title: 'Left thought',
          summary: 'Dragged node on the left',
          kind: 'branch',
          status: 'accepted',
          lane: 'formed',
          stage: 'premise',
          order: 0,
          level: 1,
          manualPosition: { x: 560, y: 180 }
        }),
        node({
          id: 'right',
          title: 'Right decision',
          summary: 'Aligned node on the right',
          kind: 'decision',
          status: 'accepted',
          lane: 'formed',
          stage: 'conclusion',
          order: 1,
          level: 2,
          manualPosition: { x: 1000, y: 180 }
        })
      ],
      edges: [
        { id: 'e1', sourceId: 'left', targetId: 'right', kind: 'derives', label: '推导' }
      ]
    };

    const model = buildIdeaMapLayout(snapshot, snapshot.nodes);

    expect(model.edges).toHaveLength(1);
    expect(countCubicSegments(model.edges[0].path)).toBeGreaterThanOrEqual(1);
    expect(maxVerticalDeviationFromChord(model.edges[0])).toBeGreaterThan(6);
  });

  it('keeps dragged adjacent-column conflict routes smooth instead of falling back to square orthogonal lines', () => {
    const snapshot: ThinkingChainSnapshot = {
      sessionId: 's3b',
      sessionTitle: 'dragged adjacent conflict',
      generatedAt: '2026-04-19T00:00:00.000Z',
      counts: {
        totalNodes: 4,
        rejectedNodes: 0,
        orphanedNodes: 0
      },
      sourceRefs: [],
      layoutState: null,
      nodes: [
        node({
          id: 'premise',
          title: 'Premise',
          summary: 'Top-left premise',
          kind: 'branch',
          status: 'accepted',
          lane: 'formed',
          stage: 'premise',
          order: 0,
          level: 1,
          manualPosition: { x: 560, y: 120 }
        }),
        node({
          id: 'constraint',
          title: 'Constraint',
          summary: 'Bottom-left constraint',
          kind: 'criterion',
          status: 'accepted',
          lane: 'formed',
          stage: 'constraint',
          order: 1,
          level: 1,
          manualPosition: { x: 560, y: 328 }
        }),
        node({
          id: 'upper-decision',
          title: 'Upper decision',
          summary: 'Top-right conclusion',
          kind: 'decision',
          status: 'accepted',
          lane: 'formed',
          stage: 'conclusion',
          order: 2,
          level: 2,
          manualPosition: { x: 1000, y: 120 }
        }),
        node({
          id: 'lower-decision',
          title: 'Lower decision',
          summary: 'Bottom-right conclusion',
          kind: 'decision',
          status: 'accepted',
          lane: 'formed',
          stage: 'conclusion',
          order: 3,
          level: 2,
          manualPosition: { x: 1000, y: 328 }
        })
      ],
      edges: [
        { id: 'e1', sourceId: 'premise', targetId: 'lower-decision', kind: 'derives', label: '推导' },
        { id: 'e2', sourceId: 'constraint', targetId: 'upper-decision', kind: 'constrains', label: '约束' }
      ]
    };

    const model = buildIdeaMapLayout(snapshot, snapshot.nodes);

    expect(countPathCrossings(model)).toBe(0);
    for (const edge of model.edges) {
      expect(countCubicSegments(edge.path)).toBeGreaterThanOrEqual(2);
    }
  });

  it('uses local swaps to eliminate avoidable multi-span crossings across distant columns', () => {
    const snapshot: ThinkingChainSnapshot = {
      sessionId: 's4',
      sessionTitle: 'avoidable multi-span crossing',
      generatedAt: '2026-04-18T00:00:00.000Z',
      counts: {
        totalNodes: 7,
        rejectedNodes: 0,
        orphanedNodes: 0
      },
      sourceRefs: [],
      layoutState: null,
      nodes: [
        node({ id: 'g', title: 'Goal', summary: 'Core goal', kind: 'goal', status: 'active', lane: 'focus', stage: 'core', order: 0, level: 0 }),
        node({ id: 'p1', title: 'Premise A', summary: 'Premise A', kind: 'branch', status: 'accepted', lane: 'formed', stage: 'premise', order: 1, level: 1 }),
        node({ id: 'p2', title: 'Premise B', summary: 'Premise B', kind: 'branch', status: 'accepted', lane: 'formed', stage: 'premise', order: 2, level: 1 }),
        node({ id: 'c1', title: 'Conclusion A', summary: 'Conclusion A', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 3, level: 2 }),
        node({ id: 'c2', title: 'Conclusion B', summary: 'Conclusion B', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 4, level: 2 }),
        node({ id: 'm1', title: 'Artifact A', summary: 'Artifact A', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 5, level: 3 }),
        node({ id: 'm2', title: 'Artifact B', summary: 'Artifact B', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 6, level: 3 })
      ],
      edges: [
        { id: 'e1', sourceId: 'g', targetId: 'p2', kind: 'supports', label: '拆解' },
        { id: 'e2', sourceId: 'p1', targetId: 'c1', kind: 'derives', label: '推导' },
        { id: 'e3', sourceId: 'p2', targetId: 'c1', kind: 'derives', label: '推导' },
        { id: 'e4', sourceId: 'p2', targetId: 'c2', kind: 'derives', label: '推导' },
        { id: 'e5', sourceId: 'c2', targetId: 'm1', kind: 'materializes', label: '落地到' },
        { id: 'e6', sourceId: 'p1', targetId: 'm1', kind: 'materializes', label: '落地到' },
        { id: 'e7', sourceId: 'p2', targetId: 'm2', kind: 'materializes', label: '落地到' }
      ]
    };

    const model = buildIdeaMapLayout(snapshot, snapshot.nodes);

    expect(countExpandedLayerCrossings(model)).toBe(0);
  });

  it('keeps complex conclusion columns compact instead of stretching them with excess blank rows', () => {
    const snapshot: ThinkingChainSnapshot = {
      sessionId: 's5',
      sessionTitle: 'compact row span',
      generatedAt: '2026-04-18T00:00:00.000Z',
      counts: {
        totalNodes: 11,
        rejectedNodes: 1,
        orphanedNodes: 0
      },
      sourceRefs: [],
      layoutState: null,
      nodes: [
        node({ id: 'goal', title: 'Core', summary: 'Europe planner workbench', kind: 'goal', status: 'active', lane: 'focus', stage: 'core', order: 0, level: 0 }),
        node({ id: 'user', title: 'User profile', summary: 'First-time independent traveler', kind: 'branch', status: 'accepted', lane: 'formed', stage: 'premise', order: 1, level: 1 }),
        node({ id: 'risk', title: 'Risk constraint', summary: 'Budget and offline readability', kind: 'criterion', status: 'accepted', lane: 'formed', stage: 'constraint', order: 2, level: 1 }),
        node({ id: 'itinerary', title: 'Itinerary skeleton', summary: 'Country and city sequence', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 3, level: 2 }),
        node({ id: 'budget', title: 'Budget strategy', summary: 'Cap flight and hotel first', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 4, level: 2 }),
        node({ id: 'shell', title: 'Workbench shell', summary: 'Carries traveler, budget and itinerary', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 5, level: 2 }),
        node({ id: 'doc-root', title: 'Document: requirement.md', summary: 'Materialized from shell', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 6, level: 3 }),
        node({ id: 'doc-itinerary', title: 'Document: itinerary.md', summary: 'Materialized from itinerary', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 7, level: 3 }),
        node({ id: 'doc-budget', title: 'Document: budget.md', summary: 'Materialized from budget', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 8, level: 3 }),
        node({ id: 'explore', title: 'Explore direction', summary: 'Should collaboration be added?', kind: 'branch', status: 'active', lane: 'exploration', stage: 'exploration', order: 9, level: 4 }),
        node({ id: 'rejected', title: 'Discarded direction', summary: 'Pure chatbot shell', kind: 'rejected', status: 'rejected', lane: 'discarded', stage: 'discarded', order: 10, level: 5 })
      ],
      edges: [
        { id: 'e1', sourceId: 'goal', targetId: 'user', kind: 'supports', label: '拆解' },
        { id: 'e2', sourceId: 'goal', targetId: 'risk', kind: 'constrains', label: '约束' },
        { id: 'e3', sourceId: 'user', targetId: 'itinerary', kind: 'derives', label: '推导' },
        { id: 'e4', sourceId: 'risk', targetId: 'itinerary', kind: 'constrains', label: '约束' },
        { id: 'e5', sourceId: 'risk', targetId: 'budget', kind: 'constrains', label: '约束' },
        { id: 'e6', sourceId: 'user', targetId: 'shell', kind: 'derives', label: '推导' },
        { id: 'e7', sourceId: 'risk', targetId: 'shell', kind: 'constrains', label: '约束' },
        { id: 'e8', sourceId: 'itinerary', targetId: 'doc-itinerary', kind: 'materializes', label: '落地到' },
        { id: 'e9', sourceId: 'budget', targetId: 'doc-budget', kind: 'materializes', label: '落地到' },
        { id: 'e10', sourceId: 'shell', targetId: 'doc-root', kind: 'materializes', label: '落地到' },
        { id: 'e11', sourceId: 'shell', targetId: 'explore', kind: 'explores', label: '继续探索' },
        { id: 'e12', sourceId: 'explore', targetId: 'rejected', kind: 'replaces', label: '替代/已废弃' }
      ]
    };

    const model = buildIdeaMapLayout(snapshot, snapshot.nodes);
    const conclusionRows = model.nodes
      .filter((item) => item.node.stage === 'conclusion')
      .map((item) => item.row);

    expect(Math.max(...conclusionRows) - Math.min(...conclusionRows)).toBeLessThanOrEqual(4);
  });

  it('does not insert spacer rows for moderate fan-out columns', () => {
    const snapshot: ThinkingChainSnapshot = {
      sessionId: 's5b',
      sessionTitle: 'moderate fan-out spacing',
      generatedAt: '2026-04-19T00:00:00.000Z',
      counts: {
        totalNodes: 6,
        rejectedNodes: 0,
        orphanedNodes: 0
      },
      sourceRefs: [],
      layoutState: null,
      nodes: [
        node({ id: 'goal', title: 'Core', summary: 'Core idea', kind: 'goal', status: 'active', lane: 'focus', stage: 'core', order: 0, level: 0 }),
        node({ id: 'risk', title: 'Risk', summary: 'Three outbound edges but not a mega hub', kind: 'criterion', status: 'accepted', lane: 'formed', stage: 'constraint', order: 1, level: 1 }),
        node({ id: 'user', title: 'User', summary: 'Neighbor in the same source column', kind: 'branch', status: 'accepted', lane: 'formed', stage: 'premise', order: 2, level: 1 }),
        node({ id: 'itinerary', title: 'Itinerary', summary: 'Decision A', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 3, level: 2 }),
        node({ id: 'shell', title: 'Shell', summary: 'Decision B', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 4, level: 2 }),
        node({ id: 'budget', title: 'Budget', summary: 'Decision C', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 5, level: 2 })
      ],
      edges: [
        { id: 'e1', sourceId: 'goal', targetId: 'risk', kind: 'constrains', label: '约束' },
        { id: 'e2', sourceId: 'goal', targetId: 'user', kind: 'supports', label: '拆解' },
        { id: 'e3', sourceId: 'risk', targetId: 'itinerary', kind: 'constrains', label: '约束' },
        { id: 'e4', sourceId: 'risk', targetId: 'shell', kind: 'constrains', label: '约束' },
        { id: 'e5', sourceId: 'risk', targetId: 'budget', kind: 'constrains', label: '约束' },
        { id: 'e6', sourceId: 'user', targetId: 'itinerary', kind: 'derives', label: '推导' },
        { id: 'e7', sourceId: 'user', targetId: 'shell', kind: 'derives', label: '推导' }
      ]
    };

    const model = buildIdeaMapLayout(snapshot, snapshot.nodes);
    const sourceColumnRows = model.nodes
      .filter((item) => item.node.stage === 'premise' || item.node.stage === 'constraint')
      .map((item) => item.row)
      .sort((left, right) => left - right);

    expect(sourceColumnRows).toHaveLength(2);
    expect(sourceColumnRows[1] - sourceColumnRows[0]).toBeLessThanOrEqual(1);
  });

  it('avoids visible path crossings in the complex multi-parent map', () => {
    const snapshot: ThinkingChainSnapshot = {
      sessionId: 's6',
      sessionTitle: 'complex routed crossings',
      generatedAt: '2026-04-18T00:00:00.000Z',
      counts: {
        totalNodes: 11,
        rejectedNodes: 1,
        orphanedNodes: 0
      },
      sourceRefs: [],
      layoutState: null,
      nodes: [
        node({ id: 'goal', title: 'Core', summary: 'Europe planner workbench', kind: 'goal', status: 'active', lane: 'focus', stage: 'core', order: 0, level: 0 }),
        node({ id: 'user', title: 'User profile', summary: 'First-time independent traveler', kind: 'branch', status: 'accepted', lane: 'formed', stage: 'premise', order: 1, level: 1 }),
        node({ id: 'risk', title: 'Risk constraint', summary: 'Budget and offline readability', kind: 'criterion', status: 'accepted', lane: 'formed', stage: 'constraint', order: 2, level: 1 }),
        node({ id: 'itinerary', title: 'Itinerary skeleton', summary: 'Country and city sequence', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 3, level: 2 }),
        node({ id: 'budget', title: 'Budget strategy', summary: 'Cap flight and hotel first', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 4, level: 2 }),
        node({ id: 'shell', title: 'Workbench shell', summary: 'Carries traveler, budget and itinerary', kind: 'decision', status: 'accepted', lane: 'formed', stage: 'conclusion', order: 5, level: 2 }),
        node({ id: 'doc-root', title: 'Document: requirement.md', summary: 'Materialized from shell', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 6, level: 3 }),
        node({ id: 'doc-itinerary', title: 'Document: itinerary.md', summary: 'Materialized from itinerary', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 7, level: 3 }),
        node({ id: 'doc-budget', title: 'Document: budget.md', summary: 'Materialized from budget', kind: 'artifact', status: 'accepted', lane: 'landed', stage: 'materialized', order: 8, level: 3 }),
        node({ id: 'explore', title: 'Explore direction', summary: 'Should collaboration be added?', kind: 'branch', status: 'active', lane: 'exploration', stage: 'exploration', order: 9, level: 4 }),
        node({ id: 'rejected', title: 'Discarded direction', summary: 'Pure chatbot shell', kind: 'rejected', status: 'rejected', lane: 'discarded', stage: 'discarded', order: 10, level: 5 })
      ],
      edges: [
        { id: 'e1', sourceId: 'goal', targetId: 'user', kind: 'supports', label: '拆解' },
        { id: 'e2', sourceId: 'goal', targetId: 'risk', kind: 'constrains', label: '约束' },
        { id: 'e3', sourceId: 'user', targetId: 'itinerary', kind: 'derives', label: '推导' },
        { id: 'e4', sourceId: 'risk', targetId: 'itinerary', kind: 'constrains', label: '约束' },
        { id: 'e5', sourceId: 'risk', targetId: 'budget', kind: 'constrains', label: '约束' },
        { id: 'e6', sourceId: 'user', targetId: 'shell', kind: 'derives', label: '推导' },
        { id: 'e7', sourceId: 'risk', targetId: 'shell', kind: 'constrains', label: '约束' },
        { id: 'e8', sourceId: 'itinerary', targetId: 'doc-itinerary', kind: 'materializes', label: '落地到' },
        { id: 'e9', sourceId: 'budget', targetId: 'doc-budget', kind: 'materializes', label: '落地到' },
        { id: 'e10', sourceId: 'shell', targetId: 'doc-root', kind: 'materializes', label: '落地到' },
        { id: 'e11', sourceId: 'shell', targetId: 'explore', kind: 'explores', label: '继续探索' },
        { id: 'e12', sourceId: 'explore', targetId: 'rejected', kind: 'replaces', label: '替代/已废弃' }
      ]
    };

    const model = buildIdeaMapLayout(snapshot, snapshot.nodes);

    expect(countPathCrossings(model)).toBe(0);
  });
});
