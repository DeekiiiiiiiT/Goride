/**
 * Presentational types + display metadata for the Unlinked-Refund resolution UI.
 *
 * Phase 1 (design shells) owns this file. Phase 2 introduces the canonical
 * `tollRefundResolution` type across the four type mirrors; Phase 3 will align
 * these shells to it. Keeping the shell types local for now avoids premature
 * coupling and keeps the shells buildable in isolation.
 */

export type RefundResolutionType =
  | "cash_wash"
  | "expense_logged"
  | "phantom"
  | "pending";

export interface RefundResolutionMeta {
  label: string;
  description: string;
  /** One-line row hint under the suggestion chip. */
  hint: string;
  /** Tailwind classes for the status chip. */
  chipClass: string;
}

export const REFUND_RESOLUTION_META: Record<RefundResolutionType, RefundResolutionMeta> = {
  cash_wash: {
    label: "Cash wash",
    description:
      "Clears an unlinked trip refund — not the same as a cash toll expense on Financials → Expenses. Fare already covered the toll; no driver charge.",
    hint: "Fare already covered this toll",
    chipClass: "border-emerald-200 bg-emerald-100 text-emerald-800",
  },
  phantom: {
    label: "Phantom / estimate",
    description: "Clears the credit — no real toll was crossed on this trip.",
    hint: "No real toll on this route",
    chipClass: "border-slate-200 bg-slate-100 text-slate-700",
  },
  pending: {
    label: "Pending import",
    description: "Holds the row until the tag statement imports and can auto-match.",
    hint: "Waiting on tag statement",
    chipClass: "border-yellow-200 bg-yellow-100 text-yellow-800",
  },
  expense_logged: {
    label: "Expense logged",
    description: "Creates a cash toll expense for this credit — use only when no tag toll exists.",
    hint: "Log as cash toll expense",
    chipClass: "border-indigo-200 bg-indigo-100 text-indigo-800",
  },
};

/** Leftover clear options (collapsed section). Expense logged last = advanced. */
export const REFUND_RESOLUTION_ORDER: RefundResolutionType[] = [
  "cash_wash",
  "phantom",
  "pending",
  "expense_logged",
];

/** Section label for collapsed leftovers in Review drawer. */
export const REFUND_OTHER_WAYS_LABEL = "Other ways to clear";

export interface RefundSuggestion {
  type: RefundResolutionType;
  /** 0–100. */
  confidence: number;
  reason: string;
}

/** Minimal trip shape the refund UI needs (subset of the app Trip type). */
export interface RefundTripLike {
  id: string;
  date: string;
  platform?: string;
  driverId?: string | null;
  driverName?: string | null;
  tollCharges?: number;
  pickupLocation?: string;
  dropoffLocation?: string;
}
