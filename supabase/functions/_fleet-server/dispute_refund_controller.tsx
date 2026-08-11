/**
 * Dispute Refund Controller
 *
 * Server-side endpoints for managing Support Adjustment refunds
 * extracted from Uber payments_transaction CSVs.
 *
 * KV Key Patterns:
 *   dispute-refund:<id>                → DisputeRefund JSON
 *   dispute-refund-dedup:<supportCaseId> → dispute-refund:<id> (dedup index)
 *
 * Routes:
 *   POST   /dispute-refunds/import           – Bulk import with dedup
 *   GET    /dispute-refunds                  – List all (with optional filters)
 *   PATCH  /dispute-refunds/:id/match        – Link refund to toll + auto-resolve claim
 *   PATCH  /dispute-refunds/:id/unmatch      – Unlink a matched refund
 *   GET    /dispute-refunds/suggestions/:id  – Smart match suggestions
 *   GET    /dispute-refunds/match-detail/:id – Linked toll + trip for a matched refund
 *   POST   /dispute-refunds/repair-settlements – Seed trip credits + reproject matched claims
 */

import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission, type RbacUser } from "./rbac_middleware.ts";
import { getServiceClient } from "./service_client.ts";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import { isTollCategory } from "./toll_category_flags.ts";
import { getFleetTimezone, hasTzSuffix } from "./timezone_helper.tsx";
import { upsertClaim, deleteClaim, findExistingClaimIdForToll } from "./claim_service.ts";
import {
  applyRefundResolution,
  isUnresolvedRefund,
  loadAllTollLedgerWithTrips,
  getRefundAutomationSettings,
  reconcileTollForDisputeMatch,
  getDriverAliasMap,
} from "./toll_controller.tsx";
import {
  driverIdsReferToSamePerson,
  driverNamesReferToSamePerson,
} from "./driver_identity.ts";
import {
  DISPUTE_SHORTFALL_TOLERANCE,
  amountsAlign,
  isFullyReimbursedViaTrip,
  isMatchableDisputeClaim,
} from "./dispute_refund_eligibility.ts";
import {
  candidateToSuggestion,
  DEFAULT_DISPUTE_REFUND_AUTO_MIN_CONFIDENCE,
  evaluateDisputeBareTollCandidate,
  evaluateDisputeClaimCandidate,
  pickDisputeMatchCandidate,
} from "./dispute_match_rules.ts";
import {
  computeLiveTripRefundForToll,
  enrichAndFilterDisputeBareTolls,
  resolveLiveTripContextForToll,
} from "./dispute_match_toll_enrichment.ts";
import {
  applySettlementAllocation,
  isCorrectSettlementOrderEnabled,
  reverseSettlementsForSource,
  getRemainingShortfall,
  loadAllocationsForToll,
  projectClaimFromSettlement,
  ensureTripRefundAllocation,
  sumActiveTripSideCredits,
  computeDisputeMatchDetailFinancials,
} from "./toll_settlement.ts";
import { remainingTollShortfall } from "../../../apps/fleet/src/utils/tollSettlement.ts";
import { safeErrorResponse } from "./safe_error.ts";
import { periodAnchorFor } from "./financial_ledger.ts";

const app = new Hono();

// Auth gate: every route in this controller requires a valid user JWT (Wave 1B).
app.use("*", requireAuth({ strict: true }));

// Wave 5: Use shared service client
const supabase = getServiceClient();

const BASE = "/make-server-37f42386/dispute-refunds";

/**
 * Resolve a stored date value to its calendar day (yyyy-MM-dd) in the fleet
 * timezone — the same frame the UI displays and groups by.
 *
 * Two stored forms exist and are handled distinctly:
 *   • Date-only ("2026-06-18") or fleet-local naive timestamp
 *     ("2026-06-18T06:55:00", no suffix) → the date part IS already the fleet
 *     calendar day, so no shift is applied.
 *   • UTC / offset-suffixed timestamp ("2026-06-18T02:00:00Z") → converted to
 *     the fleet-tz calendar day (may roll to the previous/next day).
 */
function fleetTzDay(dateStr: string | null | undefined, tz: string): string {
  if (!dateStr) return "";
  const s = String(dateStr);
  if (!hasTzSuffix(s)) return s.slice(0, 10);
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

function mapTripsById(tripIds: string[], tripValues: any[]): Map<string, any> {
  const map = new Map<string, any>();
  tripIds.forEach((id, idx) => {
    const trip = tripValues[idx];
    if (trip) map.set(id, trip);
  });
  return map;
}

function attachTripDisplayFields(target: any, trip: any): void {
  target.tripPickup = trip.pickupLocation || null;
  target.tripDropoff = trip.dropoffLocation || null;
  target.tripPlatform = trip.platform || null;
  target.tripRequestTime = trip.requestTime || trip.date || null;
  target.tripDropoffTime = trip.dropoffTime || null;
}

// ─── Helper: Load all KV entries by prefix with 1000-row pagination ────
async function loadAllByPrefix(prefix: string): Promise<any[]> {
  const results: any[] = [];
  const batch = await kv.getByPrefix(prefix);
  if (Array.isArray(batch)) {
    results.push(...batch);
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// DISPUTE ↔ UNDERPAID MATCHING (claims-first, variance-aware)
// ═══════════════════════════════════════════════════════════════════════
// A dispute refund is the money we won back on an underpaid toll. Its amount
// equals the *shortfall* (the Claimable-Loss claim amount), NOT the full toll.
// Match against open Toll_Refund claims or Resolved "Charge Driver" claims
// (late refunds reverse the charge). Resolving as "Reimbursed" closes the loop.

const TOLL_REFUND_LINK_PREFIX = "dispute-refund-toll:";

async function getRefundIdLinkedToToll(tollId: string, excludeRefundId?: string): Promise<string | null> {
  const linked = await kv.get(`${TOLL_REFUND_LINK_PREFIX}${tollId}`);
  if (typeof linked === "string" && linked && linked !== excludeRefundId) return linked;
  return null;
}

async function setRefundTollLink(tollId: string, refundId: string): Promise<void> {
  await kv.set(`${TOLL_REFUND_LINK_PREFIX}${tollId}`, refundId);
}

async function clearRefundTollLink(tollId: string): Promise<void> {
  await kv.del(`${TOLL_REFUND_LINK_PREFIX}${tollId}`);
}

/** Load a toll behind a claim from the ledger (falls back to legacy transaction). */
async function loadTollForClaim(transactionId: string | undefined): Promise<any | null> {
  if (!transactionId) return null;
  return (
    (await kv.get(`toll_ledger:${transactionId}`)) ||
    (await kv.get(`transaction:${transactionId}`)) ||
    null
  );
}

/** Matchable toll-refund claims for a driver (open underpaid + Charge Driver).
 *  Uber CSV IDs and Roam driver UUIDs are treated as the same person via alias map. */
async function loadOpenTollClaimsForDriver(
  driverId: string,
  aliasMap?: Map<string, string>,
): Promise<any[]> {
  const allClaims = await loadAllByPrefix("claim:");
  const map = aliasMap ?? (await getDriverAliasMap());
  return allClaims.filter(
    (cl: any) =>
      cl && typeof cl === "object" &&
      isMatchableDisputeClaim(cl) &&
      driverIdsReferToSamePerson(cl.driverId, driverId, map),
  );
}

/** Load toll IDs already linked to a matched dispute refund. */
async function loadLinkedDisputeTollIds(): Promise<Set<string>> {
  const allRefunds = await loadAllByPrefix("dispute-refund:");
  return new Set(
    allRefunds
      .filter((r: any) => r?.matchedTollId && (r.status === "matched" || r.status === "auto_resolved"))
      .map((r: any) => String(r.matchedTollId)),
  );
}

/** Evaluate claim/toll candidates for one refund (claims-first, bare-toll fallback). */
async function buildDisputeCandidates(
  refund: any,
  opts?: { light?: boolean; preferFrom?: string; preferTo?: string },
) {
  const driverId = refund.driverId;
  if (!driverId) return [];
  const light = opts?.light === true;
  const preferFrom = (opts?.preferFrom || "").slice(0, 10);
  const preferTo = (opts?.preferTo || "").slice(0, 10);
  const preferPeriod = !!(preferFrom || preferTo);

  const fleetTz = await getFleetTimezone();
  const aliasMap = await getDriverAliasMap();
  const linkedTollIds = await loadLinkedDisputeTollIds();
  const claims = await loadOpenTollClaimsForDriver(driverId, aliasMap);

  // Alias expansion can pull every claim for a driver — only fully evaluate the
  // closest amount matches (live trip enrichment is CPU-heavy on edge).
  const refundAmt = Math.abs(Number(refund.amount) || 0);
  const claimsToEval = [...claims]
    .sort(
      (a, b) =>
        Math.abs(Math.abs(Number(a.amount) || 0) - refundAmt) -
        Math.abs(Math.abs(Number(b.amount) || 0) - refundAmt),
    )
    .slice(0, light ? 12 : 8);

  const trips = light ? [] : (await loadAllTollLedgerWithTrips()).trips;

  const evaluated: NonNullable<Awaited<ReturnType<typeof evaluateDisputeClaimCandidate>>>[] = [];
  for (const claim of claimsToEval) {
    const toll = await loadTollForClaim(claim.transactionId);
    const candidate = await evaluateDisputeClaimCandidate({
      refund,
      claim,
      toll,
      trips,
      fleetTz,
      linkedTollIds,
      light,
    });
    if (candidate) evaluated.push(candidate);
  }

  const dayInPreferPeriod = (dateStr: string | null | undefined) => {
    if (!preferPeriod) return true;
    const d = fleetTzDay(dateStr, fleetTz);
    if (!d) return false;
    if (preferFrom && d < preferFrom) return false;
    if (preferTo && d > preferTo) return false;
    return true;
  };

  const hasEligibleClaims = evaluated.some((c) => c.eligibleForSuggestion);
  // Active recon week: always scan bare shortfalls in that week so they surface
  // even when older open claims score higher on amount/date proximity.
  // Otherwise keep claims-first short-circuit (light) / full bare fallback (!light).
  const needBare = !hasEligibleClaims || preferPeriod;
  if (!needBare) return evaluated;
  if (light && !preferPeriod) return evaluated;

  const ledger = await loadAllByPrefix("toll_ledger:");
  const barePool: any[] = [];
  for (const toll of ledger) {
    if (!toll || typeof toll !== "object") continue;
    if (!driverIdsReferToSamePerson(toll.driverId, driverId, aliasMap)) continue;
    if (preferPeriod && !dayInPreferPeriod(toll.date)) continue;
    barePool.push(toll);
  }
  const bareToEval = barePool
    .sort(
      (a, b) =>
        Math.abs(Math.abs(Number(a.amount) || 0) - refundAmt) -
        Math.abs(Math.abs(Number(b.amount) || 0) - refundAmt),
    )
    .slice(0, preferPeriod && light ? 12 : 8);

  for (const toll of bareToEval) {
    const candidate = await evaluateDisputeBareTollCandidate({
      refund,
      toll,
      fleetTz,
      linkedTollIds,
      trips,
    });
    if (candidate) evaluated.push(candidate);
  }
  return evaluated;
}

/** Build ranked match suggestions for a dispute refund (claims first, toll fallback). */
async function computeDisputeSuggestions(
  refund: any,
  opts?: { preferFrom?: string; preferTo?: string },
): Promise<any[]> {
  const preferFrom = (opts?.preferFrom || "").slice(0, 10);
  const preferTo = (opts?.preferTo || "").slice(0, 10);
  const preferPeriod = !!(preferFrom || preferTo);
  const fleetTz = preferPeriod ? await getFleetTimezone() : "";

  const inPreferPeriod = (dateStr: string | null | undefined) => {
    if (!preferPeriod) return false;
    const d = fleetTzDay(dateStr, fleetTz);
    if (!d) return false;
    if (preferFrom && d < preferFrom) return false;
    if (preferTo && d > preferTo) return false;
    return true;
  };

  const evaluated = await buildDisputeCandidates(refund, {
    light: true,
    preferFrom,
    preferTo,
  });
  return evaluated
    .filter((c) => c.eligibleForSuggestion)
    .sort((a, b) => {
      // Active recon week shortfalls first, then confidence.
      if (preferPeriod) {
        const aIn = inPreferPeriod(a.date) ? 1 : 0;
        const bIn = inPreferPeriod(b.date) ? 1 : 0;
        if (aIn !== bIn) return bIn - aIn;
      }
      return b.confidence - a.confidence;
    })
    .slice(0, 5)
    .map(candidateToSuggestion);
}

/** Shared match: link a refund to a toll (+claim), resolving the claim as Reimbursed. */
/**
 * Ensure trip_refund credit → apply dispute_refund → project claim from ledger.
 * Shared by live match and repair so Expenses / claims stay on one shortfall SSOT.
 */
async function applyDisputeSettlementToClaim(input: {
  refund: any;
  claim: any;
  claimId: string;
  tollId: string;
  suggestedTripId?: string | null;
  actor: string;
  c: unknown;
  /** When repairing, keep existing preDispute* if already set. */
  preservePreDispute?: boolean;
  /** Skip per-claim period rebuild (repair batches rebuilds once at the end). */
  skipPeriodRebuild?: boolean;
}): Promise<{
  applyAmt: number;
  remainingAfter: number;
  tollCost: number;
  projected: ReturnType<typeof projectClaimFromSettlement>;
  tripId: string | null;
  tripShareApplied: number;
  driverId: string | null;
  tollDate: string | null;
  refundDate: string | null;
}> {
  const { refund, claim, claimId, tollId, actor, c } = input;
  const cs = claim.status;
  const priorPaid = Math.abs(Number(claim.paidAmount) || 0);
  const disputeAmount = Math.abs(Number(refund.amount) || 0);
  const fleetTz = await getFleetTimezone();
  const tollForDisplay = await loadTollForClaim(tollId);
  const tollCost = Math.abs(
    Number(claim.expectedAmount ?? tollForDisplay?.amount ?? claim.amount) || 0,
  );
  const periodAnchor = String(claim.date || tollForDisplay?.date || "").slice(0, 10) || null;
  const settlementOrder = await isCorrectSettlementOrderEnabled();

  let tripId: string | null =
    input.suggestedTripId || claim.tripId || tollForDisplay?.tripId || null;
  let tripShareApplied = 0;

  if (settlementOrder && tollId && tollCost > DISPUTE_SHORTFALL_TOLERANCE) {
    try {
      const liveCtx = await resolveLiveTripContextForToll(tollForDisplay || { id: tollId }, fleetTz, {
        suggestedTripId: tripId,
        // Match/repair must stay cheap — never O(tolls×trips) scan here.
        skipInferred: true,
      });
      if (liveCtx) {
        tripId = liveCtx.tripId;
        const share = Math.abs(Number(liveCtx.tripRefund) || 0);
        if (share > DISPUTE_SHORTFALL_TOLERANCE) {
          const ensured = await ensureTripRefundAllocation({
            tollId,
            tripId: liveCtx.tripId,
            amount: share,
            tollCost,
            claimId,
            tollPeriodAnchor: periodAnchor,
            actor,
            notes: `Trip refund share $${share.toFixed(2)}`,
          });
          if (ensured.ok) tripShareApplied = ensured.applyAmount;
        }
      }
    } catch (e: any) {
      console.warn(`[DisputeRefund] ensure trip_refund warn: ${e?.message}`);
    }
  }

  let remainingBefore = Math.abs(Number(claim.amount) || 0);
  let applyAmt = 0;
  let remainingAfter = remainingBefore;

  if (settlementOrder && tollId) {
    remainingBefore = await getRemainingShortfall(tollId, tollCost);
    applyAmt = Math.min(disputeAmount, remainingBefore);
    if (applyAmt > DISPUTE_SHORTFALL_TOLERANCE) {
      try {
        const applied = await applySettlementAllocation({
          sourceType: "dispute_refund",
          sourceId: refund.id,
          tollId,
          claimId,
          amount: applyAmt,
          tollCost,
          tollPeriodAnchor: periodAnchor,
          actor,
          notes: `Dispute refund $${applyAmt.toFixed(2)}`,
        });
        if (applied.ok) {
          applyAmt = applied.applyAmount;
          remainingAfter = applied.remainingAfter;
        } else {
          remainingAfter = Math.max(0, Math.round((remainingBefore - applyAmt) * 100) / 100);
        }
      } catch (e: any) {
        console.warn(`[DisputeRefund] allocation warn: ${e?.message}`);
        remainingAfter = Math.max(0, Math.round((remainingBefore - applyAmt) * 100) / 100);
      }
    } else {
      applyAmt = 0;
      remainingAfter = remainingBefore;
    }
  } else {
    applyAmt = disputeAmount;
    remainingAfter = 0;
  }

  const projected = settlementOrder
    ? projectClaimFromSettlement({
        tollCost,
        remaining: remainingAfter,
        // Ledger remaining already includes trip + dispute credits; don't add shares again.
        priorPaid,
        disputeRefundId: refund.id,
      })
    : {
        status: "Resolved" as const,
        resolutionReason: "Reimbursed" as const,
        amount: 0,
        paidAmount: Math.max(priorPaid, disputeAmount),
        expectedAmount: tollCost,
      };

  const keepPre = input.preservePreDispute && claim.preDisputeStatus != null;
  await upsertClaim(
    {
      ...claim,
      status: projected.status,
      resolutionReason: projected.resolutionReason,
      disputeRefundId: refund.id,
      amount: projected.amount,
      paidAmount: projected.paidAmount,
      expectedAmount: projected.expectedAmount || tollCost,
      tripId: tripId || claim.tripId,
      platform: claim.platform || refund.platform || undefined,
      pickup:
        claim.pickup ||
        (tollForDisplay as { metadata?: { plaza?: string } } | null)?.metadata?.plaza ||
        undefined,
      preDisputeStatus: keepPre ? claim.preDisputeStatus : cs,
      preDisputeResolutionReason: keepPre
        ? claim.preDisputeResolutionReason
        : cs === "Resolved"
          ? claim.resolutionReason
          : claim.preDisputeResolutionReason,
      preDisputeAmount: keepPre ? claim.preDisputeAmount : claim.amount,
      preDisputePaidAmount: keepPre ? claim.preDisputePaidAmount : priorPaid,
    },
    c,
    { syncMode: "force", suggestedTripId: tripId ?? claim.tripId, fleetTz },
  );

  try {
    if (!input.skipPeriodRebuild) {
      await rebuildPeriodsForDisputeMatch({
        driverId: claim.driverId || refund.driverId || tollForDisplay?.driverId,
        tollDate: tollForDisplay?.date || claim.date,
        refundDate: refund.date,
        fleetTz,
      });
    }
  } catch (e: any) {
    console.warn(`[DisputeRefund] period rebuild warn: ${e?.message}`);
  }

  return {
    applyAmt,
    remainingAfter,
    tollCost,
    projected,
    tripId,
    tripShareApplied,
    driverId: claim.driverId || refund.driverId || tollForDisplay?.driverId || null,
    tollDate: tollForDisplay?.date || claim.date || null,
    refundDate: refund.date || null,
  };
}

async function rebuildPeriodsForDisputeMatch(input: {
  driverId?: string | null;
  tollDate?: string | null;
  refundDate?: string | null;
  fleetTz: string;
}): Promise<void> {
  const driverId = input.driverId ? String(input.driverId) : "";
  if (!driverId) return;
  const { rebuildDriverFinancialPeriod } = await import("./driver_financial_periods.ts");
  const anchors = new Set<string>();
  for (const d of [input.tollDate, input.refundDate]) {
    if (!d) continue;
    try {
      anchors.add(await periodAnchorFor(String(d), input.fleetTz));
    } catch {
      // skip bad dates
    }
  }
  for (const anchor of anchors) {
    await rebuildDriverFinancialPeriod(driverId, anchor);
  }
}

async function matchRefundToClaim(
  refund: any,
  tollTransactionId: string,
  claimId: string | null,
  auto: boolean,
  c: unknown,
  opts?: { tripId?: string | null; manualPick?: boolean },
): Promise<{ ok: true; data: any; warning?: string } | { ok: false; status: number; error: string }> {
  const id = refund.id;
  const recordKey = `dispute-refund:${id}`;

  if (refund.status === "matched" || refund.status === "auto_resolved") {
    return { ok: false, status: 409, error: `Refund ${id} is already matched to toll ${refund.matchedTollId}. Unmatch it first.` };
  }
  const existingRefundId = await getRefundIdLinkedToToll(tollTransactionId, id);
  if (existingRefundId) {
    return { ok: false, status: 409, error: `Toll ${tollTransactionId} is already linked to refund ${existingRefundId}. Unlink it first.` };
  }

  const settings = await getRefundAutomationSettings();

  // Persist toll→trip link when automation resolved a suggested trip.
  const reconcileTripId = opts?.tripId || null;
  if (reconcileTripId) {
    try {
      const tollEntry = await loadTollForClaim(tollTransactionId);
      if (tollEntry && !tollEntry.tripId) {
        await reconcileTollForDisputeMatch(tollTransactionId, reconcileTripId);
      }
    } catch (err: any) {
      console.log(`[DisputeRefund] reconcileTollForDisputeMatch skipped: ${err.message}`);
    }
  }

  let matchWarning: string | undefined;
  // Manual UI picks already passed eligibility in match-candidates — skip the
  // heavy full-ledger candidate rebuild (was exhausting edge compute).
  if (!auto && !opts?.manualPick) {
    const evaluated = await buildDisputeCandidates(refund);
    const picked = evaluated.find(
      (c) => c.tollId === tollTransactionId && (claimId ? c.claimId === claimId : !c.claimId),
    );
    if (picked && !picked.eligibleForAuto && picked.rejectReason) {
      matchWarning = picked.rejectReason;
    }
  }

  // Toll-only match: resolve the linked claim so partial shortfall rows clear.
  // A stale claimId (e.g. UI list captured before a period reset recreated the
  // claim) must not produce a dangling matchedClaimId — fall back to the live
  // claim for this toll.
  let resolvedClaimId = claimId;
  if (resolvedClaimId && !(await kv.get(`claim:${resolvedClaimId}`))) {
    console.warn(`[DisputeRefund] Claim ${resolvedClaimId} no longer exists — resolving live claim for toll ${tollTransactionId}`);
    resolvedClaimId = null;
  }
  if (!resolvedClaimId) {
    resolvedClaimId = await findExistingClaimIdForToll(tollTransactionId);
  }

  let updated: any = {
    ...refund,
    status: "matched",
    matchedTollId: tollTransactionId,
    matchedClaimId: resolvedClaimId || null,
    resolvedAt: new Date().toISOString(),
    resolvedBy: auto ? "system-auto" : "admin",
  };
  await kv.set(recordKey, updated);
  await setRefundTollLink(tollTransactionId, id);

  if (resolvedClaimId) {
    const claimKey = `claim:${resolvedClaimId}`;
    const claim = await kv.get(claimKey);
    if (claim && typeof claim === "object") {
      const cs = (claim as any).status;
      // Rejected is terminal/adversarial — leave it alone. Resolved claims
      // (e.g. previously "Charge Driver") now flow through the reversible
      // sync too, instead of being silently skipped, so a dispute that
      // proves a toll was actually reimbursed correctly un-charges the driver.
      if (cs === "Rejected") {
        console.log(`[DisputeRefund] Claim ${resolvedClaimId} is Rejected — refund marked matched, claim untouched`);
      } else {
        const settle = await applyDisputeSettlementToClaim({
          refund,
          claim: claim as any,
          claimId: resolvedClaimId,
          tollId: tollTransactionId,
          suggestedTripId: opts?.tripId ?? null,
          actor: auto ? "system-auto" : "admin",
          c,
        });
        // Only auto_resolved when the shortfall is fully closed.
        if (settle.projected.status === "Resolved") {
          updated = { ...updated, status: "auto_resolved", matchedClaimId: resolvedClaimId };
        } else {
          updated = { ...updated, status: "matched", matchedClaimId: resolvedClaimId };
        }
        await kv.set(recordKey, updated);
        console.log(
          `[DisputeRefund] ${auto ? "Auto-" : ""}matched claim ${resolvedClaimId} (apply $${settle.applyAmt}, remaining $${settle.remainingAfter}) via refund ${id}`,
        );
      }
    }
  }

  // ── Trip-side cascade (Unlinked Refunds) ──────────────────────────────
  if (settings.disputeRefundTripSyncEnabled) {
    try {
      const tollEntry = await loadTollForClaim(tollTransactionId);
      const claimForTrip: any = resolvedClaimId ? await kv.get(`claim:${resolvedClaimId}`) : null;
      const tripId = opts?.tripId || claimForTrip?.tripId || tollEntry?.tripId || null;
      if (tripId) {
        const trip = await kv.get(`trip:${tripId}`);
        if (trip) {
          // This toll is now linked to the trip — no full-ledger scan needed.
          const linkedTripIds = new Set([tripId]);
          if (isUnresolvedRefund(trip, linkedTripIds)) {
            await applyRefundResolution({
              tripId,
              resolution: "expense_logged",
              existingLedgerId: tollTransactionId, // the matched toll IS the real ledger row
              auto,
              driverId: refund.driverId,
              notes: `Linked via dispute refund ${id}`,
              source: `system:dispute_refund_sync:${id}`,
            });
            console.log(`[DisputeRefund] Trip ${tripId} resolved (unlinked → expense_logged) via refund ${id}`);
          }
        }
      }
    } catch (err: any) {
      console.error(`[DisputeRefund] Trip cascade failed for refund ${id}:`, err.message);
    }
  }

  return { ok: true, data: updated, ...(matchWarning ? { warning: matchWarning } : {}) };
}

// ─── POST /dispute-refunds/import ──────────────────────────────────────
app.post(`${BASE}/import`, requirePermission('toll.manage'), async (c) => {
  try {
    const body = await c.req.json();
    const refunds: any[] = body.refunds || [];

    if (!Array.isArray(refunds) || refunds.length === 0) {
      return c.json({ imported: 0, skipped: 0, total: 0, message: "No refunds provided" });
    }

    let imported = 0;
    let skipped = 0;

    for (const refund of refunds) {
      const supportCaseId = refund.supportCaseId;
      if (!supportCaseId) {
        console.log(`[DisputeRefund] Skipping refund with no supportCaseId`);
        skipped++;
        continue;
      }

      // Check dedup key
      const dedupKey = `dispute-refund-dedup:${supportCaseId}`;
      const existing = await kv.get(dedupKey);
      if (existing) {
        console.log(`[DisputeRefund] Dedup skip: ${supportCaseId} already imported`);
        skipped++;
        continue;
      }

      // Generate a stable ID if not provided
      const id = refund.id || `dr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const batchId =
        typeof refund.batchId === "string" && refund.batchId.trim() ? refund.batchId.trim() : undefined;
      const record = {
        ...refund,
        id,
        ...(batchId ? { batchId } : {}),
        status: refund.status || "unmatched",
        matchedTollId: refund.matchedTollId || null,
        matchedClaimId: refund.matchedClaimId || null,
        importedAt: refund.importedAt || new Date().toISOString(),
        resolvedAt: null,
        resolvedBy: null,
      };

      // Write record + dedup index
      const recordKey = `dispute-refund:${id}`;
      await kv.set(recordKey, record);
      await kv.set(dedupKey, recordKey);

      console.log(`[DisputeRefund] Imported: ${supportCaseId} → ${recordKey} ($${record.amount})`);
      imported++;
    }

    return c.json({
      imported,
      skipped,
      total: refunds.length,
      message: `Imported ${imported} dispute refund(s)${skipped > 0 ? `, ${skipped} skipped (duplicates)` : ""}`,
    });
  } catch (err: any) {
    return safeErrorResponse(c, err, "DisputeRefund.import");
  }
});

// ─── POST /dispute-refunds/repair-settlements ──────────────────────────
/** Seed missing trip_refund credits + reproject matched claims from ledger SSOT. */
app.post(`${BASE}/repair-settlements`, requirePermission('toll.manage'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false; // default dry-run for safety
    const limit = Math.max(1, Math.min(10, Number(body?.limit) || 10));
    const offset = Math.max(0, Number(body?.offset) || 0);
    const fleetTz = await getFleetTimezone();
    const allRefunds = await loadAllByPrefix("dispute-refund:");
    const matched = (allRefunds || []).filter(
      (r: any) =>
        r &&
        (r.status === "matched" || r.status === "auto_resolved") &&
        r.matchedTollId,
    );
    const page = matched.slice(offset, offset + limit);

    const report = {
      dryRun,
      scanned: matched.length,
      pageOffset: offset,
      pageLimit: limit,
      pageSize: page.length,
      repaired: 0,
      alreadyOk: 0,
      exceptions: [] as Array<{ refundId: string; tollId?: string; reason: string }>,
      samples: [] as Array<{
        refundId: string;
        tollId: string;
        tripShare: number;
        remainingBefore: number;
        remainingAfter: number;
        claimBefore: string;
        claimAfter: string;
      }>,
      periodsRebuilt: 0,
    };

    const periodKeys = new Set<string>(); // driverId|anchor

    for (const refund of page) {
      const refundId = String(refund.id);
      const tollId = String(refund.matchedTollId);
      try {
        const claimId = refund.matchedClaimId ? String(refund.matchedClaimId) : null;
        if (!claimId) {
          report.exceptions.push({ refundId, tollId, reason: "no matchedClaimId" });
          continue;
        }
        const claim: any = await kv.get(`claim:${claimId}`);
        if (!claim || typeof claim !== "object") {
          report.exceptions.push({ refundId, tollId, reason: `claim ${claimId} missing` });
          continue;
        }
        const toll = await loadTollForClaim(tollId);
        const tollCost = Math.abs(
          Number(claim.expectedAmount ?? toll?.amount ?? claim.amount) || 0,
        );
        if (!(tollCost > 0)) {
          report.exceptions.push({ refundId, tollId, reason: "missing toll cost" });
          continue;
        }

        const liveCtx = await resolveLiveTripContextForToll(toll || { id: tollId }, fleetTz, {
          suggestedTripId: claim.tripId || null,
          skipInferred: true,
        });
        const tripShare = liveCtx ? Math.abs(Number(liveCtx.tripRefund) || 0) : 0;
        const remainingBefore = await getRemainingShortfall(tollId, tollCost);
        const tripSide = await sumActiveTripSideCredits(tollId);
        const missingTrip = Math.max(0, tripShare - tripSide);
        const simulatedAfterTrip = Math.max(
          0,
          Math.round((remainingBefore - missingTrip) * 100) / 100,
        );
        const projected = projectClaimFromSettlement({
          tollCost,
          remaining: simulatedAfterTrip,
          priorPaid: Math.abs(Number(claim.paidAmount) || 0),
          disputeRefundId: refundId,
        });
        const claimBefore = `${claim.status}/${claim.resolutionReason || "none"}:${claim.amount}`;
        const claimAfter = `${projected.status}/${projected.resolutionReason || "none"}:${projected.amount}`;
        const needsWork =
          missingTrip > DISPUTE_SHORTFALL_TOLERANCE ||
          claim.status !== projected.status ||
          String(claim.resolutionReason || "") !== String(projected.resolutionReason || "") ||
          Math.abs(Number(claim.amount) - projected.amount) > DISPUTE_SHORTFALL_TOLERANCE;

        report.samples.push({
          refundId,
          tollId,
          tripShare,
          remainingBefore,
          remainingAfter: simulatedAfterTrip,
          claimBefore,
          claimAfter,
        });

        if (!needsWork) {
          report.alreadyOk++;
          continue;
        }

        if (dryRun) {
          report.repaired++;
          continue;
        }

        const settle = await applyDisputeSettlementToClaim({
          refund,
          claim,
          claimId,
          tollId,
          suggestedTripId: liveCtx?.tripId || claim.tripId || null,
          actor: "repair-settlements",
          c,
          preservePreDispute: true,
          skipPeriodRebuild: true,
        });

        if (settle.projected.status === "Resolved" && refund.status !== "auto_resolved") {
          await kv.set(`dispute-refund:${refundId}`, {
            ...refund,
            status: "auto_resolved",
            matchedClaimId: claimId,
          });
        }
        const driverId = settle.driverId ? String(settle.driverId) : "";
        if (driverId) {
          for (const d of [settle.tollDate, settle.refundDate]) {
            if (!d) continue;
            try {
              const anchor = await periodAnchorFor(String(d), fleetTz);
              periodKeys.add(`${driverId}|${anchor}`);
            } catch {
              // skip
            }
          }
        }
        report.repaired++;
      } catch (e: any) {
        report.exceptions.push({
          refundId,
          tollId,
          reason: e?.message || String(e),
        });
      }
    }

    if (!dryRun && periodKeys.size > 0) {
      const { rebuildDriverFinancialPeriod } = await import("./driver_financial_periods.ts");
      for (const key of periodKeys) {
        const [driverId, anchor] = key.split("|");
        try {
          await rebuildDriverFinancialPeriod(driverId, anchor);
          report.periodsRebuilt++;
        } catch (e: any) {
          report.exceptions.push({
            refundId: "period-rebuild",
            reason: `${key}: ${e?.message || e}`,
          });
        }
      }
    }

    return c.json({ success: true, report });
  } catch (err: any) {
    return safeErrorResponse(c, err, "DisputeRefund.repairSettlements");
  }
});

// ─── GET /dispute-refunds ──────────────────────────────────────────────
app.get(`${BASE}`, async (c) => {
  try {
    const status = c.req.query("status");
    const driverId = c.req.query("driverId");
    // Comma-separated expanded IDs (native + Uber + InDrive) for driver Financials.
    const driverIdsRaw = c.req.query("driverIds") || "";
    const driverIdSet = new Set(
      driverIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    );
    if (driverId) driverIdSet.add(driverId);
    const dateFrom = c.req.query("dateFrom");
    const dateTo = c.req.query("dateTo");

    let raw: any[];
    if (driverIdSet.size > 0) {
      // Driver Financials: filter at the DB instead of shipping the fleet dump.
      const ids = Array.from(driverIdSet);
      const scoped: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      for (;;) {
        const { data, error } = await fromKvStore()
          .select("value")
          .like("key", "dispute-refund:%")
          .in("value->>driverId", ids)
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const page = (data || []).map((d: any) => d.value).filter(Boolean);
        scoped.push(...page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }
      raw = scoped;
    } else {
      raw = await loadAllByPrefix("dispute-refund:");
    }
    // Filter out dedup keys (they store string references, not objects)
    let refunds = raw.filter(
      (item: any) => item && typeof item === "object" && item.id && item.supportCaseId
    );

    // Apply filters
    if (status) {
      refunds = refunds.filter((r: any) => r.status === status);
    }
    // When driverIdSet was used for the DB query, records already match those IDs.
    // Re-apply for the unscoped path if a single driverId was provided (covered above).
    if (driverIdSet.size > 0) {
      refunds = refunds.filter((r: any) => driverIdSet.has(r.driverId));
    }
    // Date range is an inclusive fleet-tz calendar-day window (yyyy-MM-dd). Each
    // refund's date is resolved to its fleet-tz day so the boundaries line up
    // with what the UI shows/groups by, and the end day is fully inclusive.
    if (dateFrom || dateTo) {
      const fleetTz = await getFleetTimezone();
      const from = dateFrom ? String(dateFrom).slice(0, 10) : "";
      const to = dateTo ? String(dateTo).slice(0, 10) : "";
      refunds = refunds.filter((r: any) => {
        const d = fleetTzDay(r.date, fleetTz);
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }

    // Sort by date descending
    refunds.sort((a: any, b: any) => {
      const da = new Date(a.date).getTime() || 0;
      const db = new Date(b.date).getTime() || 0;
      return db - da;
    });

    // ── Self-heal dangling matches: a period reset (or manual claim delete)
    //    can erase the claim a refund was resolved against. Left matched, the
    //    refund silently holds its toll hostage and blocks re-matching, so
    //    revert it to unmatched here before listing/auto-linking.
    for (const refund of refunds) {
      if (refund.status !== "matched" && refund.status !== "auto_resolved") continue;
      if (!refund.matchedClaimId) continue;
      const missingClaimId = String(refund.matchedClaimId);
      const claimStillExists = await kv.get(`claim:${missingClaimId}`);
      if (claimStillExists) continue;
      try {
        const healed = await unmatchDisputeRefundById(String(refund.id), c);
        Object.assign(refund, healed);
        console.log(`[DisputeRefund] Healed dangling match ${refund.id} (claim ${missingClaimId} missing)`);
      } catch (healErr: any) {
        console.log(`[DisputeRefund] Heal failed for ${refund.id}: ${healErr.message}`);
      }
    }

    // ── Auto-link (flagged): only during an active wizard period (dateFrom +
    //    dateTo both required). Must stay cheap — a full trip-ledger rebuild
    //    per unmatched refund was HTTP 546'ing the list and wiping the UI.
    let autoMatched = 0;
    try {
      const settings = await getRefundAutomationSettings();
      const enabled = settings.refundAutomationEnabled === true;
      const minConf = typeof settings.disputeRefundAutoMinConfidence === "number"
        ? settings.disputeRefundAutoMinConfidence
        : DEFAULT_DISPUTE_REFUND_AUTO_MIN_CONFIDENCE;
      const periodFrom = dateFrom ? String(dateFrom).slice(0, 10) : "";
      const periodTo = dateTo ? String(dateTo).slice(0, 10) : "";
      const autoPeriodActive = Boolean(periodFrom && periodTo);
      if (enabled && autoPeriodActive) {
        const fleetTz = await getFleetTimezone();
        const unmatched = refunds.filter((r: any) => r.status === "unmatched" && r.driverId);
        // Cap per list request so opening a week cannot burn the whole edge budget.
        const AUTO_CAP = 5;
        let attempted = 0;
        for (const refund of unmatched) {
          if (attempted >= AUTO_CAP) break;
          attempted++;
          const candidates = (await buildDisputeCandidates(refund, { light: true })).filter((c) => {
            const d = fleetTzDay(c.date, fleetTz);
            return Boolean(d && d >= periodFrom && d <= periodTo);
          });
          // Light path never sets eligibleForAuto — pick by suggestion confidence
          // and require an exact shortfall amount match before linking.
          const best = pickDisputeMatchCandidate(candidates, {
            mode: "suggest",
            minConfidence: minConf,
          });
          if (!best?.claimId) continue;
          if (best.shortfall <= DISPUTE_SHORTFALL_TOLERANCE) continue;
          if (!amountsAlign(Math.abs(Number(refund.amount) || 0), best.shortfall)) continue;
          const res = await matchRefundToClaim(
            refund,
            best.tollId,
            best.claimId,
            true,
            c,
            { tripId: best.tripId },
          );
          if (res.ok) {
            Object.assign(refund, res.data);
            autoMatched++;
          }
        }
        if (autoMatched > 0) console.log(`[DisputeRefund] Auto-linked ${autoMatched} refund(s) to underpaid claims`);
      }
    } catch (autoErr: any) {
      console.log(`[DisputeRefund] Auto-link pass error: ${autoErr.message}`);
    }

    return c.json({ data: refunds, total: refunds.length, autoMatched });
  } catch (err: any) {
    return safeErrorResponse(c, err, "DisputeRefund.list");
  }
});

// ─── PATCH /dispute-refunds/:id/match ──────────────────────────────────
app.patch(`${BASE}/:id/match`, requirePermission('toll.manage'), async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { tollTransactionId, createClaim, suggestedTripId } = body;
    let { claimId } = body;

    if (!tollTransactionId) {
      return c.json({ error: "tollTransactionId is required" }, 400);
    }

    const tollForGuard = await loadTollForClaim(tollTransactionId);
    if (tollForGuard) {
      const tollAmount = Math.abs(tollForGuard.amount || 0);
      // Cheap canonical guard first: settlement allocations are the source of
      // truth for what's already credited. The legacy live-refund guard did a
      // full-ledger geo-match scan (O(tolls × trips)) that blew the edge CPU
      // budget — only use it when no allocations exist, and never let it
      // infer trip links from scratch.
      let guardedByAllocations = false;
      if (await isCorrectSettlementOrderEnabled()) {
        const allocs = await loadAllocationsForToll(tollTransactionId);
        if (allocs.length > 0) {
          guardedByAllocations = true;
          const remaining = remainingTollShortfall(tollAmount, allocs, tollTransactionId);
          if (remaining <= DISPUTE_SHORTFALL_TOLERANCE) {
            return c.json({
              error: "This toll is already fully settled (trip credits + adjustments cover the full cost) — nothing left for a dispute refund.",
            }, 409);
          }
        }
      }
      if (!guardedByAllocations) {
        const fleetTz = await getFleetTimezone();
        const liveRefund = await computeLiveTripRefundForToll(tollForGuard, fleetTz, {
          suggestedTripId: suggestedTripId ?? null,
          skipInferred: true,
        });
        if (liveRefund != null && isFullyReimbursedViaTrip(tollAmount, liveRefund)) {
          return c.json({
            error: "This toll was already fully reimbursed on the trip fare — use Needs Review or Underpaid & Claims, not Dispute Refunds.",
          }, 409);
        }
      }
    }

    const refund: any = await kv.get(`dispute-refund:${id}`);
    if (!refund || typeof refund !== "object") {
      return c.json({ error: `Dispute refund not found: ${id}` }, 404);
    }

    // Manual link to a bare toll (no claim yet) → create or reuse the claim on the fly,
    // sized to the amount we won back, so the loop still closes.
    if (!claimId && createClaim) {
      let toll = await loadTollForClaim(tollTransactionId);
      if (!toll?.tripId && suggestedTripId) {
        await reconcileTollForDisputeMatch(tollTransactionId, suggestedTripId);
        toll = await loadTollForClaim(tollTransactionId);
      }

      const fleetTz = await getFleetTimezone();
      // Bare-toll candidates are pre-filtered to have no claim — skip the
      // all-claims scan that was blowing edge compute budgets.
      const existingClaimId = toll?.claimId
        ? await findExistingClaimIdForToll(tollTransactionId)
        : null;
      const refundAmount = Math.abs(refund.amount || 0);
      const tollAmount = Math.abs(toll?.amount || 0);

      if (existingClaimId) {
        const existing: any = await kv.get(`claim:${existingClaimId}`);
        const upgraded = await upsertClaim(
          {
            ...(existing && typeof existing === "object" ? existing : {}),
            id: existingClaimId,
            transactionId: tollTransactionId,
            tripId: toll?.tripId || suggestedTripId || existing?.tripId || null,
            driverId: toll?.driverId || refund.driverId || existing?.driverId || "unknown",
            driverName: toll?.driverName || refund.driverName || existing?.driverName || null,
            type: "Toll_Refund",
            // Keep Resolved claims as-is so matchRefundToClaim can transition
            // Charge Driver → Reimbursed and reverse the driver charge.
            status: existing?.status === "Resolved" ? existing.status : "Submitted_to_Uber",
            resolutionReason: existing?.status === "Resolved" ? existing.resolutionReason : null,
            amount: refundAmount,
            expectedAmount: tollAmount,
            platform: existing?.platform || refund.platform || undefined,
            pickup:
              existing?.pickup ||
              (toll?.metadata as { plaza?: string } | undefined)?.plaza ||
              undefined,
            subject: existing?.subject || "Toll Underpayment (manual dispute match)",
            date: toll?.date || existing?.date || undefined,
          },
          c,
          { syncMode: "skip", suggestedTripId: suggestedTripId ?? toll?.tripId, fleetTz },
        );
        claimId = upgraded.id;
      } else {
        const newClaimId = `claim-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const newClaim = await upsertClaim(
          {
            id: newClaimId,
            transactionId: tollTransactionId,
            tripId: toll?.tripId || suggestedTripId || null,
            driverId: toll?.driverId || refund.driverId || "unknown",
            driverName: toll?.driverName || refund.driverName || null,
            type: "Toll_Refund",
            status: "Submitted_to_Uber",
            amount: refundAmount,
            expectedAmount: tollAmount,
            platform: refund.platform || undefined,
            pickup: (toll?.metadata as { plaza?: string } | undefined)?.plaza || undefined,
            subject: "Toll Underpayment (manual dispute match)",
            date: toll?.date || undefined,
            _createdByRefund: id,
          },
          c,
          { syncMode: "skip", suggestedTripId: suggestedTripId ?? toll?.tripId, fleetTz },
        );
        claimId = newClaim.id;
      }
    }

    const result = await matchRefundToClaim(
      refund,
      tollTransactionId,
      claimId || null,
      false,
      c,
      { tripId: suggestedTripId || null, manualPick: true },
    );
    if (!result.ok) return c.json({ error: result.error }, result.status as any);

    console.log(`[DisputeRefund] Matched refund ${id} → toll ${tollTransactionId}${claimId ? ` + claim ${claimId}` : ""}`);
    return c.json({
      data: result.data,
      ...(result.warning ? { warning: result.warning } : {}),
    });
  } catch (err: any) {
    return safeErrorResponse(c, err, "DisputeRefund.match");
  }
});

// ─── PATCH /dispute-refunds/:id/unmatch ────────────────────────────────
export async function unmatchDisputeRefundById(id: string, c: unknown): Promise<any> {
  const recordKey = `dispute-refund:${id}`;
  const refund: any = await kv.get(recordKey);
  if (!refund || typeof refund !== "object") {
    throw Object.assign(new Error(`Dispute refund not found: ${id}`), { status: 404 });
  }

  try {
    await reverseSettlementsForSource("dispute_refund", id, { actor: "unmatch-dispute" });
  } catch (e: any) {
    console.warn(`[DisputeRefund] allocation reverse warn: ${e?.message}`);
  }

  const settings = await getRefundAutomationSettings();

  const claimId = refund.matchedClaimId;
  let claimTripIdForTripReversal: string | null = null;
  if (claimId) {
    const claimKey = `claim:${claimId}`;
    const claim: any = await kv.get(claimKey);
    if (claim && typeof claim === "object" && claim.disputeRefundId === id) {
      claimTripIdForTripReversal = claim.tripId || null;
      if (claim._createdByRefund === id) {
        // Symmetric with matchRefundToClaim's unconditional syncMode:"force" —
        // a match always runs the driver-wallet claim sync, so unmatch must
        // always undo it too, regardless of disputeRefundTripSyncEnabled
        // (that flag gates the TRIP cascade below, not this reversal).
        await deleteClaim(claimId, c, { syncMode: "force" });
        console.log(`[DisputeRefund] Deleted refund-created claim ${claimId} on unmatch`);
      } else if (settings.disputeRefundTripSyncEnabled && claim.preDisputeResolutionReason !== undefined) {
        const revertReason = claim.preDisputeResolutionReason || undefined;
        await upsertClaim(
          {
            ...claim,
            status: claim.preDisputeStatus || "Sent_to_Driver",
            resolutionReason: revertReason || null,
            // Restore pre-dispute shortfall amounts when present (settlement order).
            amount:
              typeof claim.preDisputeAmount === "number" ? claim.preDisputeAmount : claim.amount,
            paidAmount:
              typeof claim.preDisputePaidAmount === "number"
                ? claim.preDisputePaidAmount
                : claim.paidAmount,
            disputeRefundId: null,
            preDisputeStatus: null,
            preDisputeResolutionReason: null,
            preDisputeAmount: null,
            preDisputePaidAmount: null,
            preIsReconciled: revertReason === undefined ? undefined : claim.preIsReconciled,
          },
          c,
          { syncMode: "force" },
        );
        console.log(`[DisputeRefund] Reverted claim ${claimId} to ${claim.preDisputeStatus || "Sent_to_Driver"} on unmatch`);
      } else {
        // Same symmetry fix as the delete branch above — always force.
        await upsertClaim(
          {
            ...claim,
            status: claim.preDisputeStatus || "Sent_to_Driver",
            resolutionReason: null,
            disputeRefundId: null,
            preDisputeStatus: null,
          },
          c,
          { syncMode: "force" },
        );
        console.log(`[DisputeRefund] Reverted claim ${claimId} to ${claim.preDisputeStatus || "Sent_to_Driver"} on unmatch`);
      }
    }
  }

  if (settings.disputeRefundTripSyncEnabled && refund.matchedTollId) {
    try {
      const tollEntry = await loadTollForClaim(refund.matchedTollId);
      const tripId = claimTripIdForTripReversal || tollEntry?.tripId || null;
      if (tripId) {
        const trip: any = await kv.get(`trip:${tripId}`);
        if (trip?.tollRefundResolution?.source === `system:dispute_refund_sync:${id}`) {
          await applyRefundResolution({ tripId, resolution: "pending", auto: false, source: "admin" });
          console.log(`[DisputeRefund] Trip ${tripId} reverted to pending on unmatch of refund ${id}`);
        }
      }
    } catch (err: any) {
      console.error(`[DisputeRefund] Trip cascade reversal failed for refund ${id}:`, err.message);
    }
  }

  if (refund.matchedTollId) {
    await clearRefundTollLink(String(refund.matchedTollId));
  }

  const updated = {
    ...refund,
    status: "unmatched",
    matchedTollId: null,
    matchedClaimId: null,
    resolvedAt: null,
    resolvedBy: null,
  };
  await kv.set(recordKey, updated);
  console.log(`[DisputeRefund] Unmatched refund ${id}`);
  return updated;
}

app.patch(`${BASE}/:id/unmatch`, requirePermission('toll.manage'), async (c) => {
  try {
    const id = c.req.param("id");
    const updated = await unmatchDisputeRefundById(id, c);
    return c.json({ data: updated });
  } catch (err: any) {
    const status = typeof err.status === "number" ? err.status : 500;
    if (status === 500) {
      return safeErrorResponse(c, err, "DisputeRefund.unmatch");
    }
    return c.json({ error: `Failed to unmatch dispute refund: ${err.message}` }, status);
  }
});

// ─── GET /dispute-refunds/suggestions/:id ──────────────────────────────
app.get(`${BASE}/suggestions/:id`, async (c) => {
  try {
    const id = c.req.param("id");
    const preferFrom = (c.req.query("from") || "").slice(0, 10);
    const preferTo = (c.req.query("to") || "").slice(0, 10);

    // Load the refund
    const recordKey = `dispute-refund:${id}`;
    const refund: any = await kv.get(recordKey);
    if (!refund || typeof refund !== "object") {
      return c.json({ error: `Dispute refund not found: ${id}` }, 404);
    }

    if (!refund.driverId) {
      return c.json({ suggestions: [], message: "Refund has no driver ID — cannot suggest matches" });
    }

    // Claims-first, variance-aware matching (reads toll_ledger + open claims).
    // Optional from/to = active recon week — prefer shortfalls in that week.
    const suggestions = await computeDisputeSuggestions(refund, {
      preferFrom: preferFrom || undefined,
      preferTo: preferTo || undefined,
    });
    return c.json({ suggestions });
  } catch (err: any) {
    return safeErrorResponse(c, err, "DisputeRefund.suggestions");
  }
});

// ─── GET /dispute-refunds/match-candidates ─────────────────────────────
// Manual search across ALL drivers: open underpaid claims, Charge Driver
// claims (late refunds), + bare tolls (no claim yet).
app.get(`${BASE}/match-candidates`, async (c) => {
  try {
    const q = (c.req.query("q") || "").trim().toLowerCase();
    const from = (c.req.query("from") || "").slice(0, 10); // yyyy-MM-dd
    const to = (c.req.query("to") || "").slice(0, 10);
    const filterDriverId = (c.req.query("driverId") || "").trim();
    // Period-scoped lists need room for every shortfall in the week (fleet-wide).
    const LIMIT = from || to ? 100 : 25;
    // Period boundaries arrive as fleet-tz calendar days; normalize each
    // candidate's date into the same frame before comparing (see fleetTzDay).
    const fleetTz = await getFleetTimezone();
    const aliasMap = await getDriverAliasMap();
    const dayInRange = (dateStr: string | null | undefined) => {
      if (!from && !to) return true;
      const d = fleetTzDay(dateStr, fleetTz);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    };
    const matchesDriverFilter = (candidateDriverId: string | null | undefined) => {
      if (!filterDriverId) return true;
      return driverIdsReferToSamePerson(candidateDriverId, filterDriverId, aliasMap);
    };

    // Tolls already linked to a matched refund (exclude from candidates).
    const allRefunds = await loadAllByPrefix("dispute-refund:");
    const linkedTollIds = new Set(
      allRefunds
        .filter((r: any) => r && r.matchedTollId && (r.status === "matched" || r.status === "auto_resolved"))
        .map((r: any) => r.matchedTollId),
    );

    // Single ledger load — also used as claim→toll lookup (no N+1 kv.get).
    const ledger = await loadAllByPrefix("toll_ledger:");
    const ledgerById = new Map<string, any>();
    for (const toll of ledger || []) {
      if (toll?.id) ledgerById.set(String(toll.id), toll);
    }

    // Open underpaid + already-charged (Charge Driver) claims across all drivers.
    const allClaims = await loadAllByPrefix("claim:");
    const openClaims = allClaims.filter(
      (cl: any) => cl && typeof cl === "object" && isMatchableDisputeClaim(cl),
    );
    const claimTollIds = new Set(openClaims.map((cl: any) => cl.transactionId).filter(Boolean));

    const claimCandidates: any[] = [];
    for (const cl of openClaims) {
      const toll = cl.transactionId
        ? (ledgerById.get(String(cl.transactionId)) || null)
        : null;
      const anchorDate = toll?.date || cl.date || cl.createdAt || null;
      // Drop out-of-period / wrong-driver claims before building the response payload.
      if (!dayInRange(anchorDate)) continue;
      if (!matchesDriverFilter(cl.driverId || toll?.driverId)) continue;
      const claimAmount = Math.abs(cl.amount || 0);
      const tollAmount = Math.abs(cl.expectedAmount ?? toll?.amount ?? 0);
      claimCandidates.push({
        matchType: "claim",
        claimId: cl.id,
        tollId: cl.transactionId,
        tripId: cl.tripId || toll?.tripId || null,
        driverId: cl.driverId,
        driverName: toll?.driverName || cl.driverName || "Unknown",
        claimAmount,
        tollAmount,
        // The claim amount IS the shortfall (see the file-level doc comment),
        // so what Uber already paid via the trip fare is the remainder —
        // shown alongside the toll cost so the user can see the same
        // cost/refund/shortfall picture the Underpaid & Claims step shows.
        tripRefund: Math.max(0, tollAmount - claimAmount),
        // Align to the toll date (what the period filters on), not the claim's
        // creation date — createdAt is often days/weeks after the trip.
        date: toll?.date || cl.createdAt || null,
        // The toll's own time-of-day — shown alongside the matched trip's
        // time so a cross-day (or otherwise implausible) match is visible
        // at a glance instead of hidden behind a date-only display.
        tollTime: toll?.time || null,
        status: cl.status,
      });
    }

    // Bare tolls (usage, no claim yet, not already linked).
    const tollCandidates: any[] = [];
    const rawTollById = new Map<string, any>();
    for (const toll of ledger) {
      if (!toll || typeof toll !== "object" || !toll.id) continue;
      if (toll.type && toll.type !== "usage") continue;
      if (!dayInRange(toll.date)) continue;
      if (!matchesDriverFilter(toll.driverId)) continue;
      if (claimTollIds.has(toll.id) || linkedTollIds.has(toll.id)) continue;
      // Do NOT use a broad "any claim" block — Rejected / stale claims would hide
      // bare underpaid shortfalls that Underpaid & Claims still lists. Matchable
      // open claims are already excluded via claimTollIds above.
      const stage = toll.workflowStage;
      const MATCHABLE_STAGES = ["needs_review", "underpaid_pending", "underpaid", "matched"];
      if (stage && !MATCHABLE_STAGES.includes(stage)) continue;
      rawTollById.set(toll.id, toll);
      tollCandidates.push({
        matchType: "toll",
        claimId: null,
        tollId: toll.id,
        tripId: toll.tripId || null,
        driverId: toll.driverId,
        driverName: toll.driverName || "Unknown",
        claimAmount: null,
        tollAmount: Math.abs(toll.amount || 0),
        date: toll.date,
        // The toll's own time-of-day — shown alongside the matched trip's
        // time so a cross-day (or otherwise implausible) match is visible
        // at a glance instead of hidden behind a date-only display.
        tollTime: toll.time || null,
        status: null,
        workflowStage: toll.workflowStage || null,
      });
    }

    const matchQ = (cand: any) => {
      if (!q) return true;
      // Uber CSV names often append platform suffixes (e.g. RATTRAYCAS) while
      // toll/claim rows use the Roam name — substring match fails; fuzzy does not.
      if (cand.driverName && driverNamesReferToSamePerson(String(cand.driverName), q)) {
        return true;
      }
      const hay = `${cand.driverName} ${cand.tollAmount} ${cand.claimAmount ?? ""} ${cand.date ?? ""}`.toLowerCase();
      return hay.includes(q);
    };
    const keep = (cand: any) => matchQ(cand);
    const byDate = (a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();

    const claims = claimCandidates.filter(keep).sort(byDate).slice(0, LIMIT);

    // Enrich + eligibility-filter BEFORE slice so fully-reimbursed tolls don't
    // consume the result cap (Dispute Refunds is shortfall-only). Enrichment
    // (per-toll trip matching) is CPU-heavy — when the wizard passes from/to,
    // skip live geo-match and use persisted trip links only (avoids HTTP 546).
    const ENRICH_CAP = LIMIT;
    let tolls = tollCandidates.filter(keep).sort(byDate).slice(0, ENRICH_CAP);
    const scopedPeriod = !!(from || to);
    try {
      tolls = await enrichAndFilterDisputeBareTolls(tolls, rawTollById, fleetTz, {
        skipInferred: scopedPeriod,
      });
    } catch {
      // Best-effort — fall back to workflow-stage filter only.
      tolls = tolls.filter((t) => {
        const raw = rawTollById.get(t.tollId);
        return raw?.workflowStage === "underpaid_pending";
      });
    }
    tolls = tolls.slice(0, LIMIT);

    // Attach matched-trip details to claim candidates (already linked via
    // Underpaid & Claims' "Flag for Claim") so the user can see exactly
    // which trip a claim's toll was matched to.
    const claimTripIds = [...new Set(claims.map((c: any) => c.tripId).filter(Boolean))] as string[];
    if (claimTripIds.length > 0) {
      try {
        const tripKeys = claimTripIds.map((tid) => `trip:${tid}`);
        const tripValues = await kv.mget(tripKeys);
        const tripById = mapTripsById(claimTripIds, tripValues);
        for (const c of claims) {
          const trip = c.tripId ? tripById.get(c.tripId) : null;
          if (trip) attachTripDisplayFields(c, trip);
        }
      } catch {
        // Best-effort enrichment — candidates are still usable without it.
      }
    }

    return c.json({ claims, tolls });
  } catch (err: any) {
    return safeErrorResponse(c, err, "DisputeRefund.matchCandidates");
  }
});

// ─── GET /dispute-refunds/match-detail/:id ─────────────────────────────
/** Read-only view of which toll/trip a matched refund was linked to. */
app.get(`${BASE}/match-detail/:id`, async (c) => {
  try {
    const id = c.req.param("id");
    const refund: any = await kv.get(`dispute-refund:${id}`);
    if (!refund || typeof refund !== "object") {
      return c.json({ error: `Dispute refund not found: ${id}` }, 404);
    }
    if (refund.status === "unmatched" || !refund.matchedTollId) {
      return c.json({ error: "Refund is not linked to a toll yet" }, 404);
    }

    const toll = await loadTollForClaim(refund.matchedTollId);
    const claim: any = refund.matchedClaimId
      ? await kv.get(`claim:${refund.matchedClaimId}`)
      : null;

    const fleetTz = await getFleetTimezone();
    const tollAmount = Math.abs(toll?.amount ?? 0);
    const claimAmount = claim ? Math.abs(claim.amount ?? 0) : null;
    const tollCost = Math.abs(claim?.expectedAmount ?? tollAmount);

    let trip: any = null;
    let tripId: string | null = claim?.tripId || toll?.tripId || null;
    let tripLinkSource: "claim" | "toll" | "inferred" | null = claim?.tripId
      ? "claim"
      : toll?.tripId
        ? "toll"
        : null;

    if (tripId) {
      trip = await kv.get(`trip:${tripId}`);
    }
    if (!trip && toll) {
      const live = await resolveLiveTripContextForToll(toll, fleetTz);
      if (live) {
        trip = live.trip;
        tripId = live.tripId;
        tripLinkSource = live.tripLinkSource;
      }
    }

    const liveTripRefund = toll ? await computeLiveTripRefundForToll(toll, fleetTz) : null;
    let settlementTripSide: number | null = null;
    try {
      settlementTripSide = await sumActiveTripSideCredits(String(refund.matchedTollId));
    } catch {
      settlementTripSide = null;
    }
    const disputeRefund = Math.abs(Number(refund.amount) || 0);
    const fin = computeDisputeMatchDetailFinancials({
      tollCost,
      liveTripRefund,
      settlementTripSideCredits: settlementTripSide,
      disputeRefund,
    });
    const { tripRefund, shortfall, variance, coversShortfallFully } = fin;

    return c.json({
      refund: {
        id: refund.id,
        amount: disputeRefund,
        date: refund.date,
        status: refund.status,
        platform: refund.platform,
        supportCaseId: refund.supportCaseId,
        resolvedAt: refund.resolvedAt,
        resolvedBy: refund.resolvedBy,
      },
      financials: {
        tollCost,
        tripRefund,
        shortfall,
        disputeRefund,
        variance,
        coversShortfallFully,
      },
      toll: toll
        ? {
            id: toll.id,
            amount: tollAmount,
            date: toll.date,
            time: toll.time || null,
            location: toll.location || toll.description || toll.vendor || null,
            driverName: toll.driverName || refund.driverName || null,
            tripId: toll.tripId || null,
          }
        : null,
      claim: claim
        ? {
            id: claim.id,
            amount: claimAmount,
            expectedAmount: Math.abs(claim.expectedAmount ?? tollCost),
            status: claim.status,
            resolutionReason: claim.resolutionReason || null,
            tripId: claim.tripId || null,
          }
        : null,
      trip: trip
        ? {
            id: trip.id,
            pickup: trip.pickupLocation || null,
            dropoff: trip.dropoffLocation || null,
            platform: trip.platform || null,
            requestTime: trip.requestTime || trip.date || null,
            dropoffTime: trip.dropoffTime || null,
            tollCharges: Number(trip.tollCharges) || 0,
            tripRefund,
            tripLinkSource,
          }
        : null,
    });
  } catch (err: any) {
    return safeErrorResponse(c, err, "DisputeRefund.matchDetail");
  }
});

export default app;