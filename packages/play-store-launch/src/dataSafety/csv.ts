import type { DataSafetyRow, DataSafetyState } from './types';
import { DATA_SAFETY_CSV_HEADER } from './types';

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Parse one CSV record respecting quoted fields. */
function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  return records;
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowKey(questionId: string, responseId: string): string {
  return `${questionId}\u0001${responseId}`;
}

export function parseDataSafetyCsv(text: string): DataSafetyState {
  const normalized = stripBom(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const records = parseCsvRecords(normalized.trimEnd());
  if (records.length === 0) {
    throw new Error('CSV is empty');
  }

  const header = records[0].join(',');
  if (header !== DATA_SAFETY_CSV_HEADER) {
    throw new Error(
      `Invalid CSV header. Expected Google Play Data safety export format.`,
    );
  }

  const rows: DataSafetyRow[] = [];
  for (let i = 1; i < records.length; i += 1) {
    const cols = records[i];
    if (cols.length < 5) continue;
    if (cols.every((c) => c.trim() === '')) continue;

    rows.push({
      questionId: cols[0] ?? '',
      responseId: cols[1] ?? '',
      responseValue: cols[2] ?? '',
      answerRequirement: cols[3] ?? '',
      humanLabel: cols[4] ?? '',
    });
  }

  if (rows.length === 0) {
    throw new Error('CSV contains no data rows');
  }

  return { rows };
}

export function serializeDataSafetyCsv(state: DataSafetyState): string {
  const lines = [DATA_SAFETY_CSV_HEADER];
  for (const row of state.rows) {
    lines.push(
      [
        escapeCsvField(row.questionId),
        escapeCsvField(row.responseId),
        escapeCsvField(row.responseValue),
        escapeCsvField(row.answerRequirement),
        escapeCsvField(row.humanLabel),
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

export function findRow(
  state: DataSafetyState,
  questionId: string,
  responseId = '',
): DataSafetyRow | undefined {
  return state.rows.find(
    (r) => r.questionId === questionId && r.responseId === responseId,
  );
}

export function isRowSelected(row: DataSafetyRow | undefined): boolean {
  return row?.responseValue === 'true';
}

export function getRowValue(
  state: DataSafetyState,
  questionId: string,
  responseId = '',
): string {
  return findRow(state, questionId, responseId)?.responseValue ?? '';
}

export function updateRowValue(
  state: DataSafetyState,
  questionId: string,
  responseId: string,
  responseValue: string,
): DataSafetyState {
  return {
    ...state,
    rows: state.rows.map((r) =>
      r.questionId === questionId && r.responseId === responseId
        ? { ...r, responseValue }
        : r,
    ),
  };
}

export function setCheckboxValue(
  state: DataSafetyState,
  questionId: string,
  responseId: string,
  checked: boolean,
): DataSafetyState {
  return updateRowValue(state, questionId, responseId, checked ? 'true' : '');
}

export function setRadioValue(
  state: DataSafetyState,
  questionId: string,
  selectedResponseId: string,
): DataSafetyState {
  return {
    ...state,
    rows: state.rows.map((r) => {
      if (r.questionId !== questionId) return r;
      return {
        ...r,
        responseValue: r.responseId === selectedResponseId ? 'true' : '',
      };
    }),
  };
}

export function setTextValue(
  state: DataSafetyState,
  questionId: string,
  value: string,
): DataSafetyState {
  return updateRowValue(state, questionId, '', value);
}

export function computeImportDiff(
  previous: DataSafetyState | null,
  next: DataSafetyState,
): { changedRows: number; addedRows: number; removedRows: number; criticalChanges: string[] } {
  const prevMap = new Map(
    (previous?.rows ?? []).map((r) => [rowKey(r.questionId, r.responseId), r.responseValue]),
  );
  const nextMap = new Map(
    next.rows.map((r) => [rowKey(r.questionId, r.responseId), r.responseValue]),
  );

  let changedRows = 0;
  let addedRows = 0;
  const criticalChanges: string[] = [];

  for (const row of next.rows) {
    const key = rowKey(row.questionId, row.responseId);
    const prevVal = prevMap.get(key);
    if (prevVal === undefined) {
      addedRows += 1;
      if (row.responseValue === 'true' || row.responseValue.startsWith('http')) {
        criticalChanges.push(row.humanLabel || row.questionId);
      }
    } else if (prevVal !== row.responseValue) {
      changedRows += 1;
      if (
        row.questionId.includes('PSL_DATA_TYPES_') ||
        row.questionId.includes('PSL_ACCOUNT_DELETION') ||
        row.questionId.includes('PSL_DATA_DELETION')
      ) {
        criticalChanges.push(row.humanLabel || row.questionId);
      }
    }
  }

  let removedRows = 0;
  for (const key of prevMap.keys()) {
    if (!nextMap.has(key)) removedRows += 1;
  }

  return { changedRows, addedRows, removedRows, criticalChanges: criticalChanges.slice(0, 20) };
}

export function mergeImportWithTemplate(
  template: DataSafetyState,
  imported: DataSafetyState,
): DataSafetyState {
  const importedMap = new Map(
    imported.rows.map((r) => [rowKey(r.questionId, r.responseId), r]),
  );

  const mergedRows = template.rows.map((t) => {
    const key = rowKey(t.questionId, t.responseId);
    return importedMap.get(key) ?? t;
  });

  for (const row of imported.rows) {
    const key = rowKey(row.questionId, row.responseId);
    const exists = mergedRows.some(
      (r) => rowKey(r.questionId, r.responseId) === key,
    );
    if (!exists) mergedRows.push(row);
  }

  return {
    rows: mergedRows,
    templateVersion: imported.templateVersion ?? template.templateVersion,
  };
}

export async function sha256Hex(text: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const data = new TextEncoder().encode(text);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return `len-${text.length}`;
}
