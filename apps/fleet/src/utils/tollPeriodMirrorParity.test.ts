import { describe, it, expect } from 'vitest';
import { isDisputeRefundMatched, tollWeekKey, isVisiblePartialShortfallClaim, isTollCoveredByDisputeRefund } from './tollWeekPeriod';
import { classifyPeriodUnderpaidClaim } from './tollPeriodGating';
import { incrementUnderpaidClaimCount } from './tollPeriodCounts';
import type { Claim, DisputeRefund } from '../types/data';

/**
 * Characterization / mirror contracts for rules duplicated in
 * supabase/functions/_fleet-server/toll_period_controller.tsx.
 *
 * Deno cannot import this Vite client bundle, so the edge controller keeps
 * local twins (isDisputeRefundMatched, weekKeyFor, applyUnderpaidClaimCounts).
 * These golden fixtures are what both sides must honor — if a case here needs
 * to change, update the Deno mirror in the same PR.
 *
 * Style twin: tollBucket.test.ts `bucketForWorkflowStage mirror contract`.
 */

const TZ = 'America/Jamaica';

describe('isDisputeRefundMatched mirror contract (toll_period_controller.tsx)', () => {
  const GOLDEN: Array<{ status: DisputeRefund['status']; matched: boolean }> = [
    { status: 'matched', matched: true },
    { status: 'auto_resolved', matched: true },
    { status: 'unmatched', matched: false },
  ];

  it('matches only matched + auto_resolved (server isDisputeRefundMatched)', () => {
    for (const row of GOLDEN) {
      expect(isDisputeRefundMatched({ status: row.status })).toBe(row.matched);
    }
  });
});

describe('tollWeekKey / weekKeyFor date-only mirror contract (toll_period_controller.tsx)', () => {
  /**
   * Server weekKeyFor(dateStr, tz) uses fleetTzDay → ymdToLocalDate → Monday key.
   * Client tollWeekKey for bare yyyy-MM-dd must produce the same key (no UTC shift).
   */
  const DATE_ONLY_GOLDEN: Array<{ date: string; tz: string; weekKey: string }> = [
    { date: '2026-06-29', tz: TZ, weekKey: '2026-06-29' }, // Monday
    { date: '2026-07-05', tz: TZ, weekKey: '2026-06-29' }, // Sunday of that week
    { date: '2026-07-06', tz: TZ, weekKey: '2026-07-06' }, // next Monday
    { date: '2025-12-15', tz: 'America/New_York', weekKey: '2025-12-15' },
    { date: '2025-12-15', tz: TZ, weekKey: '2025-12-15' },
  ];

  it('date-only ledger days map to the same Monday week key as server weekKeyFor', () => {
    for (const row of DATE_ONLY_GOLDEN) {
      expect(tollWeekKey({ date: row.date }, row.tz)).toBe(row.weekKey);
    }
  });
});

describe('classifyPeriodUnderpaidClaim / applyUnderpaidClaimCounts mirror (toll_period_controller.tsx)', () => {
  const claim = (status: Claim['status']): Pick<Claim, 'status'> => ({ status });

  /**
   * Server applyUnderpaidClaimCounts increments:
   *   informational ← Sent_to_Driver | Submitted_to_Uber
   *   actionable    ← Rejected | Open (unless dispute-covered) | visible partial Resolved
   *   (skip/done)   ← Open covered by matched dispute; Resolved without visible partial
   *
   * Client twin: classifyPeriodUnderpaidClaim (+ caller dispute-cover check for Open).
   */
  type CountBucket = 'actionable' | 'informational' | 'done';

  function applyUnderpaidClaimCountsTwin(
    c: Pick<Claim, 'status'>,
    opts?: { coveredByDispute?: boolean; isVisiblePartialShortfall?: boolean },
  ): CountBucket {
    // Server returns early on Open when isTollCoveredByDisputeRefundServer.
    if (c.status === 'Open' && opts?.coveredByDispute) return 'done';
    return classifyPeriodUnderpaidClaim(c, {
      isVisiblePartialShortfall: opts?.isVisiblePartialShortfall,
    });
  }

  const GOLDEN: Array<{
    status: Claim['status'];
    coveredByDispute?: boolean;
    isVisiblePartialShortfall?: boolean;
    bucket: CountBucket;
  }> = [
    { status: 'Sent_to_Driver', bucket: 'informational' },
    { status: 'Submitted_to_Uber', bucket: 'informational' },
    { status: 'Rejected', bucket: 'actionable' },
    { status: 'Open', bucket: 'actionable' },
    { status: 'Open', coveredByDispute: true, bucket: 'done' },
    { status: 'Resolved', bucket: 'done' },
    { status: 'Resolved', isVisiblePartialShortfall: true, bucket: 'actionable' },
  ];

  it('every status maps to the same bucket the Deno applyUnderpaidClaimCounts uses', () => {
    for (const row of GOLDEN) {
      expect(
        applyUnderpaidClaimCountsTwin(claim(row.status), {
          coveredByDispute: row.coveredByDispute,
          isVisiblePartialShortfall: row.isVisiblePartialShortfall,
        }),
      ).toBe(row.bucket);
    }
  });
});

describe('partial shortfall + dispute cover (shared tollPeriodCounts)', () => {
  it('Open claim covered by matched dispute is not actionable', () => {
    const claimRow: Pick<Claim, 'id' | 'status' | 'amount' | 'transactionId'> = {
      id: 'c1',
      status: 'Open',
      amount: 0,
      transactionId: 'toll-1',
    };
    const disputeRefunds: DisputeRefund[] = [
      { id: 'dr1', status: 'matched', matchedTollId: 'toll-1', amount: 10 } as DisputeRefund,
    ];
    expect(isTollCoveredByDisputeRefund(claimRow, disputeRefunds)).toBe(true);
    const counts = {
      'needs-review': { actionable: 0, informational: 0 },
      'personal-use': { actionable: 0, informational: 0 },
      deadhead: { actionable: 0, informational: 0 },
      'underpaid-claims': { actionable: 0, informational: 0 },
      'dispute-refunds': { actionable: 0, informational: 0 },
      'unlinked-refunds': { actionable: 0, informational: 0 },
    };
    incrementUnderpaidClaimCount(counts, claimRow as Claim, undefined, disputeRefunds);
    expect(counts['underpaid-claims'].actionable).toBe(0);
  });

  it('Resolved Charge Driver with resolutionTransactionId is not visible partial', () => {
    const claimRow = {
      id: 'c2',
      status: 'Resolved' as const,
      amount: 10,
      paidAmount: 360,
      resolutionReason: 'Charge Driver',
      resolutionTransactionId: 'rt-1',
      transactionId: 'toll-2',
    };
    expect(isVisiblePartialShortfallClaim(claimRow, null, [])).toBe(false);
  });
});
