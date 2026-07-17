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
 */

import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { isTollCategory } from "./toll_category_flags.ts";
import { getFleetTimezone, hasTzSuffix } from "./timezone_helper.tsx";
import { upsertClaim, deleteClaim, findExistingClaimIdForToll } from "./claim_service.ts";
import {
  applyRefundResolution,
  isUnresolvedRefund,
  loadAllTollLedgerWithTrips,
  getRefundAutomationSettings,
  reconcileTollForDisputeMatch,
} from "./toll_controller.tsx";
import {
  DISPUTE_SHORTFALL_TOLERANCE,
  isFullyReimbursedViaTrip,
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
} from "./toll_settlement.ts";
import { remainingTollShortfall } from "../../../utils/tollSettlement.ts";

const app = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

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
// So we match a refund against open Toll_Refund claims by claim.amount, and
// resolving the claim as "Reimbursed" closes the loop into the Reimbursed tile.

const OPEN_CLAIM_STATUSES = ["Open", "Sent_to_Driver", "Submitted_to_Uber"];
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

/** Open toll-refund (underpaid) claims for a driver, not already tied to a refund. */
async function loadOpenTollClaimsForDriver(driverId: string): Promise<any[]> {
  const allClaims = await loadAllByPrefix("claim:");
  return allClaims.filter(
    (cl: any) =>
      cl && typeof cl === "object" &&
      cl.driverId === driverId &&
      cl.type === "Toll_Refund" &&
      OPEN_CLAIM_STATUSES.includes(cl.status) &&
      !cl.disputeRefundId,
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

/** Evaluate all claim candidates for one refund (claims-first, bare-toll fallback). */
async function buildDisputeCandidates(refund: any) {
  const driverId = refund.driverId;
  if (!driverId) return [];

  const fleetTz = await getFleetTimezone();
  const linkedTollIds = await loadLinkedDisputeTollIds();
  const { trips } = await loadAllTollLedgerWithTrips();
  const claims = await loadOpenTollClaimsForDriver(driverId);

  const evaluated: NonNullable<Awaited<ReturnType<typeof evaluateDisputeClaimCandidate>>>[] = [];
  for (const claim of claims) {
    const toll = await loadTollForClaim(claim.transactionId);
    const candidate = await evaluateDisputeClaimCandidate({
      refund,
      claim,
      toll,
      trips,
      fleetTz,
      linkedTollIds,
    });
    if (candidate) evaluated.push(candidate);
  }

  if (evaluated.some((c) => c.eligibleForSuggestion)) {
    return evaluated;
  }

  const ledger = await loadAllByPrefix("toll_ledger:");
  for (const toll of ledger) {
    if (!toll || typeof toll !== "object" || toll.driverId !== driverId) continue;
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
async function computeDisputeSuggestions(refund: any): Promise<any[]> {
  const evaluated = await buildDisputeCandidates(refund);
  return evaluated
    .filter((c) => c.eligibleForSuggestion)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map(candidateToSuggestion);
}

/** Shared match: link a refund to a toll (+claim), resolving the claim as Reimbursed. */
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
        const priorPaid = Math.abs(Number((claim as any).paidAmount) || 0);
        const disputeAmount = Math.abs(Number(refund.amount) || 0);
        const tollCost = Math.abs(
          Number((claim as any).expectedAmount ?? (claim as any).amount) || 0,
        );
        const settlementOrder = await isCorrectSettlementOrderEnabled();

        // Settle only the live remaining shortfall (after trip/unlinked credits).
        let remainingBefore = Math.abs(Number((claim as any).amount) || 0);
        if (settlementOrder && tollTransactionId) {
          remainingBefore = await getRemainingShortfall(tollTransactionId, tollCost);
          if (remainingBefore <= DISPUTE_SHORTFALL_TOLERANCE && cs !== "Resolved") {
            // Fall back to claim amount when no allocations yet (legacy rows).
            remainingBefore = Math.max(
              remainingBefore,
              Math.abs(Number((claim as any).amount) || 0),
            );
          }
        }
        const applyAmt = Math.min(disputeAmount, remainingBefore || disputeAmount);

        if (settlementOrder && tollTransactionId && applyAmt > DISPUTE_SHORTFALL_TOLERANCE) {
          try {
            await applySettlementAllocation({
              sourceType: "dispute_refund",
              sourceId: id,
              tollId: tollTransactionId,
              claimId: resolvedClaimId,
              amount: applyAmt,
              tollCost,
              tollPeriodAnchor: String((claim as any).date || "").slice(0, 10) || null,
              actor: auto ? "system-auto" : "admin",
              notes: `Dispute refund $${applyAmt.toFixed(2)}`,
            });
          } catch (e: any) {
            console.warn(`[DisputeRefund] allocation warn: ${e?.message}`);
          }
        }

        const remainingAfter = Math.max(
          0,
          Math.round(((remainingBefore || disputeAmount) - applyAmt) * 100) / 100,
        );
        const projected = settlementOrder
          ? projectClaimFromSettlement({
              tollCost,
              remaining: remainingAfter,
              priorPaid: priorPaid + applyAmt,
              disputeRefundId: id,
            })
          : {
              status: "Resolved" as const,
              resolutionReason: "Reimbursed" as const,
              amount: 0,
              paidAmount: Math.max(priorPaid, disputeAmount),
              expectedAmount: tollCost,
            };

        await upsertClaim(
          {
            ...(claim as any),
            status: projected.status,
            resolutionReason: projected.resolutionReason,
            disputeRefundId: id,
            amount: projected.amount,
            paidAmount: projected.paidAmount,
            expectedAmount: projected.expectedAmount || tollCost,
            preDisputeStatus: cs,
            preDisputeResolutionReason: cs === "Resolved" ? (claim as any).resolutionReason : (claim as any).preDisputeResolutionReason,
            preDisputeAmount: (claim as any).amount,
            preDisputePaidAmount: priorPaid,
          },
          c,
          { syncMode: "force", suggestedTripId: opts?.tripId ?? (claim as any).tripId, fleetTz: await getFleetTimezone() },
        );
        // Only auto_resolved when the shortfall is fully closed.
        if (projected.status === "Resolved") {
          updated = { ...updated, status: "auto_resolved", matchedClaimId: resolvedClaimId };
        } else {
          updated = { ...updated, status: "matched", matchedClaimId: resolvedClaimId };
        }
        await kv.set(recordKey, updated);
        console.log(
          `[DisputeRefund] ${auto ? "Auto-" : ""}matched claim ${resolvedClaimId} (apply $${applyAmt}, remaining $${remainingAfter}) via refund ${id}`,
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
app.post(`${BASE}/import`, async (c) => {
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
    console.log(`[DisputeRefund] Import error: ${err.message}`);
    return c.json({ error: `Failed to import dispute refunds: ${err.message}` }, 500);
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
        const { data, error } = await supabase
          .from("kv_store_37f42386")
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
    //    dateTo both required). Refunds are already period-scoped above; toll
    //    candidates must fall in the same window. Never auto when live shortfall
    //    is already $0. Manual cross-period matching is unchanged.
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
        const settlementOrder = await isCorrectSettlementOrderEnabled();
        // Unlinked-first: do not auto-match disputes while the driver still has
        // unresolved trip-refund credits that should settle the fare half first.
        let blockingUnlinkedDrivers: Set<string> | null = null;
        if (settlementOrder) {
          blockingUnlinkedDrivers = new Set();
          const { trips, tollTx } = await loadAllTollLedgerWithTrips();
          const linkedTripIds = new Set(
            (tollTx || []).filter((t: any) => t?.tripId).map((t: any) => t.tripId),
          );
          for (const trip of trips || []) {
            if (!trip?.driverId || !(Number(trip.tollCharges) > 0)) continue;
            if (!isUnresolvedRefund(trip, linkedTripIds)) continue;
            blockingUnlinkedDrivers.add(String(trip.driverId));
          }
        }
        for (const refund of refunds) {
          if (refund.status !== "unmatched" || !refund.driverId) continue;
          if (blockingUnlinkedDrivers?.has(String(refund.driverId))) continue;
          const candidates = (await buildDisputeCandidates(refund)).filter((c) => {
            const d = fleetTzDay(c.date, fleetTz);
            return Boolean(d && d >= periodFrom && d <= periodTo);
          });
          const best = pickDisputeMatchCandidate(candidates, { mode: "auto", minConfidence: minConf });
          if (!best?.claimId) continue;
          if (best.shortfall <= DISPUTE_SHORTFALL_TOLERANCE) continue;
          const tollForAuto = await loadTollForClaim(best.tollId);
          if (tollForAuto) {
            const liveRefund = await computeLiveTripRefundForToll(tollForAuto, fleetTz, {
              suggestedTripId: best.tripId,
            });
            const tollAmt = Math.abs(tollForAuto.amount || 0);
            if (liveRefund != null && isFullyReimbursedViaTrip(tollAmt, liveRefund)) continue;
          }
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
    console.log(`[DisputeRefund] List error: ${err.message}`);
    return c.json({ error: `Failed to list dispute refunds: ${err.message}` }, 500);
  }
});

// ─── PATCH /dispute-refunds/:id/match ──────────────────────────────────
app.patch(`${BASE}/:id/match`, async (c) => {
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
    console.log(`[DisputeRefund] Match error: ${err.message}`);
    return c.json({ error: `Failed to match dispute refund: ${err.message}` }, 500);
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
        await deleteClaim(claimId, c, { syncMode: settings.disputeRefundTripSyncEnabled ? "force" : "skip" });
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
        await upsertClaim(
          {
            ...claim,
            status: claim.preDisputeStatus || "Sent_to_Driver",
            resolutionReason: null,
            disputeRefundId: null,
            preDisputeStatus: null,
          },
          c,
          { syncMode: "skip" },
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

app.patch(`${BASE}/:id/unmatch`, async (c) => {
  try {
    const id = c.req.param("id");
    const updated = await unmatchDisputeRefundById(id, c);
    return c.json({ data: updated });
  } catch (err: any) {
    const status = typeof err.status === "number" ? err.status : 500;
    console.log(`[DisputeRefund] Unmatch error: ${err.message}`);
    return c.json({ error: `Failed to unmatch dispute refund: ${err.message}` }, status);
  }
});

// ─── GET /dispute-refunds/suggestions/:id ──────────────────────────────
app.get(`${BASE}/suggestions/:id`, async (c) => {
  try {
    const id = c.req.param("id");

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
    const suggestions = await computeDisputeSuggestions(refund);
    return c.json({ suggestions });
  } catch (err: any) {
    console.log(`[DisputeRefund] Suggestions error: ${err.message}`);
    return c.json({ error: `Failed to get suggestions: ${err.message}` }, 500);
  }
});

// ─── GET /dispute-refunds/match-candidates ─────────────────────────────
// Manual search across ALL drivers: open underpaid claims + bare tolls (no
// claim yet). Used when the smart matcher misses (e.g. driver-name mismatch).
app.get(`${BASE}/match-candidates`, async (c) => {
  try {
    const q = (c.req.query("q") || "").trim().toLowerCase();
    const from = (c.req.query("from") || "").slice(0, 10); // yyyy-MM-dd
    const to = (c.req.query("to") || "").slice(0, 10);
    const LIMIT = 25;
    // Period boundaries arrive as fleet-tz calendar days; normalize each
    // candidate's date into the same frame before comparing (see fleetTzDay).
    const fleetTz = await getFleetTimezone();

    // Tolls already linked to a matched refund (exclude from candidates).
    const allRefunds = await loadAllByPrefix("dispute-refund:");
    const linkedTollIds = new Set(
      allRefunds
        .filter((r: any) => r && r.matchedTollId && (r.status === "matched" || r.status === "auto_resolved"))
        .map((r: any) => r.matchedTollId),
    );

    // Open underpaid claims (across all drivers).
    const allClaims = await loadAllByPrefix("claim:");
    const openClaims = allClaims.filter(
      (cl: any) => cl && typeof cl === "object" && cl.type === "Toll_Refund" &&
        OPEN_CLAIM_STATUSES.includes(cl.status) && !cl.disputeRefundId,
    );
    const claimTollIds = new Set(openClaims.map((cl: any) => cl.transactionId).filter(Boolean));
    const anyClaimTollIds = new Set(
      allClaims
        .filter((cl: any) => cl && typeof cl === "object" && cl.type === "Toll_Refund" && cl.transactionId && !cl.disputeRefundId)
        .map((cl: any) => cl.transactionId),
    );

    const claimCandidates: any[] = [];
    for (const cl of openClaims) {
      const toll = await loadTollForClaim(cl.transactionId);
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
    const ledger = await loadAllByPrefix("toll_ledger:");
    const tollCandidates: any[] = [];
    const rawTollById = new Map<string, any>();
    for (const toll of ledger) {
      if (!toll || typeof toll !== "object" || !toll.id) continue;
      if (toll.type && toll.type !== "usage") continue;
      if (claimTollIds.has(toll.id) || linkedTollIds.has(toll.id) || anyClaimTollIds.has(toll.id)) continue;
      // Only tolls that can still take a dispute refund belong here:
      // untriaged, flagged underpaid, or trip-linked ("matched"/"underpaid")
      // with a leftover shortfall — a prior unmatch keeps the trip link, so
      // a $10-short toll lands back at "matched" and must stay searchable.
      // enrichAndFilterDisputeBareTolls drops fully-reimbursed ones below.
      // Personal Use / Deadhead / resolved stages stay excluded.
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
      const hay = `${cand.driverName} ${cand.tollAmount} ${cand.claimAmount ?? ""} ${cand.date ?? ""}`.toLowerCase();
      return hay.includes(q);
    };
    // Period filter (yyyy-MM-dd inclusive range). Each candidate's date is
    // resolved to its fleet-tz calendar day so it matches the day the UI shows
    // and the day the tab groups by (see fleetTzDay).
    const inRange = (cand: any) => {
      if (!from && !to) return true;
      const d = fleetTzDay(cand.date, fleetTz);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    };
    const keep = (cand: any) => matchQ(cand) && inRange(cand);
    const byDate = (a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();

    const claims = claimCandidates.filter(keep).sort(byDate).slice(0, LIMIT);

    // Enrich + eligibility-filter BEFORE slice so fully-reimbursed tolls don't
    // consume the result cap (Dispute Refunds is shortfall-only). Enrichment
    // (per-toll trip matching) is CPU-heavy, so cap it tightly: enriching more
    // than we can return just risks the edge CPU limit (HTTP 546) on wide /
    // all-period searches. Candidates are date-desc, so the newest shortfall
    // tolls win the cap; scoped weekly searches stay well under it.
    const ENRICH_CAP = LIMIT;
    let tolls = tollCandidates.filter(keep).sort(byDate).slice(0, ENRICH_CAP);
    try {
      tolls = await enrichAndFilterDisputeBareTolls(tolls, rawTollById, fleetTz);
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
    console.log(`[DisputeRefund] Match-candidates error: ${err.message}`);
    return c.json({ error: `Failed to load match candidates: ${err.message}` }, 500);
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
    const tripRefundFromClaim =
      claimAmount != null && tollCost > 0 ? Math.max(0, tollCost - claimAmount) : null;
    const tripRefund = tripRefundFromClaim ?? liveTripRefund ?? (
      trip ? Math.max(0, Math.min(Math.abs(Number(trip.tollCharges) || 0), tollCost)) : null
    );
    const shortfall = claimAmount ?? (
      tripRefund != null ? Math.max(0, tollCost - tripRefund) : tollCost
    );
    const disputeRefund = Math.abs(Number(refund.amount) || 0);
    const variance = shortfall - disputeRefund;

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
        coversShortfallFully: Math.abs(variance) < 0.01,
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
    console.log(`[DisputeRefund] Match-detail error: ${err.message}`);
    return c.json({ error: `Failed to load match detail: ${err.message}` }, 500);
  }
});

export default app;