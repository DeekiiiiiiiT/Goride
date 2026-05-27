/**
 * Map Postgres rides.ledger_lines rows to PaymentLedgerLine (Fleet/Uber parity, major units).
 */
import type { PaymentLedgerLine } from '@roam/types/paymentLedgerLine';

export interface RideLedgerLineRowInput {
  id: string;
  ride_request_id: string;
  line_kind: string;
  description: string;
  reporting_at: string;
  paid_to_you_minor: number;
  earnings_gross_minor: number;
  cash_collected_minor: number;
  bank_transferred_minor: number;
  fare_breakdown: Record<string, number> | null;
  payment_method: string | null;
  driver_user_id: string | null;
  rider_user_id: string;
  idempotency_key: string;
}

function minorToMajor(minor: number): number {
  return minor / 100;
}

function breakdownFromMinor(b: Record<string, number> | null | undefined) {
  const fb = b ?? {};
  return {
    base: minorToMajor(Number(fb.base_minor ?? fb.after_surge_minor ?? 0)),
    surge: minorToMajor(Number(fb.surge_minor ?? 0)),
    waitPickup: minorToMajor(Number(fb.wait_pickup_minor ?? 0)),
    timeAtStop: minorToMajor(Number(fb.time_component_minor ?? 0)),
    cancellation: minorToMajor(Number(fb.cancellation_minor ?? 0)),
    taxes: minorToMajor(Number(fb.taxes_minor ?? 0)),
    tip: minorToMajor(Number(fb.tip_minor ?? 0)),
    tollRefund: minorToMajor(Number(fb.toll_refund_minor ?? 0)),
  };
}

export function mapRideLedgerLineRowToPaymentLedgerLine(
  row: RideLedgerLineRowInput,
): PaymentLedgerLine {
  const pm = row.payment_method === 'card' ? 'Card' as const
    : row.payment_method === 'cash' ? 'Cash' as const
    : undefined;

  return {
    id: row.id,
    platform: 'Roam',
    tripId: row.ride_request_id,
    driverId: row.driver_user_id ?? undefined,
    riderUserId: row.rider_user_id,
    description: row.description,
    reportingAt: row.reporting_at,
    paidToYou: minorToMajor(row.paid_to_you_minor),
    earningsGross: minorToMajor(row.earnings_gross_minor),
    cashCollected: minorToMajor(row.cash_collected_minor),
    bankTransferred: minorToMajor(row.bank_transferred_minor),
    fareBreakdown: breakdownFromMinor(row.fare_breakdown),
    sourceType: 'roam_completion',
    lineKind: row.line_kind as PaymentLedgerLine['lineKind'],
    idempotencyKey: row.idempotency_key,
    externalTransactionId: row.idempotency_key,
    paymentMethod: pm,
    currency: 'JMD',
  };
}

export function rollupPaymentLinesFromRows(rows: RideLedgerLineRowInput[]): {
  paidToYouNet: number;
  bankTransferred: number;
  paymentRowCount: number;
  reportingAt: string;
} {
  let paidToYouNet = 0;
  let bankTransferred = 0;
  let reportingAt = '';
  for (const row of rows) {
    paidToYouNet += minorToMajor(row.paid_to_you_minor);
    bankTransferred += minorToMajor(row.bank_transferred_minor);
    if (row.reporting_at && (!reportingAt || row.reporting_at > reportingAt)) {
      reportingAt = row.reporting_at;
    }
  }
  return { paidToYouNet, bankTransferred, paymentRowCount: rows.length, reportingAt };
}
