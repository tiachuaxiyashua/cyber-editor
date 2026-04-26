import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AiSession } from '../../src/shared/types.js';
import { ThinkingChainProjector } from '../../src/main/services/thinking-chain-projector.js';

const roots: string[] = [];

function createTempRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

describe('ThinkingChainProjector semantic projection', () => {
  afterEach(() => {
    while (roots.length) {
      fs.rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  it('builds semantic thought units and materializes documents from the adopted source thought instead of the focus node', () => {
    const rootPath = createTempRoot('cyber-editor-semantic-projection-');
    const requirementPath = path.join(rootPath, '01-requirements', '01-requirement.md');
    fs.mkdirSync(path.dirname(requirementPath), { recursive: true });
    fs.writeFileSync(requirementPath, '# Requirement\n', 'utf8');

    const session: AiSession = {
      id: 'session-semantic',
      title: 'Complex planning session',
      stage: 'discover',
      summary: 'Project the thought chain into readable thought units.',
      pinned: false,
      archived: false,
      projectDocumentPaths: [requirementPath],
      messages: [
        { id: 'm1', role: 'user', content: 'Core idea: build an editor-like workbench.', createdAt: '2026-04-18T10:00:00.000Z' },
        { id: 'm2', role: 'assistant', content: 'Disguise mode: keep the shell like a normal work app.', createdAt: '2026-04-18T10:00:10.000Z' },
        { id: 'm3', role: 'assistant', content: 'Risk constraint: it cannot be flashy or network-dependent.', createdAt: '2026-04-18T10:00:20.000Z' },
        { id: 'm4', role: 'assistant', content: 'Workbench shell: the editor shell satisfies disguise mode and risk constraint together.', createdAt: '2026-04-18T10:00:30.000Z' },
        { id: 'm5', role: 'assistant', content: 'Explore direction: should floating reading mode be supported later?', createdAt: '2026-04-18T10:00:40.000Z' },
        { id: 'm6', role: 'assistant', content: 'Discarded direction: browser extension form.', createdAt: '2026-04-18T10:00:50.000Z' }
      ]
    };

    const projector = new ThinkingChainProjector();
    const snapshot = projector.build({
      rootPath,
      session,
      runs: [],
      events: [],
      reviewRounds: [],
      artifactRevisions: [
        {
          id: 'rev-1',
          createdAt: '2026-04-18T10:01:00.000Z',
          artifactPath: '01-requirements/01-requirement.md',
          absolutePath: requirementPath,
          title: 'Requirement',
          source: 'runtime-write',
          nodeIds: [],
          writeMode: 'replace',
          contentHash: 'hash',
          exists: true,
          valid: true,
          contractSignature: 'sig',
          runId: undefined,
          contentSummary: 'The requirement document materializes the workbench shell decision.'
        }
      ],
      documentChanges: []
    });

    const shellNode = snapshot.nodes.find((node) => node.title.includes('Workbench shell'));
    const focusNode = snapshot.nodes.find((node) => node.stage === 'core');

    expect(shellNode).toBeTruthy();
    expect(shellNode?.semanticKey).toBeTruthy();
    expect(focusNode?.stage).toBe('core');

    const landedDoc = snapshot.nodes.find((node) => node.artifactPath === requirementPath);
    expect(landedDoc?.stage).toBe('materialized');
    expect(landedDoc?.artifactAnchor).toBe('Requirement');
    expect(snapshot.nodes.filter((node) => node.artifactPath === requirementPath)).toHaveLength(1);

    const landedInbound = snapshot.edges.filter((edge) => edge.targetId === landedDoc?.id && edge.kind === 'materializes');
    expect(landedInbound.length).toBeGreaterThan(0);
    expect(landedInbound.some((edge) => edge.sourceId === shellNode?.id)).toBe(true);
    expect(landedInbound.some((edge) => edge.sourceId === focusNode?.id)).toBe(false);
  });
});
