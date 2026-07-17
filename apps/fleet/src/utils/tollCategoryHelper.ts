/**
 * Single source of truth for whether a category is a toll row for ledger / logs / UI.
 * Mirrors src/supabase/functions/server/toll_category_flags.ts (Edge).
 *
 * Case-insensitive; trims whitespace.
 */
export function isTollCategory(category: string | undefined | null): boolean {
  if (!category) return false;
  const lower = category.toLowerCase().trim();
  // Usage / plaza charges only. Tag top-ups & refunds are tag-ledger activity
  // and must not inflate Driver Expenses "Toll Status" / weekly toll spend.
  return (
    lower === 'toll usage' ||
    lower === 'tolls' ||
    lower === 'toll'
  );
}

/** Broader matcher for Tag section / Toll Logs (includes credits). */
export function isTollLedgerCategory(category: string | undefined | null): boolean {
  if (!category) return false;
  const lower = category.toLowerCase().trim();
  return (
    isTollCategory(lower) ||
    lower === 'toll top-up' ||
    lower === 'toll refund' ||
    lower === 'toll adjustment'
  );
}

export type TollLogKind = 'usage' | 'top-up' | 'refund' | 'adjustment';

/** Toll Logs table: label column from category. */
export function tollLogKindFromCategory(category: string | undefined | null): TollLogKind {
  if (!category) return 'usage';
  const lower = category.toLowerCase().trim();
  if (lower === 'toll top-up') return 'top-up';
  if (lower === 'toll refund') return 'refund';
  if (lower === 'toll adjustment') return 'adjustment';
  return 'usage';
}
