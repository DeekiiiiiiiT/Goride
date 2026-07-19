/**
 * Toll Reconciliation — Period Aggregation Controller (Phase F2)
 *
 * One read-only endpoint that scans FULL toll/trip/claim/dispute-refund
 * history once and buckets everything into Monday–Sunday weeks (fleet
 * timezone), returning per-period actionable/informational counts for the
 * period-first landing page (apps/fleet/src/components/toll-tags/
 * reconciliation/PeriodLandingPage.tsx).
 *
 * Why a new endpoint instead of the existing client hooks: `useTollReconciliation`
 * fetches `reconciled`/`unclaimed-refunds` capped at ~1000 rows (see that
 * hook), which would silently miscount older periods for any fleet with real
 * history. This endpoint uses the same paginated (`.range()`-looped) loaders
 * `toll_controller.tsx` already proved safe for its own backfills.
 *
 * Deno runtime cannot import the client's utils bundle (Vite-targeted, not
 * Deno-bundled) — the same reason `toll_workflow_stage.ts` doesn't import
 * `tollBucket.ts`. So the small set of rules this endpoint needs
 * (actionable-vs-informational, dispute-refund "matched", week-bucketing,
 * claim-date fallback) are mirrored locally below, each with a comment
 * pointing at its client twin that must be kept in sync:
 *   - apps/fleet/src/utils/tollPeriodGating.ts (classifyPeriodUnderpaidClaim,
 *     countUnclaimedUnderpaidAsPeriodActionable, isClaimActionableNow,
 *     computeStepCounts unlinked + isUnlinkedRefundActionableNow)
 *   - apps/fleet/src/utils/tollWeekPeriod.ts (isDisputeRefundMatched, getClaimWeekDate, weekBucketForDate, formatWeekPeriodLabel)
 *   - apps/fleet/src/utils/tollBucket.ts (bucketForWorkflowStage)
 *
 * Routes:
 *   GET /toll-reconciliation/periods?driverId= – per-period step counts
 */

import { Hono } from "npm:hono";
import { startOfWeek, endOfWeek, format } from "npm:date-fns";
import { getFleetTimezone } from "./timezone_helper.tsx";
import { requireAuth, requirePermission, type RbacUser } from "./rbac_middleware.ts";
import {
  loadAllTollLedgerWithTrips,
  isUnresolvedRefund,
  loadDisputeRefundRecords,
  filterByDriver,
  loadAllByPrefix,
  isReconcilableTollExpense,
  buildUnresolvedRefundSuggestionStatuses,
} from "./toll_controller.tsx";
import { safeErrorResponse } from "./safe_error.ts";

const app = new Hono();

// Auth gate: every route in this controller requires a valid user JWT (Wave 1B).
app.use("*", requireAuth({ strict: true }));

const BASE = "/make-server-37f42386/toll-reconciliation";

// ─── Step ids (mirrors StepId in apps/fleet/src/utils/tollPeriodGating.ts) ──
type StepId =
  | "needs-review"
  | "personal-use"
  | "deadhead"
  | "underpaid-claims"
  | "dispute-refunds"
  | "unlinked-refunds";

const STEP_IDS: StepId[] = [
  "needs-review",
  "personal-use",
  "deadhead",
  "unlinked-refunds",
  "dispute-refunds",
  "underpaid-claims",
];

interface StepCounts {
  actionable: number;
  informational: number;
}

function zeroCounts(): Record<StepId, StepCounts> {
  const counts = {} as Record<StepId, StepCounts>;
  for (const id of STEP_IDS) counts[id] = { actionable: 0, informational: 0 };
  return counts;
}

/** Mirrors resolveWizardBucket in apps/fleet/src/utils/tollBucket.ts (no live MatchResult on server). */
function resolvePeriodBucket(tx: any): "needs-review" | "underpaid-claims" | "deadhead" | "personal-use" | null {
  const stage = tx.workflowStage as string | undefined;
  const stageBucket = bucketForWorkflowStage(stage);
  if (stageBucket === null && stage) return null;

  const reasonCode = String(tx.matchReasonCode || "");
  const isOrphanPersonal =
    tx.matchTypeCode === "PERSONAL_MATCH" &&
    (reasonCode.startsWith("ORPHAN_") || !tx.matchedTripId);

  if (isOrphanPersonal || stage === "personal_use_pending" || tx.matchStatus === "orphan_personal") {
    return "personal-use";
  }

  const linkConfirmed = !!(tx.isReconciled && tx.tripId);
  if (!linkConfirmed && (tx.matchStatus === "ambiguous" || tx.isAmbiguous === true)) {
    return "needs-review";
  }

  const matchType = tx.matchTypeCode as string | undefined;
  if (matchType === "AMOUNT_VARIANCE" || stage === "underpaid_pending") return "underpaid-claims";
  if (matchType === "DEADHEAD_MATCH" || stage === "deadhead_pending") return "deadhead";
  if (matchType === "PERSONAL_MATCH" || stage === "personal_use_pending") return "personal-use";

  const isCash = tx.paymentMethod === "Cash" || !!tx.receiptUrl;
  if (!matchType && !isCash && tx.matchStatus !== "ambiguous") {
    return "personal-use";
  }

  return stageBucket ?? "needs-review";
}

/** Mirrors bucketForWorkflowStage in apps/fleet/src/utils/tollBucket.ts. */
function bucketForWorkflowStage(stage: string | undefined): "needs-review" | "underpaid-claims" | "deadhead" | "personal-use" | null {
  switch (stage) {
    case "needs_review":
      return "needs-review";
    case "underpaid_pending":
      return "underpaid-claims";
    case "deadhead_pending":
      return "deadhead";
    case "personal_use_pending":
      return "personal-use";
    case "deadhead_resolved":
    case "personal_use_resolved":
    case "claim_filed":
    case "claim_resolved":
    case "matched":
      return null;
    default:
      return "needs-review";
  }
}

/** Mirrors isDisputeRefundMatched in apps/fleet/src/utils/tollWeekPeriod.ts. */
function isDisputeRefundMatched(r: any): boolean {
  return r?.status === "matched" || r?.status === "auto_resolved";
}

const VARIANCE_THRESHOLD = 0.05;

/** Mirrors isActionablePartialShortfall in apps/fleet/src/utils/tollWeekPeriod.ts. */
function isActionablePartialShortfallServer(claim: any, toll?: any): boolean {
  if (!claim) return false;
  const paid = Math.abs(Number(claim.paidAmount) || 0);
  const remaining = Math.abs(Number(claim.amount) || 0);
  if (remaining <= VARIANCE_THRESHOLD || paid <= VARIANCE_THRESHOLD) return false;
  if (claim.status === "Open") return true;
  if (claim.status !== "Resolved") return false;
  const hasUnlinkedApply = !!(claim.unlinkedTripId || toll?.unlinkedSourceTripId);
  if (claim.resolutionReason === "Reimbursed" && hasUnlinkedApply) return true;
  return claim.resolutionReason === "Charge Driver" && !claim.resolutionTransactionId;
}

/** Mirrors isTollCoveredByDisputeRefund in apps/fleet/src/utils/tollWeekPeriod.ts. */
function isTollCoveredByDisputeRefundServer(claim: any, disputeRefunds: any[]): boolean {
  if (!claim?.transactionId && !claim?.id) return false;
  return disputeRefunds.some(
    (r) =>
      isDisputeRefundMatched(r) &&
      (r.matchedClaimId === claim.id || r.matchedTollId === claim.transactionId),
  );
}

/** Mirrors isVisiblePartialShortfallClaim in apps/fleet/src/utils/tollWeekPeriod.ts. */
function isVisiblePartialShortfallClaimServer(claim: any, toll: any, disputeRefunds: any[]): boolean {
  if (!claim) return false;
  if (isTollCoveredByDisputeRefundServer(claim, disputeRefunds)) return false;
  if (claim.status === "Resolved" && claim.disputeRefundId) return false;
  if (claim.status === "Open") return true;
  if (!isActionablePartialShortfallServer(claim, toll)) return false;
  return true;
}

/**
 * Period week for a dispute refund — toll-first, then matched claim, else refund date.
 * Mirrors isDisputeRefundInWizardPeriod in apps/fleet/src/utils/tollWeekPeriod.ts.
 */
function disputeRefundPeriodKey(
  r: any,
  tollDateById: Map<string, string>,
  claims: any[],
  timezone: string,
): string | null {
  if (r.matchedTollId) {
    const tollDate = tollDateById.get(String(r.matchedTollId));
    if (tollDate) return weekKeyFor(tollDate, timezone).key;
  }
  if (r.matchedClaimId) {
    const claim = claims.find((c) => String(c.id) === String(r.matchedClaimId));
    const claimDate = claim ? resolveClaimDate(claim, tollDateById) : null;
    if (claimDate) return weekKeyFor(claimDate, timezone).key;
  }
  if (r?.date) return weekKeyFor(r.date, timezone).key;
  return null;
}

/**
 * Mirrors isClaimActionableNow / UnderpaidClaimsStep period gating
 * (apps/fleet/src/utils/tollPeriodGating.ts). Open + Rejected block Completed;
 * waiting-on-Uber/driver stay informational; incomplete Resolved partials still actionable.
 */
function applyUnderpaidClaimCounts(
  acc: PeriodAccumulator,
  claim: any,
  toll: any,
  disputeRefunds: any[],
): void {
  if (claim.status === "Sent_to_Driver") {
    acc.counts["underpaid-claims"].informational++;
    return;
  }
  if (claim.status === "Submitted_to_Uber") {
    acc.counts["underpaid-claims"].informational++;
    return;
  }
  if (claim.status === "Rejected") {
    acc.counts["underpaid-claims"].actionable++;
    return;
  }
  if (claim.status === "Open") {
    // Matched dispute refund already covers this toll — do not block the period.
    if (isTollCoveredByDisputeRefundServer(claim, disputeRefunds)) return;
    acc.counts["underpaid-claims"].actionable++;
    return;
  }
  // Resolved (or other): only leftover partial shortfalls still need a decision.
  if (isVisiblePartialShortfallClaimServer(claim, toll, disputeRefunds)) {
    acc.counts["underpaid-claims"].actionable++;
  }
}

/** Mirrors getClaimPeriodAnchorDate in apps/fleet/src/utils/tollWeekPeriod.ts — toll date first, never createdAt. */
function resolveClaimDate(claim: any, tollDateById: Map<string, string>): string | null {
  const candidates: (string | undefined)[] = [
    claim?.transactionId ? tollDateById.get(String(claim.transactionId)) : undefined,
    claim?.date,
    claim?.tripDate,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const d = new Date(candidate);
    if (!isNaN(d.getTime())) return candidate;
  }
  return null;
}

/** Resolve a stored date string to its fleet-tz calendar day (yyyy-MM-dd). */
function fleetTzDay(dateStr: string, tz: string): string {
  const s = String(dateStr);
  const hasTzSuffix = /[Zz]|[+-]\d{2}:\d{2}$/.test(s);
  if (!hasTzSuffix) return s.slice(0, 10);
  const instant = new Date(s);
  if (isNaN(instant.getTime())) return s.slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return y && m && d ? `${y}-${m}-${d}` : s.slice(0, 10);
  } catch {
    return s.slice(0, 10);
  }
}

/** Mirrors ymdToLocalDate in apps/fleet/src/utils/timezoneDisplay.ts. */
function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

/**
 * Monday–Sunday week key + bounds for a stored date, in the fleet timezone.
 * Mirrors weekBucketForDate (private) in apps/fleet/src/utils/tollWeekPeriod.ts —
 * key format MUST match exactly so period ids line up with any client-side
 * recompute of the same week.
 */
function weekKeyFor(dateStr: string, timezone: string): { key: string; weekStart: Date; weekEnd: Date } {
  const day = fleetTzDay(dateStr, timezone);
  let base = ymdToLocalDate(day);
  if (isNaN(base.getTime())) base = new Date(dateStr);
  const weekStart = startOfWeek(base, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(base, { weekStartsOn: 1 });
  return { key: format(weekStart, "yyyy-MM-dd"), weekStart, weekEnd };
}

/** Mirrors formatWeekPeriodLabel in apps/fleet/src/utils/tollWeekPeriod.ts. */
function formatWeekPeriodLabel(start: Date, end: Date): string {
  return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}

interface PeriodFinancials {
  tollSpend: number;
  /** Tag/plaza debits only — used for Net Loss so cash washes don't inflate leakage. */
  tagTollSpend: number;
  reimbursedFromTrips: number;
  /** Excludes cash_wash — used for Net Loss only. */
  fleetOffsetReimbursed: number;
  matchedDisputeRefundAmount: number;
  chargedToDrivers: number;
  resolvedRefundsAmount: number;
}

interface PeriodAccumulator {
  weekStart: Date;
  weekEnd: Date;
  counts: Record<StepId, StepCounts>;
  financials: PeriodFinancials;
}

function zeroFinancials(): PeriodFinancials {
  return {
    tollSpend: 0,
    tagTollSpend: 0,
    reimbursedFromTrips: 0,
    fleetOffsetReimbursed: 0,
    matchedDisputeRefundAmount: 0,
    chargedToDrivers: 0,
    resolvedRefundsAmount: 0,
  };
}

function netLossFrom(f: PeriodFinancials): number {
  const reimbursed = f.fleetOffsetReimbursed + f.matchedDisputeRefundAmount;
  return Math.max(0, f.tagTollSpend - reimbursed - f.chargedToDrivers);
}

// ─── GET /toll-reconciliation/periods ───────────────────────────────────
app.get(`${BASE}/periods`, requirePermission('toll.view'), async (c) => {
  try {
    const driverId = c.req.query("driverId") || undefined;
    const timezone = await getFleetTimezone();

    const { tollTx, trips } = await loadAllTollLedgerWithTrips();
    // Tag credits (top-ups/refunds/adjustments) must not spawn periods or counts.
    const scopedTollTx = filterByDriver(tollTx, driverId).filter(isReconcilableTollExpense);
    const scopedTrips = filterByDriver(trips, driverId);

    const allClaims = (await loadAllByPrefix("claim:")) as any[];
    const claims = filterByDriver(allClaims, driverId);

    const allDisputeRefunds = await loadDisputeRefundRecords();
    const disputeRefunds = filterByDriver(allDisputeRefunds, driverId);

    const tollDateById = new Map<string, string>();
    for (const tx of scopedTollTx) {
      if (tx?.id && tx?.date) tollDateById.set(String(tx.id), tx.date);
    }

    const linkedTripIds = new Set(
      scopedTollTx.filter((tx: any) => tx.tripId).map((tx: any) => String(tx.tripId)),
    );
    const unclaimedRefundTrips = scopedTrips.filter((t: any) => isUnresolvedRefund(t, linkedTripIds));

    const claimedTransactionIds = new Set(
      claims.filter((cl: any) => cl.transactionId).map((cl: any) => String(cl.transactionId)),
    );
    const unclaimedTolls = scopedTollTx.filter((tx: any) => !claimedTransactionIds.has(String(tx.id)));

    const periods = new Map<string, PeriodAccumulator>();
    const getOrCreatePeriod = (dateStr: string): PeriodAccumulator => {
      const { key, weekStart, weekEnd } = weekKeyFor(dateStr, timezone);
      let acc = periods.get(key);
      if (!acc) {
        acc = { weekStart, weekEnd, counts: zeroCounts(), financials: zeroFinancials() };
        periods.set(key, acc);
      }
      return acc;
    };

    let anyMissingWorkflowStage = false;

    const tollById = new Map<string, any>();
    for (const tx of scopedTollTx) {
      if (tx?.id) tollById.set(String(tx.id), tx);
    }

    // Unclaimed tolls → needs-review / personal-use / deadhead / claimless underpaid.
    // Linked rows (tripId) never appear in wizard /unreconciled — counting them
    // here left Jan 5 week Outstanding after Finish (cash $2400 approved+linked
    // but still workflowStage needs_review / isReconciled false on ledger).
    // Claimless underpaid_pending with a trip link is also non-blocking (shortfall
    // work is gated by wizard financials).
    for (const tx of unclaimedTolls) {
      if (!tx?.date) continue;
      if (tx.tripId) continue;
      if (!tx.workflowStage) anyMissingWorkflowStage = true;
      const bucket = resolvePeriodBucket(tx);
      if (!bucket) continue;
      getOrCreatePeriod(tx.date).counts[bucket].actionable++;
    }

    // Claims → underpaid-claims (mirror UnderpaidClaimsStep tab rules).
    for (const claim of claims) {
      const dateStr = resolveClaimDate(claim, tollDateById);
      if (!dateStr) continue;
      const toll = claim.transactionId ? tollById.get(String(claim.transactionId)) : undefined;
      applyUnderpaidClaimCounts(getOrCreatePeriod(dateStr), claim, toll, disputeRefunds);
    }

    // Dispute refunds → dispute-refunds, scoped to matched toll/claim week when linked.
    for (const r of disputeRefunds) {
      const periodKey = disputeRefundPeriodKey(r, tollDateById, claims, timezone);
      if (!periodKey) continue;
      let acc = periods.get(periodKey);
      if (!acc) {
        const anchorDate = r.matchedTollId
          ? tollDateById.get(String(r.matchedTollId))
          : r.date;
        if (!anchorDate) continue;
        acc = getOrCreatePeriod(anchorDate);
      }
      if (isDisputeRefundMatched(r)) acc.counts["dispute-refunds"].informational++;
      else acc.counts["dispute-refunds"].actionable++;
    }

    // Unclaimed refund trips → unlinked-refunds.
    // Mirror client isUnlinkedRefundActionableNow: pending-hold alone is
    // informational; pending + cash_wash/phantom Accept suggestion stays actionable.
    const unlinkedSuggestionByTripId = await buildUnresolvedRefundSuggestionStatuses(unclaimedRefundTrips);
    for (const t of unclaimedRefundTrips) {
      if (!t?.date) continue;
      const acc = getOrCreatePeriod(t.date);
      const suggestionStatus = unlinkedSuggestionByTripId.get(String(t.id)) ?? null;
      const hasAcceptSuggestion = !!(suggestionStatus && suggestionStatus !== "pending");
      const isPendingOnly = t.tollRefundResolution?.status === "pending";
      if (isPendingOnly && !hasAcceptSuggestion) {
        acc.counts["unlinked-refunds"].informational++;
      } else {
        acc.counts["unlinked-refunds"].actionable++;
      }
    }

    // ── Per-period financials (same rule as wizard cards) ──────────────────
    // Gross Toll Spend = tag/plaza debits + trip-only tolls (no linked tag).
    // Reimbursed (display) includes cash_wash — Uber paid on the trip.
    // Net Loss uses tag spend − fleet-offset reimbursements (no cash_wash).
    for (const tx of scopedTollTx) {
      if (!tx?.date) continue;
      const amt = Number(tx.amount) < 0 ? Math.abs(Number(tx.amount)) : 0;
      if (amt <= 0) continue;
      const acc = getOrCreatePeriod(tx.date);
      acc.financials.tollSpend += amt;
      acc.financials.tagTollSpend += amt;
    }

    for (const t of scopedTrips) {
      const tc = Math.abs(Number(t.tollCharges) || 0);
      if (tc <= 0) continue;
      const anchor = t.dropoffTime || t.date;
      if (!anchor) continue;
      const acc = getOrCreatePeriod(String(anchor));
      const status = t.tollRefundResolution?.status;
      if (status && status !== "pending") {
        acc.financials.resolvedRefundsAmount += tc;
      }
      // Trip-only spend: real plaza toll with no tag debit linked this period.
      if (!linkedTripIds.has(String(t.id)) && status !== "phantom") {
        acc.financials.tollSpend += tc;
      }
      // Phantom = fake credit — never reimbursed.
      if (status === "phantom") continue;
      acc.financials.reimbursedFromTrips += tc;
      // Cash wash shows on Reimbursed card but does not offset tag Net Loss.
      if (status !== "cash_wash") {
        acc.financials.fleetOffsetReimbursed += tc;
      }
    }

    for (const claim of claims) {
      if (claim.status !== "Resolved" || claim.resolutionReason !== "Charge Driver") continue;
      const dateStr = resolveClaimDate(claim, tollDateById);
      if (!dateStr) continue;
      getOrCreatePeriod(dateStr).financials.chargedToDrivers += Math.abs(Number(claim.amount) || 0);
    }

    for (const r of disputeRefunds) {
      if (!isDisputeRefundMatched(r)) continue;
      const periodKey = disputeRefundPeriodKey(r, tollDateById, claims, timezone);
      const anchorDate = r.matchedTollId
        ? tollDateById.get(String(r.matchedTollId))
        : r.date;
      if (!periodKey && !anchorDate) continue;
      const acc = periodKey && periods.get(periodKey)
        ? periods.get(periodKey)!
        : getOrCreatePeriod(String(anchorDate));
      acc.financials.matchedDisputeRefundAmount += Math.abs(Number(r.amount) || 0);
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const periodsOut = Array.from(periods.entries())
      .map(([id, acc]) => {
        const actionableTotal = STEP_IDS.reduce((sum, stepId) => sum + acc.counts[stepId].actionable, 0);
        const f = acc.financials;
        const reimbursedByPlatform = f.reimbursedFromTrips + f.matchedDisputeRefundAmount;
        return {
          id,
          startDate: format(acc.weekStart, "yyyy-MM-dd"),
          endDate: format(acc.weekEnd, "yyyy-MM-dd"),
          label: formatWeekPeriodLabel(acc.weekStart, acc.weekEnd),
          status: actionableTotal > 0 ? ("outstanding" as const) : ("reconciled" as const),
          actionableTotal,
          counts: acc.counts,
          financials: {
            tollSpend: round2(f.tollSpend),
            reimbursedByPlatform: round2(reimbursedByPlatform),
            matchedDisputeRefundAmount: round2(f.matchedDisputeRefundAmount),
            chargedToDrivers: round2(f.chargedToDrivers),
            netTollLoss: round2(netLossFrom(f)),
            resolvedRefundsAmount: round2(f.resolvedRefundsAmount),
          },
        };
      })
      .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0));

    // Fleet-wide cards = sum of per-period financials (same sources / same rule).
    const totalsAcc = periodsOut.reduce(
      (sum, p) => {
        sum.tollSpend += p.financials.tollSpend;
        sum.reimbursedByPlatform += p.financials.reimbursedByPlatform;
        sum.matchedDisputeRefundAmount += p.financials.matchedDisputeRefundAmount;
        sum.chargedToDrivers += p.financials.chargedToDrivers;
        sum.resolvedRefundsAmount += p.financials.resolvedRefundsAmount;
        sum.netTollLoss += p.financials.netTollLoss;
        return sum;
      },
      {
        tollSpend: 0,
        reimbursedByPlatform: 0,
        matchedDisputeRefundAmount: 0,
        chargedToDrivers: 0,
        resolvedRefundsAmount: 0,
        netTollLoss: 0,
      },
    );
    const netTollLoss = round2(totalsAcc.netTollLoss);

    return c.json({
      success: true,
      timezone,
      generatedAt: new Date().toISOString(),
      workflowStageBackfillComplete: !anyMissingWorkflowStage,
      periods: periodsOut,
      totals: {
        tollSpend: round2(totalsAcc.tollSpend),
        reimbursedByPlatform: round2(totalsAcc.reimbursedByPlatform),
        matchedDisputeRefundAmount: round2(totalsAcc.matchedDisputeRefundAmount),
        chargedToDrivers: round2(totalsAcc.chargedToDrivers),
        netTollLoss: round2(netTollLoss),
        needsReviewCount: unclaimedTolls.length + unclaimedRefundTrips.length,
        tollsNeedingReviewCount: unclaimedTolls.length,
        refundsNeedingReviewCount: unclaimedRefundTrips.length,
        resolvedRefundsAmount: round2(totalsAcc.resolvedRefundsAmount),
      },
    });
  } catch (e: any) {
    return safeErrorResponse(c, e, "TollPeriodController.periods");
  }
});

export default app;
