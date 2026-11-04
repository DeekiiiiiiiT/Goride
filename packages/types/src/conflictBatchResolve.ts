import type { ConflictRowLike } from "./partMatchConflictCopy";

export type ConflictBatchResolveItem = {
  id: string;
  action: "keep" | "remove";
  note: string;
};

export function openConflictsForBatch(
  rows: ConflictRowLike[],
  conflictType: string,
): ConflictRowLike[] {
  const type = conflictType.trim();
  if (!type) return [];
  return rows.filter(
    (r) => String(r.status || "") === "open" && String(r.conflict_type || "") === type,
  );
}

export function buildConflictBatchResolveItems(
  rows: ConflictRowLike[],
  conflictType: string,
  action: "keep" | "remove",
  note: string,
): { ok: true; items: ConflictBatchResolveItem[] } | { ok: false; error: string } {
  const trimmed = note.trim();
  if (!trimmed) return { ok: false, error: "Add a note for the audit trail." };
  const open = openConflictsForBatch(rows, conflictType);
  if (!open.length) return { ok: false, error: "No open conflicts for this type." };
  const items = open
    .map((r) => String(r.id ?? "").trim())
    .filter(Boolean)
    .map((id) => ({ id, action, note: trimmed }));
  if (!items.length) return { ok: false, error: "No open conflicts for this type." };
  return { ok: true, items };
}

export function firstOpenConflictType(
  totalsByType: Record<string, number> | undefined,
  chipOrder: string[],
): string {
  if (!totalsByType) return "";
  for (const id of chipOrder) {
    if ((totalsByType[id] ?? 0) > 0) return id;
  }
  return "";
}
