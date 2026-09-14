/**
 * Capacity-close + SPLIT math.
 * Mirrored in supabase/functions/_fleet-server/fuel_logic.ts — keep in sync.
 * See docs/fuel-brain-spine.md.
 *
 * Product rule: cycles close at ≥98% tank capacity (capacity full) with spillover.
 * Driver Full Tank checkbox is ignored. Expense-backed Reimbursement fills DO participate.
 */

/** Capacity full close at ≥98% tank. */
export const SOFT_ANCHOR_THRESHOLD = 0.98;
export const CAPACITY_CLOSE_THRESHOLD = SOFT_ANCHOR_THRESHOLD;

export type AnchorClassifyInput = {
  /** @deprecated Ignored — capacity math only. */
  isFullTank?: boolean;
  /** @deprecated Ignored — capacity math only. */
  isAnchor?: boolean;
  /** @deprecated Ignored — capacity math only. */
  isHardAnchor?: boolean;
  /** @deprecated Ignored — capacity math only. */
  isSoftAnchor?: boolean;
  prevCumulative: number;
  volume: number;
  tankCapacity: number;
  /** Reserved: future non-fuel memo rows. Do not exclude Roam Reimbursement fills. */
  entryType?: string | null;
  paymentSource?: string | null;
};

export type AnchorClassifyResult = {
  /** Always false under capacity-only spine (kept for callers). */
  isHard: boolean;
  /** True when capacity close (compat alias for isCapacityClose). */
  isSoft: boolean;
  isAnchor: boolean;
  /** Capacity ≥98% close with SPLIT. */
  isCapacityClose: boolean;
  volumeContributed: number;
  excessVolume: number;
  percentOfTank: number;
  totalVolumeInCycle: number;
};

/** When true, fill must not close a tank cycle. Roam expense fills use type Reimbursement — do NOT exclude those. */
export function isNonTankCycleEntry(
  _entryType?: string | null,
  _paymentSource?: string | null,
): boolean {
  // Reserved for future non-fuel memo rows. Expense-backed fills (type Reimbursement) DO participate in capacity cycles.
  return false;
}

/**
 * Tank capacity: specifications first, then fuelSettings. No silent 40 on server paths.
 */
export function resolveTankCapacity(vehicle: {
  specifications?: { tankCapacity?: number | string | null };
  fuelSettings?: { tankCapacity?: number | string | null };
} | null | undefined): number {
  const fromSpec = Number(vehicle?.specifications?.tankCapacity);
  if (Number.isFinite(fromSpec) && fromSpec > 0) return fromSpec;
  const fromSettings = Number(vehicle?.fuelSettings?.tankCapacity);
  if (Number.isFinite(fromSettings) && fromSettings > 0) return fromSettings;
  return 0;
}

/**
 * Classify capacity full close + SPLIT liters.
 * Ignores driver Full Tank / legacy hard flags.
 */
export function classifyAnchor(input: AnchorClassifyInput): AnchorClassifyResult {
  const volume = Math.max(0, Number(input.volume) || 0);
  const prevCumulative = Math.max(0, Number(input.prevCumulative) || 0);
  const tankCapacity = Math.max(0, Number(input.tankCapacity) || 0);
  const totalVolumeInCycle = prevCumulative + volume;
  const percentOfTank = tankCapacity > 0 ? (totalVolumeInCycle / tankCapacity) * 100 : 0;

  if (isNonTankCycleEntry(input.entryType, input.paymentSource)) {
    return {
      isHard: false,
      isSoft: false,
      isAnchor: false,
      isCapacityClose: false,
      volumeContributed: Number(volume.toFixed(4)),
      excessVolume: 0,
      percentOfTank: Number(percentOfTank.toFixed(2)),
      totalVolumeInCycle: Number(totalVolumeInCycle.toFixed(4)),
    };
  }

  const isCapacityClose =
    tankCapacity > 0 && totalVolumeInCycle >= tankCapacity * CAPACITY_CLOSE_THRESHOLD;

  let volumeContributed = volume;
  let excessVolume = 0;
  if (isCapacityClose && tankCapacity > 0) {
    volumeContributed = Math.max(0, tankCapacity - prevCumulative);
    excessVolume = Math.max(0, volume - volumeContributed);
  }

  return {
    isHard: false,
    isSoft: isCapacityClose,
    isAnchor: isCapacityClose,
    isCapacityClose,
    volumeContributed: Number(volumeContributed.toFixed(4)),
    excessVolume: Number(excessVolume.toFixed(4)),
    percentOfTank: Number(percentOfTank.toFixed(2)),
    totalVolumeInCycle: Number(totalVolumeInCycle.toFixed(4)),
  };
}

/** Canonical stable cycle UUID. Mirrored in fuel_logic.ts — keep in sync. */
export function mintCycleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cycle_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isStableCycleId(id: unknown): boolean {
  return typeof id === 'string' && UUID_RE.test(id);
}

export function resolveCycleIdForOpenCycle(
  openCycleEntries: Array<{ metadata?: { cycleId?: string } | null } | null | undefined>,
): string {
  for (const e of openCycleEntries) {
    const id = e?.metadata?.cycleId;
    if (isStableCycleId(id)) return id as string;
  }
  return mintCycleId();
}

export function resolveNextCycleIdAfterAnchor(
  nextEntry: { metadata?: { cycleId?: string } | null } | null | undefined,
  closedCycleId: string,
): string {
  const nextId = nextEntry?.metadata?.cycleId;
  if (isStableCycleId(nextId) && nextId !== closedCycleId) return nextId as string;
  return mintCycleId();
}
