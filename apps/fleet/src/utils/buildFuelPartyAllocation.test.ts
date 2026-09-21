import { describe, expect, it } from 'vitest';
import { buildFuelPartyAllocation } from './buildFuelPartyAllocation';
import type { WeeklyFuelReport } from '../types/fuel';
import { FUEL_SPEND_EPS } from './fuelMoneyEpsilon';

describe('buildFuelPartyAllocation', () => {
  it('splits ride share to company and personal to driver under Full fallback', () => {
    const reports = [
      {
        id: 'r1',
        weekStart: '2026-09-07',
        weekEnd: '2026-09-13',
        vehicleId: 'v1',
        driverId: 'd1',
        totalGasCardCost: 1000,
        rideShareCost: 600,
        companyUsageCost: 0,
        deadheadCost: 0,
        personalUsageCost: 400,
        miscellaneousCost: 0,
        windowTimingCost: 0,
        unattributedFillCost: 0,
        companyShare: 600,
        driverShare: 400,
        totalTripDistance: 0,
        companyMiscDistance: 0,
        personalDistance: 0,
        deadheadDistance: 0,
        status: 'Draft',
      },
    ] as WeeklyFuelReport[];

    const driver = buildFuelPartyAllocation(reports, [], 'driver');
    const company = buildFuelPartyAllocation(reports, [], 'company');

    expect(driver.lines.find((l) => l.key === 'personal')?.amount).toBe(400);
    expect(company.lines.find((l) => l.key === 'rideShare')?.amount).toBe(600);
    expect(Math.abs(driver.total + company.total - 1000)).toBeLessThan(0.02);
  });

  it('assigns window timing to company only', () => {
    const reports = [
      {
        id: 'r1',
        weekStart: '2026-09-07',
        weekEnd: '2026-09-13',
        vehicleId: 'v1',
        driverId: 'd1',
        totalGasCardCost: 110,
        rideShareCost: 100,
        companyUsageCost: 0,
        deadheadCost: 0,
        personalUsageCost: 0,
        miscellaneousCost: 0,
        windowTimingCost: 10,
        unattributedFillCost: 0,
        companyShare: 110,
        driverShare: 0,
        totalTripDistance: 0,
        companyMiscDistance: 0,
        personalDistance: 0,
        deadheadDistance: 0,
        status: 'Draft',
      },
    ] as WeeklyFuelReport[];

    const driver = buildFuelPartyAllocation(reports, [], 'driver');
    const company = buildFuelPartyAllocation(reports, [], 'company');
    expect(driver.lines.find((l) => l.key === 'windowTiming')).toBeUndefined();
    expect(company.lines.find((l) => l.key === 'windowTiming')?.amount).toBe(10);
  });

  it('ties lines to frozen shares under Personal Allowance full absorb', () => {
    // Measured personal fully absorbed; overage $0; lines must reconstruct frozen shares.
    const personalMeasured = 180.6;
    const rideShare = 2597.64;
    const deadhead = 34.08;
    const totalSpend = 30300;
    const miscellaneousCost = totalSpend - rideShare - deadhead - personalMeasured;
    const reports = [
      {
        id: 'r-pa',
        weekStart: '2026-09-07',
        weekEnd: '2026-09-13',
        vehicleId: 'v1',
        driverId: 'd1',
        totalGasCardCost: totalSpend,
        rideShareCost: rideShare,
        companyUsageCost: 0,
        deadheadCost: deadhead,
        personalUsageCost: personalMeasured,
        miscellaneousCost,
        windowTimingCost: 0,
        unattributedFillCost: 0,
        // Full coverage: RS/DH/misc → company; personal overage → driver ($0); PA → company
        driverShare: 0,
        companyShare: totalSpend,
        totalTripDistance: 0,
        companyMiscDistance: 0,
        personalDistance: 12,
        deadheadDistance: 0,
        status: 'Draft',
        metadata: {
          personalAllowance: {
            quotaPct: 80,
            weeklyEarnings: 80000,
            weeklyQuota: 100000,
            earnedKm: 12,
            overageKm: 0,
            earnedCost: personalMeasured,
            overageCost: 0,
            hitTopBand: false,
          },
        },
      },
    ] as WeeklyFuelReport[];

    const driver = buildFuelPartyAllocation(reports, [], 'driver');
    const company = buildFuelPartyAllocation(reports, [], 'company');

    expect(driver.lines.find((l) => l.key === 'personal')?.amount).toBe(0);
    expect(company.lines.find((l) => l.key === 'personalAllowance')?.amount).toBe(
      personalMeasured,
    );
    expect(Math.abs(driver.total - reports[0].driverShare)).toBeLessThanOrEqual(FUEL_SPEND_EPS);
    expect(Math.abs(company.total - reports[0].companyShare)).toBeLessThanOrEqual(FUEL_SPEND_EPS);
  });

  it('includes zero-spend reports that still carry frozen shares', () => {
    const reports = [
      {
        id: 'r-zero',
        weekStart: '2026-09-07',
        weekEnd: '2026-09-13',
        vehicleId: 'v2',
        driverId: 'd1',
        totalGasCardCost: 0,
        rideShareCost: 0,
        companyUsageCost: 0,
        deadheadCost: 0,
        personalUsageCost: 50,
        miscellaneousCost: 0,
        windowTimingCost: 0,
        unattributedFillCost: 0,
        companyShare: 0,
        driverShare: 50,
        totalTripDistance: 0,
        companyMiscDistance: 0,
        personalDistance: 0,
        deadheadDistance: 0,
        status: 'Draft',
        metadata: {
          personalAllowance: {
            quotaPct: 0,
            weeklyEarnings: 0,
            weeklyQuota: 100000,
            earnedKm: 0,
            overageKm: 5,
            earnedCost: 0,
            overageCost: 50,
            hitTopBand: false,
          },
        },
      },
    ] as WeeklyFuelReport[];

    const driver = buildFuelPartyAllocation(reports, [], 'driver');
    expect(driver.lines.find((l) => l.key === 'personal')?.amount).toBe(50);
    expect(Math.abs(driver.total - 50)).toBeLessThanOrEqual(FUEL_SPEND_EPS);
  });
});
