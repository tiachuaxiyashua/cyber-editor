import type { KnowledgeLinkEdge, KnowledgeLinkNode, ProjectKnowledgeGraph } from './types';

export type KnowledgeGraphRelation = {
  edge: KnowledgeLinkEdge;
  peerNode: KnowledgeLinkNode;
  direction: 'outbound' | 'inbound';
};

export type KnowledgeGraphPathStep = {
  edge: KnowledgeLinkEdge;
  fromNode: KnowledgeLinkNode;
  toNode: KnowledgeLinkNode;
  direction: 'outbound' | 'inbound';
};

export type KnowledgeGraphPathResult = {
  nodes: KnowledgeLinkNode[];
  steps: KnowledgeGraphPathStep[];
};

function edgeSortKey(edge: KnowledgeLinkEdge) {
  return [edge.sourceId, edge.targetId, edge.type, edge.label ?? '', edge.id].join('|');
}

function nodeSortKey(node: KnowledgeLinkNode) {
  return [node.title, node.kind, node.id].join('|');
}

export function collectKnowledgeGraphRelations(graph: ProjectKnowledgeGraph, nodeId: string): KnowledgeGraphRelation[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const relations: KnowledgeGraphRelation[] = [];
  for (const edge of [...graph.edges].sort((left, right) => edgeSortKey(left).localeCompare(edgeSortKey(right)))) {
    if (edge.sourceId === nodeId) {
      const peerNode = nodesById.get(edge.targetId);
      if (peerNode) {
        relations.push({ edge, peerNode, direction: 'outbound' });
      }
      continue;
    }
    if (edge.targetId === nodeId) {
      const peerNode = nodesById.get(edge.sourceId);
      if (peerNode) {
        relations.push({ edge, peerNode, direction: 'inbound' });
      }
    }
  }
  return relations.sort((left, right) =>
    nodeSortKey(left.peerNode).localeCompare(nodeSortKey(right.peerNode)) || edgeSortKey(left.edge).localeCompare(edgeSortKey(right.edge))
  );
}

export function findKnowledgeGraphPath(
  graph: ProjectKnowledgeGraph,
  startNodeId: string,
  endNodeId: string
): KnowledgeGraphPathResult | null {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const startNode = nodesById.get(startNodeId);
  const endNode = nodesById.get(endNodeId);
  if (!startNode || !endNode) {
    return null;
  }
  if (startNodeId === endNodeId) {
    return {
      nodes: [startNode],
      steps: []
    };
  }

  const adjacency = new Map<string, KnowledgeGraphPathStep[]>();
  const pushStep = (sourceId: string, step: KnowledgeGraphPathStep) => {
    const bucket = adjacency.get(sourceId) ?? [];
    bucket.push(step);
    adjacency.set(sourceId, bucket);
  };

  for (const edge of [...graph.edges].sort((left, right) => edgeSortKey(left).localeCompare(edgeSortKey(right)))) {
    const sourceNode = nodesById.get(edge.sourceId);
    const targetNode = nodesById.get(edge.targetId);
    if (!sourceNode || !targetNode) continue;
    pushStep(edge.sourceId, {
      edge,
      fromNode: sourceNode,
      toNode: targetNode,
      direction: 'outbound'
    });
    pushStep(edge.targetId, {
      edge,
      fromNode: targetNode,
      toNode: sourceNode,
      direction: 'inbound'
    });
  }

  for (const [nodeId, steps] of adjacency) {
    adjacency.set(nodeId, [...steps].sort((left, right) =>
      nodeSortKey(left.toNode).localeCompare(nodeSortKey(right.toNode)) || edgeSortKey(left.edge).localeCompare(edgeSortKey(right.edge))
    ));
  }

  const queue: Array<{ nodeId: string; steps: KnowledgeGraphPathStep[] }> = [{ nodeId: startNodeId, steps: [] }];
  const visited = new Set([startNodeId]);

  while (queue.length) {
    const current = queue.shift()!;
    const nextSteps = adjacency.get(current.nodeId) ?? [];
    for (const step of nextSteps) {
      if (visited.has(step.toNode.id)) continue;
      const candidateSteps = [...current.steps, step];
      if (step.toNode.id === endNodeId) {
        return {
          nodes: [startNode, ...candidateSteps.map((item) => item.toNode)],
          steps: candidateSteps
        };
      }
      visited.add(step.toNode.id);
      queue.push({
        nodeId: step.toNode.id,
        steps: candidateSteps
      });
    }
  }

  return null;
}
