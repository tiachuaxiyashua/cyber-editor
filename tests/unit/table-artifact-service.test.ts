import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Workbook } from 'exceljs';
import { afterEach, describe, expect, it } from 'vitest';
import { TableArtifactService } from '../../src/main/services/table-artifact-service.js';

async function writeSampleXlsx(filePath: string) {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(['title', 'status']);
  sheet.addRow(['draft', 'pending']);
  await workbook.xlsx.writeFile(filePath);
}

describe('TableArtifactService', () => {
  const createdRoots: string[] = [];

  afterEach(() => {
    while (createdRoots.length) {
      const root = createdRoots.pop();
      if (root && fs.existsSync(root)) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('opens csv tables into a normalized model and preserves warnings', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-table-artifact-'));
    createdRoots.push(root);
    const filePath = path.join(root, 'table.csv');
    fs.writeFileSync(filePath, 'name,owner\nCyber Editor,team\nOpenHarness\n', 'utf8');

    const service = new TableArtifactService();

    await expect(service.openArtifact(filePath)).resolves.toMatchObject({
      kind: 'table',
      table: {
        format: 'csv',
        sheets: [
          {
            columns: ['name', 'owner'],
            rows: [
              ['Cyber Editor', 'team'],
              ['OpenHarness', '']
            ]
          }
        ]
      }
    });

    const artifact = await service.openArtifact(filePath);
    expect(artifact.warnings?.length).toBeGreaterThan(0);
  });

  it('writes updated xlsx tables and reopens them through the generic artifact API', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-table-artifact-xlsx-'));
    createdRoots.push(root);
    const filePath = path.join(root, 'table.xlsx');
    await writeSampleXlsx(filePath);

    const service = new TableArtifactService();
    const opened = await service.open(filePath);
    const updated = {
      ...opened,
      sheets: opened.sheets.map((sheet) => ({
        ...sheet,
        rows: sheet.rows.map((row, index) => (index === 0 ? [row[0] ?? '', 'done'] : row))
      }))
    };

    await expect(service.save(filePath, updated)).resolves.toBeUndefined();
    await expect(service.openArtifact(filePath)).resolves.toMatchObject({
      kind: 'table',
      binary: true,
      table: {
        sheets: [
          {
            rows: [['draft', 'done']]
          }
        ]
      }
    });
  });

  it('rejects oversized xlsx artifacts before invoking the spreadsheet parser', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-table-artifact-large-'));
    createdRoots.push(root);
    const filePath = path.join(root, 'oversized.xlsx');
    fs.writeFileSync(filePath, Buffer.alloc(8 * 1024 * 1024, 0));

    const service = new TableArtifactService();

    await expect(service.open(filePath)).rejects.toThrow(/Table artifact is too large to open safely/);
  });
});
