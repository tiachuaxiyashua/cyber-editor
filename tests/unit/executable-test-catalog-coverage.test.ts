import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const rootDir = process.cwd();
const docsDir = path.join(rootDir, 'docs', '04-测试验收');
const generatedDir = path.join(docsDir, 'generated');

function readDocByPrefix(prefix: string) {
  const name = fs
    .readdirSync(docsDir)
    .find((entry) => entry.startsWith(prefix) && entry.endsWith('.md'));
  if (!name) {
    throw new Error(`missing doc for prefix ${prefix}`);
  }
  return fs.readFileSync(path.join(docsDir, name), 'utf8');
}

function tableCells(line: string) {
  return line.split('|').slice(1, -1).map((cell) => cell.trim());
}

function splitFamilyIds(value: string) {
  return value
    .split('、')
    .map((item) => item.trim())
    .filter(Boolean);
}

function expectedCaseCountFromMappings() {
  const mappingDocs = [readDocByPrefix('21-'), readDocByPrefix('22-')];
  let count = 0;
  for (const text of mappingDocs) {
    for (const line of text.split(/\r?\n/u)) {
      if (/^\|\s*(F|INF)-\d{3}\s*\|/u.test(line)) {
        const cells = tableCells(line);
        const families = [
          ...splitFamilyIds(cells[2]),
          ...splitFamilyIds(cells[3]),
          ...splitFamilyIds(cells[4]),
          ...splitFamilyIds(cells[5]),
          ...splitFamilyIds(cells[6]),
          ...splitFamilyIds(cells[7]),
        ];
        count += families.length;
      }
    }
  }
  return count;
}

describe('executable test catalog coverage', () => {
  const familyDoc = readDocByPrefix('20-');
  const laneDoc = readDocByPrefix('25-');
  const fixtureDoc = readDocByPrefix('24-');
  const catalogRunnerSource = fs.readFileSync(path.join(rootDir, 'scripts', 'run-executable-case-catalog.mjs'), 'utf8');
  const caseCatalogPath = path.join(generatedDir, 'full-executable-test-cases.json');
  const cases = JSON.parse(fs.readFileSync(caseCatalogPath, 'utf8')) as Array<{
    caseId: string;
    objectId: string;
    familyId: string;
    primaryLaneId: string;
    laneIds: string[];
    fixtureIds: string[];
    evidenceIds: string[];
    qualityGateIds: string[];
    preconditions: string;
    minimalSteps: string;
    oracle: string;
  }>;

  it('generates one executable case for every mapped family reference', () => {
    expect(cases.length).toBe(expectedCaseCountFromMappings());
  });

  it('ensures every executable case is unique and fully wired', () => {
    const familyIds = new Set(
      (familyDoc.match(/(LOG|FUN|ABU|STR|EXP|SCN)-\d{2}/g) ?? []).sort(),
    );
    const laneIds = new Set((laneDoc.match(/LANE-[A-Z0-9-]+/g) ?? []).sort());
    const fixtureIds = new Set((fixtureDoc.match(/FIX-\d{2}/g) ?? []).sort());
    const caseIds = new Set<string>();

    for (const row of cases) {
      expect(caseIds.has(row.caseId)).toBe(false);
      caseIds.add(row.caseId);

      expect(row.caseId).toMatch(/^TC-(F|INF)-\d{3}-(LOG|FUN|ABU|STR|EXP|SCN)-\d{2}$/u);
      expect(familyIds.has(row.familyId)).toBe(true);
      expect(laneIds.has(row.primaryLaneId)).toBe(true);
      expect(row.laneIds.length).toBeGreaterThan(0);
      expect(row.fixtureIds.length).toBeGreaterThan(0);
      expect(row.evidenceIds.length).toBeGreaterThan(0);
      expect(row.qualityGateIds.length).toBeGreaterThan(0);
      expect(row.preconditions.length).toBeGreaterThan(0);
      expect(row.minimalSteps.length).toBeGreaterThan(0);
      expect(row.oracle.length).toBeGreaterThan(0);
      expect(row.minimalSteps.includes('undefined')).toBe(false);

      for (const laneId of row.laneIds) {
        expect(laneIds.has(laneId)).toBe(true);
      }
      for (const fixtureId of row.fixtureIds) {
        expect(fixtureIds.has(fixtureId)).toBe(true);
      }
    }
  });

  it('prevents lane-level suite success from being reported as case-level oracle proof', () => {
    expect(catalogRunnerSource).toContain('CASE_ORACLE_COVERAGE_PATH');
    expect(catalogRunnerSource).toContain('caseProofStatus');
    expect(catalogRunnerSource).toContain('executionUnproven');
    expect(catalogRunnerSource).toContain('missingProofEvidenceIds');
    expect(catalogRunnerSource).not.toContain(
      'const executionPassed = failedLanes.length === 0 && missingEvidenceIds.length === 0;',
    );
  });

  it('marks lane-passed cases as unproven when case-level oracle coverage is missing', () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'case-catalog-runner-'));
    try {
      const caseCatalogPath = path.join(fixtureRoot, 'cases.json');
      const qualityGatePath = path.join(fixtureRoot, 'quality-gates.json');
      const suiteResultsPath = path.join(fixtureRoot, 'suite-results.json');
      const runRoot = path.join(fixtureRoot, 'run');
      fs.writeFileSync(
        caseCatalogPath,
        JSON.stringify([
          {
            caseId: 'TC-F-001-FUN-01',
            objectId: 'F-001',
            objectKind: 'feature',
            objectDomain: 'core',
            suiteCategory: 'FUN',
            familyId: 'FUN-01',
            primaryLaneId: 'LANE-UNIT',
            laneIds: ['LANE-UNIT'],
            evidenceIds: ['EVD-ASSERT'],
            qualityGateIds: ['QG-FUNC-001'],
            fixtureIds: ['FIX-01'],
            preconditions: 'fixture',
            minimalSteps: 'run',
            oracle: 'assert'
          }
        ], null, 2),
        'utf8'
      );
      fs.writeFileSync(
        qualityGatePath,
        JSON.stringify([{ id: 'QG-FUNC-001', label: 'Function gate' }], null, 2),
        'utf8'
      );
      fs.writeFileSync(
        suiteResultsPath,
        JSON.stringify({
          suites: [
            {
              id: 'LANE-UNIT',
              status: 'passed',
              providedEvidenceIds: ['EVD-ASSERT'],
              artifactPaths: ['unit.log']
            }
          ]
        }, null, 2),
        'utf8'
      );

      const result = spawnSync(process.execPath, [path.join(rootDir, 'scripts', 'run-executable-case-catalog.mjs')], {
        cwd: rootDir,
        env: {
          ...process.env,
          CASE_CATALOG_PATH: caseCatalogPath,
          QUALITY_GATES_PATH: qualityGatePath,
          CASE_ORACLE_COVERAGE_PATH: path.join(fixtureRoot, 'missing-case-oracle.json'),
          CASE_CATALOG_SUITE_RESULTS_PATH: suiteResultsPath,
          CASE_CATALOG_RUN_ROOT: runRoot
        },
        encoding: 'utf8',
        windowsHide: true
      });

      expect(result.status).toBe(1);
      const summary = JSON.parse(fs.readFileSync(path.join(runRoot, 'summary.json'), 'utf8'));
      const caseResults = JSON.parse(fs.readFileSync(path.join(runRoot, 'case-results.json'), 'utf8'));
      expect(summary.summary.executionPassed).toBe(0);
      expect(summary.summary.executionFailed).toBe(0);
      expect(summary.summary.executionUnproven).toBe(1);
      expect(summary.summary.caseOracleCoverage.manifestExists).toBe(false);
      expect(caseResults[0].executionStatus).toBe('unproven');
      expect(caseResults[0].caseProofStatus).toBe('unproven');
      expect(caseResults[0].missingProofEvidenceIds).toEqual(['EVD-ASSERT']);
      expect(caseResults[0].missingProofAssertion).toBe(true);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
