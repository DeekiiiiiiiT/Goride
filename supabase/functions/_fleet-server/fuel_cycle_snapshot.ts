/**
 * Server-owned fuel cycle snapshots — groups stamped metadata by cycleId.
 * Client reads via GET /fuel/cycles; does not re-run classifyAnchor except legacy rows.
 */
import {
  effectiveCycleVolume,
  isCycleVolumeEligible,
  normalizeIntegrityStatus,
  type FuelSignalTier,
} from "./fuel_cycle_stamp.ts";
import { resolveCycleCloseMode } from "./fuel_cycle_close_policy.ts";
import * as fuelLogic from "./fuel_logic.ts";
import { isJaaStatementLedgerRow } from "./fuel_jaa_ledger.ts";

export type CycleSnapshotEntry = Record<string, unknown>;

export type SlimCycleSnapshot = {
  id: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  startOdometer?: number;
  endOdometer?: number;
  totalLiters: number;
  totalCost: number;
  avgPricePerLiter: number;
  distance: number;
  efficiency: number;
  status: "Complete" | "Active" | "Anomaly";
  resetType: "Manual" | "Auto_Soft" | "Auto_Anomaly";
  trustTier?: "Manual" | "Soft";
  isCapped?: boolean;
  excessVolume?: number;
  transactionIds: string[];
  signalTier?: FuelSignalTier;
  closeReason?: string | null;
  healthStatus?: "healthy" | "review" | "exception";
};

function entrySortKey(e: CycleSnapshotEntry): number {
  const d = new Date(String(e.date || "")).getTime();
  if (!Number.isNaN(d)) return d;
  return 0;
}

function isLegacyRow(entry: CycleSnapshotEntry): boolean {
  const m = (entry.metadata || {}) as Record<string, unknown>;
  return m.cycleLegacy === true || (
    m.cycleId == null &&
    m.isAnchor == null &&
    m.volumeContributed == null
  );
}

function cycleSignalTier(entries: CycleSnapshotEntry[]): FuelSignalTier {
  let tier: FuelSignalTier = "observe";
  for (const e of entries) {
    const m = (e.metadata || {}) as Record<string, unknown>;
    const rowTier = m.signalTier as FuelSignalTier | undefined;
    if (rowTier === "exception") return "exception";
    if (rowTier === "review") tier = "review";
    else if (!rowTier) {
      const integrity = normalizeIntegrityStatus(m.integrityStatus);
      if (integrity === "critical") return "exception";
      if (integrity === "warning" && tier === "observe") tier = "observe";
    }
  }
  return tier;
}

function deriveCycleStatus(
  entries: CycleSnapshotEntry[],
  isClosed: boolean,
  closeMode: string,
): SlimCycleSnapshot["status"] {
  if (!isClosed) return "Active";
  const tier = cycleSignalTier(entries);
  // Rideshare: overflow-only cycles are not Anomaly
  if (tier === "exception") return "Anomaly";
  return "Complete";
}

export function buildVehicleCycleSnapshot(
  vehicleId: string,
  entries: CycleSnapshotEntry[],
  vehicle: Record<string, unknown> | null,
  opts: { weekStart?: string; weekEnd?: string } = {},
): SlimCycleSnapshot[] {
  const closeMode = resolveCycleCloseMode(vehicle, null);
  const tankCapacity = fuelLogic.resolveTankCapacity(vehicle);

  // Build from full lookback history; clip to week only AFTER cycles are formed.
  // Week-filtering entries first truncates open tanks mid-cycle (e.g. 21.9L "CAPACITY FULL").
  const filtered = entries
    .filter((e) => e.vehicleId === vehicleId)
    .filter((e) => !isJaaStatementLedgerRow(e))
    .sort((a, b) => {
      const da = entrySortKey(a);
      const db = entrySortKey(b);
      if (da !== db) return da - db;
      return (Number(a.odometer) || 0) - (Number(b.odometer) || 0);
    });

  const cycles: SlimCycleSnapshot[] = [];
  let current: CycleSnapshotEntry[] = [];
  let lastAnchorOdo: number | undefined;
  let lastAnchorDate: string | undefined;
  let carryover = 0;

  const flushCycle = (closingEntry: CycleSnapshotEntry, isClosed: boolean) => {
    if (current.length === 0 && !isClosed) return;
    // Closing fill is appended here once — caller must NOT push it into `current` first
    // (prior bug double-counted volumeContributed and duplicated SPLIT rows).
    const allEntries = isClosed ? [...current, closingEntry] : [...current];
    if (allEntries.length === 0) return;
    const endEntry = isClosed ? closingEntry : allEntries[allEntries.length - 1];
    const endOdo = Number(endEntry.odometer) || 0;
    const distance =
      lastAnchorOdo != null && endOdo > 0 ? endOdo - lastAnchorOdo : 0;

    const totalLiters =
      carryover +
      allEntries.reduce((s, e) => s + effectiveCycleVolume(e), 0);
    const totalCost = allEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const m = (endEntry.metadata || {}) as Record<string, unknown>;
    const isSoft = !!m.isSoftAnchor || !!m.isCapacityClose;
    const excess = Number(m.excessVolume) || 0;
    const signalTier = cycleSignalTier(allEntries);
    const status = deriveCycleStatus(allEntries, isClosed, closeMode);

    const cycleId = fuelLogic.isStableCycleId(m.cycleId)
      ? String(m.cycleId)
      : allEntries
          .map((e) => (e.metadata as Record<string, unknown>)?.cycleId)
          .find((id) => fuelLogic.isStableCycleId(id)) as string ||
        `cycle_${String(endEntry.id)}`;

    cycles.push({
      id: cycleId,
      vehicleId,
      startDate: lastAnchorDate || String(allEntries[0]?.date || ""),
      endDate: String(endEntry.date || ""),
      startOdometer: lastAnchorOdo,
      endOdometer: endOdo || undefined,
      totalLiters: Number(totalLiters.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      avgPricePerLiter: totalLiters > 0 ? totalCost / totalLiters : 0,
      distance,
      efficiency: totalLiters > 0 ? distance / totalLiters : 0,
      status,
      resetType:
        status === "Anomaly"
          ? "Auto_Anomaly"
          : isSoft
            ? "Auto_Soft"
            : "Manual",
      trustTier: status === "Anomaly" ? undefined : isSoft ? "Soft" : "Manual",
      isCapped: isSoft || excess > 0,
      excessVolume: excess > 0 ? excess : undefined,
      transactionIds: allEntries.map((e) => String(e.id)).filter(Boolean),
      signalTier,
      closeReason: (m.cycleCloseReason as string) || null,
      healthStatus:
        signalTier === "exception"
          ? "exception"
          : signalTier === "review"
            ? "review"
            : "healthy",
    });

    if (isClosed) {
      carryover = excess;
      current = [];
      if (endOdo > 0) {
        lastAnchorOdo = endOdo;
        lastAnchorDate = String(endEntry.date);
      }
    }
  };

  for (const entry of filtered) {
    const m = (entry.metadata || {}) as Record<string, unknown>;
    const isAnchor = !!m.isAnchor || !!m.isSoftAnchor || !!m.isCapacityClose;
    const hasValidOdo = Number(entry.odometer) > 0;

    if (isLegacyRow(entry) && !isAnchor) {
      current.push(entry);
      continue;
    }

    if (isAnchor) {
      if (lastAnchorOdo == null && hasValidOdo) {
        // Seed anchor chain — first close stamp opens the tank window, does not flush yet
        lastAnchorOdo = Number(entry.odometer);
        lastAnchorDate = String(entry.date);
        current.push(entry);
      } else if (distanceReady(lastAnchorOdo, entry) || !hasValidOdo) {
        // flushCycle appends closingEntry — do not push into current first
        flushCycle(entry, true);
      } else {
        current.push(entry);
      }
    } else {
      current.push(entry);
    }
  }

  if (current.length > 0) {
    const last = current[current.length - 1];
    flushCycle(last, false);
  }

  // Week view: keep full-tank math, only hide cycles that do not touch the selected week
  if (opts.weekStart || opts.weekEnd) {
    return cycles.filter((c) => cycleOverlapsWeek(c, opts.weekStart, opts.weekEnd));
  }
  return cycles;
}

function cycleOverlapsWeek(
  cycle: SlimCycleSnapshot,
  weekStart?: string,
  weekEnd?: string,
): boolean {
  const start = String(cycle.startDate || "").split("T")[0];
  const end = String(cycle.endDate || "").split("T")[0];
  if (weekEnd && start && start > weekEnd) return false;
  if (weekStart && end && end < weekStart) return false;
  return true;
}

function distanceReady(lastAnchorOdo: number | undefined, entry: CycleSnapshotEntry): boolean {
  if (lastAnchorOdo == null) return false;
  const odo = Number(entry.odometer);
  return Number.isFinite(odo) && odo > lastAnchorOdo;
}

export function buildFleetCycleSnapshot(
  entries: CycleSnapshotEntry[],
  vehicles: Record<string, Record<string, unknown>>,
  opts: { weekStart?: string; weekEnd?: string; vehicleId?: string } = {},
): SlimCycleSnapshot[] {
  const vehicleIds = opts.vehicleId
    ? [opts.vehicleId]
    : [...new Set(entries.map((e) => String(e.vehicleId)).filter(Boolean))];

  const all: SlimCycleSnapshot[] = [];
  for (const vid of vehicleIds) {
    all.push(
      ...buildVehicleCycleSnapshot(vid, entries, vehicles[vid] || null, opts),
    );
  }
  return all;
}
