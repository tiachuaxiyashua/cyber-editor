import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('packaging chain', () => {
  it('keeps the default make path free of squirrel/electron-winstaller', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve('package.json'), 'utf8')
    ) as {
      devDependencies?: Record<string, string>;
    };
    const makeScript = fs.readFileSync(path.resolve('scripts/make-installer.mjs'), 'utf8');
    const forgeConfig = fs.readFileSync(path.resolve('forge.config.cjs'), 'utf8');

    expect(packageJson.devDependencies?.['@electron-forge/maker-squirrel']).toBeUndefined();
    expect(makeScript).not.toMatch(/electron-winstaller/);
    expect(forgeConfig).not.toMatch(/MakerSquirrel|maker-squirrel/);
    expect(packageJson.devDependencies?.['@electron-forge/maker-zip']).toBeTruthy();
  });
});
