import { describe, expect, it } from 'vitest';
import {
  fuelOpsSpendAmount,
  fuelPriceLiters,
  fuelTankLiters,
  fuelOpsLiters,
} from './fuelOpsEligibility';
import type { FuelEntry } from './fuelTypes';

function entry(partial: Partial<FuelEntry> & { id: string }): FuelEntry {
  return {
    date: '2026-09-15',
    amount: 0,
    liters: 40,
    paymentSource: 'Cash',
    ...partial,
  } as FuelEntry;
}

describe('fuelTankLiters vs fuelPriceLiters (M1)', () => {
  it('awaiting cash volume-owner: tank liters count, price liters and spend do not', () => {
    const e = entry({
      id: 'cash-await',
      amount: 0,
      liters: 40,
      metadata: {
        fillGroupId: 'fg-1',
        splitRole: 'cash',
        splitVolumeOwner: true,
        awaitingCashStatement: true,
        splitPumpTotal: 5400,
      },
    });
    expect(fuelTankLiters(e)).toBe(40);
    expect(fuelPriceLiters(e)).toBe(0);
    expect(fuelOpsLiters(e)).toBe(0);
    expect(fuelOpsSpendAmount(e)).toBe(0);
  });

  it('after reconcile: tank and price liters align with spend', () => {
    const e = entry({
      id: 'cash-done',
      amount: 2400,
      liters: 40,
      metadata: {
        fillGroupId: 'fg-1',
        splitRole: 'cash',
        splitVolumeOwner: true,
        awaitingCashStatement: false,
        splitReconciled: true,
      },
    });
    expect(fuelTankLiters(e)).toBe(40);
    expect(fuelPriceLiters(e)).toBe(40);
    expect(fuelOpsSpendAmount(e)).toBe(2400);
  });
});
