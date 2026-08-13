/**
 * Ownership of a fuel_entry vs a financial expense.
 * A log line may only be reused for posting if it belongs to that expense.
 */

function trimId(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

export function fuelEntryOwnerTxIds(
  entry: Record<string, unknown> | null | undefined,
): string[] {
  if (!entry) return [];
  const meta =
    entry.metadata && typeof entry.metadata === "object"
      ? (entry.metadata as Record<string, unknown>)
      : {};
  const ids = [
    entry.transactionId,
    meta.originalTransactionId,
    meta.sourceId,
  ]
    .map(trimId)
    .filter(Boolean);
  return [...new Set(ids)];
}

export function fuelEntryBelongsToTransaction(
  entry: Record<string, unknown> | null | undefined,
  txId: string,
): boolean {
  const id = trimId(txId);
  if (!id) return false;
  return fuelEntryOwnerTxIds(entry).includes(id);
}

/** metadata.fuelEntryId is only safe to reuse when the row is owned by this expense. */
export function canReuseLinkedFuelEntry(
  entry: Record<string, unknown> | null | undefined,
  txId: string,
): boolean {
  return fuelEntryBelongsToTransaction(entry, txId);
}
