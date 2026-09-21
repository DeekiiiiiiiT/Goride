/**
 * Kill switch for Fuel Management service-line tabs (S8).
 * Default ON when unset — dual-line orgs see tabs unless ops sets this false.
 */
export const FUEL_SERVICE_LINE_TABS_FLAG = 'fuelServiceLineTabsEnabled';

/** True unless explicitly disabled in enabledModules. */
export function isFuelServiceLineTabsEnabled(
  enabledModules?: Record<string, boolean> | null,
): boolean {
  if (!enabledModules) return true;
  if (FUEL_SERVICE_LINE_TABS_FLAG in enabledModules) {
    return enabledModules[FUEL_SERVICE_LINE_TABS_FLAG] !== false;
  }
  return true;
}
