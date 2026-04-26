import { expect, test } from '@playwright/test';

import { contractsByKind } from '../contracts';
import { runExperienceContract } from './helpers/experience-contract-harness';

test.describe('latency contracts keep high-frequency interactions within handoff thresholds', () => {
  test.setTimeout(240_000);

  test('registry is populated', () => {
    expect(contractsByKind.latency.length).toBeGreaterThan(0);
  });

  for (const contract of contractsByKind.latency) {
    test(contract.id, async () => {
      await runExperienceContract(contract);
    });
  }
});
