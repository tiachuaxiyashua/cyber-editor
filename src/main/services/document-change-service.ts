import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  DocumentChangeRecord,
  DocumentChangeSource,
  NoteReferenceDocument,
  NoteReferenceGraph
} from '../../shared/types';

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function noteTitle(filePath: string) {
  return path.basename(filePath, path.extname(filePath));
}

function normalizeRelativePath(rootPath: string, targetPath: string) {
  return path.relative(rootPath, targetPath).replace(/\\/g, '/');
}

function stripAnchor(target: string) {
  return target.split('#')[0]?.trim() ?? '';
}

function normalizeMarkdownTarget(target: string) {
  const trimmed = target.trim().replace(/^<|>$/g, '');
  if (!trimmed || trimmed.startsWith('#')) return '';
  if (/^(https?:|mailto:|data:)/i.test(trimmed)) return '';
  return stripAnchor(trimmed.split(/\s+/)[0] ?? '');
}

function resolveMarkdownTarget(rootPath: string, sourcePath: string, rawTarget: string, notePaths: string[]) {
  const normalized = normalizeMarkdownTarget(rawTarget);
  if (!normalized) return null;

  const candidates: string[] = [];
  const directCandidate = normalized.startsWith('/')
    ? path.resolve(rootPath, normalized.slice(1))
    : path.resolve(path.dirname(sourcePath), normalized);
  candidates.push(directCandidate);

  if (!path.extname(directCandidate)) {
    for (const ext of ['.md', '.markdown', '.txt']) {
      candidates.push(`${directCandidate}${ext}`);
    }
  }

  return candidates.find((candidate) => notePaths.includes(candidate)) ?? null;
}

function normalizeWikiTarget(target: string) {
  const raw = target.split('|')[0]?.split('#')[0]?.trim() ?? '';
  return raw.replace(/\\/g, '/');
}

function resolveWikiTarget(rootPath: string, sourcePath: string, rawTarget: string, notePaths: string[]) {
  const normalized = normalizeWikiTarget(rawTarget);
  if (!normalized) return null;

  const directCandidates: string[] = [];
  const normalizedPath = normalized.replace(/^\/+/, '');
  directCandidates.push(path.resolve(rootPath, normalizedPath));
  directCandidates.push(path.resolve(path.dirname(sourcePath), normalized));
  if (!path.extname(normalized)) {
    for (const base of [...directCandidates]) {
      for (const ext of ['.md', '.markdown', '.txt']) {
        directCandidates.push(`${base}${ext}`);
      }
    }
  }

  const directMatch = directCandidates.find((candidate) => notePaths.includes(candidate));
  if (directMatch) return directMatch;

  const normalizedName = normalized.toLowerCase();
  const basenameMatches = notePaths.filter((candidate) => {
    const candidateName = noteTitle(candidate).toLowerCase();
    const relativeName = normalizeRelativePath(rootPath, candidate).replace(/\.[^.]+$/, '').toLowerCase();
    return candidateName === normalizedName || relativeName === normalizedName;
  });
  return basenameMatches.length === 1 ? basenameMatches[0] : null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function diffLineStats(previousContents: string, nextContents: string) {
  const previousLines = previousContents.split(/\r?\n/);
  const nextLines = nextContents.split(/\r?\n/);
  let start = 0;

  while (
    start < previousLines.length
    && start < nextLines.length
    && previousLines[start] === nextLines[start]
  ) {
    start += 1;
  }

  let previousEnd = previousLines.length - 1;
  let nextEnd = nextLines.length - 1;
  while (
    previousEnd >= start
    && nextEnd >= start
    && previousLines[previousEnd] === nextLines[nextEnd]
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  const removedBlock = previousEnd >= start ? previousLines.slice(start, previousEnd + 1) : [];
  const addedBlock = nextEnd >= start ? nextLines.slice(start, nextEnd + 1) : [];
  const removedLineCount = removedBlock.length;
  const addedLineCount = addedBlock.length;
  const changedLineCount = Math.max(removedLineCount, addedLineCount);
  const excerptBefore = removedBlock.map((line) => line.trim()).filter(Boolean).slice(0, 3).join(' / ');
  const excerptAfter = addedBlock.map((line) => line.trim()).filter(Boolean).slice(0, 3).join(' / ');

  return {
    addedLineCount,
    removedLineCount,
    changedLineCount,
    excerptBefore: excerptBefore || undefined,
    excerptAfter: excerptAfter || undefined
  };
}

function summarizeDocumentChange(
  title: string,
  stats: ReturnType<typeof diffLineStats>,
  impact: {
    inboundAffectedPaths: string[];
    outboundAddedPaths: string[];
    outboundRemovedPaths: string[];
    artifactPaths: string[];
  }
) {
  const changeBits = [
    stats.changedLineCount ? `changed ${stats.changedLineCount} lines` : '',
    stats.addedLineCount ? `added ${stats.addedLineCount} lines` : '',
    stats.removedLineCount ? `removed ${stats.removedLineCount} lines` : ''
  ].filter(Boolean);
  const impactBits = [
    impact.outboundAddedPaths.length ? `added ${impact.outboundAddedPaths.length} outbound refs` : '',
    impact.outboundRemovedPaths.length ? `removed ${impact.outboundRemovedPaths.length} outbound refs` : '',
    impact.inboundAffectedPaths.length ? `affected ${impact.inboundAffectedPaths.length} inbound docs` : '',
    impact.artifactPaths.length ? `hit ${impact.artifactPaths.length} tracked artifacts` : ''
  ].filter(Boolean);
  const excerpt = stats.excerptAfter || stats.excerptBefore || title;
  return [changeBits.join(', '), impactBits.join(', '), `summary: ${excerpt}`].filter(Boolean).join(', ');
}

function collectReferenceTargets(rootPath: string, sourcePath: string, contents: string, notePaths: string[]) {
  const targets: string[] = [];
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    const markdownRegex = /(!)?\[[^\]]*]\(([^)]+)\)/g;
    let markdownMatch: RegExpExecArray | null;
    while ((markdownMatch = markdownRegex.exec(line))) {
      if (markdownMatch[1] === '!') continue;
      const rawTarget = markdownMatch[2]?.trim() ?? '';
      const targetPath = resolveMarkdownTarget(rootPath, sourcePath, rawTarget, notePaths);
      if (targetPath) {
        targets.push(targetPath);
      }
    }

    const wikiRegex = /\[\[([^\]]+)\]\]/g;
    let wikiMatch: RegExpExecArray | null;
    while ((wikiMatch = wikiRegex.exec(line))) {
      const rawTarget = wikiMatch[1]?.trim() ?? '';
      const targetPath = resolveWikiTarget(rootPath, sourcePath, rawTarget, notePaths);
      if (targetPath) {
        targets.push(targetPath);
      }
    }
  }
  return uniqueStrings(targets);
}

export class DocumentChangeService {
  listRecentDocumentChanges(rootPath: string, limit = 20) {
    return readJsonSafe<DocumentChangeRecord[]>(path.join(rootPath, '.project', 'recent-document-changes.json'), []).slice(0, limit);
  }

  recordDocumentChange(
    filePath: string,
    previousContents: string,
    nextContents: string,
    source: DocumentChangeSource,
    options: {
      inferProjectRoot: (targetPath: string) => string | null;
      buildNoteReferenceGraph: (rootPath: string) => NoteReferenceGraph;
    }
  ) {
    const rootPath = options.inferProjectRoot(filePath);
    if (!rootPath || previousContents === nextContents) {
      return null;
    }

    const graph = options.buildNoteReferenceGraph(rootPath);
    const notePaths = graph.documents.map((document) => document.path);
    const previousTargets = collectReferenceTargets(rootPath, filePath, previousContents, notePaths);
    const nextTargets = collectReferenceTargets(rootPath, filePath, nextContents, notePaths);
    const currentDocument = graph.documents.find((document) => document.path === filePath);
    const relativePath = normalizeRelativePath(rootPath, filePath);
    const artifactPaths = relativePath && !/^(\.project|assets)\//.test(relativePath) ? [relativePath] : [];
    const impact = {
      inboundAffectedPaths: uniqueStrings((currentDocument?.inbound ?? []).map((edge) => edge.sourcePath)),
      outboundAddedPaths: uniqueStrings(nextTargets.filter((targetPath) => !previousTargets.includes(targetPath))),
      outboundRemovedPaths: uniqueStrings(previousTargets.filter((targetPath) => !nextTargets.includes(targetPath))),
      artifactPaths
    };
    const stats = diffLineStats(previousContents, nextContents);
    const record: DocumentChangeRecord = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      filePath,
      title: noteTitle(filePath),
      source,
      summary: summarizeDocumentChange(noteTitle(filePath), stats, impact),
      addedLineCount: stats.addedLineCount,
      removedLineCount: stats.removedLineCount,
      changedLineCount: stats.changedLineCount,
      excerptBefore: stats.excerptBefore,
      excerptAfter: stats.excerptAfter,
      impact
    };

    writeJson(path.join(rootPath, '.project', 'recent-document-changes.json'), [
      record,
      ...this.listRecentDocumentChanges(rootPath, 49)
    ]);
    return record;
  }

  getRelevantDocumentChanges(rootPath: string, anchorPaths: string[], limit = 5) {
    const anchors = new Set(anchorPaths);
    return this.listRecentDocumentChanges(rootPath, 50)
      .filter((record) =>
        anchors.has(record.filePath)
        || record.impact.inboundAffectedPaths.some((item) => anchors.has(item))
        || record.impact.outboundAddedPaths.some((item) => anchors.has(item))
        || record.impact.outboundRemovedPaths.some((item) => anchors.has(item))
      )
      .slice(0, limit);
  }

  buildRecentChangeContext(rootPath: string, anchorPaths: string[], limit = 4) {
    const changes = this.getRelevantDocumentChanges(rootPath, anchorPaths, limit);
    if (!changes.length) return '';
    return [
      'Recent document changes:',
      ...changes.map((record) => {
        const impactBits = [
          record.impact.inboundAffectedPaths.length ? `upstream ${record.impact.inboundAffectedPaths.map((item) => noteTitle(item)).join(', ')}` : '',
          record.impact.outboundAddedPaths.length ? `added refs ${record.impact.outboundAddedPaths.map((item) => noteTitle(item)).join(', ')}` : '',
          record.impact.outboundRemovedPaths.length ? `removed refs ${record.impact.outboundRemovedPaths.map((item) => noteTitle(item)).join(', ')}` : ''
        ].filter(Boolean);
        return `- ${normalizeRelativePath(rootPath, record.filePath)} [${record.source}] ${record.summary}${impactBits.length ? ` (${impactBits.join('; ')})` : ''}`;
      })
    ].join('\n');
  }

  buildDocumentContext(rootPath: string, documentPaths: string[], maxCharsPerDocument = 800) {
    const blocks = documentPaths
      .filter(Boolean)
      .map((documentPath) => {
        if (!fs.existsSync(documentPath)) return '';
        const contents = fs.readFileSync(documentPath, 'utf8');
        const excerpt = contents.slice(0, maxCharsPerDocument).trim();
        if (!excerpt) return '';
        return [
          `Document: ${normalizeRelativePath(rootPath, documentPath)}`,
          excerpt
        ].join('\n');
      })
      .filter(Boolean);
    return blocks.length ? `Related document context:\n${blocks.join('\n\n')}` : '';
  }
}
