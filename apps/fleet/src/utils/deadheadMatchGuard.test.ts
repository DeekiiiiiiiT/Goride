import { describe, it, expect } from 'vitest';
import { demoteSpuriousDeadheadMatch, DEADHEAD_APPROACH_MAX_MINUTES } from './deadheadMatchGuard';

describe('demoteSpuriousDeadheadMatch', () => {
  it('leaves true short-gap unreimbursed deadhead alone', () => {
    const m = demoteSpuriousDeadheadMatch({
      matchType: 'DEADHEAD_MATCH' as const,
      reasonCode: 'ENROUTE_APPROACH' as const,
      timeDifferenceMinutes: 20,
      tripTollCharges: 0,
      reason: 'Enroute',
    });
    expect(m.matchType).toBe('DEADHEAD_MATCH');
    expect(m.deadheadDemotedReason).toBeUndefined();
  });

  it('demotes huge approach gap out of deadhead', () => {
    const m = demoteSpuriousDeadheadMatch({
      matchType: 'DEADHEAD_MATCH' as const,
      reasonCode: 'ENROUTE_APPROACH' as const,
      timeDifferenceMinutes: 260,
      tripTollCharges: 0,
      reason: 'Enroute',
    });
    expect(m.matchType).toBe('PERSONAL_MATCH');
    expect(m.reasonCode).toBe('ORPHAN_OUT_OF_WINDOW');
    expect(m.deadheadDemotedReason).toBe('huge_gap');
    expect(DEADHEAD_APPROACH_MAX_MINUTES).toBe(45);
  });

  it('demotes deadhead when trip already has platform toll credit', () => {
    const m = demoteSpuriousDeadheadMatch({
      matchType: 'DEADHEAD_MATCH' as const,
      reasonCode: 'ENROUTE_APPROACH' as const,
      timeDifferenceMinutes: 15,
      tripTollCharges: 370,
      tollAmount: 380,
      reason: 'Enroute',
    });
    expect(m.matchType).toBe('AMOUNT_VARIANCE');
    expect(m.reasonCode).toBe('ON_TRIP');
    expect(m.deadheadDemotedReason).toBe('platform_refund');
    expect(m.varianceAmount).toBeCloseTo(-10, 5);
  });

  it('also demotes PERSONAL_MATCH + ENROUTE_APPROACH with refund', () => {
    const m = demoteSpuriousDeadheadMatch({
      matchType: 'PERSONAL_MATCH' as const,
      reasonCode: 'ENROUTE_APPROACH' as const,
      timeDifferenceMinutes: 10,
      trip: { tollCharges: 50 },
      reason: 'Approach',
    });
    expect(m.matchType).toBe('AMOUNT_VARIANCE');
    expect(m.deadheadDemotedReason).toBe('platform_refund');
  });
});
