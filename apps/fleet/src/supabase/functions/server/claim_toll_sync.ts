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
}

export interface SyncClaimTollResolutionResult {
  isNoop: boolean;
  /** undefined = don't touch claim.resolutionTransactionId; null = clear it; string = set it. */
  resolutionTransactionId: string | null | undefined;
  nextLedgerResolution: TollLedgerResolution;
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
    return { isNoop: true, resolutionTransactionId: undefined, nextLedgerResolution: decision.nextLedgerResolution };
  }

  const effectiveTollId = params.transactionId || params.claimId;
  let resolutionTransactionId: string | null | undefined;

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
        driverId: params.driverId,
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
      await updateTollLedgerEntry(
        params.transactionId,
        { resolution: decision.nextLedgerResolution },
        "resolved",
        "admin",
      );
    } catch (err: any) {
      console.error(`[ClaimTollSync] toll_ledger resolution sync failed for ${params.transactionId}:`, err.message);
    }
  }

  return { isNoop: false, resolutionTransactionId, nextLedgerResolution: decision.nextLedgerResolution };
}
