import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { allUiContracts } from '../contracts';

const rootDir = process.cwd();
const generatedDir = path.join(rootDir, 'docs', '04-测试验收', 'generated');

type ExecutableCase = {
  caseId: string;
  laneIds: string[];
  evidenceIds: string[];
  qualityGateIds: string[];
};

type QualityGate = {
  id: string;
  name: string;
  dimension: string;
  severity: string;
  thresholdText: string;
  evidenceIds: string[];
  ownerCommands: string[];
  repoEvidence: string[];
  officialSources: string[];
};

function readJson<T>(fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(generatedDir, fileName), 'utf8')) as T;
}

describe('quality gate coverage', () => {
  const cases = readJson<ExecutableCase[]>('full-executable-test-cases.json');
  const gates = readJson<QualityGate[]>('quality-gates.json');

  it('defines stable quality gates with measurable or zero-defect thresholds', () => {
    expect(gates.length).toBeGreaterThanOrEqual(9);

    const ids = new Set<string>();
    for (const gate of gates) {
      expect(ids.has(gate.id)).toBe(false);
      ids.add(gate.id);

      expect(gate.id).toMatch(/^QG-[A-Z0-9-]+$/u);
      expect(gate.name.length).toBeGreaterThan(0);
      expect(gate.dimension.length).toBeGreaterThan(0);
      expect(gate.severity.length).toBeGreaterThan(0);
      expect(gate.thresholdText.length).toBeGreaterThan(0);
      expect(gate.evidenceIds.length).toBeGreaterThan(0);
      expect(gate.ownerCommands.length).toBeGreaterThan(0);
      expect(gate.repoEvidence.length).toBeGreaterThan(0);
      expect(gate.officialSources.length).toBeGreaterThan(0);

      for (const source of gate.officialSources) {
        expect(
          source.startsWith('https://playwright.dev/') ||
            source.startsWith('https://platform.openai.com/') ||
            source.startsWith('https://www.electronjs.org/'),
        ).toBe(true);
      }
    }
  });

  it('binds every executable case to lane-appropriate quality gates', () => {
    const gateIds = new Set(gates.map((gate) => gate.id));
    const gateUsage = new Map<string, number>();
    const contractGateIds = new Set(allUiContracts.flatMap((contract) => contract.gateIds));

    for (const row of cases) {
      expect(row.qualityGateIds.length).toBeGreaterThan(0);
      expect(new Set(row.qualityGateIds).size).toBe(row.qualityGateIds.length);
      expect(row.qualityGateIds).toContain('QG-FUNC-001');
      expect(row.qualityGateIds).toContain('QG-FUNC-002');

      for (const gateId of row.qualityGateIds) {
        expect(gateIds.has(gateId)).toBe(true);
        gateUsage.set(gateId, (gateUsage.get(gateId) ?? 0) + 1);
      }

      if (row.laneIds.includes('LANE-UI-REVIEW')) {
        expect(row.qualityGateIds).toContain('QG-UX-002');
        expect(row.qualityGateIds).toContain('QG-UX-003');
        expect(row.qualityGateIds).toContain('QG-UX-004');
      }

      if (
        row.laneIds.some((laneId) =>
          [
            'LANE-ELECTRON-E2E',
            'LANE-UI-REVIEW',
            'LANE-STRESS-BATCH',
            'LANE-CLOSED-LOOP',
            'LANE-PACKAGED-SMOKE',
            'LANE-PACKAGED-CLOSED-LOOP',
          ].includes(laneId),
        )
      ) {
        expect(row.qualityGateIds).toContain('QG-UX-005');
      }

      if (row.laneIds.includes('LANE-PACKAGED-SMOKE') || row.laneIds.includes('LANE-PACKAGED-CLOSED-LOOP')) {
        expect(row.qualityGateIds).toContain('QG-PKG-001');
        expect(row.qualityGateIds).toContain('QG-PKG-002');
        expect(row.qualityGateIds).toContain('QG-PKG-003');
      }

      if (
        row.laneIds.includes('LANE-STRESS-BATCH') ||
        row.laneIds.includes('LANE-CLOSED-LOOP') ||
        row.laneIds.includes('LANE-PACKAGED-CLOSED-LOOP')
      ) {
        expect(row.qualityGateIds).toContain('QG-STRESS-001');
        expect(row.qualityGateIds).toContain('QG-STRESS-002');
      }

      if (row.evidenceIds.includes('EVD-EXPORT')) {
        expect(row.qualityGateIds).toContain('QG-DELIVERY-001');
      }
    }

    for (const gate of gates) {
      expect(gateUsage.get(gate.id) ?? 0).toBeGreaterThan(0);
    }

    for (const gateId of contractGateIds) {
      expect(gateIds.has(gateId)).toBe(true);
      expect(gateUsage.get(gateId) ?? 0).toBeGreaterThan(0);
    }
  });
});
