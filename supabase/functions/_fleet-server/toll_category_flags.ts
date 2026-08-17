/**
 * Categories that must write to toll_ledger:* and appear in Toll Logs / Ledger / Reconciliation.
 * Keep in sync with src/utils/tollCategoryHelper.ts (frontend).
 */
export function isTollCategory(category: string | undefined | null): boolean {
  if (!category) return false;
  const lower = category.toLowerCase().trim();
  return (
    lower === "toll usage" ||
    lower === "tolls" ||
    lower === "toll" ||
    lower === "toll top-up" ||
    lower === "toll refund" ||
    lower === "toll adjustment"
  );
}

/**
 * Plaza charges that bulk-link may attach to a trip.
 * `toll_ledger:*` rows store `type: "usage"` and have no `category`.
 * Legacy `transaction:*` rows store `category: "Toll Usage"`.
 */
export function isPlazaUsageTollRow(
  row: { type?: string | null; category?: string | null } | null | undefined,
): boolean {
  if (!row) return false;
  const typ = String(row.type || "").toLowerCase().trim();
  if (typ === "usage") return true;
  if (
    typ === "top_up" ||
    typ === "top-up" ||
    typ === "topup" ||
    typ === "refund" ||
    typ === "adjustment" ||
    typ === "balance_transfer"
  ) {
    return false;
  }
  return isTollCategory(row.category);
}
