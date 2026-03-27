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

const app = new Hono();

const BASE = "/make-server-37f42386/dispute-refunds";

// ─── Helper: Load all KV entries by prefix with 1000-row pagination ────
async function loadAllByPrefix(prefix: string): Promise<any[]> {
  const results: any[] = [];
  const batch = await kv.getByPrefix(prefix);
  if (Array.isArray(batch)) {
    results.push(...batch);
  }
  return results;
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
      const record = {
        ...refund,
        id,
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
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      refunds = refunds.filter((r: any) => {
        const d = new Date(r.date).getTime();
        return !isNaN(d) && d >= from;
      });
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime();
      refunds = refunds.filter((r: any) => {
        const d = new Date(r.date).getTime();
        return !isNaN(d) && d <= to;
      });
    }

    // Sort by date descending
    refunds.sort((a: any, b: any) => {
      const da = new Date(a.date).getTime() || 0;
      const db = new Date(b.date).getTime() || 0;
      return db - da;
    });

    return c.json({ data: refunds, total: refunds.length });
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
    const { tollTransactionId, claimId } = body;

    if (!tollTransactionId) {
      return c.json({ error: "tollTransactionId is required" }, 400);
    }

    // Load the refund record
    const recordKey = `dispute-refund:${id}`;
    const refund = await kv.get(recordKey);
    if (!refund || typeof refund !== "object") {
      return c.json({ error: `Dispute refund not found: ${id}` }, 404);
    }

    // Phase 7 Step 7.6: Double-counting prevention
    // Check 1: Is this refund already matched to another toll?
    if ((refund as any).status === "matched" || (refund as any).status === "auto_resolved") {
      return c.json({ error: `Refund ${id} is already matched to toll ${(refund as any).matchedTollId}. Unmatch it first.` }, 409);
    }

    // Check 2: Is this toll already matched to another refund?
    const allRefunds = await loadAllByPrefix("dispute-refund:");
    const existingMatch = allRefunds.find(
      (r: any) => r && typeof r === "object" && r.id && r.id !== id &&
        r.matchedTollId === tollTransactionId &&
        (r.status === "matched" || r.status === "auto_resolved")
    );
    if (existingMatch) {
      return c.json({ error: `Toll ${tollTransactionId} is already linked to refund ${(existingMatch as any).id}. Unlink it first.` }, 409);
    }

    // Update refund
    const updated = {
      ...refund,
      status: "matched",
      matchedTollId: tollTransactionId,
      matchedClaimId: claimId || null,
      resolvedAt: new Date().toISOString(),
      resolvedBy: "admin",
    };
    await kv.set(recordKey, updated);

    // If claimId provided, auto-resolve the Claimable Loss claim
    if (claimId) {
      const claimKey = `claim:${claimId}`;
      const claim = await kv.get(claimKey);
      if (claim && typeof claim === "object") {
        // Phase 7.6: Skip claim update if already resolved (prevent double-resolution)
        const claimStatus = (claim as any).status;
        if (claimStatus === "Resolved" || claimStatus === "Rejected") {
          console.log(`[DisputeRefund] Claim ${claimId} already ${claimStatus} — skipping auto-resolution, refund marked as matched`);
        } else {
          const updatedClaim = {
            ...claim,
            status: "Resolved",
            resolutionReason: "Reimbursed",
            disputeRefundId: id, // Phase 7: Link back to the refund record
            updatedAt: new Date().toISOString(),
          };
          await kv.set(claimKey, updatedClaim);
          console.log(`[DisputeRefund] Auto-resolved claim ${claimId} as Reimbursed (disputeRefundId: ${id})`);

          // Update refund to reflect auto-resolution
          updated.status = "auto_resolved";
          updated.matchedClaimId = claimId;
          await kv.set(recordKey, updated);
        }
      } else {
        console.log(`[DisputeRefund] Claim ${claimId} not found for auto-resolution — refund still marked as matched`);
      }
    }

    console.log(`[DisputeRefund] Matched refund ${id} → toll ${tollTransactionId}${claimId ? ` + claim ${claimId}` : ""}`);
    return c.json({ data: updated });
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
    const refund = await kv.get(recordKey);
    if (!refund || typeof refund !== "object") {
      return c.json({ error: `Dispute refund not found: ${id}` }, 404);
    }

    // Reset to unmatched — does NOT revert any claim changes
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

    const refundAmount = refund.amount || 0;
    const refundDate = new Date(refund.date).getTime();
    const refundDriverId = refund.driverId;

    if (!refundDriverId) {
      return c.json({ suggestions: [], message: "Refund has no driver ID — cannot suggest matches" });
    }

    // Load all transactions for this driver (tolls are stored as financial transactions)
    const allTxns = await loadAllByPrefix("transaction:");
    const driverTolls = allTxns.filter((tx: any) => {
      if (!tx || typeof tx !== "object") return false;
      if (tx.driverId !== refundDriverId) return false;
      return isTollCategory(tx.category);
    });

    // Also check for Claimable Loss claims for this driver
    const allClaims = await loadAllByPrefix("claim:");
    const driverClaims = allClaims.filter((cl: any) => {
      if (!cl || typeof cl !== "object") return false;
      return cl.driverId === refundDriverId && cl.type === "Toll_Refund" && (cl.status === "Open" || cl.status === "Sent_to_Driver" || cl.status === "Submitted_to_Uber");
    });

    // Build claim lookup by transactionId for quick matching
    const claimByTxId = new Map<string, any>();
    for (const cl of driverClaims) {
      if (cl.transactionId) {
        claimByTxId.set(cl.transactionId, cl);
      }
    }

    // Score each toll transaction as a potential match
    const suggestions = driverTolls.map((toll: any) => {
      const tollAmount = Math.abs(toll.amount || toll.grossAmount || 0);
      const tollDate = new Date(toll.date).getTime();

      // Amount similarity: 100 if exact, decreasing linearly
      const amountDiff = Math.abs(tollAmount - refundAmount);
      const maxAmount = Math.max(tollAmount, refundAmount, 1);
      const amountScore = Math.max(0, 100 - (amountDiff / maxAmount) * 100);

      // Date proximity: 100 if same day, -5 per day apart, min 0
      const daysDiff = Math.abs(tollDate - refundDate) / (1000 * 60 * 60 * 24);
      const dateScore = Math.max(0, 100 - daysDiff * 5);

      // Combined confidence (weighted: 60% amount, 40% date)
      const confidence = Math.round(amountScore * 0.6 + dateScore * 0.4);

      // Check if there's a matching claim
      const linkedClaim = claimByTxId.get(toll.id);

      return {
        tollId: toll.id,
        tripId: toll.tripId || null,
        tollAmount,
        uberRefund: refundAmount,
        variance: tollAmount - refundAmount,
        date: toll.date,
        description: toll.description || "",
        confidence,
        claimId: linkedClaim?.id || null,
        claimStatus: linkedClaim?.status || null,
      };
    });

    // Sort by confidence descending, take top 5
    suggestions.sort((a: any, b: any) => b.confidence - a.confidence);
    const topSuggestions = suggestions.slice(0, 5);

    return c.json({ suggestions: topSuggestions });
  } catch (err: any) {
    console.log(`[DisputeRefund] Suggestions error: ${err.message}`);
    return c.json({ error: `Failed to get suggestions: ${err.message}` }, 500);
  }
});

export default app;