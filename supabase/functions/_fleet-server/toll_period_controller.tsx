/**
 * Toll Reconciliation — Period Aggregation Controller (Phase F2)
 *
 * One read-only endpoint that loads lookback-bounded toll/trip/claim/
 * dispute-refund history (default last 26 weeks) and buckets into
 * Monday–Sunday weeks (fleet timezone), returning per-period
 * actionable/informational counts for the period-first landing page
 * (apps/fleet/src/components/toll-tags/reconciliation/PeriodLandingPage.tsx).
 * Periods already in the computed set that still have actionable work are
 * kept even if their week start falls outside the lookback window.
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
import { getServiceClient } from "./service_client.ts";
import {
  computeTollFleetLossFromEvents,
  filterTollEventsInDateRange,
  isTollFleetLossEvent,
  tollEventDate,
  type TollLedgerLikeEvent,
} from "../../../apps/fleet/src/utils/tollFleetLossNetting.ts";
import { isTollIncludedInSpend } from "../../../apps/fleet/src/utils/tollLedgerIntegrity.ts";
import {
  loadTollLedgerWithTrips,
  isUnresolvedRefund,
  collectLinkedTripIds,
  loadDisputeRefundRecords,
  filterByDriver,
  loadAllByPrefix,
  isReconcilableTollExpense,
  buildUnresolvedRefundSuggestionStatuses,
} from "./toll_controller.tsx";
import { resolvePeriodBucket } from "./toll_period_bucket.ts";
import { safeErrorResponse } from "./safe_error.ts";
import { classifyTollReconPeriodStatus } from "../../../apps/fleet/src/utils/tollReconPeriodStatus.ts";
import {
  incrementDisputeRefundCount,
  incrementLandingUnclaimedTollCount,
  incrementUnderpaidClaimCount,
  incrementUnlinkedRefundCount,
} from "../../../apps/fleet/src/utils/tollPeriodCounts.ts";
import {
  isDisputeRefundMatched,
  isTollCoveredByDisputeRefund,
  isVisiblePartialShortfallClaim,
} from "../../../apps/fleet/src/utils/tollWeekPeriod.ts";

const app = new Hono();

// Auth gate: every route in this controller requires a valid user JWT (Wave 1B).
app.use("*", requireAuth({ strict: true }));

const BASE = "/make-server-37f42386/toll-reconciliation";

/** Default landing lookback — last N Monday–Sunday weeks including the current week. */
const PERIODS_LOOKBACK_WEEKS = 26;

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

/** Period week for a dispute refund — toll-first, then matched claim, else refund date. */
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

/** Monday of the oldest lookback week → Sunday of the current week (fleet tz). */
function periodsLookbackRange(timezone: string): { fromYmd: string; toYmd: string } {
  const todayYmd = fleetTzDay(new Date().toISOString(), timezone);
  const { weekStart, weekEnd } = weekKeyFor(todayYmd, timezone);
  const from = new Date(weekStart);
  from.setDate(from.getDate() - (PERIODS_LOOKBACK_WEEKS - 1) * 7);
  return {
    fromYmd: format(from, "yyyy-MM-dd"),
    toYmd: format(weekEnd, "yyyy-MM-dd"),
  };
}

function ymdInRange(dateStr: string | null | undefined, fromYmd: string, toYmd: string): boolean {
  if (!dateStr) return false;
  const d = String(dateStr).slice(0, 10);
  return d >= fromYmd && d <= toYmd;
}

/** Underpaid claim still needs a decision (mirrors applyUnderpaidClaimCounts blockers). */
function isClaimStillActionable(claim: any, toll: any, disputeRefunds: any[]): boolean {
  if (claim.status === "Rejected") return true;
  if (claim.status === "Open") {
    return !isTollCoveredByDisputeRefund(claim, disputeRefunds);
  }
  return isVisiblePartialShortfallClaim(claim, toll, disputeRefunds);
}

/**
 * Pre-bucket fleet-loss events by Monday week key once (O(E)).
 * Uses the same date membership as filterTollEventsInDateRange via tollEventDate /
 * isTollFleetLossEvent; week key matches weekKeyFor used for period ids.
 */
function bucketFleetLossEventsByWeek(
  events: TollLedgerLikeEvent[],
  timezone: string,
): Map<string, TollLedgerLikeEvent[]> {
  const buckets = new Map<string, TollLedgerLikeEvent[]>();
  for (const e of events) {
    if (!isTollFleetLossEvent(e)) continue;
    const d = tollEventDate(e);
    if (!d) continue;
    const { key } = weekKeyFor(d, timezone);
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(e);
  }
  return buckets;
}

/** Load canonical events that drive Business Finance P&L Tolls / Net Toll Loss. */
async function loadTollFleetLossLedgerEvents(opts?: {
  driverId?: string;
  from?: string;
  to?: string;
}): Promise<Record<string, unknown>[]> {
  const { listAllUnifiedCanonicalEvents } = await import("../_shared/unifiedLedger/queries.ts");
  return await listAllUnifiedCanonicalEvents({
    products: ["roam_driver", "roam_fleet"],
    entryTypes: ["toll_charge", "toll_refund", "toll_charge_offset", "toll_reimbursement"],
    driverId: opts?.driverId,
    from: opts?.from,
    to: opts?.to,
    maxRows: 100_000,
  });
}

// ─── GET /toll-reconciliation/periods ───────────────────────────────────
app.get(`${BASE}/periods`, requirePermission('toll.view'), async (c) => {
  try {
    const driverId = c.req.query("driverId") || undefined;
    const timezone = await getFleetTimezone();
    const { fromYmd, toYmd } = periodsLookbackRange(timezone);

    const [{ tollTx, trips }, fleetLossEvents] = await Promise.all([
      loadTollLedgerWithTrips(fromYmd, toYmd),
      loadTollFleetLossLedgerEvents({ driverId, from: fromYmd, to: toYmd }),
    ]);
    // Quarantined synthetic cash rows must not inflate spend or net loss.
    const quarantinedTollIds = new Set(
      (tollTx || [])
        .filter((tx: any) => tx && !isTollIncludedInSpend(tx))
        .map((tx: any) => String(tx.id))
        .filter(Boolean),
    );
    const scopedFleetLossEvents = (fleetLossEvents || []).filter((e) => {
      const sid = String(e.sourceId || "");
      return !sid || !quarantinedTollIds.has(sid);
    });
    const fleetLossByWeek = bucketFleetLossEventsByWeek(scopedFleetLossEvents, timezone);
    const canonicalChargeSourceIds = new Set(
      scopedFleetLossEvents
        .filter((e) => String(e.eventType || "") === "toll_charge" && String(e.sourceType || "") === "transaction")
        .map((e) => String(e.sourceId || ""))
        .filter(Boolean),
    );

    const allClaims = (await loadAllByPrefix("claim:")) as any[];
    const claimsAllDrivers = filterByDriver(allClaims, driverId);

    const allDisputeRefunds = await loadDisputeRefundRecords();
    const disputeRefundsAll = filterByDriver(allDisputeRefunds, driverId);

    // Tag credits (top-ups/refunds/adjustments) must not spawn periods or counts.
    // Toll ledger loader is still unbounded; clip to lookback (trips already ranged).
    // Exclude quarantined rows from period Toll Spend / counts.
    const tollTxDriver = filterByDriver(tollTx, driverId)
      .filter(isReconcilableTollExpense)
      .filter(isTollIncludedInSpend);
    const tripsDriver = filterByDriver(trips, driverId);

    const tollByIdAll = new Map<string, any>();
    const tollDateByIdAll = new Map<string, string>();
    for (const tx of tollTxDriver) {
      if (tx?.id) tollByIdAll.set(String(tx.id), tx);
      if (tx?.id && tx?.date) tollDateByIdAll.set(String(tx.id), tx.date);
    }

    // Keep lookback rows + older rows that still drive actionable period work.
    const claims = claimsAllDrivers.filter((claim: any) => {
      const toll = claim.transactionId ? tollByIdAll.get(String(claim.transactionId)) : undefined;
      const dateStr = resolveClaimDate(claim, tollDateByIdAll);
      if (ymdInRange(dateStr, fromYmd, toYmd)) return true;
      return isClaimStillActionable(claim, toll, disputeRefundsAll);
    });

    const claimTxIds = new Set(
      claims.filter((cl: any) => cl.transactionId).map((cl: any) => String(cl.transactionId)),
    );
    const allClaimedTxIds = new Set(
      claimsAllDrivers.filter((cl: any) => cl.transactionId).map((cl: any) => String(cl.transactionId)),
    );

    const disputeRefunds = disputeRefundsAll.filter((r: any) => {
      if (ymdInRange(r?.date, fromYmd, toYmd)) return true;
      if (!isDisputeRefundMatched(r)) return true; // unmatched = still actionable
      return false;
    });

    const scopedTollTx = tollTxDriver.filter((tx: any) => {
      if (ymdInRange(tx?.date, fromYmd, toYmd)) return true;
      // Keep tolls linked to kept claims (anchors for older actionable periods).
      if (tx?.id && claimTxIds.has(String(tx.id))) return true;
      // Truly unclaimed + unlinked tolls outside lookback still spawn actionable periods.
      if (tx?.id && !allClaimedTxIds.has(String(tx.id)) && !tx?.tripId) return true;
      return false;
    });
    const scopedTrips = tripsDriver;

    const tollDateById = new Map<string, string>();
    for (const tx of scopedTollTx) {
      if (tx?.id && tx?.date) tollDateById.set(String(tx.id), tx.date);
    }

    // Same link set as /unclaimed-refunds + Apply (tripId + preUnlinkedTripId).
    const linkedTripIds = collectLinkedTripIds(scopedTollTx);
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
      incrementLandingUnclaimedTollCount(getOrCreatePeriod(tx.date).counts, tx, bucket);
    }

    // Claims → underpaid-claims (shared incrementUnderpaidClaimCount).
    for (const claim of claims) {
      const dateStr = resolveClaimDate(claim, tollDateById);
      if (!dateStr) continue;
      const toll = claim.transactionId ? tollById.get(String(claim.transactionId)) : undefined;
      incrementUnderpaidClaimCount(getOrCreatePeriod(dateStr).counts, claim, toll, disputeRefunds);
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
      incrementDisputeRefundCount(acc.counts, r);
    }

    // Unclaimed refund trips → unlinked-refunds.
    const unlinkedSuggestionByTripId = await buildUnresolvedRefundSuggestionStatuses(unclaimedRefundTrips);
    for (const t of unclaimedRefundTrips) {
      if (!t?.date) continue;
      const acc = getOrCreatePeriod(t.date);
      incrementUnlinkedRefundCount(acc.counts, t, {
        suggestionStatus: unlinkedSuggestionByTripId.get(String(t.id)) ?? null,
      });
    }

    // ── Per-period financials (same rule as wizard cards) ──────────────────
    // Toll Spend = plaza ledger debits. Cash-wash trips with no linked tag
    // are extra cash spend. Pending Unlinked Refunds are reimbursements only.
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
      // Cash at plaza (no tag debit). Do not add unmatched Uber credits — that doubled spend.
      if (!linkedTripIds.has(String(t.id)) && status === "cash_wash") {
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
        const startDate = format(acc.weekStart, "yyyy-MM-dd");
        const endDate = format(acc.weekEnd, "yyyy-MM-dd");
        // Prefer O(1) week bucket; fall back to shared range filter if missing.
        const weekEvents =
          fleetLossByWeek.get(id) ??
          filterTollEventsInDateRange(scopedFleetLossEvents, startDate, endDate);
        return {
          id,
          startDate,
          endDate,
          label: formatWeekPeriodLabel(acc.weekStart, acc.weekEnd),
          status: classifyTollReconPeriodStatus(acc.counts, actionableTotal),
          actionableTotal,
          counts: acc.counts,
          financials: {
            tollSpend: round2(f.tollSpend),
            reimbursedByPlatform: round2(reimbursedByPlatform),
            matchedDisputeRefundAmount: round2(f.matchedDisputeRefundAmount),
            chargedToDrivers: round2(f.chargedToDrivers),
            // Same formula as Business Finance P&L Tolls (canonical ledger netting).
            netTollLoss: computeTollFleetLossFromEvents(weekEvents).net,
            resolvedRefundsAmount: round2(f.resolvedRefundsAmount),
          },
        };
      })
      // Lookback window + any computed period that still has actionable work.
      .filter((p) => p.startDate >= fromYmd || p.actionableTotal > 0)
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

    // Tag usages with a driver that never got a Business Finance toll_charge.
    let missingCanonicalChargeCount = 0;
    for (const tx of scopedTollTx) {
      if (String(tx?.type || "").toLowerCase() !== "usage") continue;
      if (!tx?.driverId || !String(tx.driverId).trim()) continue;
      const id = String(tx.id || "");
      if (!id) continue;
      if (!canonicalChargeSourceIds.has(id)) missingCanonicalChargeCount++;
    }

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
        missingCanonicalChargeCount,
      },
    });
  } catch (e: any) {
    return safeErrorResponse(c, e, "TollPeriodController.periods");
  }
});

export default app;
