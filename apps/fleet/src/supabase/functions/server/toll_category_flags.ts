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
