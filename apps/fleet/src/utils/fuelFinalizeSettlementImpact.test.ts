import { describe, expect, it } from 'vitest';
import {
  aggregateProposedFuelByDriverWeek,
  estimateResidualAfterProposedFuel,
  impactFromPeriodAndProposedFuel,
  residualBalanceLabel,
} from './fuelFinalizeSettlementImpact';

const basePeriod = {
  periodAnchor: '2026-08-10',
  driverShare: 31239.15,
  fuelDeduction: 1000,
  fuelFleetShare: 10000,
  cashCollected: 49264.39,
  cashReturned: 0,
  cashWrittenOff: 0,
  tollCashSpend: 0,
  tollChargedToDriver: 0,
  settlementPaid: 4811.9,
  settlementAmount: 0,
};

describe('fuelFinalizeSettlementImpact', () => {
  it('labels residual direction for ops', () => {
    expect(residualBalanceLabel(3525.24)).toContain('Fleet owes');
    expect(residualBalanceLabel(-200)).toContain('Driver owes');
    expect(residualBalanceLabel(0)).toContain('Settled');
  });

  it('flags paid week when higher fuel credits reopen fleet-owes residual', () => {
    // Low fuel credits → more cash held → settlement near 0 after payouts
    const before = estimateResidualAfterProposedFuel(basePeriod, {
      fuelDeduction: 1000,
      fuelFleetShare: 10000,
    });
    const after = estimateResidualAfterProposedFuel(basePeriod, {
      fuelDeduction: 4398.21,
      fuelFleetShare: 30600.59,
    });
    expect(after).toBeGreaterThan(before + 0.01);

    const impact = impactFromPeriodAndProposedFuel(
      { ...basePeriod, settlementAmount: before },
      { fuelDeduction: 4398.21, fuelFleetShare: 30600.59 },
      'driver-1',
    );
    expect(impact).not.toBeNull();
    expect(impact!.settlementPaid).toBe(4811.9);
    expect(impact!.afterResidual).toBeGreaterThan(impact!.beforeResidual);
    expect(impact!.afterLabel).toContain('Fleet owes');
  });

  it('does not flag unpaid weeks', () => {
    const impact = impactFromPeriodAndProposedFuel(
      { ...basePeriod, settlementPaid: 0, settlementAmount: 100 },
      { fuelDeduction: 4398.21, fuelFleetShare: 30600.59 },
      'driver-1',
    );
    expect(impact).toBeNull();
  });

  it('does not flag when residual is unchanged', () => {
    const residual = estimateResidualAfterProposedFuel(basePeriod, {
      fuelDeduction: basePeriod.fuelDeduction,
      fuelFleetShare: basePeriod.fuelFleetShare,
    });
    const impact = impactFromPeriodAndProposedFuel(
      { ...basePeriod, settlementAmount: residual },
      {
        fuelDeduction: basePeriod.fuelDeduction,
        fuelFleetShare: basePeriod.fuelFleetShare,
      },
      'driver-1',
    );
    expect(impact).toBeNull();
  });

  it('aggregates multi-vehicle reports for one driver-week', () => {
    const map = aggregateProposedFuelByDriverWeek([
      {
        driverId: 'd1',
        weekStart: '2026-08-10',
        driverShare: 100,
        companyShare: 200,
      },
      {
        driverId: 'd1',
        weekStart: '2026-08-10',
        driverShare: 50,
        companyShare: 75,
      },
    ]);
    const row = map.get('d1|2026-08-10');
    expect(row?.fuelDeduction).toBe(150);
    expect(row?.fuelFleetShare).toBe(275);
  });
});
