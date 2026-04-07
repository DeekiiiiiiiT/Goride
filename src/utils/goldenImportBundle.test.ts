import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import {
  detectFileType,
  mergeAndProcessData,
  type FileData,
} from './csvHelpers';
import { buildCanonicalImportEvents } from './buildCanonicalImportEvents';
import { aggregateCanonicalEventsToLedgerDriverOverview } from './ledgerMoneyAggregate';
import { reconcileUberNetFareByDriver } from './uberStatementReconciliation';
import type { ParsedRow } from '../types/data';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/golden-import-bundle');

const GOLDEN_BATCH_ID = '88888888-8888-8888-8888-888888888888';

function loadGoldenFile(rel: string, logicalName: string): FileData {
  const raw = readFileSync(join(FIXTURE_DIR, rel), 'utf8');
  const parsed = Papa.parse<ParsedRow>(raw, { header: true, skipEmptyLines: true });
  const rows = parsed.data.filter((r) =>
    Object.values(r).some((v) => String(v ?? '').trim() !== ''),
  );
  const headers = parsed.meta.fields ?? [];
  const type = detectFileType(headers as string[], logicalName);
  return {
    id: rel,
    name: logicalName,
    rows,
    headers: headers as string[],
    type,
    reportDate: '2026-03-07T12:00:00.000Z',
  };
}

function loadGoldenBundle(): FileData[] {
  return [
    loadGoldenFile('golden_trip_activity.csv', 'golden_trip_activity.csv'),
    loadGoldenFile('golden_payment_organization.csv', 'golden_payment_organization.csv'),
    loadGoldenFile('golden_payments_driver.csv', 'golden_payments_driver.csv'),
    loadGoldenFile('golden_payments_transaction.csv', 'golden_payments_transaction.csv'),
  ];
}

describe('Phase 8 golden import bundle', () => {
  it('mergeAndProcessData produces trips, org metrics, SSOT map, and toll support refund', () => {
    const batch = mergeAndProcessData(loadGoldenBundle(), []);
    expect(batch.trips.length).toBe(1);
    expect(batch.organizationMetrics?.length).toBe(1);
    expect(batch.uberStatementsByDriverId).toBeDefined();
    const driverKey = '11111111-1111-1111-1111-111111111111';
    expect(batch.uberStatementsByDriverId?.[driverKey]?.statementNetFare).toBe(55);
    const dr = batch.disputeRefunds ?? [];
    expect(dr.length).toBe(1);
    expect(dr[0].amount).toBe(7.5);
    expect(dr[0].source).toBe('platform_import');
  });

  /**
   * NOTE: Fare-related statement_line events (TOTAL_EARNINGS, NET_FARE, PROMOTIONS, TIPS, REFUNDS_EXPENSES)
   * are NO LONGER emitted from buildCanonicalImportEvents. Fare data now comes from trip-level events.
   * This test verifies the events that ARE still emitted: payouts, toll refunds, toll support adjustments.
   */
  it('buildCanonicalImportEvents matches golden counts (no fare statement lines)', () => {
    const batch = mergeAndProcessData(loadGoldenBundle(), []);
    const events = buildCanonicalImportEvents({
      batchId: GOLDEN_BATCH_ID,
      sourceFileHash: 'golden-fixture',
      trips: batch.trips,
      organizationMetrics: batch.organizationMetrics?.[0],
      uberStatementsByDriverId: batch.uberStatementsByDriverId,
      disputeRefunds: batch.disputeRefunds ?? [],
    });

    const expected = JSON.parse(
      readFileSync(join(FIXTURE_DIR, 'golden-expected-read-model.json'), 'utf8'),
    );

    expect(events.length).toBe(expected.canonicalEventCount);

    const byType: Record<string, number> = {};
    for (const e of events) {
      byType[e.eventType] = (byType[e.eventType] || 0) + 1;
    }
    expect(byType).toEqual(expected.eventTypes);

    // REFUNDS_EXPENSES statement_line is NO LONGER emitted (fares come from trip events)
    const refundsStmt = events.find(
      (e) =>
        e.eventType === 'statement_line' &&
        (e.metadata as { lineCode?: string })?.lineCode === 'REFUNDS_EXPENSES',
    );
    expect(refundsStmt).toBeUndefined();

    // REFUNDS_TOLL statement_line IS still emitted
    const tollRefundStmt = events.find(
      (e) =>
        e.eventType === 'statement_line' &&
        (e.metadata as { lineCode?: string })?.lineCode === 'REFUNDS_TOLL',
    );
    expect(tollRefundStmt?.direction).toBe('inflow');
    expect(tollRefundStmt?.netAmount).toBe(3);

    // Toll support adjustment IS still emitted
    const tollSupport = events.filter((e) => e.eventType === 'toll_support_adjustment');
    expect(tollSupport).toHaveLength(1);
    expect(tollSupport[0].netAmount).toBe(7.5);
  });

  it('aggregateCanonicalEventsToLedgerDriverOverview matches golden read-model JSON', () => {
    const batch = mergeAndProcessData(loadGoldenBundle(), []);
    const events = buildCanonicalImportEvents({
      batchId: GOLDEN_BATCH_ID,
      sourceFileHash: 'golden-fixture',
      trips: batch.trips,
      organizationMetrics: batch.organizationMetrics?.[0],
      uberStatementsByDriverId: batch.uberStatementsByDriverId,
      disputeRefunds: batch.disputeRefunds ?? [],
    });

    const expected = JSON.parse(
      readFileSync(join(FIXTURE_DIR, 'golden-expected-read-model.json'), 'utf8'),
    );

    const rm = aggregateCanonicalEventsToLedgerDriverOverview(events, [], []) as {
      period: { earnings: number; cashCollected: number; disputeRefunds: number };
      readModelSource: string;
    };

    expect(rm.readModelSource).toBe(expected.readModel.readModelSource);
    expect(rm.period.earnings).toBe(expected.readModel.periodEarnings);
    expect(rm.period.cashCollected).toBe(expected.readModel.periodCashCollected);
    expect(rm.period.disputeRefunds).toBe(expected.readModel.periodDisputeRefunds);
  });

  it('reconcileUberNetFareByDriver matches golden reconciliation (statement vs trip roll)', () => {
    const batch = mergeAndProcessData(loadGoldenBundle(), []);
    const expected = JSON.parse(
      readFileSync(join(FIXTURE_DIR, 'golden-expected-read-model.json'), 'utf8'),
    );
    const rows = reconcileUberNetFareByDriver({
      trips: batch.trips,
      uberStatementsByDriverId: batch.uberStatementsByDriverId,
      periodStartYmd: '2026-03-01',
      periodEndYmd: '2026-03-07',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].driverId).toBe(expected.reconciliation.driverId);
    expect(rows[0].statementNetFare).toBe(expected.reconciliation.statementNetFare);
    expect(rows[0].tripRollFareComponents).toBe(expected.reconciliation.tripRollFareComponents);
    expect(rows[0].delta).toBe(expected.reconciliation.delta);
    expect(rows[0].withinTolerance).toBe(expected.reconciliation.withinTolerance);
  });

  it('buildCanonicalImportEvents is deterministic (stable idempotency keys)', () => {
    const batch = mergeAndProcessData(loadGoldenBundle(), []);
    const params = {
      batchId: GOLDEN_BATCH_ID,
      sourceFileHash: 'golden-fixture',
      trips: batch.trips,
      organizationMetrics: batch.organizationMetrics?.[0],
      uberStatementsByDriverId: batch.uberStatementsByDriverId,
      disputeRefunds: batch.disputeRefunds ?? [],
    };
    const a = buildCanonicalImportEvents(params).map((e) => e.idempotencyKey).sort();
    const b = buildCanonicalImportEvents(params).map((e) => e.idempotencyKey).sort();
    expect(a).toEqual(b);
  });
});
