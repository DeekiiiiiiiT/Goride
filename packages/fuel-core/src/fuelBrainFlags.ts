/**
 * Fuel Brain is always on for Fleet recon. No kill switch / env override.
 */
export type FuelBrainRuntimeFlags = {
  useFuelBrain: boolean;
  cycleHealth: boolean;
  shadowCompare: boolean;
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
