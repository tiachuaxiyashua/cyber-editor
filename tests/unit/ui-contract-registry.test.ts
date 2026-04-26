import { describe, expect, it } from 'vitest';

import { allUiContracts, contractsByKind } from '../contracts/index.js';

describe('ui contract registry', () => {
  it('defines all required contract dimensions with source refs and gate bindings', () => {
    expect(allUiContracts.length).toBeGreaterThan(0);

    expect(Object.keys(contractsByKind).sort()).toEqual([
      'action',
      'delivery',
      'graph',
      'latency',
      'layout',
      'manipulation',
      'packaged',
      'prototype',
      'state',
    ]);

    for (const contract of allUiContracts) {
      expect(contract.id).toMatch(/^UI-[A-Z0-9-]+$/u);
      expect(contract.gateIds.length).toBeGreaterThan(0);
      expect(contract.pageId.length).toBeGreaterThan(0);
      expect(contract.sourceRefs.length).toBeGreaterThan(0);

      for (const sourceRef of contract.sourceRefs) {
        expect(sourceRef.doc.length).toBeGreaterThan(0);
        expect(sourceRef.section.length).toBeGreaterThan(0);
      }
    }
  });

  it('binds the file-switch latency contract to the 250ms feedback gate', () => {
    const fileSwitchLatency = contractsByKind.latency.find((contract) =>
      contract.id === 'UI-LATENCY-WORKBENCH-FILE-SWITCH-FEEDBACK'
    );

    expect(fileSwitchLatency?.assert.latencyMs).toBe(250);
    expect(fileSwitchLatency?.gateIds).toContain('QG-UX-001');
  });
});
