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

  it('bank plug uses statementTollExpense only', () => {
    expect(deriveStatementBankPlug(10000, 0, 10000)).toBe(0);
    expect(deriveStatementBankPlug(100, 50, 0)).toBe(50);
  });

  it('payout gap ignores credits-as-expense', () => {
    const gap = statementPayoutReconciliationGap({
      totalEarnings: 10158.9,
      statementTollExpense: 0,
      periodAdjustments: 0,
      totalPayout: 11570,
    });
    expect(gap).toBe(1411.1);
  });
});
