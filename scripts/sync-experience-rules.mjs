import fs from 'node:fs';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const REPO_ROOT = process.cwd();

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, rawValue] = arg.slice(2).split('=');
    parsed[key] = rawValue ?? 'true';
  }
  return parsed;
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(args['project-root'] || REPO_ROOT);
  const sourcePath = args['source-path'] ? path.resolve(args['source-path']) : undefined;
  const artifactRoot = path.join(REPO_ROOT, 'artifacts', 'experience-sync');
  ensureDir(artifactRoot);

  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  );
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    args: ['.'],
    cwd: REPO_ROOT,
    env
  });

  try {
    const page = await app.firstWindow();
    const payload = await page.evaluate(
      async (request) => window.api.syncExperienceSources(request),
      { rootPath: projectRoot, sourcePath }
    );
    const summaryPath = path.join(artifactRoot, 'latest-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(payload, null, 2), 'utf8');
    process.stdout.write(`${JSON.stringify({ projectRoot, summaryPath, summary: payload.summary }, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
