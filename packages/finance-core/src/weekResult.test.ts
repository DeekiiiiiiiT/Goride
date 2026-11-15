import { describe, expect, it } from 'vitest';
import { computeWeekResult, type WeekStatementRow } from './weekResult.ts';

const KENNY = 'kenny';

// Real closed statements, week of 28 Sep 2026 (one driver).
const week28Sep: WeekStatementRow[] = [
  { kind: 'earnings', driverId: KENNY, version: 50, amountsMinor: { gross: 9202120, driverShare: 3212342, companyShare: 5989778, passengerCash: 4079160, tipsPaidToDriver: 0 } },
  { kind: 'fuel', driverId: KENNY, version: 1, amountsMinor: { totalSpend: 2800000, driverShare: 275669, companyShare: 2524331 } },
  { kind: 'toll', driverId: KENNY, version: 1, amountsMinor: { totalSpend: 175500, reimbursed: 175500, chargedToDriver: 0, netLoss: 0 } },
  { kind: 'settlement', driverId: KENNY, version: 1, amountsMinor: { settlementPaid: 157513, settlementAmount: 0 } },
];

describe('computeWeekResult', () => {
  it('28 Sep: Revenue 92,021.20 − Expenses 28,000 = Profit 64,021.20; Fleet 34,654.47 + Driver 29,366.73', () => {
    const r = computeWeekResult(week28Sep);
    expect(r.revenueMinor).toBe(9202120);
    expect(r.expensesMinor).toBe(2800000);
    expect(r.tollsMinor).toBe(0);
    expect(r.profitMinor).toBe(6402120);
    expect(r.driverProfitMinor).toBe(2936673);
    expect(r.fleetProfitMinor).toBe(3465447);
    expect(r.marginPercent).toBe(70);
    expect(r.fleetSharePercent).toBe(54);
    expect(r.driverSharePercent).toBe(46);
    expect(r.driverCount).toBe(1);
  });

  it('21 Sep: tips paid to the driver and a toll charged to the driver count in driver profit', () => {
    const r = computeWeekResult([
      { kind: 'earnings', driverId: KENNY, version: 61, amountsMinor: { gross: 10298843, driverShare: 3388718, tipsPaidToDriver: 30000 } },
      { kind: 'fuel', driverId: KENNY, version: 2, amountsMinor: { totalSpend: 3100000, driverShare: 328197 } },
      { kind: 'toll', driverId: KENNY, version: 1, amountsMinor: { totalSpend: 359500, reimbursed: 332000, chargedToDriver: 27500 } },
    ]);
    expect(r.expensesMinor).toBe(3100000 + 27500);
    expect(r.driverProfitMinor).toBe(3388718 + 30000 - 328197 - 27500);
    expect(r.fleetProfitMinor + r.driverProfitMinor).toBe(r.profitMinor);
  });

  it('adds up every driver and uses only the latest statement per driver and kind', () => {
    const r = computeWeekResult([
      ...week28Sep,
      { kind: 'earnings', driverId: KENNY, version: 49, amountsMinor: { gross: 1, driverShare: 1 } },
      { kind: 'earnings', driverId: 'b', version: 1, amountsMinor: { gross: 1000000, driverShare: 300000 } },
      { kind: 'fuel', driverId: 'b', version: 1, amountsMinor: { totalSpend: 200000, driverShare: 20000 } },
    ]);
    expect(r.driverCount).toBe(2);
    expect(r.revenueMinor).toBe(9202120 + 1000000);
    expect(r.driverProfitMinor).toBe(2936673 + 280000);
    expect(r.fleetProfitMinor + r.driverProfitMinor).toBe(r.profitMinor);
  });

  it('a loss week has no share percents', () => {
    const r = computeWeekResult([
      { kind: 'earnings', driverId: KENNY, version: 1, amountsMinor: { gross: 4000000, driverShare: 1240000 } },
      { kind: 'fuel', driverId: KENNY, version: 1, amountsMinor: { totalSpend: 4550000, driverShare: 0 } },
    ]);
    expect(r.profitMinor).toBe(-550000);
    expect(r.driverProfitMinor).toBe(1240000);
    expect(r.fleetProfitMinor).toBe(-1790000);
    expect(r.fleetSharePercent).toBeNull();
    expect(r.driverSharePercent).toBeNull();
  });

  it('an empty week is all zeros with no margin', () => {
    const r = computeWeekResult([]);
    expect(r.revenueMinor).toBe(0);
    expect(r.marginPercent).toBeNull();
    expect(r.driverCount).toBe(0);
  });
});
