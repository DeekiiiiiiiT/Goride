import { describe, it, expect } from 'vitest';
import {
  buildPeriodTollIdSet,
  claimPeriodWeekKey,
  formatClaimPeriodLabel,
  formatTollPeriodLabel,
  getClaimPeriodAnchorDate,
  isClaimInPeriod,
  isClaimVisibleInPeriod,
  isActionablePartialShortfall,
  isTollCoveredByDisputeRefund,
  isVisiblePartialShortfallClaim,
  filterTollsToWizardPeriod,
  filterClaimsToWizardPeriod,
  assertTollInWizardPeriod,
  isTollInWizardPeriod,
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

describe('period filter helpers', () => {
  const period = { startDate: '2026-06-29', endDate: '2026-07-05' };
  const tz = 'America/Jamaica';

  it('filterTollsToWizardPeriod keeps same-week tolls only', () => {
    const tolls = [
      tx('in', '2026-06-30'),
      tx('out', '2026-06-28'),
    ];
    const filtered = filterTollsToWizardPeriod(tolls, period.startDate, tz);
    expect(filtered.map((t) => t.id)).toEqual(['in']);
  });

  it('filterClaimsToWizardPeriod uses toll-first anchor', () => {
    const tollMap = new Map([['toll-1', '2026-06-30'], ['toll-old', '2026-06-22']]);
    const claims = [
      { date: '2026-06-30', transactionId: 'toll-1' },
      { date: '2026-06-22', transactionId: 'toll-old' },
    ] as any[];
    const filtered = filterClaimsToWizardPeriod(claims, period, tollMap, tz);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].transactionId).toBe('toll-1');
  });

  it('assertTollInWizardPeriod fails with week label for cross-week toll', () => {
    const result = assertTollInWizardPeriod(tx('toll-jun28', '2026-06-28'), period.startDate, tz);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.weekLabel).toContain('Jun 22');
      expect(result.weekLabel).toContain('Jun 28');
    }
  });

  it('assertTollInWizardPeriod passes for same-week toll', () => {
    expect(assertTollInWizardPeriod(tx('toll-jun30', '2026-06-30'), period.startDate, tz).ok).toBe(true);
  });

  it('formatTollPeriodLabel matches toll week', () => {
    const label = formatTollPeriodLabel(tx('t1', '2026-06-30'), tz);
    expect(label).toContain('Jun 29');
    expect(label).toContain('Jul 5');
  });

  it('isTollInWizardPeriod boundary: Jun 28 is not Jun 29 week', () => {
    expect(isTollInWizardPeriod(tx('t', '2026-06-28'), '2026-06-29', tz)).toBe(false);
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

describe('dispute-covered partial shortfall visibility', () => {
  const partialOpen = {
    id: 'claim-1',
    status: 'Open' as const,
    paidAmount: 370,
    amount: 10,
    transactionId: 'toll-1',
    unlinkedTripId: 'trip-unlinked',
    resolutionReason: null,
    resolutionTransactionId: undefined,
    disputeRefundId: null,
  };

  const matchedDispute = [
    {
      id: 'dr-1',
      status: 'matched' as const,
      matchedTollId: 'toll-1',
      matchedClaimId: null,
    },
  ];

  it('isTollCoveredByDisputeRefund matches by toll id', () => {
    expect(isTollCoveredByDisputeRefund(partialOpen, matchedDispute as any)).toBe(true);
  });

  it('hides open partial when dispute already matched to toll', () => {
    expect(
      isVisiblePartialShortfallClaim(partialOpen, { unlinkedSourceTripId: 'trip-unlinked' }, matchedDispute as any),
    ).toBe(false);
  });

  it('shows open partial when no dispute match', () => {
    expect(
      isVisiblePartialShortfallClaim(partialOpen, { unlinkedSourceTripId: 'trip-unlinked' }, []),
    ).toBe(true);
  });

  it('hides Resolved/Reimbursed + unlinked + amount when dispute matched', () => {
    expect(
      isVisiblePartialShortfallClaim(
        {
          id: 'claim-2',
          status: 'Resolved',
          resolutionReason: 'Reimbursed',
          paidAmount: 370,
          amount: 10,
          transactionId: 'toll-2',
          unlinkedTripId: 'trip-u',
          disputeRefundId: null,
        },
        { unlinkedSourceTripId: 'trip-u' },
        [{ id: 'dr-2', status: 'auto_resolved', matchedTollId: 'toll-2', matchedClaimId: 'claim-2' }] as any,
      ),
    ).toBe(false);
  });

  it('hides when claim already has disputeRefundId', () => {
    expect(
      isVisiblePartialShortfallClaim(
        {
          ...partialOpen,
          status: 'Resolved',
          resolutionReason: 'Reimbursed',
          disputeRefundId: 'dr-1',
        },
        null,
        [],
      ),
    ).toBe(false);
  });
});
