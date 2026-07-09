/**
 * Period-scoped reconciliation reset — inventory + ordered undo for one wizard week.
 */
import { startOfWeek, endOfWeek, format } from "npm:date-fns";
import * as kv from "./kv_store.tsx";
import { deleteClaim } from "./claim_service.ts";
import { unmatchDisputeRefundById } from "./dispute_refund_controller.tsx";
import { getFleetTimezone } from "./timezone_helper.tsx";
import {
  applyRefundResolution,
  executeTollResetForReconciliation,
  getRefundAutomationSettings,
  loadAllByPrefix,
  loadAllTollLedgerWithTrips,
  loadDisputeRefundRecords,
  recomputeAndPersistWorkflowStage,
  undoApplyUnlinkedRefundToClaim,
} from "./toll_controller.tsx";

function fleetTzDay(dateStr: string, tz: string): string {
  const s = String(dateStr);
  const hasTzSuffix = /[Zz]|[+-]\d{2}:\d{2}$/.test(s);
  if (!hasTzSuffix) return s.slice(0, 10);
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

function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

export function weekKeyForDateStr(dateStr: string, timezone: string): string {
  const day = fleetTzDay(dateStr, timezone);
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

function driverMatches(entityDriverId: string | undefined, driverIds?: string[]): boolean {
  if (!driverIds || driverIds.length === 0) return true;
  if (!entityDriverId) return false;
  return driverIds.includes(String(entityDriverId));
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

export interface PeriodResetInventory {
  periodWeekKey: string;
  unlinkedApplyTripIds: string[];
  disputeRefundIds: string[];
  claimIds: string[];
  tollIds: string[];
  refundResolutionTripIds: string[];
  chargeDriverClaimIds: string[];
}

export interface PeriodResetSummary {
  unlinkedAppliesUndone: number;
  disputeRefundsUnmatched: number;
  claimsDeleted: number;
  tollsReset: number;
  refundResolutionsReverted: number;
  workflowStagesRecomputed: number;
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

  const tollDateById = new Map<string, string>();
  for (const tx of tollTx) {
    if (tx?.id && tx?.date) tollDateById.set(String(tx.id), tx.date);
  }

  const tollIds = tollTx
    .filter((tx: any) => {
      if (!tx?.id || !tx?.date) return false;
      if (weekKeyForDateStr(tx.date, fleetTz) !== periodWeekKey) return false;
      return driverMatches(tx.driverId, driverIds);
    })
    .map((tx: any) => String(tx.id));

  const tollIdSet = new Set(tollIds);

  const claimIds = allClaims
    .filter((cl: any) => {
      if (!cl?.id) return false;
      if (claimPeriodWeekKeyServer(cl, tollDateById, fleetTz) !== periodWeekKey) return false;
      return driverMatches(cl.driverId, driverIds);
    })
    .map((cl: any) => String(cl.id));

  const chargeDriverClaimIds = allClaims
    .filter((cl: any) => claimIds.includes(String(cl.id)) && cl.status === "Resolved" && cl.resolutionReason === "Charge Driver")
    .map((cl: any) => String(cl.id));

  const unlinkedApplyTripIds = trips
    .filter((t: any) => {
      if (!t?.id || !isUnlinkedApplyTrip(t)) return false;
      if (!driverMatches(t.driverId, driverIds)) return false;
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

  const disputeRefundIds = disputeRefunds
    .filter((r: any) => {
      if (!r?.id) return false;
      if (r.status !== "matched" && r.status !== "auto_resolved") return false;
      if (!driverMatches(r.driverId, driverIds)) return false;
      if (r.matchedTollId && tollIdSet.has(String(r.matchedTollId))) return true;
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
      if (!driverMatches(t.driverId, driverIds)) return false;
      return t.date && weekKeyForDateStr(t.date, fleetTz) === periodWeekKey;
    })
    .map((t: any) => String(t.id));

  return {
    periodWeekKey,
    unlinkedApplyTripIds,
    disputeRefundIds,
    claimIds,
    tollIds,
    refundResolutionTripIds,
    chargeDriverClaimIds,
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
    if (opts.confirmationLabel.trim() !== expectedLabel.trim()) {
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

  for (const tripId of inventory.unlinkedApplyTripIds) {
    try {
      const result = await undoApplyUnlinkedRefundToClaim(tripId, c);
      if (result.ok) summary.unlinkedAppliesUndone++;
      else errors.push(`undo apply ${tripId}: ${result.error}`);
    } catch (e: any) {
      errors.push(`undo apply ${tripId}: ${e.message}`);
    }
  }

  for (const refundId of inventory.disputeRefundIds) {
    try {
      await unmatchDisputeRefundById(refundId, c);
      summary.disputeRefundsUnmatched++;
    } catch (e: any) {
      errors.push(`unmatch dispute ${refundId}: ${e.message}`);
    }
  }

  const freshInventory = await buildPeriodResetInventory({
    startDate: opts.startDate,
    driverIds: opts.driverIds,
  });

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

  await kv.set(`audit:period_reset:${Date.now()}`, {
    startDate: opts.startDate,
    endDate: opts.endDate,
    driverIds: opts.driverIds || [],
    summary,
    errors,
    completedAt: new Date().toISOString(),
  });

  return {
    dryRun: false,
    inventory: freshInventory,
    summary,
    errors,
    completedAt: new Date().toISOString(),
  };
}
