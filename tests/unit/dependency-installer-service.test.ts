import { describe, expect, it } from 'vitest';

describe('DependencyInstallerService', () => {
  it('installs builtin dependencies and reports failed required registry dependencies', async () => {
    const { DependencyInstallerService } = await import('../../src/main/services/dependency-installer-service.js');
    const service = new DependencyInstallerService();

    const results = service.installDependencies([
      {
        id: 'verification-before-completion',
        kind: 'skill',
        required: true,
        installMode: 'builtin'
      },
      {
        id: 'missing-skill',
        kind: 'skill',
        required: true,
        installMode: 'registry',
        source: 'builtin://missing-skill'
      }
    ]);

    expect(results[0]?.state).toBe('installed');
    expect(results[1]?.state).toBe('failed');
  });
});
