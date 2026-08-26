/**
 * Client/build defaults. Runtime kill switch lives in fuel reconciliation settings
 * (fuelBrainEnabled / fuelBrainShadowCompare) and overrides these when present.
 */
export type FuelBrainRuntimeFlags = {
  useFuelBrain: boolean;
  cycleHealth: boolean;
  shadowCompare: boolean;
};

export function resolveFuelBrainFlags(input?: {
  /** Vite / env default: treat unset as ON unless explicitly '0'. */
  envUseFuelBrain?: string | boolean | null;
  envCycleHealth?: string | boolean | null;
  envShadowCompare?: string | boolean | null;
  /** Server settings override (Phase 1). */
  serverUseFuelBrain?: boolean | null;
  serverShadowCompare?: boolean | null;
}): FuelBrainRuntimeFlags {
  const envOn = (v: string | boolean | null | undefined, defaultOn: boolean) => {
    if (typeof v === 'boolean') return v;
    if (v == null || v === '') return defaultOn;
    return String(v) !== '0';
  };
  const envExactOne = (v: string | boolean | null | undefined) => {
    if (typeof v === 'boolean') return v;
    return String(v) === '1';
  };

  const useFuelBrain =
    typeof input?.serverUseFuelBrain === 'boolean'
      ? input.serverUseFuelBrain
      : envOn(input?.envUseFuelBrain, true);

  const cycleHealth = envOn(input?.envCycleHealth, true);

  // Shadow compare must be runnable whether live consumer is on or off.
  const shadowCompare =
    typeof input?.serverShadowCompare === 'boolean'
      ? input.serverShadowCompare
      : envExactOne(input?.envShadowCompare);

  return { useFuelBrain, cycleHealth, shadowCompare };
}
