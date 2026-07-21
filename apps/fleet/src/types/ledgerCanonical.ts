/**
 * Phase 2 — Canonical ledger events (`ledger_event:*` in KV).
 * Product reads use this prefix; legacy `ledger:%` may remain only until KV cleanup.
 */

export const CANONICAL_LEDGER_SCHEMA_VERSION = 1 as const;
export const CANONICAL_LEDGER_EVENT_KIND = 'canonical' as const;

/** Allowed eventType values for canonical events. */
export const CANONICAL_LEDGER_EVENT_TYPES = [
  // Trip-aligned
  'fare_earning',
  'tip',
  'prior_period_adjustment',
  'promotion',
  'refund_expense',
  'platform_fee',
  'fuel_expense',
  /** Compensating entry that nets driver-share of a prior `fuel_expense` (or reinstates one). */
  'fuel_charge_offset',
  'toll_charge',
  'toll_refund',
  /** Compensating entry that nets a prior `toll_charge` (or reinstates one) without rewriting history. */
  'toll_charge_offset',
  'adjustment',
  // Statement / payout SSOT (Phase 4+)
  'statement_line',
  'statement_adjustment',
  'payout_cash',
  'payout_bank',
  'toll_support_adjustment',
  'dispute_refund',
  /** One row per Uber payments_transaction.csv line (transaction-grain SSOT). */
  'payment_line',
  // Business-overhead SSOT (Business Finance coverage program).
  /** One dated occurrence of a recurring vehicle FixedExpenseConfig. */
  'fixed_expense',
  /** Generic manually-logged operating expense bridged from transaction:*. */
  'operating_expense',
  /** Generic manually-logged other income bridged from transaction:*. */
  'other_income',
  /** Completed, paid maintenance parts/labor spend. */
  'maintenance',
] as const;

export type CanonicalLedgerEventType = (typeof CANONICAL_LEDGER_EVENT_TYPES)[number];

export type CanonicalLedgerSourceType =
  | 'trip'
  | 'statement'
  | 'import_batch'
  | 'transaction'
  | 'adjustment'
  /** Owner-entered overhead not tied to a trip/statement (fixed expenses, manual costs). */
  | 'financial_event'
  /** Rebuilt from a historical backfill job. */
  | 'backfill';

/**
 * Full persisted canonical event (server adds organizationId via stampOrg when missing).
 */
export interface CanonicalLedgerEvent {
  schemaVersion: typeof CANONICAL_LEDGER_SCHEMA_VERSION;
  eventKind: typeof CANONICAL_LEDGER_EVENT_KIND;
  id: string;
  /** Stable logical key — duplicate POSTs with the same key are skipped. */
  idempotencyKey: string;
  createdAt: string;
  date: string;
  driverId: string;
  eventType: string;
  direction: 'inflow' | 'outflow';
  netAmount: number;
  grossAmount: number;
  currency: string;
  sourceType: CanonicalLedgerSourceType;
  sourceId: string;
  batchId?: string;
  importerUserId?: string;
  sourceFileHash?: string;
  periodStart?: string;
  periodEnd?: string;
  platform?: string;
  vehicleId?: string;
  category?: string;
  description?: string;
  isReconciled?: boolean;
  /** Trip-sourced `fare_earning`: set `Cash` so driver-overview cash totals roll up (`ledgerMoneyAggregate`). */
  paymentMethod?: string;
  /** Uber `transaction UUID` or platform line id for audit/disputes. */
  externalTransactionId?: string;
  /** Uber `vs reporting` or platform posting timestamp (ISO). */
  postingAt?: string;
  /** Raw Uber Description column (e.g. trip completed order). */
  uberDescription?: string;
  metadata?: Record<string, unknown>;
}

/** Client → POST /ledger/canonical-events/append body item (id optional — server assigns). */
export type CanonicalLedgerEventInput = Omit<
  CanonicalLedgerEvent,
  'id' | 'schemaVersion' | 'eventKind' | 'createdAt'
> &
  Partial<Pick<CanonicalLedgerEvent, 'id' | 'createdAt'>>;

export interface AppendCanonicalLedgerResult {
  success: boolean;
  inserted: number;
  skipped: number;
  failed: number;
  details: Array<{
    index: number;
    idempotencyKey?: string;
    id?: string;
    error?: string;
    skipped?: boolean;
  }>;
}
