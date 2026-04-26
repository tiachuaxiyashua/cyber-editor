import { describe, expect, it } from 'vitest';
import type { ControlledScriptTool, PlatformConnector, PlatformFlowAsset, PlatformFlowNode, PlatformRole } from '../../src/shared/types.js';
import { validatePlatformFlow } from '../../src/shared/flow-validator.js';

function node(
  id: string,
  type: PlatformFlowNode['type'],
  x: number,
  y: number,
  data: Partial<PlatformFlowNode['data']> = {}
): PlatformFlowNode {
  return {
    id,
    type,
    position: { x, y },
    data: {
      label: id,
      ...data
    }
  };
}

function flow(nodes: PlatformFlowAsset['nodes'], edges: PlatformFlowAsset['edges']): PlatformFlowAsset {
  return {
    id: 'flow-1',
    name: 'Test Flow',
    description: '',
    kind: 'flow',
    createdAt: '',
    updatedAt: '',
    nodes,
    edges
  };
}

describe('validatePlatformFlow', () => {
  it('rejects parallel branches that never reach a parallel join', () => {
    const findings = validatePlatformFlow(
      flow(
        [
          node('start', 'start', 0, 0),
          node('split', 'parallel_split', 120, 0, { parallelFailureStrategy: 'manual_review' }),
          node('branch-a', 'agent', 260, -80),
          node('branch-b', 'agent', 260, 80),
          node('join', 'parallel_join', 420, -80, { mergeStrategy: 'collect_all' }),
          node('end', 'end', 600, 0)
        ],
        [
          { id: 'e1', source: 'start', target: 'split' },
          { id: 'e2', source: 'split', target: 'branch-a' },
          { id: 'e3', source: 'split', target: 'branch-b' },
          { id: 'e4', source: 'branch-a', target: 'join' },
          { id: 'e5', source: 'branch-b', target: 'end' },
          { id: 'e6', source: 'join', target: 'end' }
        ]
      )
    );

    expect(findings.some((item) => item.code === 'parallel.split.branch-without-join' && item.edgeId === 'e3')).toBe(true);
  });

  it('rejects parallel joins that are not driven by a parallel split', () => {
    const findings = validatePlatformFlow(
      flow(
        [
          node('start', 'start', 0, 0),
          node('a', 'agent', 120, -80),
          node('b', 'agent', 120, 80),
          node('join', 'parallel_join', 280, 0, { mergeStrategy: 'collect_all' }),
          node('end', 'end', 440, 0)
        ],
        [
          { id: 'e1', source: 'start', target: 'a' },
          { id: 'e2', source: 'start', target: 'b' },
          { id: 'e3', source: 'a', target: 'join' },
          { id: 'e4', source: 'b', target: 'join' },
          { id: 'e5', source: 'join', target: 'end' }
        ]
      )
    );

    expect(findings.some((item) => item.code === 'parallel.join.split.missing' && item.nodeId === 'join')).toBe(true);
  });

  it('rejects loop nodes that reuse the same node for continue and exit targets', () => {
    const findings = validatePlatformFlow(
      flow(
        [
          node('start', 'start', 0, 0),
          node('loop', 'loop', 120, 0, {
            loopExpression: 'shouldContinue',
            exitExpression: '!shouldContinue',
            maxIterations: 3,
            loopBackTargetId: 'end',
            exitTargetId: 'end'
          }),
          node('end', 'end', 320, 0)
        ],
        [
          { id: 'e1', source: 'start', target: 'loop' },
          { id: 'e2', source: 'loop', target: 'end', branch: 'loop' },
          { id: 'e3', source: 'loop', target: 'end', branch: 'exit' }
        ]
      )
    );

    expect(findings.some((item) => item.code === 'loop.targets.conflict' && item.nodeId === 'loop')).toBe(true);
  });

  it('rejects invalid loop timeout and malformed subflow mappings', () => {
    const findings = validatePlatformFlow(
      flow(
        [
          node('start', 'start', 0, 0),
          node('loop', 'loop', 120, 0, {
            loopExpression: 'again',
            exitExpression: 'done',
            maxIterations: 3,
            loopTimeoutMs: 0,
            loopBackTargetId: 'subflow',
            exitTargetId: 'end'
          }),
          node('subflow', 'subflow', 300, 0, {
            subflowId: 'sub-1',
            subflowInputBindings: ['invalid-binding'],
            subflowOutputBindings: ['child=>parent=>extra']
          }),
          node('end', 'end', 520, 0)
        ],
        [
          { id: 'e1', source: 'start', target: 'loop' },
          { id: 'e2', source: 'loop', target: 'subflow', branch: 'loop' },
          { id: 'e3', source: 'loop', target: 'end', branch: 'exit' },
          { id: 'e4', source: 'subflow', target: 'end' }
        ]
      ),
      {
        subflows: [{ ...flow([], []), id: 'sub-1', kind: 'subflow', name: 'Child', nodes: [node('s', 'start', 0, 0), node('e', 'end', 10, 0)], edges: [] }]
      }
    );

    expect(findings.some((item) => item.code === 'loop.timeout.invalid' && item.nodeId === 'loop')).toBe(true);
    expect(findings.some((item) => item.code === 'subflow.input-binding.invalid' && item.nodeId === 'subflow')).toBe(true);
    expect(findings.some((item) => item.code === 'subflow.output-binding.invalid' && item.nodeId === 'subflow')).toBe(true);
  });

  it('accepts a valid parallel flow with a reachable join', () => {
    const findings = validatePlatformFlow(
      flow(
        [
          node('start', 'start', 0, 0),
          node('split', 'parallel_split', 120, 0, { parallelFailureStrategy: 'manual_review' }),
          node('branch-a', 'agent', 260, -80),
          node('branch-b', 'agent', 260, 80),
          node('join', 'parallel_join', 420, 0, { mergeStrategy: 'collect_all' }),
          node('end', 'end', 600, 0)
        ],
        [
          { id: 'e1', source: 'start', target: 'split' },
          { id: 'e2', source: 'split', target: 'branch-a' },
          { id: 'e3', source: 'split', target: 'branch-b' },
          { id: 'e4', source: 'branch-a', target: 'join' },
          { id: 'e5', source: 'branch-b', target: 'join' },
          { id: 'e6', source: 'join', target: 'end' }
        ]
      )
    );

    expect(findings.some((item) => item.code === 'parallel.split.branch-without-join')).toBe(false);
    expect(findings.some((item) => item.code === 'parallel.join.split.missing')).toBe(false);
  });

  it('rejects invalid role, connector, and tool bindings', () => {
    const roles: PlatformRole[] = [{
      id: 'broken-role',
      name: 'Broken Role',
      description: 'Damaged package',
      promptHint: 'Damaged',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      outputFormat: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      },
      packageStatus: 'complete',
      packageHealth: 'corrupt',
      packageIssueMessage: 'Role package is damaged.'
    }];
    const connectors: PlatformConnector[] = [{
      id: 'broken-connector',
      name: 'Broken Connector',
      description: 'Missing auth',
      scope: 'local',
      transport: 'stdio',
      command: process.platform === 'win32' ? 'cmd' : 'sh',
      args: [],
      enabled: true,
      health: 'error',
      compatibility: 'review',
      authStatus: 'missing',
      diagnostic: {
        status: 'error',
        code: 'CONNECTOR_TEST_FAILED',
        summary: 'Connector authorization is missing.'
      }
    }];
    const tools: ControlledScriptTool[] = [{
      id: 'broken-tool',
      name: 'Broken Tool',
      description: 'Schema missing',
      command: process.platform === 'win32' ? 'cmd' : 'sh',
      args: [],
      cwd: '.',
      timeoutMs: 1000,
      enabled: true,
      health: 'warning',
      connectorId: 'broken-connector',
      diagnostic: {
        status: 'warning',
        code: 'TOOL_SCHEMA_MISSING',
        summary: 'Tool is missing schema.'
      }
    }];

    const findings = validatePlatformFlow(
      flow(
        [
          node('start', 'start', 0, 0),
          node('agent', 'agent', 180, 0, {
            roleId: 'broken-role',
            connectorId: 'broken-connector',
            toolId: 'broken-tool'
          }),
          node('end', 'end', 360, 0)
        ],
        [
          { id: 'e1', source: 'start', target: 'agent' },
          { id: 'e2', source: 'agent', target: 'end' }
        ]
      ),
      {
        roles,
        connectors,
        tools
      }
    );

    expect(findings.some((item) => item.code === 'binding.role.invalid' && item.nodeId === 'agent')).toBe(true);
    expect(findings.some((item) => item.code === 'binding.connector.invalid' && item.nodeId === 'agent')).toBe(true);
    expect(findings.some((item) => item.code === 'binding.tool.invalid' && item.nodeId === 'agent')).toBe(true);
  });

  it('treats unbound tool placeholder nodes as warnings instead of blocking errors', () => {
    const findings = validatePlatformFlow(
      flow(
        [
          node('start', 'start', 0, 0),
          node('tool', 'tool', 180, 0, {
            label: 'GitHub 证据刷新',
            description: '等待后续绑定无头浏览器能力。'
          }),
          node('end', 'end', 360, 0)
        ],
        [
          { id: 'e1', source: 'start', target: 'tool' },
          { id: 'e2', source: 'tool', target: 'end' }
        ]
      )
    );

    expect(findings.some((item) => item.code === 'binding.tool-node.empty' && item.severity === 'warning' && item.nodeId === 'tool')).toBe(true);
    expect(findings.some((item) => item.code === 'binding.tool-node.empty' && item.severity === 'error')).toBe(false);
  });
});
