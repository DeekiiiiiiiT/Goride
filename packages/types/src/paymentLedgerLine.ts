/**
 * Transaction-grain payment ledger line — Uber `payments_transaction.csv` parity + Roam platform equivalents.
 */

export type PaymentLedgerLinePlatform =
  | 'Uber'
  | 'Lyft'
  | 'Bolt'
  | 'InDrive'
  | 'Roam'
  | 'GoRide'
  | 'Private'
  | 'Cash'
  | 'Other';

export type PaymentLedgerLineSourceType =
  | 'uber_import'
  | 'roam_completion'
  | 'roam_adjustment';

export type PaymentLedgerLineKind =
  | 'fare_earning'
  | 'tip'
  | 'platform_fee'
  | 'cash_collection'
  | 'bank_payout'
  | 'prior_period_adjustment'
  | 'toll_refund'
  | 'cancellation'
  | 'adjustment'
  | 'payout'
  | 'trip_cancelled';

/** Fare component breakdown (major currency units for fleet KV; minor for Postgres platform lines). */
export interface PaymentLedgerFareBreakdown {
  base: number;
  surge: number;
  waitPickup: number;
  timeAtStop: number;
  cancellation: number;
  taxes: number;
  tip: number;
  tollRefund: number;
  airportFees?: number;
}

export interface PaymentLedgerLine {
  id: string;
  platform: PaymentLedgerLinePlatform;
  tripId?: string;
  driverId?: string;
  driverFirstName?: string;
  driverLastName?: string;
  riderUserId?: string;
  description: string;
  /** Uber `vs reporting` or Roam `completed_at`. */
  reportingAt: string;
  paidToYou: number;
  earningsGross: number;
  cashCollected: number;
  bankTransferred: number;
  fareBreakdown: PaymentLedgerFareBreakdown;
  organizationName?: string;
  organizationAlias?: string;
  batchId?: string;
  sourceType: PaymentLedgerLineSourceType;
  lineKind?: PaymentLedgerLineKind;
  /** Stable dedup key — e.g. Uber transaction UUID or `ride:{id}|fare_earning`. */
  idempotencyKey: string;
  /** Original Uber transaction UUID when available. */
  externalTransactionId?: string;
  paymentMethod?: 'Cash' | 'Card' | 'Digital (card/Bank)';
  currency?: string;
  createdAt?: string;
}

/** Postgres `rides.ledger_lines` row (amounts in minor units). */
export interface RideLedgerLineRow {
  id: string;
  ride_request_id: string;
  line_kind: PaymentLedgerLineKind;
  description: string;
  reporting_at: string;
  paid_to_you_minor: number;
  earnings_gross_minor: number;
  cash_collected_minor: number;
  bank_transferred_minor: number;
  fare_breakdown: Record<string, number>;
  payment_method: 'cash' | 'card' | null;
  driver_user_id: string | null;
  rider_user_id: string;
  idempotency_key: string;
  created_at: string;
}
