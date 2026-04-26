import { expect, test } from '@playwright/test';

import { contractsByKind } from '../contracts';
import { runHandoffOrQualityContract } from './helpers/handoff-quality-contract-harness';
import { findLatestExtremeValidationProject } from '../../scripts/lib/packaged-project-paths.mjs';

const latestValidationSuite = findLatestExtremeValidationProject(process.cwd(), { requireExportSuite: true });

test.describe('delivery quality contracts keep exported artifacts complete and reviewable before handoff', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);
  test.skip(!latestValidationSuite, 'delivery quality contracts require post-change extreme validation artifacts with export suites');

  test('registry is populated', () => {
    expect(contractsByKind.delivery.length).toBeGreaterThan(0);
  });

  for (const contract of contractsByKind.delivery) {
    test(contract.id, async () => {
      await runHandoffOrQualityContract(contract);
    });
  }
});
