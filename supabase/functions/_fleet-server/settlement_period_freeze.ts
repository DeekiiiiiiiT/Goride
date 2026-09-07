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

export type FreezeMetaInput = {
  actorId: string;
  reason: string;
  /** H-4 close hash of the complete row + input ids/versions. */
  closeHash: string;
  /** Defaults to now(). */
  signedAt?: string;
};

/**
 * Merge freeze/signature metadata into a period row's metadata blob (pure —
 * caller persists the returned object). Sets:
 *   metadata.periodFrozen         = true
 *   metadata.signedWeek           = true
 *   metadata.financeCore.signedAt = ISO timestamp
 *   metadata.financeCore.closeHash / closedBy / closeReason
 * After this, isPeriodFrozen() returns true and assertPeriodNotFrozen() blocks
 * further movements.
 */
export function markPeriodFrozen(
  row: { metadata?: Record<string, unknown> | null } | null | undefined,
  { actorId, reason, closeHash, signedAt }: FreezeMetaInput,
): Record<string, unknown> {
  const meta = { ...(row?.metadata || {}) } as Record<string, unknown>;
  const financeCore = { ...((meta.financeCore as Record<string, unknown>) || {}) };
  const signedTs = signedAt || new Date().toISOString();

  financeCore.periodFrozen = true;
  financeCore.signedAt = signedTs;
  financeCore.closeHash = closeHash;
  financeCore.closedBy = actorId;
  financeCore.closeReason = reason;

  meta.periodFrozen = true;
  meta.signedWeek = true;
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
