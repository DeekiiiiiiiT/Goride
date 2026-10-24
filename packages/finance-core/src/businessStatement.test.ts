import { describe, expect, it } from 'vitest';
import {
  amortisedPrepaid,
  expectedBankWeekKey,
  fuelCardUploadKey,
  fuelLedgerDrift,
  statementFooting,
  uberEarningsTie,
  uberWeekNeedsStatement,
} from './businessStatement.ts';

describe('business statement', () => {
  it('foots money in minus money out to operating profit', () => {
    const foot = statementFooting({
      gross: 100,
      platformFees: 10,
      driverCommission: 20,
      fleetFuelCost: 5,
      tolls: 1,
      maintenance: 2,
      fixedCosts: 3,
      otherOperating: 4,
      otherIncome: 6,
      cashWriteOff: 1,
      operatingProfit: 60,
    });
    expect(foot.ok).toBe(true);
    expect(foot.difference).toBe(0);
  });

  it('spreads a year of insurance across the days it covers', () => {
    const week = amortisedPrepaid({
      premium: 120504.08,
      coverStart: '2026-10-15',
      coverEnd: '2027-10-14',
      periodStart: '2026-10-12',
      periodEnd: '2026-10-18',
    });
    expect(week).toBeGreaterThan(1000);
    expect(week).toBeLessThan(4000);
  });

  it('treats the same card upload as one fill', () => {
    const a = fuelCardUploadKey({ cardId: 'card', date: '2026-10-17', amount: 4000, uploadId: 'up1' });
    const b = fuelCardUploadKey({ cardId: 'card', date: '2026-10-17', amount: 4000, uploadId: 'up1' });
    const c = fuelCardUploadKey({ cardId: 'card', date: '2026-10-17', amount: 1500, uploadId: 'up1' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    const first = fuelCardUploadKey({ cardId: 'card', date: '2026-10-17', amount: 4000, uploadId: 'up1', litres: 40 });
    const second = fuelCardUploadKey({ cardId: 'card', date: '2026-10-17', amount: 4000, uploadId: 'up1', litres: 41 });
    expect(first).not.toBe(second);
  });

  it('dates a stamped payout to its own week, not the import day', () => {
    expect(
      expectedBankWeekKey({
        date: '2026-10-12',
        metadata: { weekKey: '2026-10-05' },
      }),
    ).toBe('2026-10-05');
  });

  it('lists fuel weeks that do not match the fuel records', () => {
    expect(
      fuelLedgerDrift([
        { week: '2026-10-12', ledger: 21000, records: 19000 },
        { week: '2026-10-05', ledger: 1000, records: 1000 },
      ]),
    ).toEqual([{ week: '2026-10-12', ledger: 21000, records: 19000, difference: 2000 }]);
  });

  it('does not hold a week once its Uber statement has been checked', () => {
    expect(uberWeekNeedsStatement('2026-08-03')).toBe(false);
    expect(uberWeekNeedsStatement('2026-08-24')).toBe(false);
    expect(uberWeekNeedsStatement('2026-10-12')).toBe(false);
    expect(uberEarningsTie({ ledgerUber: 1, uberTotal: 2, weekStart: '2026-08-03' }).held).toBe(false);
  });
});
