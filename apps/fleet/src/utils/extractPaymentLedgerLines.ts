/**
 * Extract transaction-grain payment ledger lines from Uber `payments_transaction.csv` rows.
 */
import type { PaymentLedgerLine, PaymentLedgerLineKind } from '@roam/types/paymentLedgerLine';
import { isUberTripFareAdjustOrderDescription } from './uberTripFareAdjustOrder';

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const s = String(val).replace(/[^0-9.-]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function cell(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k];
    const found = Object.keys(row).find((rk) => rk.toLowerCase() === k.toLowerCase());
    if (found && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== '') {
      return row[found];
    }
  }
  return undefined;
}

function parseReportingAt(row: Record<string, unknown>): string {
  const raw = cell(row, 'vs reporting', 'vs Reporting');
  if (raw) {
    try {
      const d = new Date(String(raw));
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch {
      /* ignore */
    }
  }
  return new Date().toISOString();
}

function inferLineKind(description: string, fareBreakdown: PaymentLedgerLine['fareBreakdown']): PaymentLedgerLineKind {
  const d = description.toLowerCase();
  if (d.includes('so.payout') || d.includes('payout')) return 'payout';
  if (isUberTripFareAdjustOrderDescription(description)) return 'prior_period_adjustment';
  if (d.startsWith('support adjustment')) return 'toll_refund';
  if (d.includes('cancellation')) return 'cancellation';
  if (fareBreakdown.tip > 0 && fareBreakdown.base === 0 && fareBreakdown.surge === 0) return 'tip';
  if (Math.abs(fareBreakdown.tollRefund) > 0) return 'toll_refund';
  return 'fare_earning';
}

export interface ExtractPaymentLineContext {
  batchId?: string;
  tripInUberTripActivity?: (tripId: string) => boolean;
}

export function extractPaymentLedgerLineFromUberRow(
  row: Record<string, unknown>,
  ctx: ExtractPaymentLineContext = {},
): PaymentLedgerLine | null {
  const transactionUuid = String(cell(row, 'transaction UUID', 'transaction uuid') || '').trim();
  const tripUuid = String(cell(row, 'Trip UUID', 'trip uuid') || '').trim() || undefined;
  const driverId = String(cell(row, 'Driver UUID', 'driver uuid') || '').trim() || undefined;
  const description = String(cell(row, 'Description') || '').trim() || 'Unknown';
  const orgName = String(cell(row, 'Organization name', 'Organization Name') || '').trim() || undefined;
  const orgAlias = String(cell(row, 'Org alias', 'Org Alias') || '').trim() || undefined;

  const paidToYou = toNum(cell(row, 'Paid to you', 'Paid To You'));
  const earningsGross = toNum(
    cell(row, 'Paid to you : Your earnings', 'Paid to you:Your earnings'),
  );
  const cashCollected = toNum(
    cell(
      row,
      'Paid to you : Trip balance : Payouts : Cash Collected',
      'Paid to you:Trip balance:Payouts:Cash Collected',
      'Cash Collected',
    ),
  );
  const bankTransferred = toNum(
    cell(
      row,
      'Paid to you:Trip balance:Payouts:Transferred To Bank Account',
      'Paid to you : Trip balance : Payouts : Transferred To Bank Account',
    ),
  );

  const fareBreakdown = {
    base: toNum(cell(row, 'Paid to you:Your earnings:Fare:Fare', 'Paid to you : Your earnings : Fare:Fare')),
    surge: toNum(cell(row, 'Paid to you:Your earnings:Fare:Surge', 'Paid to you : Your earnings : Fare:Surge')),
    waitPickup: toNum(
      cell(row, 'Paid to you:Your earnings:Fare:Wait Time at Pickup', 'Paid to you : Your earnings : Fare:Wait Time at Pickup'),
    ),
    timeAtStop: toNum(cell(row, 'Paid to you:Your earnings:Fare:Time at Stop', 'Paid to you : Your earnings : Fare:Time at Stop')),
    cancellation: toNum(
      cell(row, 'Paid to you:Your earnings:Fare:Cancellation', 'Paid to you : Your earnings : Fare:Cancellation'),
    ),
    taxes: toNum(cell(row, 'Paid to you:Your earnings:Taxes', 'Paid to you : Your earnings : Taxes')),
    tip: toNum(cell(row, 'Paid to you:Your earnings:Tip', 'Paid to you : Your earnings : Tip')),
    tollRefund: toNum(cell(row, 'Paid to you:Trip balance:Refunds:Toll', 'Paid to you : Trip balance : Refunds : Toll')),
    airportFees: toNum(
      cell(row, 'Paid to you:Your earnings:Fare:Airport Surcharge', 'Paid to you : Your earnings : Fare:Airport Surcharge'),
    ),
  };

  const hasMoney =
    Math.abs(paidToYou) > 1e-9 ||
    Math.abs(earningsGross) > 1e-9 ||
    Math.abs(cashCollected) > 1e-9 ||
    Math.abs(bankTransferred) > 1e-9 ||
    Object.values(fareBreakdown).some((v) => Math.abs(Number(v) || 0) > 1e-9);

  if (!hasMoney && !description) return null;

  const lineKind = inferLineKind(description, fareBreakdown);
  const id = transactionUuid || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const idempotencyKey = transactionUuid
    ? `uber_tx:${transactionUuid.toLowerCase()}`
    : `uber_row:${ctx.batchId || 'batch'}:${id}`;

  let paymentMethod: PaymentLedgerLine['paymentMethod'];
  if (Math.abs(cashCollected) > 0.0001) paymentMethod = 'Cash';
  else if (Math.abs(bankTransferred) > 0.0001) paymentMethod = 'Digital (card/Bank)';

  const firstName = String(cell(row, 'Driver first name', 'Driver First Name') || '').trim();
  const lastName = String(cell(row, 'Driver last name', 'Driver Last Name') || '').trim();

  return {
    id,
    platform: 'Uber',
    tripId: tripUuid,
    driverId,
    driverFirstName: firstName || undefined,
    driverLastName: lastName || undefined,
    description,
    reportingAt: parseReportingAt(row),
    paidToYou,
    earningsGross,
    cashCollected,
    bankTransferred,
    fareBreakdown,
    organizationName: orgName,
    organizationAlias: orgAlias,
    batchId: ctx.batchId,
    sourceType: 'uber_import',
    lineKind,
    idempotencyKey,
    externalTransactionId: transactionUuid || undefined,
    paymentMethod,
    currency: 'JMD',
    createdAt: new Date().toISOString(),
  };
}

export function applyPaymentLineRollupsToTrips<T extends Record<string, unknown>>(
  trips: T[],
  lines: PaymentLedgerLine[],
): T[] {
  const byTrip = new Map<string, PaymentLedgerLine[]>();
  for (const line of lines) {
    if (!line.tripId) continue;
    const key = line.tripId.toLowerCase();
    const arr = byTrip.get(key) || [];
    arr.push(line);
    byTrip.set(key, arr);
  }

  return trips.map((trip) => {
    const id = String(trip.id || '').toLowerCase();
    const tripLines = byTrip.get(id);
    if (!tripLines?.length) return trip;

    let paidToYouNet = 0;
    let bankTransferred = 0;
    let cancellationFare = 0;
    let reportingAt = '';
    const externalTransactionIds: string[] = [];

    for (const line of tripLines) {
      paidToYouNet += line.paidToYou;
      bankTransferred += line.bankTransferred;
      cancellationFare += line.fareBreakdown.cancellation;
      if (line.reportingAt && (!reportingAt || line.reportingAt > reportingAt)) {
        reportingAt = line.reportingAt;
      }
      if (line.externalTransactionId) externalTransactionIds.push(line.externalTransactionId);
    }

    const transactionTypes = [...new Set(tripLines.map((l) => l.description))].join(', ');

    return {
      ...trip,
      paidToYouNet,
      bankTransferred,
      cancellationFare,
      reportingAt: reportingAt || trip.reportingAt,
      paymentRowCount: tripLines.length,
      externalTransactionIds,
      transactionType: transactionTypes || trip.transactionType,
      paymentLineRollupMatch: trip.amount != null
        ? Math.abs(paidToYouNet - Number(trip.amount)) <= 0.05
        : true,
    };
  });
}
