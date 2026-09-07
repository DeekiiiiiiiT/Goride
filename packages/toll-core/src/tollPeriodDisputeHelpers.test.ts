import { describe, expect, it } from 'vitest';
import {
  disputeRefundPeriodKey,
  disputeRefundPeriodWeekKey,
  isDisputeRefundInWizardPeriod,
} from './tollPeriodDisputeHelpers.ts';

const TZ = 'America/Jamaica';

describe('disputeRefundPeriodKey — exclusive priority (C-5)', () => {
  it('uses the matched toll week, never the refund-date week', () => {
    const tollWeekKeyById = new Map([['tollA', '2026-08-03']]);
    const key = disputeRefundPeriodKey(
      // refund dated in a DIFFERENT week than its matched toll
      { date: '2026-08-20', matchedTollId: 'tollA' },
      { fleetTz: TZ, tollWeekKeyById },
    );
    expect(key).toBe('2026-08-03');
    expect(key).not.toBe(disputeRefundPeriodWeekKey({ date: '2026-08-20' }, TZ));
  });

  it('falls back to matched claim week when no toll match', () => {
    const claimWeekKeyById = new Map([['claimX', '2026-07-06']]);
    expect(
      disputeRefundPeriodKey({ matchedClaimId: 'claimX' }, { fleetTz: TZ, claimWeekKeyById }),
    ).toBe('2026-07-06');
  });

  it('falls back to the refund-date week when unanchored', () => {
    expect(disputeRefundPeriodKey({ date: '2026-08-20' }, { fleetTz: TZ })).toBe(
      disputeRefundPeriodWeekKey({ date: '2026-08-20' }, TZ),
    );
  });

  it('a toll-anchored refund whose toll week is unknown resolves to no period (not its date week)', () => {
    // toll anchor wins even if unresolved — avoids double-booking into date week.
    expect(disputeRefundPeriodKey({ date: '2026-08-20', matchedTollId: 'missing' }, { fleetTz: TZ })).toBeNull();
  });
});

describe('isDisputeRefundInWizardPeriod — partition (exactly one week)', () => {
  // Two disjoint periods: week A (toll lives here) and week B (refund date here).
  const weekA = '2026-08-03';
  const weekB = '2026-08-17';
  const periodAtollIds = new Set(['tollA']);
  const emptyTolls = new Set<string>();
  const emptyClaims = new Set<string>();

  it('a toll-anchored refund appears ONLY in its toll week, not its date week', () => {
    const refund = { date: '2026-08-20', matchedTollId: 'tollA' }; // date is in week B
    const inA = isDisputeRefundInWizardPeriod(refund, weekA, TZ, periodAtollIds, emptyClaims);
    const inB = isDisputeRefundInWizardPeriod(refund, weekB, TZ, emptyTolls, emptyClaims);
    expect(inA).toBe(true);
    expect(inB).toBe(false); // the OR bug used to return true here too
  });

  it('an unanchored refund appears only in its own refund-date week', () => {
    const refund = { date: '2026-08-17' }; // week B
    expect(isDisputeRefundInWizardPeriod(refund, weekB, TZ, emptyTolls, emptyClaims)).toBe(true);
    expect(isDisputeRefundInWizardPeriod(refund, weekA, TZ, emptyTolls, emptyClaims)).toBe(false);
  });

  it('property: every refund belongs to at most one of a set of disjoint periods', () => {
    const refunds = [
      { date: '2026-08-20', matchedTollId: 'tollA' },
      { date: '2026-08-17' },
      { date: '2026-08-04', matchedClaimId: 'claimA' },
    ];
    const periodClaimIds = new Set<string>(); // claimA not in any loaded period
    for (const r of refunds) {
      const hits = [weekA, weekB, '2026-08-10'].filter((wk) =>
        isDisputeRefundInWizardPeriod(
          r,
          wk,
          TZ,
          wk === weekA ? periodAtollIds : emptyTolls,
          periodClaimIds,
        ),
      );
      expect(hits.length).toBeLessThanOrEqual(1);
    }
  });
});
