import { describe, expect, it } from 'vitest';
import { groupFuelEntriesByFillGroup } from './groupFuelEntriesByFillGroup';
import type { FuelEntry } from '../../../types/fuel';

function entry(partial: Partial<FuelEntry> & { id: string }): FuelEntry {
  return {
    date: '2026-09-18',
    amount: 0,
    ...partial,
  } as FuelEntry;
}

describe('groupFuelEntriesByFillGroup', () => {
  it('keeps ungroupeed entries as singles', () => {
    const rows = groupFuelEntriesByFillGroup([
      entry({ id: 'a', amount: 100 }),
      entry({ id: 'b', amount: 200 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === 'single')).toBe(true);
  });

  it('collapses matching fillGroupId into one split row', () => {
    const rows = groupFuelEntriesByFillGroup([
      entry({
        id: 'cash',
        amount: 1500,
        metadata: {
          fillGroupId: 'fg1',
          splitRole: 'cash',
          splitPumpTotal: 5000,
          splitVolumeOwner: true,
        },
      }),
      entry({
        id: 'card',
        amount: 3500,
        metadata: {
          fillGroupId: 'fg1',
          splitRole: 'card',
          splitPumpTotal: 5000,
          splitVolumeOwner: false,
        },
      }),
      entry({ id: 'other', amount: 99 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe('split');
    if (rows[0].kind === 'split') {
      expect(rows[0].entries).toHaveLength(2);
      expect(rows[0].pumpTotal).toBe(5000);
    }
    expect(rows[1].kind).toBe('single');
  });
});
