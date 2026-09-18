/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import type { FuelEntry } from '../types/fuel';
import {
  buildFuelFlagDeskRows,
  classifyFuelFillFlags,
  isFuelFillFlagWeekCleared,
} from './fuelFillFlagClassify';

function entry(partial: Partial<FuelEntry> & { id: string; date: string }): FuelEntry {
  return {
    amount: 100,
    type: 'Reimbursement',
    entryMode: 'Floating',
    paymentSource: 'RideShare_Cash',
    ...partial,
  } as FuelEntry;
}

describe('classifyFuelFillFlags', () => {
  it('does not flag Pending-only fills', () => {
    const c = classifyFuelFillFlags(
      entry({ id: '1', date: '2026-09-10', reconciliationStatus: 'Pending' }),
    );
    expect(c.isFlagged).toBe(false);
  });

  it('does not flag audit observing alone', () => {
    const c = classifyFuelFillFlags(
      entry({
        id: '1b',
        date: '2026-09-10',
        auditStatus: 'Observing',
        reconciliationStatus: 'Pending',
      }),
    );
    expect(c.isFlagged).toBe(false);
  });

  it('flags exception under Integrity critical', () => {
    const c = classifyFuelFillFlags(
      entry({
        id: '2',
        date: '2026-09-10',
        metadata: { signalTier: 'exception', anomalyReason: 'Tank Overflow' },
      }),
    );
    expect(c.categories).toEqual(['Integrity']);
    expect(c.primarySeverity).toBe('critical');
    expect(c.reasons[0].label).toContain('Tank Overflow');
  });

  it('flags integrity critical under Integrity', () => {
    const c = classifyFuelFillFlags(
      entry({
        id: '3',
        date: '2026-09-10',
        metadata: { integrityStatus: 'critical', anomalyReason: 'High Fuel Consumption' },
      }),
    );
    expect(c.categories).toContain('Integrity');
    expect(c.reasons.some((r) => r.code === 'integrity_critical')).toBe(true);
  });

  it('flags location anomaly under Integrity', () => {
    const c = classifyFuelFillFlags(
      entry({ id: '4', date: '2026-09-10', locationStatus: 'anomaly' }),
    );
    expect(c.categories).toContain('Integrity');
    expect(c.reasons.some((r) => r.code === 'location_anomaly')).toBe(true);
  });

  it('adds Outlier when entry id is in outlier set', () => {
    const c = classifyFuelFillFlags(entry({ id: '5', date: '2026-09-10' }), {
      outlierEntryIds: new Set(['5']),
    });
    expect(c.categories).toContain('Outlier');
    expect(c.reasons.some((r) => r.code === 'price_outlier')).toBe(true);
  });

  it('returns not flagged for clean observe fill', () => {
    const c = classifyFuelFillFlags(
      entry({
        id: '6',
        date: '2026-09-10',
        reconciliationStatus: 'Verified',
        metadata: { signalTier: 'observe', integrityStatus: 'valid' },
      }),
    );
    expect(c.isFlagged).toBe(false);
  });

  it('does not flag review-tier alone', () => {
    const c = classifyFuelFillFlags(
      entry({
        id: '7',
        date: '2026-09-10',
        metadata: { signalTier: 'review' },
      }),
    );
    expect(c.isFlagged).toBe(false);
  });
});

describe('isFuelFillFlagWeekCleared', () => {
  it('true when locked', () => {
    expect(isFuelFillFlagWeekCleared({ status: 'locked' })).toBe(true);
    expect(isFuelFillFlagWeekCleared({ lockedAt: '2026-09-14T00:00:00Z' })).toBe(true);
  });
  it('false when open', () => {
    expect(isFuelFillFlagWeekCleared({ status: 'open' })).toBe(false);
    expect(isFuelFillFlagWeekCleared(null)).toBe(false);
  });
});

describe('buildFuelFlagDeskRows', () => {
  it('omits Pending-only; includes integrity fills and marks cleared', () => {
    const entries = [
      entry({
        id: 'a',
        date: '2026-09-10',
        vehicleId: 'v1',
        driverId: 'd1',
        reconciliationStatus: 'Pending',
      }),
      entry({
        id: 'c',
        date: '2026-09-11',
        vehicleId: 'v1',
        driverId: 'd1',
        metadata: { integrityStatus: 'warning', anomalyReason: 'Approaching Capacity' },
      }),
      entry({
        id: 'b',
        date: '2026-09-01',
        reconciliationStatus: 'Pending',
      }),
    ];
    const rows = buildFuelFlagDeskRows(entries, {
      weekStartYmd: '2026-09-07',
      weekEndYmd: '2026-09-13',
      weekLocked: true,
      plateByVehicleId: new Map([['v1', '5179KZ']]),
      driverNameById: new Map([['d1', 'Kenny']]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].entryId).toBe('c');
    expect(rows[0].cleared).toBe(true);
    expect(rows[0].plate).toBe('5179KZ');
    expect(rows[0].categories).toContain('Integrity');
  });

  it('sorts critical above warning then by date desc', () => {
    const rows = buildFuelFlagDeskRows(
      [
        entry({
          id: 'warn',
          date: '2026-09-12',
          metadata: { integrityStatus: 'warning', anomalyReason: 'Approaching Capacity' },
        }),
        entry({
          id: 'crit',
          date: '2026-09-10',
          metadata: { signalTier: 'exception', anomalyReason: 'Tank Overflow' },
        }),
      ],
      {
        weekStartYmd: '2026-09-07',
        weekEndYmd: '2026-09-13',
        weekLocked: false,
      },
    );
    expect(rows.map((r) => r.entryId)).toEqual(['crit', 'warn']);
  });

  it('dedupes is_flagged when integrity_* shares the same anomaly label', () => {
    const c = classifyFuelFillFlags(
      entry({
        id: 'dup',
        date: '2026-09-10',
        isFlagged: true,
        metadata: { integrityStatus: 'warning', anomalyReason: 'Odometer Regression' },
      }),
    );
    const labels = c.reasons.map((r) => r.label);
    expect(labels.filter((l) => l === 'Odometer Regression')).toHaveLength(1);
    expect(c.reasons.some((r) => r.code === 'is_flagged')).toBe(false);
  });
});

describe('station median outlier on non-latest week', () => {
  it('includes an older-week outlier that fleet-wide slice(80) would drop', async () => {
    const { buildStationMedianOutlierIdSet } = await import('./fuelAnalyticsAggregates');
    const { buildFuelFlagDeskRows: buildRows } = await import('./fuelFillFlagClassify');

    // 90 recent clean fills at station S (would fill a slice(80) window), plus one old outlier week.
    const entries: FuelEntry[] = [];
    for (let i = 0; i < 90; i++) {
      const day = 18 - Math.floor(i / 5); // recent days in Sep
      const d = `2026-09-${String(Math.max(1, day)).padStart(2, '0')}`;
      entries.push(
        entry({
          id: `recent-${i}`,
          date: d,
          liters: 40,
          amount: 8000, // $200/L — normal vs median
          matchedStationId: 'S1',
          type: 'Gas Card',
          entryMode: 'Card',
          paymentSource: 'Gas_Card',
        }),
      );
    }
    // Older week (Aug 3–9): two fills establish median, one expensive outlier.
    entries.push(
      entry({
        id: 'old-normal-a',
        date: '2026-08-04',
        liters: 40,
        amount: 8000,
        matchedStationId: 'S1',
        type: 'Gas Card',
        entryMode: 'Card',
        paymentSource: 'Gas_Card',
      }),
      entry({
        id: 'old-normal-b',
        date: '2026-08-05',
        liters: 40,
        amount: 8000,
        matchedStationId: 'S1',
        type: 'Gas Card',
        entryMode: 'Card',
        paymentSource: 'Gas_Card',
      }),
      entry({
        id: 'old-outlier',
        date: '2026-08-06',
        liters: 40,
        amount: 12000, // $300/L — 50% above $200 median
        matchedStationId: 'S1',
        type: 'Gas Card',
        entryMode: 'Card',
        paymentSource: 'Gas_Card',
      }),
    );

    const outlierIds = buildStationMedianOutlierIdSet(
      entries,
      '2026-08-09',
      undefined,
      '2026-08-03',
      '2026-08-09',
    );
    expect(outlierIds.has('old-outlier')).toBe(true);

    const rows = buildRows(entries, {
      weekStartYmd: '2026-08-03',
      weekEndYmd: '2026-08-09',
      weekLocked: false,
      outlierEntryIds: outlierIds,
    });
    expect(rows.some((r) => r.entryId === 'old-outlier')).toBe(true);
    expect(rows.find((r) => r.entryId === 'old-outlier')?.categories).toContain('Outlier');
  });
});