import { Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import type { TableArtifactModel } from '../../shared/types';

type TableArtifactViewProps = {
  artifact: TableArtifactModel;
  readOnly?: boolean;
  onChange?: (next: TableArtifactModel) => void;
};

function updateSheet(
  artifact: TableArtifactModel,
  sheetId: string,
  updater: (sheet: TableArtifactModel['sheets'][number]) => TableArtifactModel['sheets'][number]
) {
  return {
    ...artifact,
    sheets: artifact.sheets.map((sheet) => sheet.id === sheetId ? updater(sheet) : sheet)
  };
}

export function TableArtifactView({ artifact, readOnly = false, onChange }: TableArtifactViewProps) {
  const [filterValue, setFilterValue] = useState('');
  const currentSheet = artifact.sheets.find((sheet) => sheet.id === artifact.activeSheetId) ?? artifact.sheets[0];

  if (!currentSheet) {
    return <div className="table-artifact-empty">当前表格没有可显示的工作表。</div>;
  }

  const normalizedFilter = filterValue.trim().toLowerCase();
  const visibleRows = currentSheet.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !normalizedFilter || row.some((cell) => cell.toLowerCase().includes(normalizedFilter)));

  const commit = (next: TableArtifactModel) => {
    onChange?.(next);
  };

  const handleHeaderChange = (columnIndex: number, event: ChangeEvent<HTMLInputElement>) => {
    commit(updateSheet(artifact, currentSheet.id, (sheet) => ({
      ...sheet,
      columns: sheet.columns.map((column, index) => index === columnIndex ? event.target.value : column)
    })));
  };

  const handleCellChange = (rowIndex: number, columnIndex: number, event: ChangeEvent<HTMLInputElement>) => {
    commit(updateSheet(artifact, currentSheet.id, (sheet) => ({
      ...sheet,
      rows: sheet.rows.map((row, currentRowIndex) => currentRowIndex === rowIndex
        ? row.map((cell, currentColumnIndex) => currentColumnIndex === columnIndex ? event.target.value : cell)
        : row)
    })));
  };

  const addRow = () => {
    commit(updateSheet(artifact, currentSheet.id, (sheet) => ({
      ...sheet,
      rows: [...sheet.rows, sheet.columns.map(() => '')]
    })));
  };

  const addColumn = () => {
    commit(updateSheet(artifact, currentSheet.id, (sheet) => {
      const nextColumnIndex = sheet.columns.length + 1;
      return {
        ...sheet,
        columns: [...sheet.columns, `列 ${nextColumnIndex}`],
        rows: sheet.rows.map((row) => [...row, ''])
      };
    }));
  };

  const deleteRow = (rowIndex: number) => {
    commit(updateSheet(artifact, currentSheet.id, (sheet) => ({
      ...sheet,
      rows: sheet.rows.filter((_, currentRowIndex) => currentRowIndex !== rowIndex)
    })));
  };

  return (
    <div className="table-artifact-view">
      <div className="table-artifact-toolbar">
        <div className="table-artifact-sheets">
          {artifact.sheets.map((sheet) => (
            <button
              key={sheet.id}
              type="button"
              className={sheet.id === currentSheet.id ? 'active' : ''}
              onClick={() => commit({ ...artifact, activeSheetId: sheet.id })}
            >
              {sheet.name}
            </button>
          ))}
        </div>
        <div className="table-artifact-actions">
          <label className="table-artifact-search">
            <Search size={14} strokeWidth={1.8} />
            <input
              value={filterValue}
              onChange={(event) => setFilterValue(event.target.value)}
              placeholder="筛选当前工作表"
              spellCheck={false}
            />
          </label>
          {!readOnly ? (
            <>
              <button type="button" className="button-secondary icon-text" onClick={addColumn}>
                <Plus size={14} strokeWidth={1.8} />
                新增列
              </button>
              <button type="button" className="button-secondary icon-text" onClick={addRow}>
                <Plus size={14} strokeWidth={1.8} />
                新增行
              </button>
            </>
          ) : null}
        </div>
      </div>
      {artifact.warnings.length ? (
        <div className="table-artifact-warning-list">
          {artifact.warnings.map((warning) => (
            <div key={warning} className="table-artifact-warning">{warning}</div>
          ))}
        </div>
      ) : null}
      <div className="table-artifact-scroll">
        <table className="table-artifact-grid">
          <thead>
            <tr>
              <th className="table-artifact-index">#</th>
              {currentSheet.columns.map((column, columnIndex) => (
                <th key={`${currentSheet.id}-column-${columnIndex}`}>
                  {readOnly ? (
                    <span>{column}</span>
                  ) : (
                    <input
                      value={column}
                      onChange={(event) => handleHeaderChange(columnIndex, event)}
                      spellCheck={false}
                    />
                  )}
                </th>
              ))}
              {!readOnly ? <th className="table-artifact-actions-col">操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length ? visibleRows.map(({ row, index }) => (
              <tr key={`${currentSheet.id}-row-${index}`}>
                <td className="table-artifact-index">{index + 1}</td>
                {currentSheet.columns.map((_, columnIndex) => (
                  <td key={`${currentSheet.id}-row-${index}-col-${columnIndex}`}>
                    {readOnly ? (
                      <span>{row[columnIndex] ?? ''}</span>
                    ) : (
                      <input
                        value={row[columnIndex] ?? ''}
                        onChange={(event) => handleCellChange(index, columnIndex, event)}
                        spellCheck={false}
                      />
                    )}
                  </td>
                ))}
                {!readOnly ? (
                  <td className="table-artifact-actions-col">
                    <button type="button" className="icon-button danger" onClick={() => deleteRow(index)} aria-label={`删除第 ${index + 1} 行`}>
                      <Trash2 size={14} strokeWidth={1.8} />
                    </button>
                  </td>
                ) : null}
              </tr>
            )) : (
              <tr>
                <td colSpan={currentSheet.columns.length + (readOnly ? 1 : 2)} className="table-artifact-empty">
                  暂无数据，可直接新增一行开始编辑。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
