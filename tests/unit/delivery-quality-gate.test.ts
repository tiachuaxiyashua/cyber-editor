import { describe, expect, it } from 'vitest';

import { contractsByKind } from '../contracts';
import { qualityGates } from '../../scripts/lib/quality-gates.mjs';

describe('delivery quality gate bindings', () => {
  const gateById = new Map(qualityGates.map((gate) => [gate.id, gate]));
  const deliveryAndPackagedContracts = [
    ...contractsByKind.delivery,
    ...contractsByKind.packaged,
  ];

  it('maps every delivery-facing contract to declared delivery or packaged gates', () => {
    expect(deliveryAndPackagedContracts.length).toBeGreaterThan(0);

    const allowedGateIds = new Set([
      'QG-DELIVERY-001',
      'QG-PKG-001',
      'QG-PKG-002',
      'QG-PKG-003',
    ]);

    for (const contract of deliveryAndPackagedContracts) {
      expect(contract.gateIds.length).toBeGreaterThan(0);
      for (const gateId of contract.gateIds) {
        expect(allowedGateIds.has(gateId)).toBe(true);
        expect(gateById.has(gateId)).toBe(true);
      }
    }
  });

  it('routes delivery and packaged proof paths through dedicated gate commands', () => {
    expect(gateById.get('QG-DELIVERY-001')?.ownerCommands).toContain('npm run test:delivery-quality-contracts');
    expect(gateById.get('QG-PKG-001')?.ownerCommands).toContain('npm run test:packaged-ui-contracts');
    expect(gateById.get('QG-PKG-002')?.ownerCommands).toContain('npm run test:packaged-ui-contracts');
    expect(gateById.get('QG-PKG-003')?.ownerCommands).toContain('npm run test:packaged-ui-contracts');
  });

  it('keeps strict delivery artifacts on the 90-point delivery quality bar', () => {
    const deliveryQualityContract = contractsByKind.delivery.find((contract) =>
      contract.id === 'UI-DELIVERY-MARKDOWN-QUALITY-STRICT'
    );
    expect(deliveryQualityContract?.assert.quality?.minimumDeliveryScore).toBe(90);
    expect(deliveryQualityContract?.assert.quality?.minimumScore).toBe(90);

    const packagedReopenContract = contractsByKind.packaged.find((contract) =>
      contract.id === 'UI-PACKAGED-PRESERVED-PROJECT-REOPENS'
    );
    expect(packagedReopenContract?.assert.quality?.minimumDeliveryScore).toBe(90);
  });
});
