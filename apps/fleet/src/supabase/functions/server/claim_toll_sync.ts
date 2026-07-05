/**
 * Imperative side of the claim → driver-charge / toll_ledger sync. Given a
 * claim's resolution transition, asks `decideClaimResolutionSync` (pure) what
 * must happen, then applies it: reverse/apply the driver charge and keep
 * `toll_ledger.resolution` accurate.
 *
 * Extracted from the inline block in `POST /claims` (index.tsx) so a second
 * caller (dispute-refund matching) can reuse the exact same reversible,
 * idempotent behavior instead of a raw `kv.set` on the claim. Does not
 * persist the claim itself — callers own that so each can merge in their own
 * claim-specific fields (preDisputeStatus, disputeRefundId, etc.).
 */

import {
  decideClaimResolutionSync,
  type ClaimResolutionReason,
  type TollLedgerResolution,
} from "./claim_resolution_sync.ts";
import { emitDriverTollCharge, reverseDriverTollCharge } from "./driver_toll_charge.ts";
import { getTollLedgerEntry, updateTollLedgerEntry } from "./toll_controller.tsx";

export interface SyncClaimTollResolutionParams {
  claimId: string;
  transactionId?: string | null;
  driverId?: string;
  driverName?: string;
  vehicleId?: string;
  tripId?: string | null;
  amount?: number;
  date?: string;
  subject?: string;
  prevReason: ClaimResolutionReason;
  nextReason: ClaimResolutionReason;
  /** Provenance passed straight through to emit/reverseDriverTollCharge. */
  source: string;
  /**
   * The toll's `isReconciled` value from BEFORE this claim ever resolved it
   * (stashed by the caller on first resolve, from this function's
   * `priorIsReconciled` result). Required to fully revert on a final
   * unresolve (`nextReason: undefined`) — without it, isReconciled is left
   * untouched rather than guessed at.
   */
  priorIsReconciled?: boolean;
}

export interface SyncClaimTollResolutionResult {
  isNoop: boolean;
  /** undefined = don't touch claim.resolutionTransactionId; null = clear it; string = set it. */
  resolutionTransactionId: string | null | undefined;
  nextLedgerResolution: TollLedgerResolution;
  /**
   * Set only on a claim's FIRST resolve (prevReason was undefined) — the
   * toll's isReconciled value observed just before this sync flipped it to
   * true. Callers should stash this on the claim (e.g. `claim.preIsReconciled`)
   * and pass it back as `priorIsReconciled` on the eventual full revert.
   */
  priorIsReconciled: boolean | undefined;
}

export async function syncClaimTollResolution(
  params: SyncClaimTollResolutionParams,
  c: unknown,
): Promise<SyncClaimTollResolutionResult> {
  const decision = decideClaimResolutionSync({
    prevReason: params.prevReason,
    nextReason: params.nextReason,
  });

  if (decision.isNoop) {
    return {
      isNoop: true,
      resolutionTransactionId: undefined,
      nextLedgerResolution: decision.nextLedgerResolution,
      priorIsReconciled: undefined,
    };
  }

  const effectiveTollId = params.transactionId || params.claimId;
  let resolutionTransactionId: string | null | undefined;
  let priorIsReconciled: boolean | undefined;

  if (decision.shouldReverse) {
    const reverseResult = await reverseDriverTollCharge(
      { tollId: effectiveTollId, claimId: params.claimId, source: params.source },
      c,
    );
    if (reverseResult.reversed) {
      resolutionTransactionId = null;
    }
  }

  if (decision.shouldCharge) {
    const tollEntry = params.transactionId && (!params.date || !params.vehicleId || !params.driverName)
      ? await getTollLedgerEntry(params.transactionId).catch(() => null)
      : null;
    const result = await emitDriverTollCharge(
      {
        tollId: effectiveTollId,
        claimId: params.claimId,
        driverId: params.driverId || "unknown",
        driverName: params.driverName || tollEntry?.driverName || undefined,
        vehicleId: params.vehicleId || tollEntry?.vehicleId || undefined,
        tripId: params.tripId ?? null,
        amount: params.amount || 0,
        date: params.date || tollEntry?.date || new Date().toISOString(),
        description: `Toll Charge - ${params.subject || "Personal Use"}`,
        source: params.source,
      },
      c,
    );
    if (result.projectionTxId) resolutionTransactionId = result.projectionTxId;
  }

  if (params.transactionId) {
    try {
      const ledgerUpdates: { resolution: TollLedgerResolution; isReconciled?: boolean } = {
        resolution: decision.nextLedgerResolution,
      };
      // A non-null resolution means the toll has genuinely been dealt with
      // (charged/written off/refunded) — reflect that in isReconciled too, so
      // driver-financial views that read this flag (e.g. Expense History's
      // Toll Status column) agree with the Reconciliation tab instead of
      // still showing it as unmatched. Fully reversible: on FIRST resolve
      // (prevReason undefined) we capture whatever isReconciled already was
      // (e.g. an "Underpaid" claim's toll may already be true from an
      // unrelated trip match) and report it back as `priorIsReconciled` so
      // the caller can stash it on the claim; on the eventual full revert
      // (nextReason undefined) we restore exactly that captured value
      // instead of guessing, so we never wrongly un-reconcile an unrelated
      // match or leave a stale `true` behind.
      if (decision.nextLedgerResolution !== null) {
        if (params.prevReason === undefined) {
          const existing = await getTollLedgerEntry(params.transactionId).catch(() => null);
          priorIsReconciled = existing?.isReconciled ?? false;
        }
        ledgerUpdates.isReconciled = true;
      } else if (typeof params.priorIsReconciled === "boolean") {
        ledgerUpdates.isReconciled = params.priorIsReconciled;
      }
      await updateTollLedgerEntry(params.transactionId, ledgerUpdates, "resolved", "admin");
    } catch (err: any) {
      console.error(`[ClaimTollSync] toll_ledger resolution sync failed for ${params.transactionId}:`, err.message);
    }
  }

  return { isNoop: false, resolutionTransactionId, nextLedgerResolution: decision.nextLedgerResolution, priorIsReconciled };
}
