/**
 * Fuel Brain is always on for recon. No customer or Dominion kill switch.
 */
import type { FuelBrainRuntimeFlags } from '@roam/fuel-core';

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
