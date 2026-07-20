/**
 * Shared soft/hard anchor + SPLIT math.
 * Mirrored in supabase/functions/server/fuel_logic.ts — keep in sync.
 * See docs/fuel-brain-spine.md.
 */

/** Soft cycle close at ≥98% tank (roadmap). */
export const SOFT_ANCHOR_THRESHOLD = 0.98;

export type AnchorClassifyInput = {
  isFullTank?: boolean;
  /** Legacy/hard marker; ignored as hard when isSoftAnchor is true. */
  isAnchor?: boolean;
  isHardAnchor?: boolean;
  isSoftAnchor?: boolean;
  prevCumulative: number;
  volume: number;
  tankCapacity: number;
};

export type AnchorClassifyResult = {
  isHard: boolean;
  isSoft: boolean;
  isAnchor: boolean;
  volumeContributed: number;
  excessVolume: number;
  percentOfTank: number;
  totalVolumeInCycle: number;
};

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
 * Classify whether this fill closes a cycle (manual full vs soft cap) and SPLIT liters.
 * Reimbursements are never anchors — callers must not pass type-based hard flags.
 */
export function classifyAnchor(input: AnchorClassifyInput): AnchorClassifyResult {
  const volume = Math.max(0, Number(input.volume) || 0);
  const prevCumulative = Math.max(0, Number(input.prevCumulative) || 0);
  const tankCapacity = Math.max(0, Number(input.tankCapacity) || 0);
  const totalVolumeInCycle = prevCumulative + volume;
  const percentOfTank = tankCapacity > 0 ? (totalVolumeInCycle / tankCapacity) * 100 : 0;

  // Hard = driver Full Tank, explicit hard flag, or legacy isAnchor that is not soft-only
  const isHard =
    input.isFullTank === true ||
    input.isHardAnchor === true ||
    (input.isAnchor === true && input.isSoftAnchor !== true);

  const approachingSoft =
    !isHard && tankCapacity > 0 && totalVolumeInCycle >= tankCapacity * SOFT_ANCHOR_THRESHOLD;
  const isSoft = approachingSoft;
  const isAnchor = isHard || isSoft;

  let volumeContributed = volume;
  let excessVolume = 0;
  if (isSoft && tankCapacity > 0) {
    volumeContributed = Math.max(0, tankCapacity - prevCumulative);
    excessVolume = Math.max(0, volume - volumeContributed);
  }

  return {
    isHard,
    isSoft,
    isAnchor,
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
