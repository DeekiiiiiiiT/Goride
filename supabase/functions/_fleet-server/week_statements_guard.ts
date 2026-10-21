/** Pure publish guards (no I/O) — unit-tested without Deno env. */

export function shouldBlockRestatementDraft(
  hasPriorClosed: boolean,
  status: "draft" | "closed",
  allowRestatementDraft?: boolean,
): boolean {
  return Boolean(hasPriorClosed && status === "draft" && !allowRestatementDraft);
}

/**
 * Skip a new version when the newest row is already the same status and amounts.
 * A forced retry that cannot sign must not insert another identical unsigned row.
 * Draft → closed still publishes (signing the week).
 */
export function shouldSkipUnchangedStatement(input: {
  latestStatus: string | null | undefined;
  nextStatus: "draft" | "closed";
  amountsMatch: boolean;
}): boolean {
  const latest = input.latestStatus || null;
  if (!latest || latest === "restated") return false;
  return input.amountsMatch && latest === input.nextStatus;
}

/** Older unsigned rows to mark restated after a new version is inserted. Signed rows stay. */
export function shouldRetireAsOlderDraft(
  row: { id?: string | null; status?: string | null },
  keepId: string,
): boolean {
  return row.status === "draft" && !!row.id && row.id !== keepId;
}
