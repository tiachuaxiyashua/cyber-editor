import { expect, test } from '@playwright/test';

import { contractsByKind } from '../contracts';
import { runActionContract } from './helpers/action-state-contract-harness';

test.describe('action contracts keep primary clicks aligned with expected destinations', () => {
  test.setTimeout(180_000);
  test('registry is populated', () => {
    expect(contractsByKind.action.length).toBeGreaterThan(0);
  });

  for (const contract of contractsByKind.action) {
    test(contract.id, async () => {
      await runActionContract(contract);
    });
  }
});
