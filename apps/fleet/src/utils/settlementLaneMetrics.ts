/**
 * Shared settlement lane metrics for Cash desk + Close Week (U-4 / U-3).
 * Collect vs pay are separate arrays — never infer lane from optional collectKind.
 * cash_held vs driver_owes still uses explicit collectKind on collect rows only.
 */
import { resolvePayQueueOwed } from './driverSettlementsPayAmount';

export type LaneQueueRow = {
  amountOwed?: number | null;
  settlementAmount?: number | null;
  cashStillHeld?: number | null;
  collectKind?: string | null;
  moneyUnlocked?: boolean;
  periodFrozen?: boolean;
  fuelFinalized?: boolean;
};

export type SettlementLaneMetrics = {
  fleetOwes: number;
  driversOwe: number;
  cashHeld: number;
  /** Net = fleetOwes − driversOwe (liability minus receivable). Custody separate. */
  netPosition: number;
  /** Gross exposure for legacy label = sum of three absolute piles. */
  totalExposure: number;
  blockedExposure: number;
};

function collectOwed(r: LaneQueueRow): number {
  if (r.amountOwed != null && Number.isFinite(r.amountOwed)) return Math.max(0, Number(r.amountOwed));
  if (r.collectKind === 'cash_held') return Math.max(0, Number(r.cashStillHeld) || 0);
  return Math.max(0, Math.abs(Number(r.settlementAmount) || 0));
}

function isBlocked(r: LaneQueueRow): boolean {
  return r.periodFrozen === true || r.moneyUnlocked !== true || r.fuelFinalized === false;
}

export function computeSettlementLaneMetrics(
  collectRows: LaneQueueRow[],
  payRows: LaneQueueRow[],
): SettlementLaneMetrics {
  let fleetOwes = 0;
  let blockedExposure = 0;
  for (const r of payRows) {
    const owed = resolvePayQueueOwed(r as Parameters<typeof resolvePayQueueOwed>[0]);
    fleetOwes += owed;
    if (isBlocked(r)) blockedExposure += owed;
  }

  let driversOwe = 0;
  let cashHeld = 0;
  for (const r of collectRows) {
    const owed = collectOwed(r);
    if (r.collectKind === 'cash_held') cashHeld += owed;
    else driversOwe += owed;
    if (isBlocked(r)) blockedExposure += owed;
  }

  return {
    fleetOwes,
    driversOwe,
    cashHeld,
    netPosition: fleetOwes - driversOwe,
    totalExposure: fleetOwes + driversOwe + cashHeld,
    blockedExposure,
  };
}
