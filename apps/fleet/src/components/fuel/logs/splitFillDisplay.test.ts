import { describe, expect, it } from 'vitest';
import { groupFuelEntriesByFillGroup } from './groupFuelEntriesByFillGroup';
import {
  buildSplitBreakdown,
  cardDisplayAmount,
  splitEntriesHaveMismatch,
  splitRowLiters,
} from './splitFillDisplay';
import type { FuelEntry } from '../../../types/fuel';

function entry(partial: Partial<FuelEntry> & { id: string }): FuelEntry {
  return {
    date: '2026-09-18',
    amount: 0,
    ...partial,
  } as FuelEntry;
}

describe('splitFillDisplay', () => {
  const cash = entry({
    id: 'cash',
    amount: 1500,
    liters: 40,
    metadata: {
      fillGroupId: 'fg1',
      splitRole: 'cash',
      splitPumpTotal: 5000,
      splitVolumeOwner: true,
    },
  });
  const card = entry({
    id: 'card',
    amount: 0,
    liters: 0,
    metadata: {
      fillGroupId: 'fg1',
      splitRole: 'card',
      splitPumpTotal: 5000,
      splitVolumeOwner: false,
      splitExpectedCardAmount: 3500,
      splitStatementAmount: 3600,
      splitVariance: true,
      splitVarianceDelta: 100,
    },
  });

  it('uses pump total and volume-owner liters for a split display row', () => {
    const rows = groupFuelEntriesByFillGroup([cash, card]);
    expect(rows[0].kind).toBe('split');
    if (rows[0].kind === 'split') {
      expect(rows[0].pumpTotal).toBe(5000);
      expect(splitRowLiters(rows[0])).toBe(40);
      expect(splitEntriesHaveMismatch(rows[0].entries)).toBe(true);
    }
  });

  it('prefers statement amount for card display', () => {
    expect(cardDisplayAmount(card)).toBe(3600);
  });

  it('builds ops breakdown with cash / card / delta', () => {
    const b = buildSplitBreakdown([cash, card]);
    expect(b?.pumpTotal).toBe(5000);
    expect(b?.cashAmount).toBe(1500);
    expect(b?.statementAmount).toBe(3600);
    expect(b?.hasMismatch).toBe(true);
    expect(b?.varianceDelta).toBe(100);
  });

  it('treats reconciled variance as not a mismatch', () => {
    const reconciled = entry({
      ...card,
      metadata: { ...card.metadata, splitReconciled: true },
    });
    expect(splitEntriesHaveMismatch([cash, reconciled])).toBe(false);
  });
});
