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
  /** Tailwind classes for the status chip. */
  chipClass: string;
}

export const REFUND_RESOLUTION_META: Record<RefundResolutionType, RefundResolutionMeta> = {
  cash_wash: {
    label: "Cash wash",
    description: "Fare reimbursed the driver; driver paid cash. No leakage, no liability.",
    chipClass: "border-emerald-200 bg-emerald-100 text-emerald-800",
  },
  expense_logged: {
    label: "Expense logged",
    description: "Create a matching toll expense and link it to this trip.",
    chipClass: "border-indigo-200 bg-indigo-100 text-indigo-800",
  },
  phantom: {
    label: "Phantom / estimate",
    description: "No real toll was crossed. Dismiss from leakage.",
    chipClass: "border-slate-200 bg-slate-100 text-slate-700",
  },
  pending: {
    label: "Pending import",
    description: "Expected to auto-match once the tag statement imports.",
    chipClass: "border-yellow-200 bg-yellow-100 text-yellow-800",
  },
};

/** Order options appear in the manual list. */
export const REFUND_RESOLUTION_ORDER: RefundResolutionType[] = [
  "cash_wash",
  "expense_logged",
  "phantom",
  "pending",
];

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
