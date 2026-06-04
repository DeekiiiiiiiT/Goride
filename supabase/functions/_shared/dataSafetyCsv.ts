/**
 * Deno-compatible Google Play Data safety CSV helpers (mirrors @roam/play-store-launch).
 */

export const DATA_SAFETY_CSV_HEADER =
  "Question ID (machine readable),Response ID (machine readable),Response value,Answer requirement,Human-friendly question label";

export type DataSafetyRow = {
  questionId: string;
  responseId: string;
  responseValue: string;
  answerRequirement: string;
  humanLabel: string;
};

export type DataSafetyState = {
  rows: DataSafetyRow[];
  templateVersion?: string;
};

export type DataSafetyValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  questionId?: string;
};

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
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
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r" && next === "\n") {
      row.push(field);
      records.push(row);
      row = [];
      field = "";
      i += 1;
    } else if (ch === "\n" || ch === "\r") {
      row.push(field);
      records.push(row);
      row = [];
      field = "";
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
  const normalized = stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const records = parseCsvRecords(normalized.trimEnd());
  if (records.length === 0) throw new Error("CSV is empty");

  const header = records[0].join(",");
  if (header !== DATA_SAFETY_CSV_HEADER) {
    throw new Error("Invalid CSV header. Expected Google Play Data safety export format.");
  }

  const rows: DataSafetyRow[] = [];
  for (let i = 1; i < records.length; i += 1) {
    const cols = records[i];
    if (cols.length < 5) continue;
    if (cols.every((c) => c.trim() === "")) continue;
    rows.push({
      questionId: cols[0] ?? "",
      responseId: cols[1] ?? "",
      responseValue: cols[2] ?? "",
      answerRequirement: cols[3] ?? "",
      humanLabel: cols[4] ?? "",
    });
  }

  if (rows.length === 0) throw new Error("CSV contains no data rows");
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
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function isRowSelected(row: DataSafetyRow | undefined): boolean {
  return row?.responseValue === "true";
}

function findRow(state: DataSafetyState, questionId: string, responseId = ""): DataSafetyRow | undefined {
  return state.rows.find((r) => r.questionId === questionId && r.responseId === responseId);
}

export function normalizeDataSafetyRows(raw: unknown): DataSafetyRow[] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as { rows?: unknown };
  if (!Array.isArray(obj.rows)) return null;

  const rows: DataSafetyRow[] = [];
  for (const item of obj.rows) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const questionId = String(r.questionId ?? r.question_id ?? "").trim();
    if (!questionId) continue;
    rows.push({
      questionId,
      responseId: String(r.responseId ?? r.response_id ?? ""),
      responseValue: String(r.responseValue ?? r.response_value ?? ""),
      answerRequirement: String(r.answerRequirement ?? r.answer_requirement ?? ""),
      humanLabel: String(r.humanLabel ?? r.human_label ?? ""),
    });
  }
  return rows.length > 0 ? rows : null;
}

export function validateDataSafetyState(state: DataSafetyState): DataSafetyValidationIssue[] {
  const issues: DataSafetyValidationIssue[] = [];
  const DATA_TYPE_PREFIX = "PSL_DATA_TYPES_";
  const USAGE_PREFIX = "PSL_DATA_USAGE_RESPONSES:";

  for (const row of state.rows) {
    if (!row.questionId.startsWith(DATA_TYPE_PREFIX)) continue;
    if (!isRowSelected(row)) continue;

    const typeId = row.responseId;
    const collectQ = `${USAGE_PREFIX}${typeId}:PSL_DATA_USAGE_COLLECTION_AND_SHARING`;
    const collected = isRowSelected(findRow(state, collectQ, "PSL_DATA_USAGE_ONLY_COLLECTED"));
    const shared = isRowSelected(findRow(state, collectQ, "PSL_DATA_USAGE_ONLY_SHARED"));

    if (!collected && !shared) {
      issues.push({
        severity: "warning",
        code: "missing_usage_flags",
        message: `Data type ${typeId} is declared but neither collected nor shared is selected.`,
        questionId: collectQ,
      });
    }
  }

  const deletionSelected = state.rows.filter(
    (r) => r.questionId === "PSL_SUPPORT_DATA_DELETION_BY_USER" && isRowSelected(r),
  );
  if (deletionSelected.length > 1) {
    issues.push({
      severity: "error",
      code: "deletion_single_choice",
      message: "Multiple data deletion options selected.",
      questionId: "PSL_SUPPORT_DATA_DELETION_BY_USER",
    });
  }

  return issues;
}

export function hasBlockingIssues(issues: DataSafetyValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
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
      if (row.responseValue === "true" || row.responseValue.startsWith("http")) {
        criticalChanges.push(row.humanLabel || row.questionId);
      }
    } else if (prevVal !== row.responseValue) {
      changedRows += 1;
      if (
        row.questionId.includes("PSL_DATA_TYPES_") ||
        row.questionId.includes("PSL_ACCOUNT_DELETION") ||
        row.questionId.includes("PSL_DATA_DELETION")
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

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function mergeImportWithTemplate(template: DataSafetyState, imported: DataSafetyState): DataSafetyState {
  const importedMap = new Map(
    imported.rows.map((r) => [rowKey(r.questionId, r.responseId), r]),
  );

  const mergedRows = template.rows.map((t) => {
    const key = rowKey(t.questionId, t.responseId);
    return importedMap.get(key) ?? t;
  });

  for (const row of imported.rows) {
    const key = rowKey(row.questionId, row.responseId);
    const exists = mergedRows.some((r) => rowKey(r.questionId, r.responseId) === key);
    if (!exists) mergedRows.push(row);
  }

  return {
    rows: mergedRows,
    templateVersion: imported.templateVersion ?? template.templateVersion,
  };
}
