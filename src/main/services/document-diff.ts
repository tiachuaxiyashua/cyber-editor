export type LineDiffStats = {
  addedLineCount: number;
  removedLineCount: number;
  changedLineCount: number;
  excerptBefore?: string;
  excerptAfter?: string;
};

export type DiffOperation =
  | { kind: 'equal'; line: string }
  | { kind: 'remove'; line: string }
  | { kind: 'add'; line: string };

export type LineHunk = {
  startLine: number;
  deleteCount: number;
  humanText: string;
  aiText: string;
};

function excerpt(lines: string[]) {
  const value = lines.map((line) => line.trim()).filter(Boolean).slice(0, 3).join(' / ');
  return value || undefined;
}

export function diffLineStats(previousContents: string, nextContents: string): LineDiffStats {
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
  return {
    addedLineCount: addedBlock.length,
    removedLineCount: removedBlock.length,
    changedLineCount: Math.max(removedBlock.length, addedBlock.length),
    excerptBefore: excerpt(removedBlock),
    excerptAfter: excerpt(addedBlock)
  };
}

export function summarizeLineChange(title: string, stats: LineDiffStats) {
  const changeBits = [
    stats.changedLineCount ? `变更 ${stats.changedLineCount} 行` : '',
    stats.addedLineCount ? `新增 ${stats.addedLineCount} 行` : '',
    stats.removedLineCount ? `删除 ${stats.removedLineCount} 行` : ''
  ].filter(Boolean);
  const excerptValue = stats.excerptAfter || stats.excerptBefore || title;
  return [changeBits.join('，'), `摘要：${excerptValue}`].filter(Boolean).join('；');
}

export function buildDiffOperations(previousContents: string, nextContents: string): DiffOperation[] {
  const previousLines = previousContents.split(/\r?\n/);
  const nextLines = nextContents.split(/\r?\n/);
  const lcs: number[][] = Array.from({ length: previousLines.length + 1 }, () =>
    Array.from({ length: nextLines.length + 1 }, () => 0)
  );

  for (let i = previousLines.length - 1; i >= 0; i -= 1) {
    for (let j = nextLines.length - 1; j >= 0; j -= 1) {
      if (previousLines[i] === nextLines[j]) {
        lcs[i]![j] = (lcs[i + 1]?.[j + 1] ?? 0) + 1;
      } else {
        lcs[i]![j] = Math.max(lcs[i + 1]?.[j] ?? 0, lcs[i]?.[j + 1] ?? 0);
      }
    }
  }

  const operations: DiffOperation[] = [];
  let i = 0;
  let j = 0;
  while (i < previousLines.length && j < nextLines.length) {
    if (previousLines[i] === nextLines[j]) {
      operations.push({ kind: 'equal', line: previousLines[i]! });
      i += 1;
      j += 1;
    } else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) {
      operations.push({ kind: 'remove', line: previousLines[i]! });
      i += 1;
    } else {
      operations.push({ kind: 'add', line: nextLines[j]! });
      j += 1;
    }
  }

  while (i < previousLines.length) {
    operations.push({ kind: 'remove', line: previousLines[i]! });
    i += 1;
  }
  while (j < nextLines.length) {
    operations.push({ kind: 'add', line: nextLines[j]! });
    j += 1;
  }

  return operations;
}

export function buildLineHunks(previousContents: string, nextContents: string): LineHunk[] {
  const operations = buildDiffOperations(previousContents, nextContents);
  const hunks: LineHunk[] = [];
  let currentLine = 1;
  let currentHunk: {
    startLine: number;
    deleteCount: number;
    humanLines: string[];
    aiLines: string[];
  } | null = null;

  const flush = () => {
    if (!currentHunk) return;
    hunks.push({
      startLine: currentHunk.startLine,
      deleteCount: currentHunk.deleteCount,
      humanText: currentHunk.humanLines.join('\n'),
      aiText: currentHunk.aiLines.join('\n')
    });
    currentHunk = null;
  };

  for (const operation of operations) {
    if (operation.kind === 'equal') {
      flush();
      currentLine += 1;
      continue;
    }

    if (!currentHunk) {
      currentHunk = {
        startLine: currentLine,
        deleteCount: 0,
        humanLines: [],
        aiLines: []
      };
    }

    if (operation.kind === 'remove') {
      currentHunk.humanLines.push(operation.line);
      currentHunk.deleteCount += 1;
      currentLine += 1;
    } else {
      currentHunk.aiLines.push(operation.line);
    }
  }

  flush();
  return hunks.filter((hunk) => hunk.humanText !== hunk.aiText);
}

export function applyHunkSelections(currentContents: string, hunks: LineHunk[], selections: Record<string, 'human' | 'ai'>) {
  const lines = currentContents.split(/\r?\n/);
  const indexedHunks = hunks.map((hunk, index) => ({ hunk, id: `chunk-${index + 1}` }));

  for (let index = indexedHunks.length - 1; index >= 0; index -= 1) {
    const item = indexedHunks[index]!;
    const choice = selections[item.id] ?? 'human';
    if (choice !== 'ai') continue;
    const startIndex = Math.max(0, item.hunk.startLine - 1);
    const nextLines = item.hunk.aiText ? item.hunk.aiText.split(/\r?\n/) : [];
    lines.splice(startIndex, item.hunk.deleteCount, ...nextLines);
  }

  return lines.join('\n');
}
