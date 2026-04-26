import type { UiPreviewRegion, UiPreviewSection, UiPreviewSpec } from './types';

function isRegion(value: unknown): value is UiPreviewRegion {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string' && typeof candidate.title === 'string';
}

function isSection(value: unknown): value is UiPreviewSection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    Array.isArray(candidate.regions) &&
    candidate.regions.every(isRegion);
}

function isSpec(value: unknown): value is UiPreviewSpec {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.title === 'string' &&
    Array.isArray(candidate.sections) &&
    candidate.sections.every(isSection);
}

export function parseUiPreviewSpec(raw: string): UiPreviewSpec | null {
  try {
    const value = JSON.parse(raw) as unknown;
    return isSpec(value) ? value : null;
  } catch {
    return null;
  }
}

export function collectPreviewTargets(spec: UiPreviewSpec) {
  return spec.sections.flatMap((section) =>
    section.regions
      .filter((region) => Boolean(region.target))
      .map((region) => ({
        id: region.id,
        title: region.title,
        target: region.target as string
      }))
  );
}
