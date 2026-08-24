import type { FuelCycle, FuelEntry, SlimFuelCycle } from '../types/fuel';

export type { SlimFuelCycle };

/** Server /finalize snapshots may send SlimFuelCycle (ids only) or a partial FuelCycle. */
export type CycleSnapshotInput = (Partial<FuelCycle> & Partial<SlimFuelCycle>) & {
  id: string;
  vehicleId: string;
};

/**
 * Slim cycle frozen into finalized_report KV (no embedded transactions[]).
 * See docs/fuel-brain-spine.md.
 */
export function toSlimFuelCycle(cycle: FuelCycle): SlimFuelCycle {
  return {
    id: cycle.id,
    vehicleId: cycle.vehicleId,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    startOdometer: cycle.startOdometer,
    endOdometer: cycle.endOdometer,
    totalLiters: cycle.totalLiters,
    totalCost: cycle.totalCost,
    avgPricePerLiter: cycle.avgPricePerLiter,
    distance: cycle.distance,
    efficiency: cycle.efficiency,
    status: cycle.status,
    resetType: cycle.resetType,
    trustTier: cycle.trustTier,
    isCapped: cycle.isCapped,
    excessVolume: cycle.excessVolume,
    transactionIds: (cycle.transactions || [])
      .map((t) => t.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  };
}

export function toSlimFuelCycles(cycles: FuelCycle[] | undefined | null): SlimFuelCycle[] {
  if (!cycles?.length) return [];
  return cycles.map(toSlimFuelCycle);
}

function resolveVolumeContributed(entry: FuelEntry): number {
  const liters = Number(entry.liters) || 0;
  if (typeof entry.volumeContributed === 'number' && entry.volumeContributed > 0) {
    return entry.volumeContributed;
  }
  const metaVol = entry.metadata?.volumeContributed;
  if (typeof metaVol === 'number' && metaVol > 0) return metaVol;
  // Stale post-match stamp often left volumeContributed:0 while liters were filled from CSV
  if (liters > 0) return liters;
  return 0;
}

/**
 * GET /fuel/cycles returns SlimCycleSnapshot (transactionIds only).
 * Full Tanks UI requires FuelCycle.transactions — join ids back to loaded entries.
 */
export function hydrateFuelCyclesFromEntries(
  cycles: CycleSnapshotInput[] | null | undefined,
  entries: FuelEntry[],
): FuelCycle[] {
  if (!cycles?.length) return [];
  const byId = new Map(entries.map((e) => [e.id, e]));

  return cycles.map((cycle) => {
    if (Array.isArray(cycle.transactions)) {
      return {
        ...cycle,
        startDate: cycle.startDate || '',
        endDate: cycle.endDate || '',
        totalLiters: Number(cycle.totalLiters) || 0,
        totalCost: Number(cycle.totalCost) || 0,
        avgPricePerLiter: Number(cycle.avgPricePerLiter) || 0,
        distance: Number(cycle.distance) || 0,
        efficiency: Number(cycle.efficiency) || 0,
        status: cycle.status || 'Active',
        resetType: cycle.resetType || 'Manual',
        transactions: cycle.transactions,
      } as FuelCycle;
    }

    const ids = Array.isArray(cycle.transactionIds) ? cycle.transactionIds : [];
    // Server once double-appended the closing fill id — keep one row per fill
    const seen = new Set<string>();
    const transactions: FuelEntry[] = [];
    for (const id of ids) {
      const key = String(id);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const entry = byId.get(key);
      if (!entry) continue;
      transactions.push({
        ...entry,
        volumeContributed: resolveVolumeContributed(entry),
        isCarryover: entry.isCarryover === true || entry.metadata?.isCarryover === true,
      });
    }

    const uniqueVolSum = transactions.reduce((s, t) => s + (Number(t.volumeContributed) || 0), 0);
    // Prefer stamped math when server total is present; unique sum is the floor (no double-count)
    const serverTotal = Number(cycle.totalLiters) || 0;
    const totalLiters = serverTotal > 0 ? serverTotal : uniqueVolSum;

    return {
      id: cycle.id,
      vehicleId: cycle.vehicleId,
      startDate: cycle.startDate || '',
      endDate: cycle.endDate || '',
      startOdometer: cycle.startOdometer,
      endOdometer: cycle.endOdometer,
      totalLiters,
      totalCost: Number(cycle.totalCost) || 0,
      avgPricePerLiter: Number(cycle.avgPricePerLiter) || 0,
      distance: Number(cycle.distance) || 0,
      efficiency: Number(cycle.efficiency) || 0,
      status: cycle.status || 'Active',
      resetType: cycle.resetType || 'Manual',
      trustTier: cycle.trustTier,
      isCapped: cycle.isCapped,
      excessVolume: cycle.excessVolume,
      signalTier: cycle.signalTier,
      healthStatus: cycle.healthStatus,
      closeReason: cycle.closeReason,
      startingPercentage: cycle.startingPercentage,
      transactions,
    };
  });
}
