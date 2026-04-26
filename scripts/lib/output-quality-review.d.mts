export type OutputQualityTier = 'strict' | 'assistive';

export interface OutputQualityReview {
  filePath: string;
  qualityTier: OutputQualityTier;
  verdict: string;
  band: string;
  score: number;
  dimensions: Record<string, number>;
  deliveryScore: number;
  deliveryBand: string;
  deliveryVerdict: string;
  deliveryReasons: string[];
  length: number;
  headingCount: number;
  bulletCount: number;
  tableRowCount: number;
  listMarkerCount: number;
  codeFenceCount: number;
  fallbackHits: string[];
  placeholderHits: string[];
  reasons: string[];
}

export interface OutputQualityReviewOptions {
  qualityTier?: OutputQualityTier;
  minimumLength?: number;
}

export function reviewMarkdownArtifact(
  filePath: string,
  options?: OutputQualityReviewOptions
): OutputQualityReview;

export function scoreMarkdownV2(
  filePath: string,
  options?: OutputQualityReviewOptions
): OutputQualityReview;
