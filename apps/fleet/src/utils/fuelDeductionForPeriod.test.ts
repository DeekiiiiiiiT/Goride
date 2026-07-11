import { describe, it, expect } from 'vitest';
import { getFuelDeductionForPeriod } from './fuelDeductionForPeriod';

const weeklyReport = {
  vehicleId: 'v1',
  weekStart: '2026-07-06T00:00:00.000Z',
  weekEnd: '2026-07-12T00:00:00.000Z',
  driverShare: 140,
  companyShare: 60,
  driverSpend: 100,
  netPay: -40, // driverSpend(100) - driverShare(140)
};

describe('getFuelDeductionForPeriod', () => {
  it('sums driverShare/companyShare/driverSpend/netPay for a weekly period that fully overlaps', () => {
    const periodStart = new Date('2026-07-06T00:00:00');
    const periodEnd = new Date('2026-07-12T23:59:59');

    const r = getFuelDeductionForPeriod([weeklyReport], periodStart, periodEnd, 'weekly');

    expect(r.finalized).toBe(true);
    expect(r.deduction).toBe(140);
    expect(r.fleetShare).toBe(60);
    expect(r.driverSpend).toBe(100);
    expect(r.netPay).toBe(-40);
  });

  it('returns finalized: false and all-zero totals when nothing overlaps', () => {
    const periodStart = new Date('2026-08-01T00:00:00');
    const periodEnd = new Date('2026-08-07T23:59:59');

    const r = getFuelDeductionForPeriod([weeklyReport], periodStart, periodEnd, 'weekly');

    expect(r.finalized).toBe(false);
    expect(r.deduction).toBe(0);
    expect(r.driverSpend).toBe(0);
    expect(r.netPay).toBe(0);
  });

  it('apportions the weekly totals evenly across days in daily mode', () => {
    // 7-day week: 2026-07-06 (Mon) through 2026-07-12 (Sun)
    const day = new Date('2026-07-08T00:00:00');
    const r = getFuelDeductionForPeriod([weeklyReport], day, day, 'daily');

    expect(r.finalized).toBe(true);
    expect(r.deduction).toBeCloseTo(140 / 7, 10);
    expect(r.fleetShare).toBeCloseTo(60 / 7, 10);
    expect(r.driverSpend).toBeCloseTo(100 / 7, 10);
    expect(r.netPay).toBeCloseTo(-40 / 7, 10);
  });

  it('sums multiple overlapping reports for a monthly period', () => {
    const secondWeekReport = {
      ...weeklyReport,
      vehicleId: 'v2',
      weekStart: '2026-07-13T00:00:00.000Z',
      weekEnd: '2026-07-19T00:00:00.000Z',
      driverShare: 60,
      companyShare: 40,
      driverSpend: 0,
      netPay: -60,
    };

    const monthStart = new Date('2026-07-01T00:00:00');
    const monthEnd = new Date('2026-07-31T23:59:59');

    const r = getFuelDeductionForPeriod([weeklyReport, secondWeekReport], monthStart, monthEnd, 'monthly');

    expect(r.finalized).toBe(true);
    expect(r.deduction).toBe(200);
    expect(r.fleetShare).toBe(100);
    expect(r.driverSpend).toBe(100);
    expect(r.netPay).toBe(-100);
  });

  it('tolerates a missing/empty finalizedReports array', () => {
    const r = getFuelDeductionForPeriod([], new Date(), new Date(), 'weekly');
    expect(r.finalized).toBe(false);
    expect(r.deduction).toBe(0);
  });
});
