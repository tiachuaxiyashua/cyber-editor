import fs from 'node:fs';
import path from 'node:path';
import { Workbook, type Worksheet } from 'exceljs';
import type {
  ArtifactOpenPayload,
  ArtifactViewKind,
  TableArtifactFormat,
  TableArtifactModel,
  TableArtifactSheet
} from '../../shared/types';

const TABLE_EXTENSIONS = new Set(['.csv', '.tsv', '.xlsx']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);
const DIAGRAM_EXTENSIONS = new Set(['.mmd', '.mermaid']);
const MINDMAP_EXTENSIONS = new Set(['.mindmap', '.markmap']);
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);
const MAX_TABLE_ARTIFACT_BYTES = 5 * 1024 * 1024;

function fileTitle(filePath: string) {
  return path.basename(filePath);
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function normalizeRows(rows: unknown[][]) {
  const normalizedRows = rows.map((row) => row.map((cell) => normalizeCell(cell)));
  const maxColumns = Math.max(1, ...normalizedRows.map((row) => row.length));
  const inconsistent = normalizedRows.some((row) => row.length !== maxColumns);
  return {
    rows: normalizedRows.map((row) => {
      const padded = [...row];
      while (padded.length < maxColumns) {
        padded.push('');
      }
      return padded.slice(0, maxColumns);
    }),
    maxColumns,
    inconsistent
  };
}

function sheetModelFromRows(name: string, format: TableArtifactFormat, rows: unknown[][], warnings: string[]): TableArtifactSheet {
  const normalized = normalizeRows(rows);
  if (normalized.inconsistent) {
    warnings.push(`${name}: detected rows with inconsistent column counts; missing cells were padded automatically.`);
  }
  const headerRow = normalized.rows[0] ?? [];
  const columns = Array.from({ length: normalized.maxColumns }, (_, index) => {
    const label = headerRow[index]?.trim();
    return label || `Column ${index + 1}`;
  });
  return {
    id: `${format}:${name}`,
    name,
    columns,
    rows: normalized.rows.slice(1).map((row) => row.slice(0, columns.length))
  };
}

function tableFormatForPath(filePath: string): TableArtifactFormat | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') return 'csv';
  if (ext === '.tsv') return 'tsv';
  if (ext === '.xlsx') return 'xlsx';
  return null;
}

function artifactKindForPath(filePath: string): ArtifactViewKind {
  const ext = path.extname(filePath).toLowerCase();
  if (TABLE_EXTENSIONS.has(ext)) return 'table';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (DIAGRAM_EXTENSIONS.has(ext)) return 'diagram';
  if (MINDMAP_EXTENSIONS.has(ext)) return 'mindmap';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  return 'unsupported';
}

function assertSafeTableArtifactSize(filePath: string) {
  const size = fs.statSync(filePath).size;
  if (size > MAX_TABLE_ARTIFACT_BYTES) {
    throw new Error(`Table artifact is too large to open safely (${size} bytes).`);
  }
}

function escapeDelimitedCell(value: unknown, delimiter: ',' | '\t') {
  const text = normalizeCell(value);
  if (text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  if (text.includes(delimiter) || text.includes('\n') || text.includes('\r')) {
    return `"${text}"`;
  }
  return text;
}

function parseDelimitedText(text: string, delimiter: ',' | '\t') {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function worksheetRows(worksheet: Worksheet) {
  const rowCount = worksheet.rowCount;
  const maxColumns = Math.max(
    1,
    worksheet.actualColumnCount,
    ...Array.from({ length: rowCount }, (_, index) => worksheet.getRow(index + 1).cellCount)
  );

  if (rowCount === 0) {
    return [];
  }

  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const row = worksheet.getRow(rowIndex + 1);
    return Array.from({ length: maxColumns }, (_, columnIndex) => normalizeCell(row.getCell(columnIndex + 1).text));
  });
}

async function workbookForModel(model: TableArtifactModel) {
  const workbook = new Workbook();
  const sheets = model.sheets.length
    ? model.sheets
    : [{
        id: 'default:Sheet1',
        name: 'Sheet1',
        columns: ['Column 1'],
        rows: []
      }];

  for (const [index, sheet] of sheets.entries()) {
    const worksheet = workbook.addWorksheet(sheet.name?.trim() || `Sheet${index + 1}`);
    const rows = [sheet.columns, ...sheet.rows].map((row) => row.map((cell) => normalizeCell(cell)));
    for (const row of rows) {
      worksheet.addRow(row);
    }
  }

  return workbook;
}

export class TableArtifactService {
  canHandle(filePath: string) {
    return Boolean(tableFormatForPath(filePath));
  }

  async open(filePath: string): Promise<TableArtifactModel> {
    const format = tableFormatForPath(filePath);
    if (!format) {
      throw new Error('Artifact is not a supported table format.');
    }
    if (!fs.existsSync(filePath)) {
      throw new Error('Artifact file does not exist.');
    }
    assertSafeTableArtifactSize(filePath);

    const warnings: string[] = [];
    const sheets = format === 'xlsx'
      ? await (async () => {
          const workbook = new Workbook();
          await workbook.xlsx.readFile(filePath);
          return workbook.worksheets.map((worksheet) => {
            return sheetModelFromRows(worksheet.name, format, worksheetRows(worksheet), warnings);
          });
        })()
      : [
          sheetModelFromRows(
            path.parse(filePath).name || 'Sheet1',
            format,
            parseDelimitedText(fs.readFileSync(filePath, 'utf8'), format === 'tsv' ? '\t' : ','),
            warnings
          )
        ];

    const normalizedSheets = sheets.length
      ? sheets
      : [sheetModelFromRows('Sheet1', format, [['Column 1']], warnings)];

    return {
      filePath,
      title: fileTitle(filePath),
      format,
      activeSheetId: normalizedSheets[0].id,
      sheets: normalizedSheets,
      warnings
    };
  }

  async save(filePath: string, model: TableArtifactModel) {
    const format = tableFormatForPath(filePath) ?? model.format;
    if (!format) {
      throw new Error('Artifact is not a supported table format.');
    }

    if (format === 'xlsx') {
      const workbook = await workbookForModel(model);
      await workbook.xlsx.writeFile(filePath);
      return;
    }

    const text = this.serializeText(model, format);
    fs.writeFileSync(filePath, text, 'utf8');
  }

  serializeText(model: TableArtifactModel, format: Extract<TableArtifactFormat, 'csv' | 'tsv'>) {
    const delimiter = format === 'tsv' ? '\t' : ',';
    const sheet = model.sheets[0] ?? {
      columns: ['Column 1'],
      rows: []
    };
    const rows = [sheet.columns, ...sheet.rows];
    return rows
      .map((row) => row.map((cell) => escapeDelimitedCell(cell, delimiter)).join(delimiter))
      .join('\n');
  }

  async openArtifact(filePath: string): Promise<ArtifactOpenPayload> {
    if (!fs.existsSync(filePath)) {
      return {
        kind: 'unsupported',
        filePath,
        title: fileTitle(filePath),
        editable: false,
        binary: false,
        errorMessage: 'Artifact file does not exist.'
      };
    }

    const kind = artifactKindForPath(filePath);
    if (kind === 'table') {
      const table = await this.open(filePath);
      return {
        kind,
        filePath,
        title: table.title,
        editable: true,
        binary: table.format === 'xlsx',
        table,
        content: table.format === 'xlsx' ? undefined : fs.readFileSync(filePath, 'utf8'),
        warnings: table.warnings
      };
    }

    if (kind === 'image') {
      return {
        kind,
        filePath,
        title: fileTitle(filePath),
        editable: false,
        binary: true
      };
    }

    if (kind === 'diagram' || kind === 'mindmap' || kind === 'text') {
      return {
        kind,
        filePath,
        title: fileTitle(filePath),
        editable: true,
        binary: false,
        content: fs.readFileSync(filePath, 'utf8')
      };
    }

    return {
      kind: 'unsupported',
      filePath,
      title: fileTitle(filePath),
      editable: false,
      binary: false,
      errorMessage: 'Unsupported artifact format.'
    };
  }
}
