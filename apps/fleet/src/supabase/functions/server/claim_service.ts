/**
 * The one place a Claim record is created, upserted, or deleted.
 *
 * Extracted from the inline logic in `POST /make-server-37f42386/claims`
 * (index.tsx) so every other caller that used to write `claim:*` directly —
 * dispute_refund_controller.tsx's on-the-fly claim creation and its match/
 * unmatch resolve/revert — goes through the exact same reversible sync
 * (`syncClaimTollResolution`) and the exact same persisted-workflow-stage
 * bookkeeping (`recomputeAndPersistWorkflowStage`) instead of three divergent
 * paths that each got some of this right and some of it wrong.
 *
 * There is a 4th claim-creation path, toll_controller.tsx's `POST /resolve`
 * (Personal/Write Off/Business Expense) — it CANNOT be routed through here:
 * this module (transitively, via claim_toll_sync.ts) imports toll_ledger
 * primitives FROM toll_controller.tsx, so toll_controller.tsx importing this
 * module back would be circular. See the NOTE at that endpoint.
 *
 * `upsertClaim` mirrors the existing wire contract exactly: callers hand it
 * the FULL desired claim object (same shape the client always POSTed), it
 * reads the prior persisted state, decides what changed, applies side
 * effects, persists, and returns the claim. This is not a create/update split
 * — the real endpoint was always an upsert, and splitting it would have been
 * a fictional API that doesn't match how any caller actually uses it.
 */

import * as kv from "./kv_store.tsx";
import { stampOrg } from "./org_scope.ts";
import { isDriverTollChargeSyncEnabled } from "./driver_toll_charge.ts";
import { syncClaimTollResolution } from "./claim_toll_sync.ts";
import { type ClaimResolutionReason } from "./claim_resolution_sync.ts";
import { resolveDriverChargeAmount } from "./claim_charge_guard.ts";
import { getTollLedgerEntry, updateTollLedgerEntry, recomputeAndPersistWorkflowStage, loadAllByPrefix } from "./toll_controller.tsx";

/**
 * After persisting the claim, link the toll (if any) back to it and
 * recompute the toll's workflow stage — unconditional, independent of
 * driverTollChargeSyncEnabled, since workflow-stage tracking is a separate
 * concern from the reversible driver-charge sync.
 */
async function syncTollLinkage(claim: any): Promise<void> {
  if (!claim.transactionId) return;
  try {
    const toll = await getTollLedgerEntry(claim.transactionId);
    if (toll && toll.claimId !== claim.id) {
      await updateTollLedgerEntry(claim.transactionId, { claimId: claim.id }, "updated", "system-claim-service");
    }
    await recomputeAndPersistWorkflowStage(claim.transactionId, { claim: { status: claim.status, resolutionReason: claim.resolutionReason } });
  } catch (err: any) {
    console.error(`[ClaimService] toll linkage sync failed for claim ${claim.id} (toll ${claim.transactionId}):`, err?.message);
  }
}

/**
 * Clear a toll's claimId pointer if it points at this claim, and recompute
 * its workflow stage (claim is gone — falls back to the persisted match
 * bucket). Called from deleteClaim.
 */
async function clearTollLinkage(transactionId: string | undefined, claimId: string): Promise<void> {
  if (!transactionId) return;
  try {
    const toll = await getTollLedgerEntry(transactionId);
    if (toll && toll.claimId === claimId) {
      await updateTollLedgerEntry(transactionId, { claimId: null }, "updated", "system-claim-service");
    }
    await recomputeAndPersistWorkflowStage(transactionId, { claim: null });
  } catch (err: any) {
    console.error(`[ClaimService] toll linkage clear failed for claim ${claimId} (toll ${transactionId}):`, err?.message);
  }
}

export interface UpsertClaimOptions {
  /**
   * 'auto' (default) — gate the reversible sync on the system-wide
   *   `driverTollChargeSyncEnabled` flag, falling back to the historical
   *   legacy branch when off. This is `POST /claims`' own long-standing
   *   contract (index.tsx) — preserved byte-for-byte for that caller.
   * 'force' — always run the reversible sync, regardless of
   *   `driverTollChargeSyncEnabled` (never falls back to the legacy
   *   branch). For callers with their OWN independent outer gate on
   *   whether to sync at all — e.g. dispute-refund matching's
   *   `disputeRefundTripSyncEnabled`, which historically ran the sync
   *   whenever ITS flag was on, irrespective of the unrelated
   *   claims-endpoint flag (emitDriverTollCharge/reverseDriverTollCharge
   *   still self-gate their driver-visible projection txn internally on
   *   `driverTollChargeSyncEnabled` regardless of this mode).
   * 'skip' — no sync attempt at all: bare persist + toll-linkage
   *   bookkeeping only. For that same caller's own flag being off.
   */
  syncMode?: "auto" | "force" | "skip";
  /** Dispute match: trip used for pooled shortfall guard. */
  suggestedTripId?: string | null;
  fleetTz?: string;
}

const CLAIM_STATUS_PRIORITY: Record<string, number> = {
  Sent_to_Driver: 50,
  Submitted_to_Uber: 40,
  Open: 30,
  Rejected: 20,
  Resolved: 10,
};

function claimPriorityScore(cl: any): number {
  const statusScore = CLAIM_STATUS_PRIORITY[String(cl?.status)] ?? 0;
  const updated = new Date(cl?.updatedAt || cl?.createdAt || 0).getTime();
  return statusScore * 1e15 + updated;
}

/** Find the best existing claim id for a toll (toll.claimId, then claims scan). */
export async function findExistingClaimIdForToll(transactionId: string): Promise<string | null> {
  try {
    const toll = await getTollLedgerEntry(transactionId);
    if (toll?.claimId) {
      const linked = (await kv.get(`claim:${toll.claimId}`)) as { id?: string; transactionId?: string } | null;
      if (linked?.id && linked.transactionId === transactionId) return linked.id;
    }
  } catch {
    /* fall through to scan */
  }

  const allClaims = (await loadAllByPrefix("claim:")) as any[];
  const matches = allClaims.filter(
    (cl) => cl && typeof cl === "object" && cl.transactionId === transactionId && cl.id,
  );
  if (matches.length === 0) return null;
  const best = matches.reduce((a, b) => (claimPriorityScore(b) > claimPriorityScore(a) ? b : a));
  return best.id ?? null;
}

/** Block full-toll charges/filings when platform credits leave only a shortfall. */
async function enforceClaimChargeGuard(claim: any, opts?: UpsertClaimOptions): Promise<void> {
  const filingOrCharging =
    (claim.status === "Resolved" && claim.resolutionReason === "Charge Driver") ||
    claim.status === "Sent_to_Driver" ||
    claim.status === "Open";
  if (!filingOrCharging || !claim.transactionId) return;

  const toll = await getTollLedgerEntry(String(claim.transactionId));
  if (!toll) return;

  const tollCost = Math.abs(Number(toll.amount) || 0);
  let platformRefund = 0;
  const tripId =
    claim.tripId ||
    claim.unlinkedTripId ||
    toll.tripId ||
    toll.unlinkedSourceTripId ||
    opts?.suggestedTripId;
  if (tripId) {
    const trip = (await kv.get(`trip:${tripId}`)) as { tollCharges?: number } | null;
    platformRefund = Math.abs(Number(trip?.tollCharges) || 0);
    try {
      const { computeLiveTripRefundForToll } = await import("./dispute_match_toll_enrichment.ts");
      const fleetTz = opts?.fleetTz;
      if (fleetTz) {
        const allocated = await computeLiveTripRefundForToll(toll, fleetTz, {
          suggestedTripId: tripId,
        });
        if (allocated != null) platformRefund = allocated;
      }
    } catch {
      /* fall back to raw trip.tollCharges */
    }
  }

  const resolved = resolveDriverChargeAmount({
    chargeAmount: claim.amount,
    tollCost,
    platformRefund,
    claimPaidAmount: claim.paidAmount,
  });
  // Auto-clamp full-toll charges down to remaining shortfall (never block Charge Driver).
  claim.amount = resolved.amount;
}

/**
 * Upsert a claim, applying the reversible claim/driver-charge/toll_ledger
 * sync when the claim's resolvedness changes. `claimInput` is the FULL
 * desired claim object (id optional — generated if absent, same as the
 * pre-existing endpoint contract).
 */
export async function upsertClaim(claimInput: any, c: unknown, opts?: UpsertClaimOptions): Promise<any> {
  const claim = { ...claimInput };

  // Reuse existing claim for this toll — prevents duplicate rows when the client
  // POSTs without an id (DisputeModal create path, auto-create paths).
  if (!claimInput.id && claim.transactionId) {
    const resolvedId = await findExistingClaimIdForToll(String(claim.transactionId));
    if (resolvedId) claim.id = resolvedId;
  }

  if (!claim.id) claim.id = crypto.randomUUID();
  if (!claim.createdAt) claim.createdAt = new Date().toISOString();
  claim.updatedAt = new Date().toISOString();

  await enforceClaimChargeGuard(claim, opts);

  const mode = opts?.syncMode ?? "auto";
  if (mode === "skip") {
    // Caller's own gate said no sync this time — persist as-is, no charge
    // emit/reverse, no legacy transaction, no toll_ledger.resolution write.
  } else if (mode === "force" || (await isDriverTollChargeSyncEnabled())) {
    const existingClaim = (await kv.get(`claim:${claim.id}`)) as
      | { status?: string; resolutionReason?: string; preIsReconciled?: boolean }
      | null;
    const prevReason = existingClaim?.status === "Resolved" ? (existingClaim.resolutionReason as ClaimResolutionReason) : undefined;
    const nextReason = claim.status === "Resolved" ? (claim.resolutionReason as ClaimResolutionReason) : undefined;

    const sync = await syncClaimTollResolution(
      {
        claimId: claim.id,
        transactionId: claim.transactionId,
        driverId: claim.driverId,
        driverName: claim.driverName,
        vehicleId: claim.vehicleId,
        tripId: claim.tripId,
        amount: claim.amount,
        date: claim.date,
        subject: claim.subject,
        prevReason,
        nextReason,
        source: "claim_resolution",
        priorIsReconciled: existingClaim?.preIsReconciled,
      },
      c,
    );
    if (sync.resolutionTransactionId !== undefined) {
      claim.resolutionTransactionId = sync.resolutionTransactionId ?? undefined;
    }
    if (sync.priorIsReconciled !== undefined) {
      claim.preIsReconciled = sync.priorIsReconciled;
    } else if (nextReason === undefined) {
      claim.preIsReconciled = undefined;
    }
  } else {
    // Flag OFF: preserve legacy behavior byte-for-byte — first-charge-only,
    // positive Adjustment txn (legacy sign), no reversal/reclassify support.
    // DEPRECATED path: prefer driverTollChargeSyncEnabled ON + syncMode force
    // for Apply/Undo unlinked shortfall. Planned for removal once all fleets
    // run with the reversible claim_toll_sync projection.
    // no toll_ledger sync. Identical to the pre-existing code path.
    if (claim.status === "Resolved" && claim.resolutionReason === "Charge Driver" && !claim.resolutionTransactionId) {
      const txId = crypto.randomUUID();
      const transaction = {
        id: txId,
        driverId: claim.driverId,
        date: new Date().toISOString(),
        description: `Toll Dispute Charge - ${claim.subject || "Resolution"}`,
        category: "Adjustment",
        tripId: claim.tripId,
        type: "Adjustment",
        amount: Math.abs(claim.amount || 0),
        status: "Completed",
        paymentMethod: "Cash",
        metadata: { claimId: claim.id, source: "claim_resolution" },
      };
      await kv.set(`transaction:${txId}`, stampOrg(transaction, c as never));
      claim.resolutionTransactionId = txId;
    }
  }

  await kv.set(`claim:${claim.id}`, stampOrg(claim, c as never));
  await syncTollLinkage(claim);
  return claim;
}

/**
 * Delete a claim, reversing any active driver charge/toll_ledger resolution
 * first if it was Resolved (mirrors the manual-revert-then-delete pattern
 * dispute_refund_controller.tsx used to do inline for its on-the-fly claims).
 */
export async function deleteClaim(claimId: string, c: unknown, opts?: UpsertClaimOptions): Promise<void> {
  const claim = (await kv.get(`claim:${claimId}`)) as any;
  const mode = opts?.syncMode ?? "auto";
  if (
    claim && typeof claim === "object" && claim.status === "Resolved" && mode !== "skip" &&
    (mode === "force" || (await isDriverTollChargeSyncEnabled()))
  ) {
    await syncClaimTollResolution(
      {
        claimId,
        transactionId: claim.transactionId,
        driverId: claim.driverId,
        driverName: claim.driverName,
        vehicleId: claim.vehicleId,
        tripId: claim.tripId,
        amount: claim.amount,
        date: claim.date,
        subject: claim.subject,
        prevReason: claim.resolutionReason as ClaimResolutionReason,
        nextReason: undefined,
        source: "claim_resolution",
        priorIsReconciled: claim.preIsReconciled,
      },
      c,
    );
  }
  await kv.del(`claim:${claimId}`);
  if (claim) await clearTollLinkage(claim.transactionId, claimId);
}

export interface ClaimDateBackfillResult {
  scanned: number;
  updated: number;
  skippedAlreadySet: number;
  skippedNoSource: number;
}

/**
 * One-time repair for claims created before every claim-creation call site
 * set `date` (Phase F1). Fallback chain, in priority order: the linked
 * toll's own date (via `transactionId`) → `tripDate` → `createdAt`. Patches
 * ONLY the `date` field via a bare `kv.set` — never `upsertClaim`, which
 * would re-run the reversible sync/workflow-stage side effects on claims
 * that are already fully resolved. Idempotent: a second run reports
 * `updated: 0` since every claim it already touched now has `date` set.
 */
export async function executeClaimDateBackfill(opts?: { dryRun?: boolean }): Promise<ClaimDateBackfillResult> {
  const dryRun = opts?.dryRun ?? true;
  const claims = (await loadAllByPrefix("claim:")) as any[];
  let updated = 0;
  let skippedAlreadySet = 0;
  let skippedNoSource = 0;

  for (const claim of claims) {
    if (!claim || typeof claim !== "object" || !claim.id) continue;
    if (claim.date) {
      skippedAlreadySet++;
      continue;
    }

    let resolvedDate: string | undefined;
    if (claim.transactionId) {
      const toll = await getTollLedgerEntry(claim.transactionId);
      if (toll?.date) resolvedDate = toll.date;
    }
    if (!resolvedDate && claim.tripDate) resolvedDate = claim.tripDate;
    if (!resolvedDate && claim.createdAt) resolvedDate = claim.createdAt;

    if (!resolvedDate) {
      skippedNoSource++;
      continue;
    }

    updated++;
    if (!dryRun) {
      await kv.set(`claim:${claim.id}`, { ...claim, date: resolvedDate });
    }
  }

  return { scanned: claims.length, updated, skippedAlreadySet, skippedNoSource };
}
