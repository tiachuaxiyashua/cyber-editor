import { expect, test } from '@playwright/test';

import { contractsByKind } from '../contracts';
import { runExperienceContract } from './helpers/experience-contract-harness';

test.describe('thinking-map graph contracts keep default routing, zoom, and drag persistence aligned with expectations', () => {
  test.setTimeout(240_000);

  test('registry is populated', () => {
    expect(contractsByKind.graph.length).toBeGreaterThan(0);
  });

  for (const contract of contractsByKind.graph) {
    test(contract.id, async () => {
      await runExperienceContract(contract);
    });
  }
});
