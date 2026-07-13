/**
 * Fuel Brain / personal sessions feature flags (client).
 * Default OFF — enable in order: sessions → brain Edge → fleet consumer.
 */

export const FUEL_PERSONAL_SESSIONS_ENABLED =
  import.meta.env.VITE_FUEL_PERSONAL_SESSIONS_ENABLED === '1';

export const FUEL_BRAIN_SHADOW_COMPARE =
  import.meta.env.VITE_FUEL_BRAIN_SHADOW_COMPARE === '1';

/** Last flag on — when set, recon consumes brain category km. */
export const FLEET_USE_FUEL_BRAIN =
  import.meta.env.VITE_FLEET_USE_FUEL_BRAIN === '1';
