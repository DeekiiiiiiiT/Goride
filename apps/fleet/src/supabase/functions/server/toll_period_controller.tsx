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
 *   - apps/fleet/src/utils/tollPeriodGating.ts (isClaimActionableNow / isClaimInformationalOnly)
 *   - apps/fleet/src/utils/tollWeekPeriod.ts (isDisputeRefundMatched, getClaimWeekDate, weekBucketForDate, formatWeekPeriodLabel)
 *   - apps/fleet/src/utils/tollBucket.ts (bucketForWorkflowStage)
 *
 * Routes:
 *   GET /toll-reconciliation/periods?driverId= – per-period step counts
 */

import { Hono } from "npm:hono";
import { startOfWeek, endOfWeek, format } from "npm:date-fns";
import { getFleetTimezone } from "./timezone_helper.tsx";
import {
  loadAllTollLedgerWithTrips,
  isUnresolvedRefund,
  loadDisputeRefundRecords,
  filterByDriver,
  loadAllByPrefix,
} from "./toll_controller.tsx";

const app = new Hono();

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
  "underpaid-claims",
  "dispute-refunds",
  "unlinked-refunds",
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

/** Mirrors isTripLinkConfirmed / resolveTollBucket in apps/fleet/src/utils/tollBucket.ts. */
function resolvePeriodBucket(tx: any): "needs-review" | "underpaid-claims" | "deadhead" | "personal-use" | null {
  const linkConfirmed = !!(tx.isReconciled && tx.tripId);
  if (!linkConfirmed && (tx.matchStatus === "ambiguous" || tx.isAmbiguous === true)) {
    return "needs-review";
  }
  return bucketForWorkflowStage(tx.workflowStage);
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

/** Mirrors isClaimActionableNow/isClaimInformationalOnly in apps/fleet/src/utils/tollPeriodGating.ts. */
function isClaimActionableNow(claim: any): boolean {
  switch (claim?.status) {
    case "Sent_to_Driver":
    case "Submitted_to_Uber":
    case "Resolved":
      return false;
    case "Rejected":
    case "Open":
    default:
      return true;
  }
}
function isClaimInformationalOnly(claim: any): boolean {
  return claim?.status === "Sent_to_Driver" || claim?.status === "Submitted_to_Uber";
}

/** Mirrors isDisputeRefundMatched in apps/fleet/src/utils/tollWeekPeriod.ts. */
function isDisputeRefundMatched(r: any): boolean {
  return r?.status === "matched" || r?.status === "auto_resolved";
}

/** Mirrors getClaimWeekDate's fallback chain in apps/fleet/src/utils/tollWeekPeriod.ts. */
function resolveClaimDate(claim: any, tollDateById: Map<string, string>): string | null {
  const candidates: (string | undefined)[] = [
    claim?.date,
    claim?.transactionId ? tollDateById.get(String(claim.transactionId)) : undefined,
    claim?.tripDate,
    claim?.createdAt,
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

interface PeriodAccumulator {
  weekStart: Date;
  weekEnd: Date;
  counts: Record<StepId, StepCounts>;
}

// ─── GET /toll-reconciliation/periods ───────────────────────────────────
app.get(`${BASE}/periods`, async (c) => {
  try {
    const driverId = c.req.query("driverId") || undefined;
    const timezone = await getFleetTimezone();

    const { tollTx, trips } = await loadAllTollLedgerWithTrips();
    const scopedTollTx = filterByDriver(tollTx, driverId);
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
        acc = { weekStart, weekEnd, counts: zeroCounts() };
        periods.set(key, acc);
      }
      return acc;
    };

    let anyMissingWorkflowStage = false;

    // Unclaimed tolls → needs-review / personal-use / deadhead / underpaid-claims.
    for (const tx of unclaimedTolls) {
      if (!tx?.date) continue;
      if (!tx.workflowStage) anyMissingWorkflowStage = true;
      const bucket = resolvePeriodBucket(tx);
      if (!bucket) continue;
      getOrCreatePeriod(tx.date).counts[bucket].actionable++;
    }

    // Claims → underpaid-claims (actionable or informational).
    for (const claim of claims) {
      const dateStr = resolveClaimDate(claim, tollDateById);
      if (!dateStr) continue;
      const acc = getOrCreatePeriod(dateStr);
      if (isClaimActionableNow(claim)) acc.counts["underpaid-claims"].actionable++;
      else if (isClaimInformationalOnly(claim)) acc.counts["underpaid-claims"].informational++;
    }

    // Dispute refunds → dispute-refunds (actionable if unmatched, else informational).
    for (const r of disputeRefunds) {
      if (!r?.date) continue;
      const acc = getOrCreatePeriod(r.date);
      if (isDisputeRefundMatched(r)) acc.counts["dispute-refunds"].informational++;
      else acc.counts["dispute-refunds"].actionable++;
    }

    // Unclaimed refund trips → unlinked-refunds (always actionable).
    for (const t of unclaimedRefundTrips) {
      if (!t?.date) continue;
      getOrCreatePeriod(t.date).counts["unlinked-refunds"].actionable++;
    }

    const periodsOut = Array.from(periods.entries())
      .map(([id, acc]) => {
        const actionableTotal = STEP_IDS.reduce((sum, stepId) => sum + acc.counts[stepId].actionable, 0);
        return {
          id,
          startDate: format(acc.weekStart, "yyyy-MM-dd"),
          endDate: format(acc.weekEnd, "yyyy-MM-dd"),
          label: formatWeekPeriodLabel(acc.weekStart, acc.weekEnd),
          status: actionableTotal > 0 ? ("outstanding" as const) : ("reconciled" as const),
          actionableTotal,
          counts: acc.counts,
        };
      })
      .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0));

    // ── All-time financial snapshot (the pre-period-redesign dashboard cards),
    // now sourced from the same single loaded/scoped data this endpoint
    // already builds its per-period counts from, so the two views can never
    // silently disagree with each other. Unlike the per-period counts above,
    // these are deliberately NOT period-scoped — they're the fleet-wide
    // (optionally driver-scoped) totals shown once, above the period list.
    const round2 = (n: number) => Math.round(n * 100) / 100;

    const tollSpend = scopedTollTx.reduce(
      (sum: number, tx: any) => sum + (Number(tx.amount) < 0 ? Math.abs(Number(tx.amount)) : 0),
      0,
    );
    const reimbursedFromTrips = scopedTrips.reduce((sum: number, t: any) => sum + (Number(t.tollCharges) || 0), 0);
    const matchedDisputeRefundAmount = disputeRefunds
      .filter((r: any) => isDisputeRefundMatched(r))
      .reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);
    const reimbursedByPlatform = reimbursedFromTrips + matchedDisputeRefundAmount;
    const chargedToDrivers = claims
      .filter((cl: any) => cl.status === "Resolved" && cl.resolutionReason === "Charge Driver")
      .reduce((sum: number, cl: any) => sum + Math.abs(Number(cl.amount) || 0), 0);
    const netTollLoss = Math.max(0, tollSpend - reimbursedByPlatform - chargedToDrivers);

    const resolvedRefundTrips = scopedTrips.filter(
      (t: any) => t.tollRefundResolution && t.tollRefundResolution.status !== "pending",
    );
    const resolvedRefundsAmount = resolvedRefundTrips.reduce(
      (sum: number, t: any) => sum + (Number(t.tollCharges) || 0),
      0,
    );

    return c.json({
      success: true,
      timezone,
      generatedAt: new Date().toISOString(),
      workflowStageBackfillComplete: !anyMissingWorkflowStage,
      periods: periodsOut,
      totals: {
        tollSpend: round2(tollSpend),
        reimbursedByPlatform: round2(reimbursedByPlatform),
        matchedDisputeRefundAmount: round2(matchedDisputeRefundAmount),
        chargedToDrivers: round2(chargedToDrivers),
        netTollLoss: round2(netTollLoss),
        needsReviewCount: unclaimedTolls.length + unclaimedRefundTrips.length,
        tollsNeedingReviewCount: unclaimedTolls.length,
        refundsNeedingReviewCount: unclaimedRefundTrips.length,
        resolvedRefundsAmount: round2(resolvedRefundsAmount),
      },
    });
  } catch (e: any) {
    console.log(`[TollPeriodController] GET /periods error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

export default app;
