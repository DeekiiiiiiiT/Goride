/**
 * Single source of truth for whether a category is a toll row for ledger / logs / UI.
 * Mirrors supabase/functions/_fleet-server/toll_category_flags.ts (Edge).
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

/** Toll Logs table: label column from category and/or ledger type field. */
export function tollLogKindFromCategory(category: string | undefined | null): TollLogKind {
  if (!category) return 'usage';
  const lower = category.toLowerCase().trim();
  if (lower === 'toll top-up' || lower === 'top-up' || lower === 'top_up' || lower === 'topup') {
    return 'top-up';
  }
  if (lower === 'toll refund' || lower === 'refund') return 'refund';
  if (lower === 'toll adjustment' || lower === 'adjustment' || lower === 'balance_transfer') {
    return 'adjustment';
  }
  return 'usage';
}

/** Prefer explicit API type when present (avoids bad hardcoded categories). */
export function tollLogKindFromTx(tx: { type?: string | null; category?: string | null }): TollLogKind {
  const typeKind = tollLogKindFromCategory(tx.type);
  if (tx.type && typeKind !== 'usage') return typeKind;
  const catKind = tollLogKindFromCategory(tx.category);
  if (catKind !== 'usage') return catKind;
  // Signed amount fallback for credits mis-labeled as usage
  if (typeof (tx as any).amount === 'number' && (tx as any).amount > 0) return 'top-up';
  return 'usage';
}
