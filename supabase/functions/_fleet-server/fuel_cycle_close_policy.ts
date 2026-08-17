/**
 * Tank cycle close policy — rideshare default, legacy cumulative_98 per org.
 * Mirrored on client: apps/fleet/src/utils/fuelCycleClosePolicy.ts
 */
import { classifyAnchor } from "./fuel_logic.ts";

export type CycleCloseMode = "rideshare" | "cumulative_98";

export type CycleCloseReason =
  | "single_fill_full"
  | "admin_confirmed"
  | "week_boundary"
  | "cumulative_98"
  | "tank_overfill"
  | null;

export type CloseDecision = {
  shouldClose: boolean;
  reason: CycleCloseReason;
  isSoft: boolean;
  isCapacityClose: boolean;
  isAnchor: boolean;
  volumeContributed: number;
  excessVolume: number;
  totalVolumeInCycle: number;
  percentOfTank: number;
};

/** Default: one fill ≥ 90% of rated tank closes the cycle. */
export const SINGLE_FILL_FULL_THRESHOLD = 0.9;
const TANK_OVERFILL_THRESHOLD = 1.02;

export function resolveCycleCloseMode(
  vehicle: Record<string, unknown> | null | undefined,
  auditConfig?: Record<string, unknown> | null,
): CycleCloseMode {
  const fromVehicle = vehicle?.fuelSettings as Record<string, unknown> | undefined;
  const fromAudit = auditConfig?.cycleCloseMode;
  const mode = String(fromVehicle?.cycleCloseMode || fromAudit || "rideshare");
  return mode === "cumulative_98" ? "cumulative_98" : "rideshare";
}

export function evaluateCycleClose(params: {
  closeMode: CycleCloseMode;
  prevCumulative: number;
  volume: number;
  tankCapacity: number;
  entryType?: string | null;
  paymentSource?: string | null;
  adminConfirmedFullTank?: boolean;
}): CloseDecision {
  const volume = Math.max(0, Number(params.volume) || 0);
  const prevCumulative = Math.max(0, Number(params.prevCumulative) || 0);
  const tankCapacity = Math.max(0, Number(params.tankCapacity) || 0);
  const totalVolumeInCycle = Number((prevCumulative + volume).toFixed(4));
  const percentOfTank = tankCapacity > 0 ? (totalVolumeInCycle / tankCapacity) * 100 : 0;

  if (params.closeMode === "cumulative_98") {
    const anchor = classifyAnchor({
      prevCumulative,
      volume,
      tankCapacity,
      entryType: params.entryType,
      paymentSource: params.paymentSource,
    });
    return {
      shouldClose: anchor.isCapacityClose,
      reason: anchor.isCapacityClose ? "cumulative_98" : null,
      isSoft: anchor.isSoft,
      isCapacityClose: anchor.isCapacityClose,
      isAnchor: anchor.isAnchor,
      volumeContributed: anchor.volumeContributed,
      excessVolume: anchor.excessVolume,
      totalVolumeInCycle: anchor.totalVolumeInCycle,
      percentOfTank: anchor.percentOfTank,
    };
  }

  // Rideshare mode — partial top-ups do not force capacity SPLIT
  if (params.adminConfirmedFullTank) {
    const overfill = tankCapacity > 0 && volume > tankCapacity * TANK_OVERFILL_THRESHOLD;
    const contributed = overfill && tankCapacity > 0
      ? tankCapacity
      : volume;
    const excess = overfill ? Math.max(0, volume - contributed) : 0;
    return {
      shouldClose: true,
      reason: "admin_confirmed",
      isSoft: true,
      isCapacityClose: true,
      isAnchor: true,
      volumeContributed: Number(contributed.toFixed(4)),
      excessVolume: Number(excess.toFixed(4)),
      totalVolumeInCycle,
      percentOfTank: Number(percentOfTank.toFixed(2)),
    };
  }

  const singleFillFull =
    tankCapacity > 0 && volume >= tankCapacity * SINGLE_FILL_FULL_THRESHOLD;

  if (singleFillFull) {
    const overfill = volume > tankCapacity * TANK_OVERFILL_THRESHOLD;
    const contributed = overfill ? tankCapacity : volume;
    const excess = overfill ? Math.max(0, volume - contributed) : 0;
    return {
      shouldClose: true,
      reason: "single_fill_full",
      isSoft: true,
      isCapacityClose: true,
      isAnchor: true,
      volumeContributed: Number(contributed.toFixed(4)),
      excessVolume: Number(excess.toFixed(4)),
      totalVolumeInCycle,
      percentOfTank: Number(percentOfTank.toFixed(2)),
    };
  }

  if (tankCapacity > 0 && volume > tankCapacity * TANK_OVERFILL_THRESHOLD) {
    return {
      shouldClose: true,
      reason: "tank_overfill",
      isSoft: true,
      isCapacityClose: true,
      isAnchor: true,
      volumeContributed: tankCapacity,
      excessVolume: Number((volume - tankCapacity).toFixed(4)),
      totalVolumeInCycle,
      percentOfTank: Number(percentOfTank.toFixed(2)),
    };
  }

  return {
    shouldClose: false,
    reason: null,
    isSoft: false,
    isCapacityClose: false,
    isAnchor: false,
    volumeContributed: Number(volume.toFixed(4)),
    excessVolume: 0,
    totalVolumeInCycle,
    percentOfTank: Number(percentOfTank.toFixed(2)),
  };
}

/** Batch close at finalize — no SPLIT spillover in rideshare mode. */
export function closeOpenCycleAtWeekBoundary(
  prevCumulative: number,
  volume: number,
  tankCapacity: number,
): CloseDecision {
  const volumeN = Math.max(0, Number(volume) || 0);
  const total = Number((prevCumulative + volumeN).toFixed(4));
  return {
    shouldClose: true,
    reason: "week_boundary",
    isSoft: false,
    isCapacityClose: false,
    isAnchor: true,
    volumeContributed: Number(volumeN.toFixed(4)),
    excessVolume: 0,
    totalVolumeInCycle: total,
    percentOfTank: tankCapacity > 0 ? (total / tankCapacity) * 100 : 0,
  };
}
