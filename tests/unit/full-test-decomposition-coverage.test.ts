import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const rootDir = process.cwd();
const docsDir = path.join(rootDir, 'docs', '04-测试验收');
const detailDocsDir = path.join(rootDir, 'docs', '06-详细设计库');

function readDocByPrefix(prefix: string) {
  const name = fs
    .readdirSync(docsDir)
    .find((entry) => entry.startsWith(prefix) && entry.endsWith('.md'));
  if (!name) {
    throw new Error(`missing doc for prefix ${prefix}`);
  }
  return fs.readFileSync(path.join(docsDir, name), 'utf8');
}

function extractIds(text: string, pattern: RegExp) {
  return [...new Set(text.match(pattern) ?? [])].sort();
}

function parseCoverageLines(text: string, prefix: 'F' | 'INF') {
  return text
    .split(/\r?\n/u)
    .filter((line) => new RegExp(`^\\|\\s*${prefix}-\\d{3}\\s*\\|`).test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
}

function parseFamilyCells(cells: string[]) {
  return {
    logic: cells[2],
    functional: cells[3],
    abuse: cells[4],
    stress: cells[5],
    experience: cells[6],
    scenario: cells[7],
  };
}

describe('full test decomposition coverage', () => {
  const sourceDoc = fs.readFileSync(path.join(detailDocsDir, '03-功能清单.md'), 'utf8');
  const familyDoc = readDocByPrefix('20-');
  const userDoc = readDocByPrefix('21-');
  const internalDoc = readDocByPrefix('22-');

  it('covers every F-* and INF-* id from the source feature inventory', () => {
    const sourceFeatureIds = extractIds(sourceDoc, /F-\d{3}/g);
    const sourceInternalIds = extractIds(sourceDoc, /INF-\d{3}/g);
    const mappedFeatureIds = extractIds(userDoc, /F-\d{3}/g);
    const mappedInternalIds = extractIds(internalDoc, /INF-\d{3}/g);

    expect(mappedFeatureIds).toEqual(sourceFeatureIds);
    expect(mappedInternalIds).toEqual(sourceInternalIds);
  });

  it('references only declared family ids and fills all six categories for every mapped row', () => {
    const allowedFamilyIds = new Set(
      extractIds(familyDoc, /(LOG|FUN|ABU|STR|EXP|SCN)-\d{2}/g),
    );

    const userRows = parseCoverageLines(userDoc, 'F');
    const internalRows = parseCoverageLines(internalDoc, 'INF');

    for (const cells of [...userRows, ...internalRows]) {
      const families = parseFamilyCells(cells);
      for (const value of Object.values(families)) {
        expect(value.length).toBeGreaterThan(0);
        for (const familyId of value.split('、')) {
          expect(allowedFamilyIds.has(familyId)).toBe(true);
        }
      }
    }
  });
});
