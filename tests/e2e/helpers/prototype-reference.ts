import fs from 'node:fs';
import path from 'node:path';

const prototypeIndexPath = path.resolve(process.cwd(), 'prototypes', 'ui-rebuild', 'index.html');

export function readPrototypeIndex() {
  return fs.readFileSync(prototypeIndexPath, 'utf8');
}

export function assertPrototypeEntry(entry: string) {
  const html = readPrototypeIndex();
  if (html.includes(entry)) return;

  if (entry.startsWith('data-screen-target=')) {
    const target = entry.slice('data-screen-target='.length).replace(/^['"]|['"]$/g, '');
    if (
      html.includes(`data-screen-target="${target}"`)
      || html.includes(`data-screen-target='${target}'`)
    ) {
      return;
    }
  }

  throw new Error(`prototype entry missing: ${entry}`);
}

export function assertPrototypeTargets() {
  const html = readPrototypeIndex();
  for (const target of ['welcome', 'workbench', 'thinking-chain', 'resource-center', 'rules-center', 'settings', 'orchestration']) {
    if (!html.includes(`data-screen-target="${target}"`)) {
      throw new Error(`prototype screen target missing: ${target}`);
    }
  }
}
