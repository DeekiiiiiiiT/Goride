import { describe, it, expect } from 'vitest';
import {
  bucketForBestMatch,
  bucketForWorkflowStage,
  isTripLinkConfirmed,
  resolveTollBucket,
  resolveWizardBucket,
  TollWorkflowStage,
} from './tollBucket';
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
    it('ORPHAN_NEARBY_UNEXPLAINED → personal-use', () => {
      expect(bucketForBestMatch(m({ reasonCode: 'ORPHAN_NEARBY_UNEXPLAINED', reason: 'Nearby trip' }))).toBe('personal-use');
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
describe('resolveTollBucket', () => {
  it('ambiguous unreconciled AMOUNT_VARIANCE → needs-review', () => {
    expect(
      resolveTollBucket(
        { isReconciled: false, tripId: null },
        { matchType: 'AMOUNT_VARIANCE', isAmbiguous: true },
      ),
    ).toBe('needs-review');
  });

  it('ambiguous but reconciled → underpaid', () => {
    expect(
      resolveTollBucket(
        { isReconciled: true, tripId: 'trip-1' },
        { matchType: 'AMOUNT_VARIANCE', isAmbiguous: true },
      ),
    ).toBe('underpaid');
  });

  it('non-ambiguous underpaid → underpaid', () => {
    expect(
      resolveTollBucket(
        { isReconciled: false, tripId: null },
        { matchType: 'AMOUNT_VARIANCE', isAmbiguous: false },
      ),
    ).toBe('underpaid');
  });
});

describe('isTripLinkConfirmed', () => {
  it('requires both isReconciled and tripId', () => {
    expect(isTripLinkConfirmed({ isReconciled: true, tripId: 'x' })).toBe(true);
    expect(isTripLinkConfirmed({ isReconciled: true, tripId: null })).toBe(false);
    expect(isTripLinkConfirmed({ isReconciled: false, tripId: 'x' })).toBe(false);
  });
});

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

describe('resolveWizardBucket', () => {
  const tagTx = { paymentMethod: 'Tag' as const };

  it('ambiguous unreconciled → needs-review', () => {
    expect(resolveWizardBucket(tagTx, { matchType: 'AMOUNT_VARIANCE', isAmbiguous: true })).toBe('needs-review');
  });

  it('zero-match tag toll → personal-use', () => {
    expect(resolveWizardBucket(tagTx, undefined)).toBe('personal-use');
  });

  it('personal_use_pending stage wins over stale needs_review live path', () => {
    expect(resolveWizardBucket(
      { ...tagTx, workflowStage: 'personal_use_pending' },
      undefined,
    )).toBe('personal-use');
  });

  it('orphan_personal matchStatus → personal-use', () => {
    expect(resolveWizardBucket(
      { ...tagTx, matchStatus: 'orphan_personal' },
      undefined,
    )).toBe('personal-use');
  });

  it('resolved personal_use_resolved → excluded (null)', () => {
    expect(resolveWizardBucket(
      { ...tagTx, workflowStage: 'personal_use_resolved' },
      undefined,
    )).toBeNull();
  });

  it('cash claim with no match stays needs-review', () => {
    expect(resolveWizardBucket(
      { paymentMethod: 'Cash' },
      undefined,
    )).toBe('needs-review');
  });

  it('orphan personal suggestion wins over stale ambiguous flags', () => {
    expect(resolveWizardBucket(
      { ...tagTx, matchStatus: 'ambiguous', isAmbiguous: true },
      {
        matchType: 'PERSONAL_MATCH',
        reasonCode: 'ORPHAN_NEARBY_UNEXPLAINED',
        trip: { id: '' } as any,
      },
    )).toBe('personal-use');
  });
});

/**
 * Phase F2's period aggregation endpoint (apps/fleet/src/supabase/functions/
 * server/toll_period_controller.tsx) cannot import this Deno-incompatible
 * client module, so it carries its own local `bucketForWorkflowStage` mirror.
 * That mirror must stay behaviorally identical to this one (StepId
 * 'underpaid-claims' is that function's name for this function's 'underpaid'
 * — same bucket, different label domain since the server groups underpaid
 * tolls and claims into one step). This test locks down the exact mapping
 * table both implementations must agree on — if this test ever needs to
 * change, toll_period_controller.tsx's mirror must change to match.
 */
describe('bucketForWorkflowStage mirror contract (toll_period_controller.tsx)', () => {
  const SERVER_STEP_ID_FOR_STAGE: Record<string, string | null> = {
    needs_review: 'needs-review',
    underpaid_pending: 'underpaid-claims',
    deadhead_pending: 'deadhead',
    personal_use_pending: 'personal-use',
    deadhead_resolved: null,
    personal_use_resolved: null,
    claim_filed: null,
    claim_resolved: null,
    matched: null,
  };

  const CLIENT_BUCKET_TO_SERVER_STEP_ID: Record<string, string> = {
    'needs-review': 'needs-review',
    underpaid: 'underpaid-claims',
    deadhead: 'deadhead',
    'personal-use': 'personal-use',
  };

  it('every stage maps to the same step (translated to the server label domain)', () => {
    for (const [stage, expectedServerStepId] of Object.entries(SERVER_STEP_ID_FOR_STAGE)) {
      const clientBucket = bucketForWorkflowStage(stage as TollWorkflowStage);
      const translated = clientBucket ? CLIENT_BUCKET_TO_SERVER_STEP_ID[clientBucket] : null;
      expect(translated).toBe(expectedServerStepId);
    }
  });
});
