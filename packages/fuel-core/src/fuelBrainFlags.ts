/**
 * Fuel Brain is always on for Fleet recon. No kill switch / env override.
 */
export type FuelBrainRuntimeFlags = {
  useFuelBrain: boolean;
  cycleHealth: boolean;
  shadowCompare: boolean;
};

/** Recon always consumes Fuel Brain category km. */
export const FLEET_USE_FUEL_BRAIN = true;

/** Week health from tank cycles. */
export const FLEET_CYCLE_HEALTH = true;

/** Shadow-compare path retired — live brain only. */
export const FUEL_BRAIN_SHADOW_COMPARE = false;

export const FUEL_BRAIN_FLAGS: FuelBrainRuntimeFlags = {
  useFuelBrain: true,
  cycleHealth: true,
  shadowCompare: false,
};

/** Always-on flags — kept for API compatibility with callers/tests. */
export function resolveFuelBrainFlags(_input?: {
  envUseFuelBrain?: string | boolean | null;
  envCycleHealth?: string | boolean | null;
  envShadowCompare?: string | boolean | null;
  serverUseFuelBrain?: boolean | null;
  serverShadowCompare?: boolean | null;
}): FuelBrainRuntimeFlags {
  return {
    useFuelBrain: true,
    cycleHealth: true,
    shadowCompare: false,
  };
}
