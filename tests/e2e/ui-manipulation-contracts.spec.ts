import { expect, test } from '@playwright/test';

import { contractsByKind } from '../contracts';
import { runExperienceContract } from './helpers/experience-contract-harness';

test.describe('manipulation contracts keep drag, resize, and compact layout behavior aligned with the design gate', () => {
  test.setTimeout(240_000);

  test('registry is populated', () => {
    expect(contractsByKind.manipulation.length).toBeGreaterThan(0);
  });

  for (const contract of contractsByKind.manipulation) {
    test(contract.id, async () => {
      await runExperienceContract(contract);
    });
  }
});
