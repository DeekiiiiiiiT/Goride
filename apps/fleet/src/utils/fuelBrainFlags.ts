/**
 * Fuel Brain client flags.
 * Runtime server settings (fuel reconciliation settings) override env when present.
 * Shadow compare can run whether live consumer is on or off.
 */
import { resolveFuelBrainFlags } from '@roam/fuel-core';

const resolved = resolveFuelBrainFlags({
  envUseFuelBrain: import.meta.env.VITE_FLEET_USE_FUEL_BRAIN,
  envCycleHealth: import.meta.env.VITE_FLEET_CYCLE_HEALTH,
  envShadowCompare: import.meta.env.VITE_FUEL_BRAIN_SHADOW_COMPARE,
});

/** Recon consumes Fuel Brain category km. Overridable via server settings. */
export let FLEET_USE_FUEL_BRAIN = resolved.useFuelBrain;

/** Week health from tank cycles. */
export let FLEET_CYCLE_HEALTH = resolved.cycleHealth;

/** Log brain vs legacy without requiring consumer off. */
export let FUEL_BRAIN_SHADOW_COMPARE = resolved.shadowCompare;

/** Apply Dominion / API settings over build-time env defaults. */
export function applyFuelBrainServerSettings(settings: {
  fuelBrainEnabled?: boolean | null;
  fuelBrainShadowCompare?: boolean | null;
}): void {
  const next = resolveFuelBrainFlags({
    envUseFuelBrain: import.meta.env.VITE_FLEET_USE_FUEL_BRAIN,
    envCycleHealth: import.meta.env.VITE_FLEET_CYCLE_HEALTH,
    envShadowCompare: import.meta.env.VITE_FUEL_BRAIN_SHADOW_COMPARE,
    serverUseFuelBrain: settings.fuelBrainEnabled,
    serverShadowCompare: settings.fuelBrainShadowCompare,
  });
  FLEET_USE_FUEL_BRAIN = next.useFuelBrain;
  FLEET_CYCLE_HEALTH = next.cycleHealth;
  FUEL_BRAIN_SHADOW_COMPARE = next.shadowCompare;
}
