/**
 * Period-scoped reconciliation reset — inventory + ordered undo for one wizard week.
 */
import { startOfWeek, format } from "npm:date-fns";
import * as kv from "./kv_store.tsx";
import { deleteClaim } from "./claim_service.ts";
import { unmatchDisputeRefundById } from "./dispute_refund_controller.tsx";
import { getFleetTimezone, fleetCalendarDay } from "./timezone_helper.tsx";
import {
  applyRefundResolution,
  executeTollResetForReconciliation,
  getDriverAliasMap,
  getRefundAutomationSettings,
  isUnresolvedRefund,
  loadAllByPrefix,
  loadAllTollLedgerWithTrips,
  loadDisputeRefundRecords,
  recomputeAndPersistWorkflowStage,
  undoApplyUnlinkedRefundToClaim,
} from "./toll_controller.tsx";
import {
  isCorrectSettlementOrderEnabled,
  reverseSettlementsForTolls,
} from "./toll_settlement.ts";

function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

export function weekKeyForDateStr(dateStr: string, timezone: string): string {
  const day = fleetCalendarDay(dateStr, timezone) || String(dateStr).slice(0, 10);
  let base = ymdToLocalDate(day);
  if (isNaN(base.getTime())) base = new Date(dateStr);
  const weekStart = startOfWeek(base, { weekStartsOn: 1 });
  return format(weekStart, "yyyy-MM-dd");
}

export function formatPeriodConfirmationLabel(startDate: string, endDate: string): string {
  const start = ymdToLocalDate(startDate);
  const end = ymdToLocalDate(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "";
  return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}

function periodConfirmLabelsMatchServer(typed: string, expected: string): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[-–—]/g, "-");
  return norm(typed) === norm(expected);
}

/** Toll-first claim anchor week key (mirrors client claimPeriodWeekKey). */
export function claimPeriodWeekKeyServer(
  claim: any,
  tollDateById: Map<string, string>,
  fleetTz: string,
): string | null {
  const candidates = [
    claim?.transactionId ? tollDateById.get(String(claim.transactionId)) : undefined,
    claim?.date,
    claim?.tripDate,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const d = new Date(candidate);
    if (!isNaN(d.getTime())) return weekKeyForDateStr(candidate, fleetTz);
  }
  return null;
}

function driverMatches(
  entityDriverId: string | undefined,
  driverIds?: string[],
  aliasMap?: Map<string, string>,
): boolean {
  if (!driverIds || driverIds.length === 0) return true;
  if (!entityDriverId) return false;
  const entityId = String(entityDriverId);
  const canonicalEntityId = aliasMap?.get(entityId) ?? entityId;
  return driverIds.some((driverId) => {
    const canonicalRequestedId = aliasMap?.get(String(driverId)) ?? String(driverId);
    return canonicalRequestedId === canonicalEntityId;
  });
}

function isUnlinkedApplyTrip(trip: any): boolean {
  const res = trip?.tollRefundResolution;
  if (!res || res.status !== "expense_logged") return false;
  const source = String(res.source || "");
  return !!(
    res.appliedToClaimId ||
    res.appliedToTollId ||
    source.startsWith("system:unlinked_shortfall:")
  );
}

function inventoryTouchesWork(inv: PeriodResetInventory): boolean {
  return (
    inv.unlinkedApplyTripIds.length +
      inv.disputeRefundIds.length +
      inv.claimIds.length +
      inv.tollIds.length +
      inv.refundResolutionTripIds.length +
      inv.unresolvedUnlinkedTripIds.length >
    0
  );
}

export interface PeriodResetInventory {
  periodWeekKey: string;
  unlinkedApplyTripIds: string[];
  disputeRefundIds: string[];
  claimIds: string[];
  tollIds: string[];
  refundResolutionTripIds: string[];
  /** Pending / open Unlinked Refunds still in the wizard queue for this week. */
  unresolvedUnlinkedTripIds: string[];
  chargeDriverClaimIds: string[];
  /** Drivers whose Expenses week must be rebuilt after reset. */
  touchedDriverIds: string[];
}

export interface PeriodResetSummary {
  unlinkedAppliesUndone: number;
  disputeRefundsUnmatched: number;
  claimsDeleted: number;
  tollsReset: number;
  refundResolutionsReverted: number;
  unresolvedUnlinkedNormalized: number;
  workflowStagesRecomputed: number;
  /** Expenses snapshot rows rebuilt for the reset week. */
  periodsRebuilt?: number;
}

export interface PeriodResetResult {
  dryRun: boolean;
  inventory: PeriodResetInventory;
  summary: PeriodResetSummary;
  errors: string[];
  completedAt: string;
}

export async function buildPeriodResetInventory(opts: {
  startDate: string;
  driverIds?: string[];
  fleetTz?: string;
}): Promise<PeriodResetInventory> {
  const fleetTz = opts.fleetTz || (await getFleetTimezone());
  const periodWeekKey = opts.startDate;
  const driverIds = opts.driverIds;

  const { tollTx, trips } = await loadAllTollLedgerWithTrips();
  const allClaims = (await loadAllByPrefix("claim:")) as any[];
  const disputeRefunds = await loadDisputeRefundRecords();
  const driverAliasMap = await getDriverAliasMap();

  const tollDateById = new Map<string, string>();
  for (const tx of tollTx) {
    if (tx?.id && tx?.date) tollDateById.set(String(tx.id), tx.date);
  }

  // Any trip already linked to a tag toll is not an "unlinked refund".
  const linkedTripIds = new Set(
    tollTx.map((tx: any) => tx?.tripId).filter(Boolean).map(String),
  );

  const tollIds = tollTx
    .filter((tx: any) => {
      if (!tx?.id || !tx?.date) return false;
      if (weekKeyForDateStr(tx.date, fleetTz) !== periodWeekKey) return false;
      return driverMatches(tx.driverId, driverIds, driverAliasMap);
    })
    .map((tx: any) => String(tx.id));

  const tollIdSet = new Set(tollIds);

  const claimIds = allClaims
    .filter((cl: any) => {
      if (!cl?.id) return false;
      if (claimPeriodWeekKeyServer(cl, tollDateById, fleetTz) !== periodWeekKey) return false;
      return driverMatches(cl.driverId, driverIds, driverAliasMap);
    })
    .map((cl: any) => String(cl.id));

  const chargeDriverClaimIds = allClaims
    .filter((cl: any) => claimIds.includes(String(cl.id)) && cl.status === "Resolved" && cl.resolutionReason === "Charge Driver")
    .map((cl: any) => String(cl.id));

  const unlinkedApplyTripIds = trips
    .filter((t: any) => {
      if (!t?.id || !isUnlinkedApplyTrip(t)) return false;
      if (!driverMatches(t.driverId, driverIds, driverAliasMap)) return false;
      const res = t.tollRefundResolution;
      const tollId = res?.appliedToTollId || res?.linkedTollLedgerId;
      const claimId = res?.appliedToClaimId;
      if (tollId && tollIdSet.has(String(tollId))) return true;
      if (claimId) {
        const cl = allClaims.find((c: any) => String(c.id) === String(claimId));
        if (cl && claimPeriodWeekKeyServer(cl, tollDateById, fleetTz) === periodWeekKey) return true;
      }
      return t.date && weekKeyForDateStr(t.date, fleetTz) === periodWeekKey;
    })
    .map((t: any) => String(t.id));

  const claimIdSet = new Set(claimIds);

  const disputeRefundIds = disputeRefunds
    .filter((r: any) => {
      if (!r?.id) return false;
      if (r.status !== "matched" && r.status !== "auto_resolved") return false;
      if (!driverMatches(r.driverId, driverIds, driverAliasMap)) return false;
      if (r.matchedTollId && tollIdSet.has(String(r.matchedTollId))) return true;
      if (r.matchedClaimId && claimIdSet.has(String(r.matchedClaimId))) return true;
      return r.date && weekKeyForDateStr(r.date, fleetTz) === periodWeekKey;
    })
    .map((r: any) => String(r.id));

  const unlinkedApplySet = new Set(unlinkedApplyTripIds);
  const refundResolutionTripIds = trips
    .filter((t: any) => {
      if (!t?.id) return false;
      if (unlinkedApplySet.has(String(t.id))) return false;
      const res = t?.tollRefundResolution;
      if (!res || res.status === "pending") return false;
      if (!driverMatches(t.driverId, driverIds, driverAliasMap)) return false;
      const anchor = t.dropoffTime || t.date;
      return anchor && weekKeyForDateStr(String(anchor), fleetTz) === periodWeekKey;
    })
    .map((t: any) => String(t.id));

  // Pending Unlinked Refunds are already "at start" for that step, but Reset
  // must still count them so preview isn't empty and Expenses can be rebuilt.
  const refundResolutionSet = new Set(refundResolutionTripIds);
  const unresolvedUnlinkedTripIds = trips
    .filter((t: any) => {
      if (!t?.id) return false;
      if (unlinkedApplySet.has(String(t.id))) return false;
      if (refundResolutionSet.has(String(t.id))) return false;
      if (!isUnresolvedRefund(t, linkedTripIds)) return false;
      if (!driverMatches(t.driverId, driverIds, driverAliasMap)) return false;
      const anchor = t.dropoffTime || t.date;
      return anchor && weekKeyForDateStr(String(anchor), fleetTz) === periodWeekKey;
    })
    .map((t: any) => String(t.id));

  const touchedDriverIds = new Set<string>(
    (driverIds || []).map(String).filter(Boolean),
  );
  for (const tx of tollTx) {
    if (!tx?.id || !tollIdSet.has(String(tx.id))) continue;
    if (tx.driverId) touchedDriverIds.add(String(tx.driverId));
  }
  for (const cl of allClaims) {
    if (!cl?.id || !claimIdSet.has(String(cl.id))) continue;
    if (cl.driverId) touchedDriverIds.add(String(cl.driverId));
  }
  const tripIdNeedDrivers = new Set([
    ...unlinkedApplyTripIds,
    ...refundResolutionTripIds,
    ...unresolvedUnlinkedTripIds,
  ]);
  for (const t of trips) {
    if (!t?.id || !tripIdNeedDrivers.has(String(t.id))) continue;
    if (t.driverId) touchedDriverIds.add(String(t.driverId));
  }

  return {
    periodWeekKey,
    unlinkedApplyTripIds,
    disputeRefundIds,
    claimIds,
    tollIds,
    refundResolutionTripIds,
    unresolvedUnlinkedTripIds,
    chargeDriverClaimIds,
    touchedDriverIds: [...touchedDriverIds],
  };
}

export async function executePeriodReconciliationReset(
  opts: {
    startDate: string;
    endDate: string;
    driverIds?: string[];
    dryRun: boolean;
    confirmationLabel: string;
  },
  c: unknown,
): Promise<PeriodResetResult> {
  if (!opts.dryRun) {
    const expectedLabel = formatPeriodConfirmationLabel(opts.startDate, opts.endDate);
    if (!periodConfirmLabelsMatchServer(opts.confirmationLabel, expectedLabel)) {
      throw Object.assign(
        new Error(`Confirmation label must exactly match: ${expectedLabel}`),
        { status: 400 },
      );
    }
  }

  const inventory = await buildPeriodResetInventory({
    startDate: opts.startDate,
    driverIds: opts.driverIds,
  });

  const summary: PeriodResetSummary = {
    unlinkedAppliesUndone: 0,
    disputeRefundsUnmatched: 0,
    claimsDeleted: 0,
    tollsReset: 0,
    refundResolutionsReverted: 0,
    unresolvedUnlinkedNormalized: 0,
    workflowStagesRecomputed: 0,
  };
  const errors: string[] = [];

  if (opts.dryRun) {
    return {
      dryRun: true,
      inventory,
      summary,
      errors,
      completedAt: new Date().toISOString(),
    };
  }

  const settings = await getRefundAutomationSettings();
  const claimSyncMode = settings.driverTollChargeSyncEnabled ? "force" : "skip";
  const settlementOrder = await isCorrectSettlementOrderEnabled();

  // Correct order applies unlinked → dispute; reverse dependency-first:
  // dispute allocations → unlinked allocations → claims/tolls.
  if (settlementOrder) {
    for (const refundId of inventory.disputeRefundIds) {
      try {
        await unmatchDisputeRefundById(refundId, c);
        summary.disputeRefundsUnmatched++;
      } catch (e: any) {
        errors.push(`unmatch dispute ${refundId}: ${e.message}`);
      }
    }
  }

  const unlinkedApplyStillResolved = new Set<string>();
  for (const tripId of inventory.unlinkedApplyTripIds) {
    try {
      const result = await undoApplyUnlinkedRefundToClaim(tripId, c, { skipUndoGate: true });
      if (result.ok) {
        // noop = already clean; still counts as handled for reset progress
        if (result.data?.mode !== "noop") summary.unlinkedAppliesUndone++;
      } else {
        errors.push(`undo apply ${tripId}: ${result.error}`);
        unlinkedApplyStillResolved.add(tripId);
      }
    } catch (e: any) {
      errors.push(`undo apply ${tripId}: ${e.message}`);
      unlinkedApplyStillResolved.add(tripId);
    }
  }

  // Safety net: if undo failed, force trip back to pending before claims are deleted.
  for (const tripId of unlinkedApplyStillResolved) {
    try {
      await applyRefundResolution({ tripId, resolution: "pending", auto: false, source: "admin:period_reset" });
      summary.refundResolutionsReverted++;
    } catch (e: any) {
      errors.push(`force revert unlinked apply ${tripId}: ${e.message}`);
    }
  }

  if (!settlementOrder) {
    for (const refundId of inventory.disputeRefundIds) {
      try {
        await unmatchDisputeRefundById(refundId, c);
        summary.disputeRefundsUnmatched++;
      } catch (e: any) {
        errors.push(`unmatch dispute ${refundId}: ${e.message}`);
      }
    }
  }

  // Clear any leftover allocation rows owned by period tolls.
  if (settlementOrder && inventory.tollIds.length > 0) {
    try {
      await reverseSettlementsForTolls(inventory.tollIds, { actor: "period_reset" });
    } catch (e: any) {
      errors.push(`reverse toll allocations: ${e.message}`);
    }
  }

  const freshInventory = await buildPeriodResetInventory({
    startDate: opts.startDate,
    driverIds: opts.driverIds,
  });

  // Cross-period safety net: a refund dated in ANOTHER week can still hold a
  // claim/toll this reset is about to delete. Unmatch it first or the refund
  // goes dangling (matched → deleted claim) and blocks future re-matching.
  try {
    const allRefunds = await loadDisputeRefundRecords();
    const claimIdSet = new Set(freshInventory.claimIds.map(String));
    const tollIdSetForRefunds = new Set(freshInventory.tollIds.map(String));
    for (const r of allRefunds) {
      if (!r?.id) continue;
      if (r.status !== "matched" && r.status !== "auto_resolved") continue;
      const holdsClaim = r.matchedClaimId && claimIdSet.has(String(r.matchedClaimId));
      const holdsToll = r.matchedTollId && tollIdSetForRefunds.has(String(r.matchedTollId));
      if (!holdsClaim && !holdsToll) continue;
      try {
        await unmatchDisputeRefundById(String(r.id), c);
        summary.disputeRefundsUnmatched++;
      } catch (e: any) {
        errors.push(`unmatch cross-period dispute ${r.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    errors.push(`cross-period dispute sweep: ${e.message}`);
  }

  for (const claimId of freshInventory.claimIds) {
    try {
      await deleteClaim(claimId, c, { syncMode: claimSyncMode as "force" | "skip" });
      summary.claimsDeleted++;
    } catch (e: any) {
      errors.push(`delete claim ${claimId}: ${e.message}`);
    }
  }

  for (const tollId of freshInventory.tollIds) {
    try {
      await executeTollResetForReconciliation(tollId);
      await recomputeAndPersistWorkflowStage(tollId, { claim: null });
      summary.tollsReset++;
      summary.workflowStagesRecomputed++;
    } catch (e: any) {
      errors.push(`reset toll ${tollId}: ${e.message}`);
    }
  }

  for (const tripId of freshInventory.refundResolutionTripIds) {
    try {
      await applyRefundResolution({ tripId, resolution: "pending", auto: false, source: "admin:period_reset" });
      summary.refundResolutionsReverted++;
    } catch (e: any) {
      errors.push(`revert refund ${tripId}: ${e.message}`);
    }
  }

  // Unresolved Unlinked Refunds are already at wizard-start (pending). Counting
  // them in inventory unlocks Reset + Expenses rebuild; no per-trip write needed.
  summary.unresolvedUnlinkedNormalized =
    freshInventory.unresolvedUnlinkedTripIds.length ||
    inventory.unresolvedUnlinkedTripIds.length;

  // Expenses / Settlement Toll Status reads driver_financial_periods — always
  // rebuild touched drivers so the week cannot stay "Reconciled" after reset.
  const driversToRebuild = new Set<string>([
    ...inventory.touchedDriverIds,
    ...freshInventory.touchedDriverIds,
    ...(opts.driverIds || []).map(String).filter(Boolean),
  ]);
  for (const tollId of freshInventory.tollIds) {
    try {
      const toll: any = await kv.get(`toll_ledger:${tollId}`);
      if (toll?.driverId) driversToRebuild.add(String(toll.driverId));
    } catch {
      /* non-fatal */
    }
  }
  let periodsRebuilt = 0;
  if (driversToRebuild.size > 0) {
    try {
      const { rebuildPeriodsForAnchors } = await import("./driver_financial_periods.ts");
      for (const driverId of driversToRebuild) {
        try {
          periodsRebuilt += await rebuildPeriodsForAnchors(driverId, [opts.startDate]);
        } catch (e: any) {
          errors.push(`rebuild expenses ${driverId}: ${e.message}`);
        }
      }
      console.log(
        `[PeriodReset] Rebuilt ${periodsRebuilt} expense period(s) for ${driversToRebuild.size} driver(s) ` +
          `(work=${inventoryTouchesWork(inventory) || inventoryTouchesWork(freshInventory)})`,
      );
    } catch (e: any) {
      errors.push(`rebuild expenses: ${e.message}`);
    }
  }

  await kv.set(`audit:period_reset:${Date.now()}`, {
    startDate: opts.startDate,
    endDate: opts.endDate,
    driverIds: opts.driverIds || [],
    summary: { ...summary, periodsRebuilt },
    errors,
    completedAt: new Date().toISOString(),
  });

  return {
    dryRun: false,
    inventory: {
      ...freshInventory,
      unresolvedUnlinkedTripIds:
        freshInventory.unresolvedUnlinkedTripIds.length > 0
          ? freshInventory.unresolvedUnlinkedTripIds
          : inventory.unresolvedUnlinkedTripIds,
      touchedDriverIds: [...driversToRebuild],
    },
    summary: { ...summary, periodsRebuilt },
    errors,
    completedAt: new Date().toISOString(),
  };
}
