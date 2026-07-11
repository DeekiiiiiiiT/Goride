import { describe, it, expect } from 'vitest';
import { isDriverTollChargeRow, netDriverTollCharges } from './netDriverTollCharges';

describe('isDriverTollChargeRow', () => {
  it('matches Toll Charge category and charge/reversal projections', () => {
    expect(isDriverTollChargeRow({ category: 'Toll Charge', amount: -10 })).toBe(true);
    expect(
      isDriverTollChargeRow({
        category: 'Toll Charge',
        metadata: { projection: 'driver_toll_charge' },
        amount: -285,
      }),
    ).toBe(true);
    expect(
      isDriverTollChargeRow({
        category: 'Toll Charge',
        metadata: { projection: 'driver_toll_charge_reversal' },
        amount: 285,
      }),
    ).toBe(true);
    expect(isDriverTollChargeRow({ category: 'Toll Usage', amount: -285 })).toBe(false);
  });
});

describe('netDriverTollCharges', () => {
  it('nets charge then reversal to zero', () => {
    expect(
      netDriverTollCharges([
        { category: 'Toll Charge', metadata: { projection: 'driver_toll_charge' }, amount: -380 },
        {
          category: 'Toll Charge',
          metadata: { projection: 'driver_toll_charge_reversal' },
          amount: 380,
        },
      ]),
    ).toBe(0);
  });

  it('sums multiple unreverted charges', () => {
    expect(
      netDriverTollCharges([
        { category: 'Toll Charge', metadata: { projection: 'driver_toll_charge' }, amount: -285 },
        { category: 'Toll Charge', metadata: { projection: 'driver_toll_charge' }, amount: -10 },
      ]),
    ).toBe(295);
  });

  it('does not inflate by Math.abs on reversals', () => {
    // Abs-sum would be 760; correct net is 0.
    const rows = [
      { category: 'Toll Charge', amount: -380 },
      { category: 'Toll Charge', amount: 380 },
    ];
    expect(netDriverTollCharges(rows)).toBe(0);
  });
});
