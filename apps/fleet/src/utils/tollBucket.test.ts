import { describe, it, expect } from 'vitest';
import { bucketForBestMatch, bucketForWorkflowStage } from './tollBucket';
import { MatchResult } from './tollReconciliation';

/**
 * Guards the reconciliation sub-tab bucketing, with special focus on the
 * NON-BREAKAGE contract: when `reasonCode` is undefined (legacy payloads / the
 * personal-use flag OFF), bucketing must reproduce the old
 * `reason.includes('Approach')` behavior byte-for-byte.
 */

const m = (over: Partial<MatchResult>): Pick<MatchResult, 'matchType' | 'reasonCode' | 'reason'> =>
  ({ matchType: 'PERSONAL_MATCH', reason: '', ...over } as MatchResult);

describe('bucketForBestMatch', () => {
  it('sends no-match tolls to needs-review', () => {
    expect(bucketForBestMatch(undefined)).toBe('needs-review');
  });

  it('sends AMOUNT_VARIANCE to underpaid and DEADHEAD to deadhead', () => {
    expect(bucketForBestMatch(m({ matchType: 'AMOUNT_VARIANCE' }))).toBe('underpaid');
    expect(bucketForBestMatch(m({ matchType: 'DEADHEAD_MATCH' }))).toBe('deadhead');
  });

  it('sends POSSIBLE_MATCH to needs-review', () => {
    expect(bucketForBestMatch(m({ matchType: 'POSSIBLE_MATCH' }))).toBe('needs-review');
  });

  describe('legacy fallback (reasonCode undefined) reproduces reason.includes("Approach")', () => {
    it('PERSONAL_MATCH with "Approach" in reason → deadhead', () => {
      expect(bucketForBestMatch(m({ reason: 'Unreimbursed Approach - Driver Liability' }))).toBe('deadhead');
    });
    it('PERSONAL_MATCH without "Approach" → personal-use', () => {
      expect(bucketForBestMatch(m({ reason: 'After dropoff (Likely Personal)' }))).toBe('personal-use');
    });
  });

  describe('structured reasonCode takes precedence', () => {
    it('ENROUTE_APPROACH → deadhead (even if reason lacks the word)', () => {
      expect(bucketForBestMatch(m({ reasonCode: 'ENROUTE_APPROACH', reason: 'enroute to pickup' }))).toBe('deadhead');
    });
    it('POST_TRIP_GAP → personal-use', () => {
      expect(bucketForBestMatch(m({ reasonCode: 'POST_TRIP_GAP', reason: 'after dropoff' }))).toBe('personal-use');
    });
    it('ORPHAN_NO_TRIP → personal-use', () => {
      expect(bucketForBestMatch(m({ reasonCode: 'ORPHAN_NO_TRIP', reason: 'No trip explains this toll (personal use)' }))).toBe('personal-use');
    });
    it('ORPHAN_OUT_OF_WINDOW → personal-use', () => {
      expect(bucketForBestMatch(m({ reasonCode: 'ORPHAN_OUT_OF_WINDOW', reason: 'No trip explains this toll (personal use)' }))).toBe('personal-use');
    });
    it('reasonCode wins even when reason contains "Approach"', () => {
      // A structured POST_TRIP_GAP must NOT be misrouted to deadhead by a stray word.
      expect(bucketForBestMatch(m({ reasonCode: 'POST_TRIP_GAP', reason: 'Approach mentioned' }))).toBe('personal-use');
    });
  });
});

/**
 * RWF-1: the persisted-workflow-stage read path (bucketForWorkflowStage) must
 * agree with bucketForBestMatch's bucket set for the 4 pre-claim states, and
 * correctly signal "no longer a to-do" (null) for every claimed/resolved state.
 */
describe('bucketForWorkflowStage', () => {
  it('maps each pending stage to the same bucket bucketForBestMatch would use', () => {
    expect(bucketForWorkflowStage('needs_review')).toBe('needs-review');
    expect(bucketForWorkflowStage('underpaid_pending')).toBe('underpaid');
    expect(bucketForWorkflowStage('deadhead_pending')).toBe('deadhead');
    expect(bucketForWorkflowStage('personal_use_pending')).toBe('personal-use');
  });

  it('returns null for resolved/claimed stages — caller must exclude these from any to-do bucket', () => {
    expect(bucketForWorkflowStage('deadhead_resolved')).toBeNull();
    expect(bucketForWorkflowStage('personal_use_resolved')).toBeNull();
    expect(bucketForWorkflowStage('claim_filed')).toBeNull();
    expect(bucketForWorkflowStage('claim_resolved')).toBeNull();
    expect(bucketForWorkflowStage('matched')).toBeNull();
  });

  it('falls back to needs-review for an unset stage (pre-backfill row)', () => {
    expect(bucketForWorkflowStage(undefined)).toBe('needs-review');
  });
});
