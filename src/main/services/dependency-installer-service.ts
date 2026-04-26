import type { DependencyInstallRecord, DependencySpecItem } from '../../shared/orchestration-contracts';

const KNOWN_BUILTIN_SKILL_IDS = new Set([
  'verification-before-completion',
  'security-best-practices'
]);

export class DependencyInstallerService {
  constructor(private readonly knownBuiltinSkillIds = KNOWN_BUILTIN_SKILL_IDS) {}

  installDependencies(spec: DependencySpecItem[]): DependencyInstallRecord[] {
    return spec.map((item) => this.installDependency(item));
  }

  private installDependency(item: DependencySpecItem): DependencyInstallRecord {
    if (item.kind !== 'skill') {
      return {
        ...item,
        state: 'skipped'
      };
    }

    if (item.installMode === 'builtin' || item.installMode === 'embedded') {
      return {
        ...item,
        state: 'installed'
      };
    }

    if (item.installMode === 'registry' && item.source?.startsWith('builtin://')) {
      const builtinId = item.source.replace('builtin://', '').trim();
      const installed = this.knownBuiltinSkillIds.has(builtinId) || this.knownBuiltinSkillIds.has(item.id);
      return {
        ...item,
        state: installed ? 'installed' : 'failed',
        message: installed ? undefined : `Missing builtin dependency: ${builtinId || item.id}`
      };
    }

    return {
      ...item,
      state: item.required ? 'failed' : 'missing',
      message: item.source ? `Dependency source is unavailable: ${item.source}` : `Dependency source is unavailable: ${item.id}`
    };
  }
}
