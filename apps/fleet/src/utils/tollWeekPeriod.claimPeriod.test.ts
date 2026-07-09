import { describe, it, expect } from 'vitest';
import {
  buildPeriodTollIdSet,
  claimPeriodWeekKey,
  formatClaimPeriodLabel,
  getClaimPeriodAnchorDate,
  isClaimInPeriod,
  isClaimVisibleInPeriod,
  isActionablePartialShortfall,
} from './tollWeekPeriod';
import type { FinancialTransaction } from '../types/data';

const tx = (id: string, date: string): FinancialTransaction =>
  ({ id, date, time: '12:00:00', isReconciled: true, tripId: 'trip-1' }) as FinancialTransaction;

describe('claim period scoping', () => {
  const period = { startDate: '2026-06-29', endDate: '2026-07-05' };
  const tollMap = new Map([['toll-1', '2026-06-30']]);
  const tz = 'America/Jamaica';

  it('includes claim when toll date is in period week', () => {
    expect(
      isClaimInPeriod(
        { date: '2026-06-30', transactionId: 'toll-1', tripDate: undefined },
        period,
        tollMap,
        tz,
      ),
    ).toBe(true);
  });

  it('excludes claim when only createdAt is in period (strict — no createdAt)', () => {
    expect(
      isClaimInPeriod(
        { date: undefined, transactionId: 'missing-toll', tripDate: undefined } as any,
        period,
        tollMap,
        tz,
      ),
    ).toBe(false);
  });

  it('uses linked toll date when claim.date missing', () => {
    expect(
      getClaimPeriodAnchorDate({ transactionId: 'toll-1' }, tollMap),
    ).toBe('2026-06-30');
  });

  it('prefers toll date over stale claim.date for period week', () => {
    expect(
      isClaimInPeriod(
        { date: '2026-06-15', transactionId: 'toll-1' },
        period,
        tollMap,
        tz,
      ),
    ).toBe(true);
    expect(claimPeriodWeekKey({ date: '2026-06-15', transactionId: 'toll-1' }, tollMap, tz)).toBe(
      '2026-06-29',
    );
  });

  it('excludes claim when toll week differs even if claim.date is in range', () => {
    const tollMapJun22 = new Map([['toll-1', '2026-06-22']]);
    expect(
      isClaimInPeriod(
        { date: '2026-06-30', transactionId: 'toll-1' },
        period,
        tollMapJun22,
        tz,
      ),
    ).toBe(false);
  });

  it('does not bypass period filter via periodTollIds', () => {
    expect(
      isClaimVisibleInPeriod(
        { date: '2026-06-22', transactionId: 'toll-1' },
        period,
        new Map([['toll-1', '2026-06-22']]),
        tz,
        new Set(['toll-1']),
      ),
    ).toBe(false);
  });

  it('excludes claim linked to out-of-period toll when period set is scoped', () => {
    const periodWeekKey = '2026-06-29';
    const tollMapOut = new Map([['toll-old', '2026-06-15']]);
    const periodTollIds = buildPeriodTollIdSet(
      [],
      [],
      [tx('toll-old', '2026-06-15'), tx('toll-in', '2026-06-30')],
      periodWeekKey,
      tz,
    );
    expect(periodTollIds.has('toll-old')).toBe(false);
    expect(periodTollIds.has('toll-in')).toBe(true);
    expect(
      isClaimVisibleInPeriod(
        { date: '2026-06-15', transactionId: 'toll-old' },
        period,
        tollMapOut,
        tz,
        periodTollIds,
      ),
    ).toBe(false);
  });

  it('formatClaimPeriodLabel uses toll date when linked', () => {
    const label = formatClaimPeriodLabel(
      { date: '2026-06-15', transactionId: 'toll-1' },
      tollMap,
    );
    expect(label).toContain('Jun 29');
    expect(label).toContain('Jul 5');
  });
});

describe('buildPeriodTollIdSet', () => {
  const periodWeekKey = '2026-06-29';
  const tz = 'America/Jamaica';

  it('excludes Jun 15 toll when active week is Jun 29–Jul 5', () => {
    const ids = buildPeriodTollIdSet(
      [],
      [],
      [tx('toll-jun15', '2026-06-15')],
      periodWeekKey,
      tz,
    );
    expect(ids.has('toll-jun15')).toBe(false);
  });

  it('includes same-week toll present only in allReconciled', () => {
    const ids = buildPeriodTollIdSet(
      [],
      [],
      [tx('toll-jun30', '2026-06-30')],
      periodWeekKey,
      tz,
    );
    expect(ids.has('toll-jun30')).toBe(true);
  });

  it('always includes date-filtered unreconciled and reconciled tolls', () => {
    const ids = buildPeriodTollIdSet(
      [tx('unrec-1', '2026-07-01')],
      [tx('rec-1', '2026-07-02')],
      [tx('other-week', '2026-06-15')],
      periodWeekKey,
      tz,
    );
    expect(ids.has('unrec-1')).toBe(true);
    expect(ids.has('rec-1')).toBe(true);
    expect(ids.has('other-week')).toBe(false);
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
