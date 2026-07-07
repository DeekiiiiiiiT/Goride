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
 */

import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { isTollCategory } from "./toll_category_flags.ts";
import { getFleetTimezone, hasTzSuffix } from "./timezone_helper.tsx";
import { upsertClaim, deleteClaim } from "./claim_service.ts";
import {
  applyRefundResolution,
  isUnresolvedRefund,
  loadAllTollLedgerWithTrips,
  getRefundAutomationSettings,
  findTollMatchesServer,
  reconcileTollForDisputeMatch,
} from "./toll_controller.tsx";

const app = new Hono();

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

const TOLL_SETTINGS_KEY = "toll_reconciliation:settings";
const DEFAULT_DISPUTE_MIN_CONFIDENCE = 85;
const OPEN_CLAIM_STATUSES = ["Open", "Sent_to_Driver", "Submitted_to_Uber"];

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

/**
 * Score a claim as a match for a refund. The refund amount should equal the
 * claim (shortfall) amount, so amount similarity dominates; date decays gently
 * because disputes are resolved weeks after the trip.
 */
function scoreClaimForRefund(claim: any, refundAmount: number, refundDate: number): number {
  const claimAmount = Math.abs(claim.amount || 0);
  const amountDiff = Math.abs(claimAmount - refundAmount);
  const maxA = Math.max(claimAmount, refundAmount, 1);
  const amountScore = Math.max(0, 100 - (amountDiff / maxA) * 100);
  const claimDate = new Date(claim.createdAt || claim.date || refundDate).getTime();
  const daysDiff = Math.abs(claimDate - refundDate) / (1000 * 60 * 60 * 24);
  const dateScore = Math.max(0, 100 - daysDiff * 3);
  return Math.round(amountScore * 0.75 + dateScore * 0.25);
}

/** Build ranked match suggestions for a dispute refund (claims first, toll fallback). */
async function computeDisputeSuggestions(refund: any): Promise<any[]> {
  const driverId = refund.driverId;
  const refundAmount = Math.abs(refund.amount || 0);
  const refundDate = new Date(refund.date).getTime();
  if (!driverId) return [];

  const claims = await loadOpenTollClaimsForDriver(driverId);
  const suggestions: any[] = [];
  for (const claim of claims) {
    const toll = await loadTollForClaim(claim.transactionId);
    const tollCost = Math.abs(claim.expectedAmount ?? (toll ? toll.amount : 0)) || 0;
    const claimAmount = Math.abs(claim.amount || 0);
    suggestions.push({
      tollId: claim.transactionId,
      tripId: claim.tripId || toll?.tripId || null,
      tollAmount: tollCost,          // full toll cost (context)
      claimAmount,                    // the shortfall we're matching against
      // What Uber's trip fare already paid toward this toll — claimAmount IS
      // the shortfall, so the remainder is the trip refund. Shown alongside
      // tollAmount so the user sees the same cost/refund/shortfall picture
      // the Underpaid & Claims step shows.
      tripRefund: Math.max(0, tollCost - claimAmount),
      uberRefund: refundAmount,
      variance: claimAmount - refundAmount, // ~0 when the refund covers the loss
      date: toll?.date || claim.createdAt || refund.date, // toll date = the frame the UI groups by

      confidence: scoreClaimForRefund(claim, refundAmount, refundDate),
      claimId: claim.id,
      claimStatus: claim.status,
      matchType: "claim",
    });
  }

  // Fallback: full-toll disputes (Uber refunded the whole toll → no variance claim).
  if (suggestions.length === 0 && driverId) {
    const ledger = await loadAllByPrefix("toll_ledger:");
    for (const toll of ledger) {
      if (!toll || typeof toll !== "object" || toll.driverId !== driverId) continue;
      const tollAmount = Math.abs(toll.amount || 0);
      const amountDiff = Math.abs(tollAmount - refundAmount);
      const maxA = Math.max(tollAmount, refundAmount, 1);
      const amountScore = Math.max(0, 100 - (amountDiff / maxA) * 100);
      const daysDiff = Math.abs(new Date(toll.date).getTime() - refundDate) / (1000 * 60 * 60 * 24);
      const dateScore = Math.max(0, 100 - daysDiff * 3);
      const confidence = Math.round(amountScore * 0.7 + dateScore * 0.3);
      if (confidence <= 0) continue;
      suggestions.push({
        tollId: toll.id, tripId: toll.tripId || null,
        tollAmount, claimAmount: tollAmount, uberRefund: refundAmount,
        variance: tollAmount - refundAmount, date: toll.date,
        confidence, claimId: null, claimStatus: null, matchType: "toll",
      });
    }
  }

  suggestions.sort((a, b) => b.confidence - a.confidence);
  return suggestions.slice(0, 5);
}

/** Shared match: link a refund to a toll (+claim), resolving the claim as Reimbursed. */
async function matchRefundToClaim(
  refund: any,
  tollTransactionId: string,
  claimId: string | null,
  auto: boolean,
  c: unknown,
): Promise<{ ok: true; data: any } | { ok: false; status: number; error: string }> {
  const id = refund.id;
  const recordKey = `dispute-refund:${id}`;

  if (refund.status === "matched" || refund.status === "auto_resolved") {
    return { ok: false, status: 409, error: `Refund ${id} is already matched to toll ${refund.matchedTollId}. Unmatch it first.` };
  }
  const allRefunds = await loadAllByPrefix("dispute-refund:");
  const existingMatch = allRefunds.find(
    (r: any) => r && typeof r === "object" && r.id && r.id !== id &&
      r.matchedTollId === tollTransactionId &&
      (r.status === "matched" || r.status === "auto_resolved"),
  );
  if (existingMatch) {
    return { ok: false, status: 409, error: `Toll ${tollTransactionId} is already linked to refund ${existingMatch.id}. Unlink it first.` };
  }

  const settings = await getRefundAutomationSettings();

  let updated: any = {
    ...refund,
    status: "matched",
    matchedTollId: tollTransactionId,
    matchedClaimId: claimId || null,
    resolvedAt: new Date().toISOString(),
    resolvedBy: auto ? "system-auto" : "admin",
  };
  await kv.set(recordKey, updated);

  if (claimId) {
    const claimKey = `claim:${claimId}`;
    const claim = await kv.get(claimKey);
    if (claim && typeof claim === "object") {
      const cs = (claim as any).status;
      // Rejected is terminal/adversarial — leave it alone. Resolved claims
      // (e.g. previously "Charge Driver") now flow through the reversible
      // sync too, instead of being silently skipped, so a dispute that
      // proves a toll was actually reimbursed correctly un-charges the driver.
      if (cs === "Rejected") {
        console.log(`[DisputeRefund] Claim ${claimId} is Rejected — refund marked matched, claim untouched`);
      } else {
        await upsertClaim(
          {
            ...(claim as any),
            status: "Resolved",
            resolutionReason: "Reimbursed",
            disputeRefundId: id,
            preDisputeStatus: cs, // so unmatch can restore it
            // Prior resolutionReason (e.g. "Charge Driver") — lets unmatch
            // restore the exact prior reason, not just null. Only meaningful
            // once cs === "Resolved" was reachable here at all.
            preDisputeResolutionReason: cs === "Resolved" ? (claim as any).resolutionReason : null,
          },
          c,
          // disputeRefundTripSyncEnabled is this cascade's OWN outer gate,
          // independent of the system-wide driverTollChargeSyncEnabled —
          // force the sync when it's on (never fall back to upsertClaim's
          // legacy branch, which this cascade never had), or skip entirely
          // when off (matches this cascade's prior conservative behavior of
          // doing nothing financial while its flag is off).
          { syncMode: settings.disputeRefundTripSyncEnabled ? "force" : "skip" },
        );
        updated = { ...updated, status: "auto_resolved", matchedClaimId: claimId };
        await kv.set(recordKey, updated);
        console.log(`[DisputeRefund] ${auto ? "Auto-" : ""}resolved claim ${claimId} as Reimbursed (refund ${id})`);
      }
    }
  }

  // ── Trip-side cascade (Unlinked Refunds) ──────────────────────────────
  if (settings.disputeRefundTripSyncEnabled) {
    try {
      const tollEntry = await loadTollForClaim(tollTransactionId);
      const claimForTrip: any = claimId ? await kv.get(`claim:${claimId}`) : null;
      const tripId = claimForTrip?.tripId || tollEntry?.tripId || null;
      if (tripId) {
        const trip = await kv.get(`trip:${tripId}`);
        if (trip) {
          const { tollTx } = await loadAllTollLedgerWithTrips();
          const linkedTripIds = new Set(
            tollTx.filter((tx: any) => tx.tripId).map((tx: any) => tx.tripId),
          );
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

  return { ok: true, data: updated };
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
    const dateFrom = c.req.query("dateFrom");
    const dateTo = c.req.query("dateTo");

    const raw = await loadAllByPrefix("dispute-refund:");
    // Filter out dedup keys (they store string references, not objects)
    let refunds = raw.filter(
      (item: any) => item && typeof item === "object" && item.id && item.supportCaseId
    );

    // Apply filters
    if (status) {
      refunds = refunds.filter((r: any) => r.status === status);
    }
    if (driverId) {
      refunds = refunds.filter((r: any) => r.driverId === driverId);
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

    // ── Auto-link (flagged): match high-confidence unmatched refunds to their
    //    open underpaid claim, closing the loop automatically. Same Automation
    //    flag + threshold as refund auto-resolution. Integrity-safe: only links
    //    to an EXISTING claim, and unmatch fully reverts it.
    let autoMatched = 0;
    try {
      const settings: any = await kv.get(TOLL_SETTINGS_KEY);
      const enabled = settings?.refundAutomationEnabled === true;
      const minConf = typeof settings?.refundAutoMinConfidence === "number"
        ? settings.refundAutoMinConfidence
        : DEFAULT_DISPUTE_MIN_CONFIDENCE;
      if (enabled) {
        for (const refund of refunds) {
          if (refund.status !== "unmatched" || !refund.driverId) continue;
          const sugg = await computeDisputeSuggestions(refund);
          const best = sugg[0];
          if (best && best.claimId && best.confidence >= minConf) {
            const res = await matchRefundToClaim(refund, best.tollId, best.claimId, true, c);
            if (res.ok) {
              // reflect new status in the response payload
              Object.assign(refund, res.data);
              autoMatched++;
            }
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

    const refund: any = await kv.get(`dispute-refund:${id}`);
    if (!refund || typeof refund !== "object") {
      return c.json({ error: `Dispute refund not found: ${id}` }, 404);
    }

    // Manual link to a bare toll (no claim yet) → create the claim on the fly,
    // sized to the amount we won back, so the loop still closes.
    if (!claimId && createClaim) {
      let toll = await loadTollForClaim(tollTransactionId);
      // The toll usually has no persisted trip yet (only "Flag for Claim" in
      // Underpaid & Claims reconciles a toll to its trip) — the caller sends
      // along the same live-suggested trip that step would show, so this
      // path reconciles first and ends in the exact same state, regardless
      // of which step the fleet manager resolved it from.
      if (!toll?.tripId && suggestedTripId) {
        await reconcileTollForDisputeMatch(tollTransactionId, suggestedTripId);
        toll = await loadTollForClaim(tollTransactionId);
      }
      const newClaimId = `claim-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const newClaim = await upsertClaim(
        {
          id: newClaimId,
          transactionId: tollTransactionId,
          tripId: toll?.tripId || null,
          driverId: toll?.driverId || refund.driverId || "unknown",
          driverName: toll?.driverName || refund.driverName || null,
          type: "Toll_Refund",
          status: "Submitted_to_Uber",
          amount: Math.abs(refund.amount || 0),
          expectedAmount: Math.abs(toll?.amount || 0),
          subject: "Toll Underpayment (manual dispute match)",
          date: toll?.date || undefined,
          _createdByRefund: id, // so unmatch can delete it
        },
        c,
      );
      claimId = newClaim.id;
    }

    const result = await matchRefundToClaim(refund, tollTransactionId, claimId || null, false, c);
    if (!result.ok) return c.json({ error: result.error }, result.status as any);

    console.log(`[DisputeRefund] Matched refund ${id} → toll ${tollTransactionId}${claimId ? ` + claim ${claimId}` : ""}`);
    return c.json({ data: result.data });
  } catch (err: any) {
    console.log(`[DisputeRefund] Match error: ${err.message}`);
    return c.json({ error: `Failed to match dispute refund: ${err.message}` }, 500);
  }
});

// ─── PATCH /dispute-refunds/:id/unmatch ────────────────────────────────
app.patch(`${BASE}/:id/unmatch`, async (c) => {
  try {
    const id = c.req.param("id");

    const recordKey = `dispute-refund:${id}`;
    const refund: any = await kv.get(recordKey);
    if (!refund || typeof refund !== "object") {
      return c.json({ error: `Dispute refund not found: ${id}` }, 404);
    }

    const settings = await getRefundAutomationSettings();

    // Revert the claim this refund resolved (reversibility) — only if we set it.
    const claimId = refund.matchedClaimId;
    let claimTripIdForTripReversal: string | null = null;
    if (claimId) {
      const claimKey = `claim:${claimId}`;
      const claim: any = await kv.get(claimKey);
      if (claim && typeof claim === "object" && claim.disputeRefundId === id) {
        // Captured before any mutation/deletion below, so the trip-side
        // reversal further down can still find the trip even when this claim
        // is about to be deleted (the _createdByRefund branch).
        claimTripIdForTripReversal = claim.tripId || null;
        if (claim._createdByRefund === id) {
          // This claim only existed to hold this manual match — reverse any
          // driver charge it drove before removing it.
          await deleteClaim(claimId, c, { syncMode: settings.disputeRefundTripSyncEnabled ? "force" : "skip" });
          console.log(`[DisputeRefund] Deleted refund-created claim ${claimId} on unmatch`);
        } else if (settings.disputeRefundTripSyncEnabled && claim.preDisputeResolutionReason !== undefined) {
          // Symmetric reversal via the same reversible sync, restoring the
          // exact prior reason (e.g. re-charging the driver if it was
          // "Charge Driver" before this dispute match reimbursed it).
          const revertReason = claim.preDisputeResolutionReason || undefined;
          await upsertClaim(
            {
              ...claim,
              status: claim.preDisputeStatus || "Sent_to_Driver",
              resolutionReason: revertReason || null,
              disputeRefundId: null,
              preDisputeStatus: null,
              preDisputeResolutionReason: null,
              // Only clear once fully back to unresolved — restoring to a still-
              // Resolved reason (e.g. "Charge Driver") means a later claims-side
              // revert must still be able to restore this same baseline.
              preIsReconciled: revertReason === undefined ? undefined : claim.preIsReconciled,
            },
            c,
            { syncMode: "force" },
          );
          console.log(`[DisputeRefund] Reverted claim ${claimId} to ${claim.preDisputeStatus || "Sent_to_Driver"} on unmatch`);
        } else {
          // Flag off, or a legacy match from before preDisputeResolutionReason
          // existed — fall back to the simpler restore (no charge reversal).
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

    // Trip-side reversal — only undo what THIS cascade set (ownership check),
    // never clobber a resolution an admin later set by hand.
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
    return c.json({ data: updated });
  } catch (err: any) {
    console.log(`[DisputeRefund] Unmatch error: ${err.message}`);
    return c.json({ error: `Failed to unmatch dispute refund: ${err.message}` }, 500);
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
      if (claimTollIds.has(toll.id) || linkedTollIds.has(toll.id)) continue;
      // Only tolls still needing a claim decision (untriaged) or already
      // flagged underpaid belong here — Deadhead never gets a claim at all
      // (fleet-absorbed by design) and a resolved Personal-Use claim isn't
      // "open" (excluded above), so both would otherwise slip through as if
      // they still needed a dispute-refund match.
      const stage = toll.workflowStage;
      if (stage && stage !== "needs_review" && stage !== "underpaid_pending") continue;
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
    const tolls = tollCandidates.filter(keep).sort(byDate).slice(0, LIMIT);

    // Attach matched-trip details to claim candidates (already linked via
    // Underpaid & Claims' "Flag for Claim") so the user can see exactly
    // which trip a claim's toll was matched to.
    const claimTripIds = [...new Set(claims.map((c: any) => c.tripId).filter(Boolean))] as string[];
    if (claimTripIds.length > 0) {
      try {
        const tripKeys = claimTripIds.map((tid) => `trip:${tid}`);
        const tripValues = await kv.mget(tripKeys);
        const tripById = new Map<string, any>();
        claimTripIds.forEach((tid, idx) => {
          if (tripValues[idx]) tripById.set(tid, tripValues[idx]);
        });
        for (const c of claims) {
          const trip = c.tripId ? tripById.get(c.tripId) : null;
          if (trip) {
            c.tripPickup = trip.pickupLocation || null;
            c.tripDropoff = trip.dropoffLocation || null;
            c.tripPlatform = trip.platform || null;
            c.tripRequestTime = trip.requestTime || trip.date || null;
            c.tripDropoffTime = trip.dropoffTime || null;
          }
        }
      } catch {
        // Best-effort enrichment — candidates are still usable without it.
      }
    }

    // Enrich the (small, already-sliced) bare-toll candidates with a trip
    // refund figure, so the user sees the same toll cost / refund / shortfall
    // picture the Underpaid & Claims step shows — vital context for deciding
    // whether a dispute refund actually covers this toll. Most of these
    // tolls have NO persisted trip link yet (only Underpaid & Claims' own
    // "Flag for Claim" action reconciles a toll to its trip) — so for those
    // we compute the same live suggested match the Underpaid & Claims step
    // itself shows, rather than reading a `tripId` field that isn't set yet.
    try {
      const { trips } = await loadAllTollLedgerWithTrips();
      const resolved: { toll: any; tripId: string; cost: number; date: string; time?: string }[] = [];
      for (const t of tolls) {
        const rawToll = rawTollById.get(t.tollId);
        if (!rawToll) continue;

        const matches = findTollMatchesServer(rawToll, trips, fleetTz);
        const validMatch = matches.find(
          (m: any) => m.matchType === "AMOUNT_VARIANCE" || m.matchType === "PERFECT_MATCH",
        );

        let tripId: string | null = null;
        if (validMatch) {
          if (t.tripId && t.tripId !== validMatch.tripId) {
            // Stale persisted link — live matcher found a different valid trip.
            t.tripId = null;
          }
          tripId = validMatch.tripId;
          if (!t.tripId) t.suggestedTripId = validMatch.tripId;
        } else if (t.tripId) {
          // Persisted link no longer passes time-window validation — drop it.
          t.tripId = null;
        }

        if (!tripId) continue;

        resolved.push({
          toll: t,
          tripId,
          cost: Math.abs(t.tollAmount || 0),
          date: t.date,
          time: rawToll.time,
        });

        // #region agent log
        fetch("http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9637fe" },
          body: JSON.stringify({
            sessionId: "9637fe",
            location: "dispute_refund_controller.tsx:match-candidates",
            message: "validated trip assigned",
            hypothesisId: "D",
            runId: "post-fix",
            data: {
              tollId: t.tollId,
              tripId,
              suggestedTripId: t.suggestedTripId ?? null,
              tollDate: t.date,
              tollTime: rawToll?.time ?? null,
              tripRequestTime: validMatch?.tripRequestTime ?? null,
              tripDropoffTime: validMatch?.tripDropoffTime ?? null,
              fleetTimezone: fleetTz,
              matchCount: matches.length,
              bestWindowHit: validMatch?.windowHit ?? null,
              bestTimeDiffMinutes: validMatch?.timeDifferenceMinutes ?? null,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      }

      if (resolved.length > 0) {
        const tripIds = [...new Set(resolved.map((r) => r.tripId))];
        const tripKeys = tripIds.map((tid) => `trip:${tid}`);
        const tripValues = await kv.mget(tripKeys);
        const tripRefundById = new Map<string, number>();
        const tripDetailsById = new Map<string, any>();
        tripIds.forEach((tid, idx) => {
          const trip = tripValues[idx] as any;
          if (trip) {
            tripRefundById.set(tid, Math.abs(trip.tollCharges || 0));
            tripDetailsById.set(tid, trip);
          }
        });

        // A trip's refund is a shared pool, handed out in chronological
        // order, each toll capped at its own cost — the same rule applied
        // client-side (tollReconciliation.ts's `allocateTripRefundAcrossTolls`)
        // and in toll_controller.tsx's `/unreconciled` suggestions. A trip
        // already tied to SOME claim (open or resolved) elsewhere has its
        // pool treated as fully spent for every bare candidate seen here.
        const tripIdsAlreadyClaimed = new Set(
          allClaims.filter((cl: any) => cl && typeof cl === "object" && cl.tripId).map((cl: any) => cl.tripId),
        );

        const byTrip = new Map<string, typeof resolved>();
        for (const r of resolved) {
          const list = byTrip.get(r.tripId) || [];
          list.push(r);
          byTrip.set(r.tripId, list);
        }
        for (const [tripId, group] of byTrip) {
          group.sort((a, b) => {
            const da = new Date(`${a.date}T${a.time || "00:00:00"}`).getTime();
            const db = new Date(`${b.date}T${b.time || "00:00:00"}`).getTime();
            return da - db;
          });
          const tripDetail = tripDetailsById.get(tripId);
          let remaining = tripIdsAlreadyClaimed.has(tripId) ? 0 : (tripRefundById.get(tripId) ?? 0);
          for (const r of group) {
            const allocated = Math.max(0, Math.min(remaining, r.cost));
            remaining -= allocated;
            r.toll.tripRefund = allocated;
            if (tripDetail) {
              r.toll.tripPickup = tripDetail.pickupLocation || null;
              r.toll.tripDropoff = tripDetail.dropoffLocation || null;
              r.toll.tripPlatform = tripDetail.platform || null;
              r.toll.tripRequestTime = tripDetail.requestTime || tripDetail.date || null;
              r.toll.tripDropoffTime = tripDetail.dropoffTime || null;
            }
          }
        }
      }
    } catch {
      // Best-effort enrichment — candidates are still usable without it.
    }

    return c.json({ claims, tolls });
  } catch (err: any) {
    console.log(`[DisputeRefund] Match-candidates error: ${err.message}`);
    return c.json({ error: `Failed to load match candidates: ${err.message}` }, 500);
  }
});

export default app;