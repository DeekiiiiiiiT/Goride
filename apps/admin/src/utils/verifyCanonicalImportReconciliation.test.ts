import { describe, expect, it } from 'vitest';
import { verifyCanonicalImportVsReconciliation } from './verifyCanonicalImportReconciliation';
import type { UberImportReconciliation } from './uberImportReconciliation';
import type { CanonicalLedgerEventInput } from '../types/ledgerCanonical';

function stmt(
  lineCode: string,
  netAmount: number,
  direction: 'inflow' | 'outflow' = 'inflow',
): CanonicalLedgerEventInput {
  return {
    idempotencyKey: `b|stmt|x|${lineCode}`,
    date: '2026-03-07',
    driverId: 'd',
    eventType: 'statement_line',
    direction,
    netAmount,
    grossAmount: Math.abs(netAmount),
    currency: 'JMD',
    sourceType: 'import_batch',
    sourceId: 'b',
    batchId: 'b',
    platform: 'Uber',
    description: 't',
    metadata: { lineCode },
  };
}

describe('verifyCanonicalImportVsReconciliation', () => {
  it('passes when statement lines match reconciliation', () => {
    const recon: UberImportReconciliation = {
      hasSsot: true,
      netFare: 100,
      promotions: 5,
      tipsStatement: 10,
      tipsPeriod: 10,
      priorSum: 0,
      tolls: 0,
      tollSupport: 0,
      refundsTotal: 2,
      periodTotal: 115,
      totalEarnings: 115,
      statementRollup: 115,
      roamTotalVsUber: 0,
      payoutCash: 0,
      payoutBank: 0,
      grandTotal: 115,
    };
    const events: CanonicalLedgerEventInput[] = [
      stmt('TOTAL_EARNINGS', 115),
      stmt('NET_FARE', 100),
      stmt('PROMOTIONS', 5),
      stmt('TIPS', 10),
      { ...stmt('REFUNDS_EXPENSES', -2), direction: 'outflow' },
    ];
    const v = verifyCanonicalImportVsReconciliation(events, recon);
    expect(v.ok).toBe(true);
  });

  it('fails when NET_FARE drifts', () => {
    const recon: UberImportReconciliation = {
      hasSsot: true,
      netFare: 100,
      promotions: 0,
      tipsStatement: 0,
      tipsPeriod: 0,
      priorSum: 0,
      tolls: 0,
      tollSupport: 0,
      refundsTotal: 0,
      periodTotal: 100,
      totalEarnings: 100,
      statementRollup: 100,
      roamTotalVsUber: 0,
      payoutCash: 0,
      payoutBank: 0,
      grandTotal: 100,
    };
    const v = verifyCanonicalImportVsReconciliation([stmt('NET_FARE', 99)], recon);
    expect(v.ok).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });
});
