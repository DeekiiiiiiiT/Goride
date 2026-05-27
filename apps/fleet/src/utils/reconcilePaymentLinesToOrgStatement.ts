/**
 * Reconcile Uber org/driver statement totals against payment ledger lines.
 */
import type { PaymentLedgerLine } from '@roam/types/paymentLedgerLine';
import type { OrganizationMetrics, Trip } from '../types/data';

const TOL = 0.05;

export interface PaymentLineOrgReconciliation {
  netFareStatement: number;
  netFareFromLines: number;
  netFareDelta: number;
  tipsStatement: number;
  tipsFromLines: number;
  tipsDelta: number;
  cashStatement: number;
  cashFromLines: number;
  cashDelta: number;
  bankStatement: number;
  bankFromLines: number;
  bankDelta: number;
  paymentLineCount: number;
  withinTolerance: boolean;
}

function sumLines(
  lines: PaymentLedgerLine[],
  pick: (l: PaymentLedgerLine) => number,
): number {
  return lines.reduce((acc, l) => acc + pick(l), 0);
}

export function reconcilePaymentLinesToOrgStatement(params: {
  organizationMetrics?: OrganizationMetrics | null;
  paymentLines: PaymentLedgerLine[];
  tolerance?: number;
}): PaymentLineOrgReconciliation {
  const org = params.organizationMetrics;
  const lines = params.paymentLines;
  const tol = params.tolerance ?? TOL;

  const netFareFromLines = sumLines(lines, (l) => l.fareBreakdown.base + l.fareBreakdown.surge
    + l.fareBreakdown.waitPickup + l.fareBreakdown.timeAtStop + l.fareBreakdown.cancellation);
  const tipsFromLines = sumLines(lines, (l) => l.fareBreakdown.tip);
  const cashFromLines = sumLines(lines, (l) => l.cashCollected);
  const bankFromLines = sumLines(lines, (l) => l.bankTransferred);

  const netFareStatement = Number(org?.netFare ?? 0);
  const tipsStatement = Number(org?.totalTips ?? 0);
  const cashStatement = Number(org?.totalCashExposure ?? 0);
  const bankStatement = Math.abs(Number((org as { bankTransfer?: number })?.bankTransfer ?? 0));

  const netFareDelta = netFareStatement - netFareFromLines;
  const tipsDelta = tipsStatement - tipsFromLines;
  const cashDelta = cashStatement - cashFromLines;
  const bankDelta = bankStatement - Math.abs(bankFromLines);

  const withinTolerance =
    Math.abs(netFareDelta) <= tol &&
    Math.abs(tipsDelta) <= tol &&
    Math.abs(cashDelta) <= tol &&
    Math.abs(bankDelta) <= tol;

  return {
    netFareStatement,
    netFareFromLines,
    netFareDelta,
    tipsStatement,
    tipsFromLines,
    tipsDelta,
    cashStatement,
    cashFromLines,
    cashDelta,
    bankStatement,
    bankFromLines,
    bankDelta,
    paymentLineCount: lines.length,
    withinTolerance,
  };
}

export interface TripLineReconciliationRow {
  tripId: string;
  paidToYouNet?: number;
  linesPaidToYou: number;
  delta: number;
  withinTolerance: boolean;
  paymentRowCount?: number;
  lineCount: number;
}

export function reconcileTripRollupsToPaymentLines(
  trips: Trip[],
  lines: PaymentLedgerLine[],
  tolerance = TOL,
): TripLineReconciliationRow[] {
  const byTrip = new Map<string, PaymentLedgerLine[]>();
  for (const line of lines) {
    if (!line.tripId) continue;
    const key = line.tripId.toLowerCase();
    const arr = byTrip.get(key) ?? [];
    arr.push(line);
    byTrip.set(key, arr);
  }

  return trips
    .filter((t) => byTrip.has(String(t.id).toLowerCase()))
    .map((t) => {
      const tripLines = byTrip.get(String(t.id).toLowerCase()) ?? [];
      const linesPaidToYou = tripLines.reduce((s, l) => s + l.paidToYou, 0);
      const rollup = t.paidToYouNet ?? t.amount ?? 0;
      const delta = rollup - linesPaidToYou;
      return {
        tripId: t.id,
        paidToYouNet: t.paidToYouNet,
        linesPaidToYou,
        delta,
        withinTolerance: Math.abs(delta) <= tolerance,
        paymentRowCount: t.paymentRowCount,
        lineCount: tripLines.length,
      };
    });
}
