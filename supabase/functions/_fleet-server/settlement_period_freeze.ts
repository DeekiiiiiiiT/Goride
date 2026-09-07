/**
 * Period freeze / calendar-close gates for settlement commands.
 * Signed weeks block further money writes; open weeks cannot settle yet.
 */
import {
  isSettlementPeriodEnded,
  settlementPeriodOpenMessage,
} from "../../../packages/finance-core/src/settlementPeriodGate.ts";
import { SettlementCommandError } from "./settlement_commands.ts";

export function isPeriodFrozen(period: {
  metadata?: Record<string, unknown> | null;
  settlementStatus?: string | null;
  signedAt?: string | null;
} | null | undefined): boolean {
  if (!period) return false;
  if (period.signedAt) return true;
  const meta = period.metadata || {};
  if (meta.periodFrozen === true || meta.signedWeek === true) return true;
  if (meta.financeCore && typeof meta.financeCore === "object") {
    const fc = meta.financeCore as Record<string, unknown>;
    if (fc.periodFrozen === true || fc.signedAt) return true;
  }
  return false;
}

export function assertPeriodNotFrozen(period: Parameters<typeof isPeriodFrozen>[0]): void {
  if (isPeriodFrozen(period)) {
    const err = new Error("PERIOD_FROZEN: this settlement week is closed and cannot accept new movements");
    (err as Error & { code?: string }).code = "PERIOD_FROZEN";
    throw err;
  }
}

/**
 * H-4: frozen weeks must still match their stored close hash. Call after
 * assertPeriodNotFrozen on money paths that load a full period row.
 * Throws HASH_MISMATCH (409) when recomputed hash disagrees.
 */
export async function assertFrozenPeriodHashIntact(period: {
  metadata?: Record<string, unknown> | null;
  source_event_hash?: string | null;
  sourceEventHash?: string | null;
  toll_spend?: number | null;
  toll_cash_spend?: number | null;
  toll_reimbursed?: number | null;
  toll_charged_to_driver?: number | null;
  fuel_deduction?: number | null;
  fuel_fleet_share?: number | null;
  driver_share?: number | null;
  fleet_share?: number | null;
  earnings_gross?: number | null;
  tips_paid_to_driver?: number | null;
  cash_collected?: number | null;
  cash_returned?: number | null;
  cash_written_off?: number | null;
  cash_still_held?: number | null;
  settlement_paid?: number | null;
  settlement_amount?: number | null;
  payout_net?: number | null;
} | null | undefined): Promise<void> {
  if (!period || !isPeriodFrozen(period)) return;

  const {
    verifyPeriodCloseHash,
    storedCloseHashFromPeriod,
  } = await import("../../../packages/finance-core/src/closeHash.ts");

  const stored = storedCloseHashFromPeriod(period);
  if (!stored) {
    // Legacy freeze without hash — allow movements to stay blocked by freeze,
    // but do not hard-fail verify until all closes write hashes.
    return;
  }

  const fc = (period.metadata?.financeCore as Record<string, unknown> | undefined) || {};
  const storedIds = Array.isArray(fc.closeSourceRowIds)
    ? (fc.closeSourceRowIds as unknown[]).map(String)
    : [];
  const storedEngine =
    typeof fc.closeEngineVersion === "string" && fc.closeEngineVersion.trim()
      ? String(fc.closeEngineVersion)
      : "week-statement@1";

  const result = await verifyPeriodCloseHash({
    row: {
      tollSpend: Number(period.toll_spend) || 0,
      tollCashSpend: Number(period.toll_cash_spend) || 0,
      tollReimbursed: Number(period.toll_reimbursed) || 0,
      tollChargedToDriver: Number(period.toll_charged_to_driver) || 0,
      fuelDeduction: Number(period.fuel_deduction) || 0,
      fuelFleetShare: Number(period.fuel_fleet_share) || 0,
      driverShare: Number(period.driver_share) || 0,
      fleetShare: Number(period.fleet_share) || 0,
      earningsGross: Number(period.earnings_gross) || 0,
      tipsPaidToDriver: Number(period.tips_paid_to_driver) || 0,
      cashCollected: Number(period.cash_collected) || 0,
      cashReturned: Number(period.cash_returned) || 0,
      cashWrittenOff: Number(period.cash_written_off) || 0,
      cashStillHeld: Number(period.cash_still_held) || 0,
      settlementPaid: Number(period.settlement_paid) || 0,
      settlementAmount: Number(period.settlement_amount) || 0,
      payoutNet: Number(period.payout_net) || 0,
    },
    storedHash: stored,
    sourceRowIds: storedIds,
    engineVersion: storedEngine,
  });

  if (!result.ok) {
    throw new SettlementCommandError(
      "HASH_MISMATCH",
      "Closed week hash no longer matches stored close hash — refuse money movement",
      409,
      { stored: result.stored, expected: result.expected },
    );
  }
}

export type FreezeMetaInput = {
  actorId: string;
  reason: string;
  /** H-4 close hash of the complete row + input ids/versions. */
  closeHash: string;
  /** Defaults to now(). */
  signedAt?: string;
  /** Same sourceRowIds used when building closeHash (H-4 verify-on-read). */
  sourceRowIds?: string[];
  /** Same engineVersion used when building closeHash. */
  engineVersion?: string;
};

/**
 * Merge freeze/signature metadata into a period row's metadata blob (pure —
 * caller persists the returned object). Sets:
 *   metadata.periodFrozen         = true
 *   metadata.signedWeek           = true
 *   metadata.financeCore.signedAt = ISO timestamp
 *   metadata.financeCore.closeHash / closedBy / closeReason
 *   metadata.financeCore.closeSourceRowIds / closeEngineVersion (H-4)
 * After this, isPeriodFrozen() returns true and assertPeriodNotFrozen() blocks
 * further movements.
 */
export function markPeriodFrozen(
  row: { metadata?: Record<string, unknown> | null } | null | undefined,
  { actorId, reason, closeHash, signedAt, sourceRowIds, engineVersion }: FreezeMetaInput,
): Record<string, unknown> {
  const meta = { ...(row?.metadata || {}) } as Record<string, unknown>;
  const financeCore = { ...((meta.financeCore as Record<string, unknown>) || {}) };
  const signedTs = signedAt || new Date().toISOString();

  financeCore.periodFrozen = true;
  financeCore.signedAt = signedTs;
  financeCore.closeHash = closeHash;
  financeCore.closedBy = actorId;
  financeCore.closeReason = reason;
  if (sourceRowIds) {
    financeCore.closeSourceRowIds = [...sourceRowIds].map(String).sort();
  }
  if (engineVersion) {
    financeCore.closeEngineVersion = engineVersion;
  }

  meta.periodFrozen = true;
  meta.signedWeek = true;
  meta.financeCore = financeCore;
  return meta;
}

export type ClearFreezeMetaInput = {
  actorId: string;
  reason: string;
  /** Defaults to now(). */
  reopenedAt?: string;
};

/**
 * Clear calendar freeze for an admin reopen (pure — caller persists).
 * Archives the live seal into financeCore.reopenHistory[] and clears live
 * freeze flags so isPeriodFrozen() returns false until the next close.
 */
export function clearPeriodFreeze(
  row: { metadata?: Record<string, unknown> | null } | null | undefined,
  { actorId, reason, reopenedAt }: ClearFreezeMetaInput,
): Record<string, unknown> {
  const meta = { ...(row?.metadata || {}) } as Record<string, unknown>;
  const financeCore = { ...((meta.financeCore as Record<string, unknown>) || {}) };
  const reopenedTs = reopenedAt || new Date().toISOString();

  const prior = {
    closeHash: financeCore.closeHash ?? null,
    signedAt: financeCore.signedAt ?? null,
    closedBy: financeCore.closedBy ?? null,
    closeReason: financeCore.closeReason ?? null,
    closeSourceRowIds: financeCore.closeSourceRowIds ?? null,
    closeEngineVersion: financeCore.closeEngineVersion ?? null,
    reopenedAt: reopenedTs,
    reopenedBy: actorId,
    reopenReason: reason,
  };
  const history = Array.isArray(financeCore.reopenHistory)
    ? [...(financeCore.reopenHistory as unknown[])]
    : [];
  history.push(prior);
  financeCore.reopenHistory = history;

  financeCore.periodFrozen = false;
  delete financeCore.signedAt;
  delete financeCore.closeHash;
  delete financeCore.closedBy;
  delete financeCore.closeReason;
  delete financeCore.closeSourceRowIds;
  delete financeCore.closeEngineVersion;

  meta.periodFrozen = false;
  meta.signedWeek = false;
  meta.financeCore = financeCore;
  return meta;
}

/** Collect / Pay / Write-off / runs — week must be fully over (periodEnd + 1). */
export function assertPeriodEndedForSettlement(
  weekAnchor: string,
  now: Date | string = new Date(),
): void {
  const gate = { weekAnchor, now };
  if (isSettlementPeriodEnded(gate)) return;
  throw new SettlementCommandError(
    "PERIOD_NOT_ENDED",
    settlementPeriodOpenMessage(gate),
    409,
    { weekAnchor },
  );
}
