import { describe, expect, it } from 'vitest';
import {
  applyStatementTollEvent,
  deriveStatementBankPlug,
  emptyStatementTollBuckets,
  presentStatementToll,
  statementPayoutReconciliationGap,
} from './statementTollNetting.ts';

describe('statementTollNetting presentation', () => {
  it('excludes plaza toll_charge from statement', () => {
    const b = emptyStatementTollBuckets();
    expect(
      applyStatementTollEvent(
        b,
        { eventType: 'toll_charge', sourceType: 'transaction', netAmount: 6210 },
        'Roam',
      ),
    ).toBeNull();
  });

  it('ignores toll_charge_offset', () => {
    expect(
      applyStatementTollEvent(
        emptyStatementTollBuckets(),
        {
          eventType: 'toll_charge_offset',
          direction: 'inflow',
          netAmount: 4665,
          metadata: { reason: 'platform_reimbursed' },
        },
        'Roam',
      ),
    ).toBeNull();
  });

  it('Uber CSV credits do not become statementTollExpense', () => {
    let b = emptyStatementTollBuckets();
    b = applyStatementTollEvent(
      b,
      { eventType: 'toll_reimbursement', sourceType: 'trip', sourceId: 't1', netAmount: 3975 },
      'Uber',
    )!;
    const p = presentStatementToll(b, 'Uber');
    expect(p.tollStory).toBe('uber_csv_credits');
    expect(p.uberTollCredits).toBe(3975);
    expect(p.platformTollCredits).toBe(3975);
    expect(p.statementTollExpense).toBe(0);
    expect(p.totalRefundsExpenses).toBe(0);
  });

  it('dedupes support_adjustment against reimbursement', () => {
    let b = emptyStatementTollBuckets();
    b = applyStatementTollEvent(
      b,
      { eventType: 'toll_reimbursement', sourceType: 'trip', sourceId: 'trip-1', netAmount: 370 },
      'Uber',
    )!;
    expect(
      applyStatementTollEvent(
        b,
        {
          eventType: 'toll_support_adjustment',
          netAmount: 370,
          metadata: { tripId: 'trip-1' },
        },
        'Uber',
      ),
    ).toBeNull();
    expect(presentStatementToll(b, 'Uber').uberTollCredits).toBe(370);
  });

  it('Roam with no platform tolls → no_platform_tolls story', () => {
    const p = presentStatementToll(emptyStatementTollBuckets(), 'Roam');
    expect(p.tollStory).toBe('no_platform_tolls');
    expect(p.platformTollCredits).toBe(0);
    expect(p.statementTollExpense).toBe(0);
  });

  it('Uber toll credits use the statement line when it exists', () => {
    let b = emptyStatementTollBuckets();
    b = applyStatementTollEvent(
      b,
      { eventType: 'toll_reimbursement', sourceType: 'trip', sourceId: 't1', netAmount: 4980 },
      'Uber',
    )!;
    b = applyStatementTollEvent(
      b,
      { eventType: 'statement_line', netAmount: 4910, metadata: { lineCode: 'REFUNDS_TOLL' } },
      'Uber',
    )!;
    expect(presentStatementToll(b, 'Uber').uberTollCredits).toBe(4910);
  });

  it('bank plug adds refunds and subtracts cash', () => {
    expect(deriveStatementBankPlug({
      totalEarnings: 53693.27,
      platformRefunds: 2535,
      cashCollected: 22470.65,
    })).toBe(33757.62);
    expect(deriveStatementBankPlug({
      totalEarnings: 10000,
      platformRefunds: 0,
      cashCollected: 10000,
    })).toBe(0);
  });

  it('tie-out is zero when the bank deposit matches earnings plus refunds minus cash', () => {
    const gap = statementPayoutReconciliationGap({
      totalEarnings: 53693.27,
      platformRefunds: 2535,
      periodAdjustments: 0,
      cashCollected: 22470.65,
      bankTransfer: 33757.62,
    });
    expect(gap).toBe(0);
  });
});
