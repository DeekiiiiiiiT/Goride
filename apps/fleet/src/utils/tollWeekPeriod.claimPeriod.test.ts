import { describe, it, expect } from 'vitest';
import { getClaimPeriodAnchorDate, isClaimInPeriod, isClaimVisibleInPeriod, isActionablePartialShortfall } from './tollWeekPeriod';

describe('claim period scoping', () => {
  const period = { startDate: '2026-06-29', endDate: '2026-07-05' };
  const tollMap = new Map([['toll-1', '2026-06-30']]);

  it('includes claim when claim.date is in period', () => {
    expect(
      isClaimInPeriod(
        { date: '2026-06-30', transactionId: 'toll-1', tripDate: undefined },
        period,
        tollMap,
        'America/Jamaica',
      ),
    ).toBe(true);
  });

  it('excludes claim when only createdAt is in period (strict — no createdAt)', () => {
    expect(
      isClaimInPeriod(
        { date: undefined, transactionId: 'missing-toll', tripDate: undefined } as any,
        period,
        tollMap,
        'America/Jamaica',
      ),
    ).toBe(false);
  });

  it('uses linked toll date when claim.date missing', () => {
    expect(
      getClaimPeriodAnchorDate({ transactionId: 'toll-1' }, tollMap),
    ).toBe('2026-06-30');
  });

  it('excludes claim outside period window', () => {
    expect(
      isClaimInPeriod(
        { date: '2026-06-15', transactionId: 'toll-1' },
        period,
        tollMap,
        'America/Jamaica',
      ),
    ).toBe(false);
  });

  it('includes claim when linked toll is in the period set even if anchor date is outside', () => {
    const tollMapOut = new Map([['toll-1', '2026-06-28']]);
    expect(
      isClaimVisibleInPeriod(
        { date: '2026-06-28', transactionId: 'toll-1' },
        period,
        tollMapOut,
        'America/Jamaica',
        new Set(['toll-1']),
      ),
    ).toBe(true);
  });
});

describe('isActionablePartialShortfall', () => {
  it('detects wrongly resolved partial unlinked apply (6 Linen Av case)', () => {
    expect(
      isActionablePartialShortfall(
        {
          status: 'Resolved',
          resolutionReason: 'Charge Driver',
          paidAmount: 275,
          amount: 10,
          unlinkedTripId: null,
          resolutionTransactionId: undefined,
        },
        null,
      ),
    ).toBe(true);
  });

  it('excludes charge-driver claims with a posted debit', () => {
    expect(
      isActionablePartialShortfall(
        {
          status: 'Resolved',
          resolutionReason: 'Charge Driver',
          paidAmount: 370,
          amount: 10,
          resolutionTransactionId: 'tx-charge-1',
        },
        null,
      ),
    ).toBe(false);
  });
});
