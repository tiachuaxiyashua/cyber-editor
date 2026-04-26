import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DocumentSnapshotInfo, DocumentSnapshotSource } from '../../shared/types';
import { diffLineStats, summarizeLineChange } from './document-diff';

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function titleFor(filePath: string) {
  return path.basename(filePath, path.extname(filePath));
}

function snapshotIndexPath(rootPath: string) {
  return path.join(rootPath, '.project', 'document-snapshots', 'index.json');
}

function snapshotDataPath(rootPath: string, snapshotId: string) {
  return path.join(rootPath, '.project', 'document-snapshots', 'data', `${snapshotId}.md`);
}

export class DocumentSnapshotService {
  listSnapshots(rootPath: string, filePath: string, limit = 20) {
    return readJsonSafe<DocumentSnapshotInfo[]>(snapshotIndexPath(rootPath), [])
      .filter((item) => item.filePath === filePath)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  createSnapshot(
    rootPath: string,
    filePath: string,
    contents: string,
    input: { label: string; source: DocumentSnapshotSource; previousContents?: string }
  ) {
    const stats = diffLineStats(input.previousContents ?? '', contents);
    const snapshot: DocumentSnapshotInfo = {
      id: randomUUID(),
      filePath,
      label: input.label,
      createdAt: new Date().toISOString(),
      source: input.source,
      summary: summarizeLineChange(titleFor(filePath), stats),
      excerpt: stats.excerptAfter || stats.excerptBefore
    };
    ensureDir(path.dirname(snapshotDataPath(rootPath, snapshot.id)));
    fs.writeFileSync(snapshotDataPath(rootPath, snapshot.id), contents, 'utf8');
    const index = readJsonSafe<DocumentSnapshotInfo[]>(snapshotIndexPath(rootPath), []);
    writeJson(snapshotIndexPath(rootPath), [snapshot, ...index]);
    return snapshot;
  }

  readSnapshotContents(rootPath: string, filePath: string, snapshotId: string) {
    const snapshot = this.listSnapshots(rootPath, filePath, 200).find((item) => item.id === snapshotId);
    if (!snapshot) {
      throw new Error('未找到目标文档快照。');
    }
    const dataPath = snapshotDataPath(rootPath, snapshot.id);
    if (!fs.existsSync(dataPath)) {
      throw new Error('文档快照内容缺失。');
    }
    return {
      snapshot,
      contents: fs.readFileSync(dataPath, 'utf8')
    };
  }
}
