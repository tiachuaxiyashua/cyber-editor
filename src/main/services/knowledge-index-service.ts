import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  KnowledgeIndexState,
  KnowledgeIndexStatus,
  KnowledgeIndexUnit
} from '../../shared/types';
import { ProjectService } from './project-service';

type PersistedKnowledgeIndex = {
  version: 1;
  builtAt?: string;
  units: KnowledgeIndexUnit[];
  lastError?: string;
};

function nowIso() {
  return new Date().toISOString();
}

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

function normalizeText(value: string) {
  return value.replace(/\r/g, '').trim();
}

function excerptForDocument(contents: string, maxChars = 320) {
  return normalizeText(contents).slice(0, maxChars);
}

function tokenize(value: string) {
  return Array.from(new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
  ));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function knowledgeIndexFile(rootPath: string) {
  return path.join(rootPath, '.project', 'runtime', 'knowledge', 'index.json');
}

function titleForDocument(filePath: string, contents: string) {
  const firstHeading = normalizeText(contents)
    .split('\n')
    .find((line) => /^#{1,6}\s+/.test(line));
  if (firstHeading) {
    return firstHeading.replace(/^#{1,6}\s+/, '').trim();
  }
  return path.basename(filePath, path.extname(filePath));
}

export class KnowledgeIndexService {
  constructor(private readonly projectService: ProjectService) {}

  getStatus(rootPath: string): KnowledgeIndexState {
    const persisted = this.read(rootPath);
    const currentFiles = this.projectService.listKnowledgeFiles(rootPath);
    if (!persisted) {
      return {
        version: 1,
        status: 'missing',
        documentCount: currentFiles.length,
        staleDocumentPaths: currentFiles,
        units: []
      };
    }

    const staleDocumentPaths = this.computeStaleDocumentPaths(currentFiles, persisted.units);
    return {
      version: 1,
      builtAt: persisted.builtAt,
      status: this.resolveStatus(persisted.lastError, staleDocumentPaths),
      documentCount: currentFiles.length,
      staleDocumentPaths,
      units: persisted.units,
      lastError: persisted.lastError
    };
  }

  refresh(rootPath: string, mode: 'manual' | 'incremental' = 'manual'): KnowledgeIndexState {
    const currentFiles = this.projectService.listKnowledgeFiles(rootPath);
    const persisted = this.read(rootPath);
    const stalePaths = new Set(
      mode === 'manual'
        ? currentFiles
        : this.computeStaleDocumentPaths(currentFiles, persisted?.units ?? [])
    );
    const persistedByPath = new Map((persisted?.units ?? []).map((unit) => [unit.path, unit]));
    const graph = this.projectService.buildNoteReferenceGraph(rootPath);
    const documentGraph = new Map(graph.documents.map((document) => [document.path, document]));
    const nextUnits: KnowledgeIndexUnit[] = [];

    for (const filePath of currentFiles) {
      if (mode === 'incremental' && persistedByPath.has(filePath) && !stalePaths.has(filePath)) {
        nextUnits.push(persistedByPath.get(filePath)!);
        continue;
      }

      const contents = this.projectService.readFile(filePath);
      const document = documentGraph.get(filePath);
      const meta = this.projectService.getDocumentMeta(filePath);
      const title = titleForDocument(filePath, contents);
      const excerpt = excerptForDocument(contents);
      const keywords = uniqueStrings([
        ...tokenize(title),
        ...tokenize(excerpt)
      ]).slice(0, 18);
      const relatedChangeRecordIds = this.projectService
        .getRelevantDocumentChanges(rootPath, [filePath], 3)
        .map((record) => record.id);

      nextUnits.push({
        id: persistedByPath.get(filePath)?.id ?? randomUUID(),
        path: filePath,
        title,
        excerpt,
        keywords,
        outboundPaths: uniqueStrings(document?.outbound.map((edge) => edge.targetPath) ?? []),
        inboundPaths: uniqueStrings(document?.inbound.map((edge) => edge.sourcePath) ?? []),
        relatedChangeRecordIds,
        modifiedAt: meta.modifiedAt,
        indexedAt: nowIso()
      });
    }

    const nextState: PersistedKnowledgeIndex = {
      version: 1,
      builtAt: nowIso(),
      units: nextUnits.sort((left, right) => left.path.localeCompare(right.path))
    };
    writeJson(knowledgeIndexFile(rootPath), nextState);
    return {
      version: 1,
      builtAt: nextState.builtAt,
      status: 'ready',
      documentCount: nextUnits.length,
      staleDocumentPaths: [],
      units: nextUnits
    };
  }

  private read(rootPath: string) {
    const filePath = knowledgeIndexFile(rootPath);
    if (!fs.existsSync(filePath)) return null;
    return readJsonSafe<PersistedKnowledgeIndex | null>(filePath, null);
  }

  private computeStaleDocumentPaths(currentFiles: string[], units: KnowledgeIndexUnit[]) {
    const stale = new Set<string>();
    const currentFileSet = new Set(currentFiles);
    const unitByPath = new Map(units.map((unit) => [unit.path, unit]));

    for (const filePath of currentFiles) {
      const unit = unitByPath.get(filePath);
      if (!unit) {
        stale.add(filePath);
        continue;
      }
      try {
        const modifiedAt = this.projectService.getDocumentMeta(filePath).modifiedAt;
        if (modifiedAt > unit.modifiedAt) {
          stale.add(filePath);
        }
      } catch {
        stale.add(filePath);
      }
    }

    for (const unit of units) {
      if (!currentFileSet.has(unit.path)) {
        stale.add(unit.path);
      }
    }

    return Array.from(stale).sort((left, right) => left.localeCompare(right));
  }

  private resolveStatus(lastError: string | undefined, staleDocumentPaths: string[]): KnowledgeIndexStatus {
    if (lastError) return 'error';
    if (staleDocumentPaths.length) return 'stale';
    return 'ready';
  }
}
