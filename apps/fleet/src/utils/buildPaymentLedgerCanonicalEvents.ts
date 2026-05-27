import type { CanonicalLedgerEventInput } from '../types/ledgerCanonical';
import type { PaymentLedgerLine } from '@roam/types/paymentLedgerLine';
import { isUberTripFareAdjustOrderDescription } from './uberTripFareAdjustOrder';

function toYmd(iso: string): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  return iso.slice(0, 10);
}

function mapDescriptionToEventType(line: PaymentLedgerLine): string {
  const d = line.description.toLowerCase();
  if (d.includes('so.payout')) return 'payout_bank';
  if (isUberTripFareAdjustOrderDescription(line.description)) return 'prior_period_adjustment';
  if (d.startsWith('support adjustment')) return 'toll_support_adjustment';
  if (line.lineKind === 'tip' || line.fareBreakdown.tip > 0) return 'tip';
  if (line.lineKind === 'toll_refund' || Math.abs(line.fareBreakdown.tollRefund) > 0) {
    return 'toll_support_adjustment';
  }
  return 'payment_line';
}

function primaryAmount(line: PaymentLedgerLine): number {
  if (Math.abs(line.earningsGross) > 1e-9) return line.earningsGross;
  if (Math.abs(line.paidToYou) > 1e-9) return line.paidToYou;
  if (Math.abs(line.fareBreakdown.tollRefund) > 1e-9) return line.fareBreakdown.tollRefund;
  return 0;
}

export function buildPaymentLedgerCanonicalEvents(
  lines: PaymentLedgerLine[],
  batchId: string,
  sourceFileHash?: string,
): CanonicalLedgerEventInput[] {
  const out: CanonicalLedgerEventInput[] = [];

  for (const line of lines) {
    const driverId = String(line.driverId || '').trim();
    if (!driverId || driverId === '00000000-0000-0000-0000-000000000000') {
      // Org-level payout rows may lack driver — skip canonical unless we have org handler
      if (!line.description.toLowerCase().includes('so.payout')) continue;
    }

    const eventType = mapDescriptionToEventType(line);
    const amt = primaryAmount(line);
    if (Math.abs(amt) < 1e-9 && eventType !== 'payment_line') continue;

    const direction: 'inflow' | 'outflow' = amt >= 0 ? 'inflow' : 'outflow';
    const absAmt = Math.abs(amt);
    const date = toYmd(line.reportingAt);
    const sourceId = line.tripId || line.externalTransactionId || line.id;

    out.push({
      idempotencyKey: `payment_line:${line.idempotencyKey}`,
      date,
      driverId: driverId || '00000000-0000-0000-0000-000000000000',
      eventType,
      direction,
      netAmount: amt,
      grossAmount: absAmt,
      currency: line.currency || 'JMD',
      sourceType: 'import_batch',
      sourceId,
      batchId,
      sourceFileHash,
      platform: 'Uber',
      description: line.description,
      externalTransactionId: line.externalTransactionId,
      postingAt: line.reportingAt,
      uberDescription: line.description,
      paymentMethod: line.paymentMethod,
      metadata: {
        lineKind: line.lineKind,
        tripId: line.tripId,
        paidToYou: line.paidToYou,
        earningsGross: line.earningsGross,
        cashCollected: line.cashCollected,
        bankTransferred: line.bankTransferred,
        fareBreakdown: line.fareBreakdown,
        paymentLineId: line.id,
      },
    });
  }

  return out;
}
