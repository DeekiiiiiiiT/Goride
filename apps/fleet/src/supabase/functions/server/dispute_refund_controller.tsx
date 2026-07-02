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
      if (cs === "Resolved" || cs === "Rejected") {
        console.log(`[DisputeRefund] Claim ${claimId} already ${cs} — refund marked matched, claim untouched`);
      } else {
        await kv.set(claimKey, {
          ...claim,
          status: "Resolved",
          resolutionReason: "Reimbursed",
          disputeRefundId: id,
          preDisputeStatus: cs, // so unmatch can restore it
          updatedAt: new Date().toISOString(),
        });
        updated = { ...updated, status: "auto_resolved", matchedClaimId: claimId };
        await kv.set(recordKey, updated);
        console.log(`[DisputeRefund] ${auto ? "Auto-" : ""}resolved claim ${claimId} as Reimbursed (refund ${id})`);
      }
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
            const res = await matchRefundToClaim(refund, best.tollId, best.claimId, true);
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
    const { tollTransactionId, createClaim } = body;
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
      const toll = await loadTollForClaim(tollTransactionId);
      const newClaimId = `claim-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await kv.set(`claim:${newClaimId}`, {
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
        _createdByRefund: id, // so unmatch can delete it
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      claimId = newClaimId;
    }

    const result = await matchRefundToClaim(refund, tollTransactionId, claimId || null, false);
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

    // Revert the claim this refund resolved (reversibility) — only if we set it.
    const claimId = refund.matchedClaimId;
    if (claimId) {
      const claimKey = `claim:${claimId}`;
      const claim: any = await kv.get(claimKey);
      if (claim && typeof claim === "object" && claim.disputeRefundId === id) {
        if (claim._createdByRefund === id) {
          // This claim only existed to hold this manual match — remove it.
          await kv.del(claimKey);
          console.log(`[DisputeRefund] Deleted refund-created claim ${claimId} on unmatch`);
        } else {
          await kv.set(claimKey, {
            ...claim,
            status: claim.preDisputeStatus || "Sent_to_Driver",
            resolutionReason: null,
            disputeRefundId: null,
            preDisputeStatus: null,
            updatedAt: new Date().toISOString(),
          });
          console.log(`[DisputeRefund] Reverted claim ${claimId} to ${claim.preDisputeStatus || "Sent_to_Driver"} on unmatch`);
        }
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
      claimCandidates.push({
        matchType: "claim",
        claimId: cl.id,
        tollId: cl.transactionId,
        tripId: cl.tripId || toll?.tripId || null,
        driverId: cl.driverId,
        driverName: toll?.driverName || cl.driverName || "Unknown",
        claimAmount: Math.abs(cl.amount || 0),
        tollAmount: Math.abs(cl.expectedAmount ?? toll?.amount ?? 0),
        // Align to the toll date (what the period filters on), not the claim's
        // creation date — createdAt is often days/weeks after the trip.
        date: toll?.date || cl.createdAt || null,
        status: cl.status,
      });
    }

    // Bare tolls (usage, no claim yet, not already linked).
    const ledger = await loadAllByPrefix("toll_ledger:");
    const tollCandidates: any[] = [];
    for (const toll of ledger) {
      if (!toll || typeof toll !== "object" || !toll.id) continue;
      if (toll.type && toll.type !== "usage") continue;
      if (claimTollIds.has(toll.id) || linkedTollIds.has(toll.id)) continue;
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
    return c.json({ claims, tolls });
  } catch (err: any) {
    console.log(`[DisputeRefund] Match-candidates error: ${err.message}`);
    return c.json({ error: `Failed to load match candidates: ${err.message}` }, 500);
  }
});

export default app;