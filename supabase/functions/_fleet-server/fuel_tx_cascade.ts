/**
 * Fuel expense DELETE cascade — discover linked fuel_entry + related txs
 * (including fuel-credit-*) so ledger deletes cannot orphan posted fills.
 */

export type FuelTxCascadePlan = {
  transactionIds: string[];
  fuelEntryId?: string;
};

function trimId(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function metaOf(rec: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!rec) return {};
  const m = rec.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

function ymdOf(value: unknown): string {
  const raw = String(value ?? "");
  if (raw.includes("T")) return raw.split("T")[0] || "";
  return raw.slice(0, 10);
}

function absAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/** Explicit fuel_entry id hints on a financial transaction. */
export function explicitFuelEntryIdFromTx(tx: Record<string, unknown>): string {
  const meta = metaOf(tx);
  return (
    trimId(meta.fuelEntryId) ||
    trimId(meta.sourceId) ||
    trimId(meta.linkedFuelId) ||
    trimId(tx.fuelEntryId)
  );
}

/** Always-related wallet credit row for an expense/reimbursement id. */
export function fuelCreditIdFor(txId: string): string {
  return `fuel-credit-${trimId(txId)}`;
}

/**
 * Build the purge set once parent entry + related rows are known.
 * Pure — unit-testable without KV.
 */
export function buildFuelTxCascadePlan(args: {
  primaryId: string;
  parentEntry: Record<string, unknown> | null;
  relatedTxIds: string[];
}): FuelTxCascadePlan {
  const primaryId = trimId(args.primaryId);
  const ids = new Set<string>();
  if (primaryId) ids.add(primaryId);
  if (primaryId) ids.add(fuelCreditIdFor(primaryId));

  for (const raw of args.relatedTxIds) {
    const id = trimId(raw);
    if (id) ids.add(id);
  }

  const entry = args.parentEntry;
  let fuelEntryId: string | undefined;
  if (entry) {
    fuelEntryId = trimId(entry.id) || undefined;
    const entryTx = trimId(entry.transactionId);
    if (entryTx) ids.add(entryTx);
    const meta = metaOf(entry);
    const orig = trimId(meta.originalTransactionId);
    if (orig) ids.add(orig);
    if (fuelEntryId) ids.add(fuelCreditIdFor(fuelEntryId));
  }

  return {
    transactionIds: [...ids],
    fuelEntryId,
  };
}

/** Fingerprint match — same vehicle/date/amount + fuel-ish category. */
export function txMatchesFuelEntryFingerprint(
  tx: Record<string, unknown>,
  entry: Record<string, unknown>,
): boolean {
  if (trimId(tx.vehicleId) !== trimId(entry.vehicleId)) return false;
  if (ymdOf(tx.date) !== ymdOf(entry.date)) return false;
  const entryAmt = absAmount(entry.amount);
  const txAmt = absAmount(tx.amount);
  const metaCost = absAmount(metaOf(tx).totalCost);
  const sameAmount = txAmt === entryAmt || (metaCost > 0 && metaCost === entryAmt);
  if (!sameAmount) return false;
  const cat = String(tx.category ?? "").toLowerCase();
  return cat.includes("fuel") || cat.includes("reimbursement");
}

export type KvLike = {
  get: (key: string) => Promise<unknown>;
};

/**
 * Resolve parent fuel_entry for a transaction (explicit ids first).
 */
export async function resolveParentFuelEntry(
  kv: KvLike,
  tx: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const explicit = explicitFuelEntryIdFromTx(tx);
  if (explicit) {
    const row = await kv.get(`fuel_entry:${explicit}`);
    if (row && typeof row === "object") return row as Record<string, unknown>;
  }
  return null;
}

/**
 * Collect related transaction ids for a known fuel_entry (explicit links + optional fingerprint scan).
 */
export function collectRelatedTxIdsForEntry(
  entry: Record<string, unknown>,
  candidateTxs: Record<string, unknown>[],
): string[] {
  const entryId = trimId(entry.id);
  const explicit: string[] = [];
  const entryTx = trimId(entry.transactionId);
  if (entryTx) explicit.push(entryTx);

  for (const t of candidateTxs) {
    const id = trimId(t.id);
    if (!id) continue;
    const meta = metaOf(t);
    if (
      trimId(meta.sourceId) === entryId ||
      trimId(meta.linkedFuelId) === entryId ||
      trimId(meta.fuelEntryId) === entryId ||
      id === entryTx
    ) {
      explicit.push(id);
      continue;
    }
    if (txMatchesFuelEntryFingerprint(t, entry)) {
      explicit.push(id);
    }
  }
  return [...new Set(explicit)];
}
