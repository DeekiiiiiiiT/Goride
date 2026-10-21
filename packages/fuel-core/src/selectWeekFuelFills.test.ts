import { describe, expect, it } from 'vitest';
import { selectWeekFuelFills, sumWeekFuelFills } from './selectWeekFuelFills';
import type { FuelEntry } from './fuelTypes';

function fill(partial: Partial<FuelEntry> & Pick<FuelEntry, 'id' | 'type' | 'amount'>): FuelEntry {
  return {
    vehicleId: 'v1',
    driverId: 'd1',
    date: '2026-10-13',
    liters: 40,
    odometer: 191441,
    ...partial,
  } as FuelEntry;
}

describe('selectWeekFuelFills', () => {
  it('keeps one row when a gas-card fill is stored as manual and card', () => {
    const fills = selectWeekFuelFills([
      fill({ id: 'manual-1', type: 'Manual_Entry', amount: 6000, paymentSource: 'company_card' as never }),
      fill({ id: 'card-1', type: 'Card_Transaction', amount: 6000 }),
      fill({ id: 'cash-1', type: 'Manual_Entry', amount: 4000, odometer: 192000, paymentSource: 'cash' as never }),
    ]);
    expect(fills).toHaveLength(2);
    expect(fills[0].cardTxId).toBe('card-1');
    expect(fills[0].manualEntryId).toBe('manual-1');
    expect(sumWeekFuelFills(fills).totalSpend).toBe(10000);
    expect(sumWeekFuelFills(fills).gasCard).toBe(6000);
    expect(sumWeekFuelFills(fills).cash).toBe(4000);
  });
});
