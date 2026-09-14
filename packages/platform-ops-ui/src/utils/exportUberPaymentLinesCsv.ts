/**
 * Export payment ledger lines in Uber payments_transaction.csv column shape.
 */
import type { PaymentLedgerLine } from '@roam/types/paymentLedgerLine';

const UBER_HEADERS = [
  'transaction UUID',
  'Driver UUID',
  'Driver first name',
  'Driver last name',
  'Trip UUID',
  'Description',
  'Organization name',
  'Org alias',
  'vs reporting',
  'Paid to you',
  'Paid to you : Your earnings',
  'Paid to you : Trip balance : Payouts : Cash Collected',
  'Paid to you:Your earnings:Fare:Fare',
  'Paid to you : Your earnings : Taxes',
  'Paid to you:Your earnings:Fare:Surge',
  'Paid to you : Your earnings : Fare:Wait Time at Pickup',
  'Paid to you:Trip balance:Refunds:Toll',
  'Paid to you:Trip balance:Payouts:Transferred To Bank Account',
  'Paid to you:Your earnings:Tip',
  'Paid to you:Your earnings:Fare:Time at Stop',
  'Paid to you:Your earnings:Fare:Cancellation',
];

export function paymentLineToUberCsvRow(line: PaymentLedgerLine): Record<string, string | number> {
  const fb = line.fareBreakdown;
  return {
    'transaction UUID': line.externalTransactionId ?? line.id,
    'Driver UUID': line.driverId ?? '',
    'Driver first name': line.driverFirstName ?? '',
    'Driver last name': line.driverLastName ?? '',
    'Trip UUID': line.tripId ?? '',
    Description: line.description,
    'Organization name': line.organizationName ?? '',
    'Org alias': line.organizationAlias ?? '',
    'vs reporting': line.reportingAt,
    'Paid to you': line.paidToYou,
    'Paid to you : Your earnings': line.earningsGross,
    'Paid to you : Trip balance : Payouts : Cash Collected': line.cashCollected,
    'Paid to you:Your earnings:Fare:Fare': fb.base,
    'Paid to you : Your earnings : Taxes': fb.taxes,
    'Paid to you:Your earnings:Fare:Surge': fb.surge,
    'Paid to you : Your earnings : Fare:Wait Time at Pickup': fb.waitPickup,
    'Paid to you:Trip balance:Refunds:Toll': fb.tollRefund,
    'Paid to you:Trip balance:Payouts:Transferred To Bank Account': line.bankTransferred,
    'Paid to you:Your earnings:Tip': fb.tip,
    'Paid to you:Your earnings:Fare:Time at Stop': fb.timeAtStop,
    'Paid to you:Your earnings:Fare:Cancellation': fb.cancellation,
  };
}

export function uberCsvHeaders(): string[] {
  return [...UBER_HEADERS];
}

export function linesToUberCsv(lines: PaymentLedgerLine[]): string {
  const rows = lines.map(paymentLineToUberCsvRow);
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = UBER_HEADERS.join(',');
  const body = rows
    .map((row) => UBER_HEADERS.map((h) => escape(row[h] ?? '')).join(','))
    .join('\n');
  return `${header}\n${body}\n`;
}
