import { describe, expect, it } from 'vitest';
import { aggregateFinalizedForWeek } from './fuelPeriodAggregates';

describe('aggregateFinalizedForWeek (NEW-5)', () => {
  it('splits gas card vs cash when snapshot fields exist', () => {
    const money = aggregateFinalizedForWeek([
      {
        totalGasCardCost: 1000,
        gasCardSpend: 700,
        driverSpend: 300,
        companyShare: 400,
        driverShare: 600,
        miscellaneousCost: 50,
        vehicleId: 'v1',
        driverId: 'd1',
      },
    ]);
    expect(money.total_spend).toBe(1000);
    expect(money.gas_card_spend).toBe(700);
    expect(money.cash_from_earnings).toBe(300);
    expect(money.gas_card_spend).not.toBe(money.total_spend);
  });

  it('does not permanently force cash_from_earnings=0 when driverSpend present', () => {
    const money = aggregateFinalizedForWeek([
      { totalGasCardCost: 500, gasCardSpend: 200, driverSpend: 300, companyShare: 0, driverShare: 0 },
    ]);
    expect(money.cash_from_earnings).toBe(300);
  });
});
