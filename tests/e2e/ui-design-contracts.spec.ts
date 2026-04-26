import { expect, test } from '@playwright/test';

import { contractsByKind } from '../contracts';
import { applyContractViewport, launchContractApp, runLayoutContracts } from './helpers/contract-harness';

test.describe('layout contracts hold for welcome, workbench, resources, rules, settings, and orchestration', () => {
  test('registry is populated', async () => {
    expect(contractsByKind.layout.length).toBeGreaterThan(0);
  });

  for (const contract of contractsByKind.layout) {
    test(contract.id, async () => {
      const { app, page, cleanup } = await launchContractApp({ projectMode: contract.precondition.projectMode });

      try {
        await applyContractViewport(page, contract);
        await runLayoutContracts(page, [contract]);
      } finally {
        await cleanup(app);
      }
    });
  }
});
