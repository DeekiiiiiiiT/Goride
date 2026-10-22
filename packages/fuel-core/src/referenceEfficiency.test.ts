import { describe, expect, it } from 'vitest';
import type { FuelEntry } from './fuelTypes.ts';
import { referenceFillsFromEntries } from './referenceFills.ts';
import { referenceEfficiencyFromFills } from './referenceEfficiency.ts';

describe('reference efficiency', () => {
  it('counts every litre between two full tanks, not only the full fills', () => {
    const result = referenceEfficiencyFromFills(
      [
        { date: '2026-07-01', odometer: 1000, liters: 40, fullTank: true },
        { date: '2026-07-08', odometer: 1200, liters: 20, fullTank: false },
        { date: '2026-07-15', odometer: 1500, liters: 30, fullTank: true },
        { date: '2026-07-22', odometer: 1800, liters: 25, fullTank: true },
      ],
      '2026-08-01',
    );
    // Three full flags are not enough, and none of them have in-band tank use.
    expect(result.kmPerLiter).toBeCloseTo(800 / 75, 5);
    expect(result.degraded).toBe(false);
    expect(result.reason).toBe('fill_chain');
  });

  it('uses a full-tank chain only when four fills are full and tank use is in band', () => {
    const result = referenceEfficiencyFromFills(
      [
        { date: '2026-07-01', odometer: 1000, liters: 40, fullTank: true, tankUsePct: 98 },
        { date: '2026-07-08', odometer: 1400, liters: 20, fullTank: false, tankUsePct: 50 },
        { date: '2026-07-15', odometer: 1700, liters: 35, fullTank: true, tankUsePct: 90 },
        { date: '2026-07-22', odometer: 2100, liters: 38, fullTank: true, tankUsePct: 105 },
        { date: '2026-07-29', odometer: 2500, liters: 36, fullTank: true, tankUsePct: 100 },
        { date: '2026-08-05', odometer: 3000, liters: 40, fullTank: true, tankUsePct: 162 },
      ],
      '2026-08-10',
    );
    expect(result.reason).toBe('full_tank_chain');
    expect(result.degraded).toBe(false);
    expect(result.kmPerLiter).toBeCloseTo(1500 / 129, 5);
  });

  it('ignores a full-tank flag when tank use is missing or above 110', () => {
    const result = referenceEfficiencyFromFills(
      [
        { date: '2026-07-01', odometer: 1000, liters: 40, fullTank: true, tankUsePct: 162 },
        { date: '2026-07-08', odometer: 1200, liters: 20, fullTank: true },
        { date: '2026-07-15', odometer: 1500, liters: 30, fullTank: true, tankUsePct: 90 },
        { date: '2026-07-22', odometer: 1800, liters: 25, fullTank: true, tankUsePct: 100 },
      ],
      '2026-08-01',
    );
    expect(result.reason).toBe('fill_chain');
    expect(result.kmPerLiter).toBeCloseTo(800 / 75, 5);
  });

  it('does not price an economy outside 4–40 km/L', () => {
    const result = referenceEfficiencyFromFills(
      [
        { date: '2026-07-01', odometer: 1000, liters: 10, fullTank: true },
        { date: '2026-08-01', odometer: 6000, liters: 10, fullTank: true },
      ],
      '2026-09-01',
    );
    expect(result.degraded).toBe(true);
    expect(result.kmPerLiter).toBeNull();
    expect(result.reason).toBe('reference_out_of_band');
  });

  it('pairs a card twin once and drops an implausible fill', () => {
    const manual = {
      id: 'm1',
      date: '2026-07-01',
      vehicleId: 'v1',
      amount: 8000,
      liters: 40,
      odometer: 1000,
      type: 'Fuel_Manual_Entry',
      paymentSource: 'Gas_Card',
      metadata: { isFullTank: true, jaaMatchedDriverEntryId: 'c1' },
    } as FuelEntry;
    const card = {
      id: 'c1',
      date: '2026-07-01',
      vehicleId: 'v1',
      amount: 8000,
      liters: 40,
      odometer: 1000,
      type: 'Card_Transaction',
      paymentSource: 'Gas_Card',
      metadata: { jaaMatchedDriverEntryId: 'm1' },
    } as FuelEntry;
    const overTank = {
      id: 'bad',
      date: '2026-07-08',
      vehicleId: 'v1',
      amount: 16000,
      liters: 80,
      odometer: 1300,
      type: 'Fuel_Manual_Entry',
      paymentSource: 'Personal',
    } as FuelEntry;
    const later = {
      id: 'm2',
      date: '2026-07-22',
      vehicleId: 'v1',
      amount: 7000,
      liters: 35,
      odometer: 1600,
      type: 'Fuel_Manual_Entry',
      paymentSource: 'Personal',
      metadata: { isFullTank: true },
    } as FuelEntry;
    const fills = referenceFillsFromEntries([manual, card, overTank, later], {
      tankCapacityLiters: 45,
    });
    const counted = fills.filter((fill) => !fill.exclude);
    expect(counted).toHaveLength(2);
    expect(counted.reduce((sum, fill) => sum + (fill.liters || 0), 0)).toBe(75);
    expect(fills.find((fill) => fill.odometer === 1300)?.exclude).toBe(true);
  });

  it('keeps litres from a repeated odometer and an odd price', () => {
    const entry = (
      id: string,
      date: string,
      odometer: number,
      liters: number,
      amount: number,
      fullTank = false,
    ): FuelEntry => ({
      id,
      date,
      vehicleId: 'v1',
      amount,
      liters,
      odometer,
      type: 'Fuel_Manual_Entry',
      paymentSource: 'Gas_Card',
      metadata: fullTank ? { isFullTank: true } : undefined,
    } as FuelEntry);
    const fills = referenceFillsFromEntries(
      [
        entry('a', '2026-06-01', 1000, 40, 8000, true),
        entry('b', '2026-06-15', 1400, 18, 3600),
        entry('c', '2026-06-15', 1400, 12, 2400),
        entry('d', '2026-07-06', 1800, 10, 5000),
        entry('e', '2026-07-13', 2000, 80, 16000),
        entry('f', '2026-07-20', 2600, 30, 6000, true),
      ],
      { tankCapacityLiters: 45 },
    );
    expect(fills.find((fill) => fill.liters === 12)?.exclude).toBe(false);
    expect(fills.find((fill) => fill.liters === 10)?.exclude).toBe(false);
    expect(fills.find((fill) => fill.liters === 80)?.exclude).toBe(true);
    const result = referenceEfficiencyFromFills(fills, '2026-08-01');
    // 1,600 km over the 18 + 12 + 10 + 30 L that were really burned.
    expect(result.kmPerLiter).toBeCloseTo(1600 / 70, 5);
    expect(result.degraded).toBe(false);
  });
});
