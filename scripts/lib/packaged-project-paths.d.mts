export interface ExtremeValidationProject {
  suiteName: string;
  suiteRoot: string;
  projectRoot: string;
  qualityReportPath: string | null;
}

export interface FindLatestExtremeValidationProjectOptions {
  requireExportSuite?: boolean;
}

export function resolvePackagedExecutablePath(
  repoRoot: string,
  platform?: NodeJS.Platform
): string;

export function resolveManualProjectsRoot(repoRoot: string): string;

export function findLatestExtremeValidationProject(
  repoRoot: string,
  options?: FindLatestExtremeValidationProjectOptions
): ExtremeValidationProject | null;
