import { describe, expect, it } from 'vitest';
import {
  isUnlinkedCardCharge,
  countUnlinkedCardCharges,
  computeGasCardStatementDriftSummary,
  gasCardStatementDriftBlocks,
  isOrphanOpsGasCardSpend,
} from './jaaUnlinkedCardCharge';

describe('jaaUnlinkedCardCharge', () => {
  const unmatched = {
    id: 'stmt-1',
    amount: 4000,
    cardId: 'card-a',
    entrySource: 'fuel-card',
    metadata: {
      importSource: 'jaa_raw',
      jaaRowKind: 'approved_fuel',
      countsInFuelSpend: true,
    },
  };

  it('detects unmatched approved_fuel statement rows', () => {
    expect(isUnlinkedCardCharge(unmatched)).toBe(true);
  });

  it('excludes matched, dismissed, fee, and ops rows', () => {
    expect(
      isUnlinkedCardCharge({
        ...unmatched,
        metadata: { ...unmatched.metadata, jaaMatchedDriverEntryId: 'log-1' },
      }),
    ).toBe(false);
    expect(
      isUnlinkedCardCharge({
        ...unmatched,
        metadata: { ...unmatched.metadata, adoptionDismissedAt: '2026-09-25T00:00:00Z' },
      }),
    ).toBe(false);
    expect(
      isUnlinkedCardCharge({
        ...unmatched,
        metadata: { ...unmatched.metadata, jaaRowKind: 'fee' },
      }),
    ).toBe(false);
    expect(
      isUnlinkedCardCharge({
        id: 'log-1',
        amount: 4000,
        entrySource: 'driver-portal',
        metadata: { countsInFuelSpend: true },
      }),
    ).toBe(false);
  });

  it('computes statement vs ops drift per card', () => {
    const summary = computeGasCardStatementDriftSummary([
      unmatched,
      {
        id: 'stmt-matched',
        amount: 5343.7,
        cardId: 'card-a',
        entrySource: 'fuel-card',
        metadata: {
          importSource: 'jaa_raw',
          jaaRowKind: 'approved_fuel',
          countsInFuelSpend: true,
          jaaMatchedDriverEntryId: 'log-m',
        },
      },
      {
        id: 'log-m',
        amount: 5343.7,
        cardId: 'card-a',
        paymentSource: 'Gas_Card',
        entrySource: 'driver-portal',
        metadata: { countsInFuelSpend: true, jaaMatchedStatementId: 'stmt-matched' },
      },
    ] as any);
    expect(summary.statementFuelTotal).toBeCloseTo(9343.7, 5);
    expect(summary.opsGasCardTotal).toBeCloseTo(5343.7, 5);
    expect(summary.unlinkedTotal).toBeCloseTo(4000, 5);
    expect(summary.drift).toBeCloseTo(4000, 5);
    expect(summary.unlinkedCount).toBe(1);
    expect(summary.unlinkedEntryIds).toEqual(['stmt-1']);
    expect(gasCardStatementDriftBlocks(summary)).toBe(true);
    expect(countUnlinkedCardCharges([unmatched])).toBe(1);
  });

  // V3: a matched pair is reconciled — neither half creates drift when the week scope splits it.
  const straddleStatement = {
    id: 'stmt-sun',
    date: '2026-09-20T23:50:00',
    amount: 4000,
    cardId: 'card-a',
    entrySource: 'fuel-card',
    metadata: {
      importSource: 'jaa_raw',
      jaaRowKind: 'approved_fuel',
      countsInFuelSpend: true,
      jaaMatchedDriverEntryId: 'log-mon',
    },
  };
  const straddleOps = {
    id: 'log-mon',
    date: '2026-09-21T00:10:00',
    amount: 4000,
    cardId: 'card-a',
    paymentSource: 'Gas_Card',
    entrySource: 'driver-portal',
    metadata: { countsInFuelSpend: true, jaaMatchedStatementId: 'stmt-sun' },
  };

  it('V3a: matched statement in scope, its ops row in the next week → no drift, no block', () => {
    const summary = computeGasCardStatementDriftSummary([straddleStatement]);
    expect(summary.drift).toBe(0);
    expect(summary.unlinkedCount).toBe(0);
    expect(summary.orphanOpsCount).toBe(0);
    expect(gasCardStatementDriftBlocks(summary)).toBe(false);
  });

  it('V3a: matched ops row in scope, its statement in the prior week → no drift, no block', () => {
    const summary = computeGasCardStatementDriftSummary([straddleOps]);
    expect(summary.drift).toBe(0);
    expect(summary.orphanOpsCount).toBe(0);
    expect(gasCardStatementDriftBlocks(summary)).toBe(false);
  });

  it('V3b: gas-card ops money with no statement → orphan, named by id, blocks', () => {
    const summary = computeGasCardStatementDriftSummary([
      {
        id: 'log-orphan',
        amount: 2500,
        cardId: 'card-a',
        paymentSource: 'Gas_Card',
        entrySource: 'admin-manual',
        metadata: { countsInFuelSpend: true },
      },
    ]);
    expect(summary.drift).toBeCloseTo(-2500, 5);
    expect(summary.orphanOpsCount).toBe(1);
    expect(summary.orphanOpsEntryIds).toEqual(['log-orphan']);
    expect(isOrphanOpsGasCardSpend({
      id: 'log-orphan',
      amount: 2500,
      paymentSource: 'Gas_Card',
      metadata: { countsInFuelSpend: true },
    })).toBe(true);
    expect(gasCardStatementDriftBlocks(summary)).toBe(true);
  });

  it('awaiting-statement anchors ($0) are not orphans', () => {
    expect(
      isOrphanOpsGasCardSpend({
        id: 'anchor',
        amount: 0,
        paymentSource: 'Gas_Card',
        entrySource: 'driver-portal',
        metadata: { awaitingCardStatement: true, countsInFuelSpend: false },
      }),
    ).toBe(false);
  });

  it('$4,000 unlinked blocks, then clears once adopted and linked', () => {
    const before = computeGasCardStatementDriftSummary([unmatched]);
    expect(gasCardStatementDriftBlocks(before)).toBe(true);

    const linkedStatement = {
      ...unmatched,
      metadata: { ...unmatched.metadata, jaaMatchedDriverEntryId: 'adopted-1' },
    };
    const adoptedOps = {
      id: 'adopted-1',
      amount: 4000,
      cardId: 'card-a',
      paymentSource: 'Gas_Card',
      entrySource: 'admin-manual',
      metadata: {
        countsInFuelSpend: true,
        awaitingCardStatement: false,
        jaaMatchedStatementId: 'stmt-1',
        fillOrigin: 'statement_adopted',
      },
    };
    const after = computeGasCardStatementDriftSummary([linkedStatement, adoptedOps]);
    expect(after.drift).toBe(0);
    expect(after.statementFuelTotal).toBeCloseTo(4000, 5);
    expect(after.opsGasCardTotal).toBeCloseTo(4000, 5);
    expect(gasCardStatementDriftBlocks(after)).toBe(false);
  });
});
