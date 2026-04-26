import { expect, test } from '@playwright/test';

import { contractsByKind } from '../contracts';
import {
  applyContractViewport,
  assertPrototypeContractSource,
  launchContractApp,
  runtimePageFor,
} from './helpers/contract-harness';

test.describe('runtime shell matches prototype entry hierarchy for first-screen pages', () => {
  test('registry is populated', async () => {
    expect(contractsByKind.prototype.length).toBeGreaterThan(0);
  });

  for (const contract of contractsByKind.prototype) {
    test(contract.id, async () => {
      assertPrototypeContractSource(contract);
      const { app, page, cleanup } = await launchContractApp({ projectMode: contract.precondition.projectMode });

      try {
        await applyContractViewport(page, contract);
        await runtimePageFor(page, contract);
        await expect(page.locator(contract.assert.locator!)).toBeVisible();
      } finally {
        await cleanup(app);
      }
    });
  }
});
