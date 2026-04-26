import fs from 'node:fs';
import { expect, test } from '@playwright/test';

import { contractsByKind } from '../contracts';
import { runHandoffOrQualityContract } from './helpers/handoff-quality-contract-harness';
import {
  findLatestExtremeValidationProject,
  resolvePackagedExecutablePath,
} from '../../scripts/lib/packaged-project-paths.mjs';

const latestValidationSuite = findLatestExtremeValidationProject(process.cwd());
const packagedExecutablePath = resolvePackagedExecutablePath(process.cwd());
const packagedPreconditionsMet = process.platform === 'win32'
  && process.env.CYBER_EDITOR_RUN_PACKAGED_UI_CONTRACTS === '1'
  && Boolean(latestValidationSuite)
  && fs.existsSync(packagedExecutablePath);

test.describe('packaged ui contracts keep the preserved-project handoff path valid for real user delivery', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(900_000);
  test.skip(
    !packagedPreconditionsMet,
    'packaged ui contracts require the dedicated packaged script, Windows, a packaged executable, and post-change validation artifacts',
  );

  test('registry is populated', () => {
    expect(contractsByKind.packaged.length).toBeGreaterThan(0);
  });

  for (const contract of contractsByKind.packaged) {
    test(contract.id, async () => {
      await runHandoffOrQualityContract(contract);
    });
  }
});
