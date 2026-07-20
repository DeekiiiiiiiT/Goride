/**
 * Fuel Brain client flags.
 * No driver sessions/toggles — recon uses trips + odo + deadhead only.
 *
 * FLEET_USE_FUEL_BRAIN defaults ON. Set VITE_FLEET_USE_FUEL_BRAIN=0 to rollback to legacy residual.
 * FLEET_CYCLE_HEALTH defaults ON. Set VITE_FLEET_CYCLE_HEALTH=0 to use legacy bucket-variance Amber.
 */

/** Recon consumes Fuel Brain category km (Ride Share / Company Ops / Deadhead / Personal residual). */
export const FLEET_USE_FUEL_BRAIN =
  import.meta.env.VITE_FLEET_USE_FUEL_BRAIN !== '0';

/** Week health from tank cycles (not ±20% stop-to-stop variance). See docs/fuel-brain-spine.md. */
export const FLEET_CYCLE_HEALTH =
  import.meta.env.VITE_FLEET_CYCLE_HEALTH !== '0';

/** Optional: log brain vs legacy without changing money (needs consumer off). */
export const FUEL_BRAIN_SHADOW_COMPARE =
  import.meta.env.VITE_FUEL_BRAIN_SHADOW_COMPARE === '1' && !FLEET_USE_FUEL_BRAIN;
