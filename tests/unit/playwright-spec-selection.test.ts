import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function collectFiles(root: string, predicate: (filePath: string) => boolean) {
  const results: string[] = [];
  if (!fs.existsSync(root)) {
    return results;
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(filePath, predicate));
    } else if (predicate(filePath)) {
      results.push(filePath);
    }
  }
  return results;
}

function listCollectedPlaywrightSpecs() {
  const output = execFileSync(
    process.execPath,
    ['scripts/with-clean-electron-env.mjs', 'playwright', 'test', '--list'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        FORCE_COLOR: '0'
      },
      timeout: 120_000
    }
  );

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes('.spec.'));
}

describe('playwright spec selection', () => {
  it('collects only TypeScript end-to-end specs in the default run', () => {
    const specs = listCollectedPlaywrightSpecs();

    expect(specs.length).toBeGreaterThan(0);
    expect(specs.some((line) => line.includes('.spec.ts:'))).toBe(true);
    expect(specs.some((line) => line.includes('.spec.js:'))).toBe(false);
  }, 130_000);

  it('does not leave stale JavaScript e2e spec mirrors beside TypeScript specs', () => {
    const staleSpecs = collectFiles(path.join(repoRoot, 'tests', 'e2e'), (filePath) => filePath.endsWith('.spec.js'))
      .map((filePath) => path.relative(repoRoot, filePath).replace(/\\/g, '/'));

    expect(staleSpecs).toEqual([]);
  });
});
