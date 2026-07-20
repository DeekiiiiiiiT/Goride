import type { FuelCycle, SlimFuelCycle } from '../types/fuel';

export type { SlimFuelCycle };

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
