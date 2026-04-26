export interface QualityGate {
  id: string;
  name: string;
  dimension: string;
  severity: string;
  appliesTo: {
    suiteCategories: string[];
    laneIds: string[];
  };
  metricType: string;
  thresholdText: string;
  thresholds: Record<string, number | string>;
  evidenceIds: string[];
  ownerCommands: string[];
  repoEvidence: string[];
  officialSources: string[];
}

export const qualityGates: QualityGate[];
export const qualityGateById: Map<string, QualityGate>;

export function qualityGateIdsForCase(
  objectRow: { focus: string },
  family: { id: string; category: string },
  laneIds: string[]
): string[];
