import { expect, test } from '@playwright/test';

import { contractsByKind } from '../contracts';
import { runStateContract } from './helpers/action-state-contract-harness';

test.describe('state contracts keep blocked, disabled, and recovery states aligned with expectations', () => {
  test.setTimeout(180_000);
  test('registry is populated', () => {
    expect(contractsByKind.state.length).toBeGreaterThan(0);
  });

  for (const contract of contractsByKind.state) {
    test(contract.id, async () => {
      await runStateContract(contract);
    });
  }
});
