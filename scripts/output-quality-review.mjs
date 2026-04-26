import path from 'node:path';
import { reviewMarkdownArtifact } from './lib/output-quality-review.mjs';

const args = process.argv.slice(2);
const strict = args.includes('--assistive') ? false : true;
const fileArgs = args.filter((arg) => !arg.startsWith('--'));

if (!fileArgs.length) {
  console.error('Usage: node scripts/output-quality-review.mjs [--assistive] <file> [file...]');
  process.exit(1);
}

const reviews = fileArgs.map((filePath) =>
  reviewMarkdownArtifact(path.resolve(filePath), {
    qualityTier: strict ? 'strict' : 'assistive'
  })
);

process.stdout.write(`${JSON.stringify(reviews, null, 2)}\n`);
