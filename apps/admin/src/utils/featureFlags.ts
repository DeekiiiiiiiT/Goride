/**
 * Feature Flags for Admin UI
 * 
 * Provides type-safe access to feature flags for gradual rollout of new features.
 * Flags are read from environment variables (VITE_* prefix for client-side access).
 */

export interface FeatureFlags {
  /** Enhanced Matching Brain UI with all settings sections */
  matchingBrainUiEnhanced: boolean;
  /** Show deprecation banner on Rides Control Panel */
  controlPanelDeprecated: boolean;
  /** Enable product profile override UI */
  productProfileOverrides: boolean;
  /** Enable dual-write to rides.dispatch_settings */
  dualWriteEnabled: boolean;
}

/**
 * Parse a boolean flag from environment variable.
 * Treats "1", "true", "yes" as true (case-insensitive).
 */
function parseBoolFlag(value: string | undefined, defaultValue = false): boolean {
  if (!value) return defaultValue;
  const normalized = value.toLowerCase().trim();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

/**
 * Get all feature flags from environment variables.
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    matchingBrainUiEnhanced: parseBoolFlag(
      import.meta.env.VITE_MATCHING_BRAIN_UI_ENHANCED,
      true // Default to enhanced UI
    ),
    controlPanelDeprecated: parseBoolFlag(
      import.meta.env.VITE_CONTROL_PANEL_DEPRECATED,
      false
    ),
    productProfileOverrides: parseBoolFlag(
      import.meta.env.VITE_PRODUCT_PROFILE_OVERRIDES,
      false
    ),
    dualWriteEnabled: parseBoolFlag(
      import.meta.env.VITE_DUAL_WRITE_ENABLED,
      true // Default to dual-write for safety
    ),
  };
}

/**
 * Check if a specific feature flag is enabled.
 */
export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return getFeatureFlags()[flag];
}

/**
 * Hook-friendly feature flags accessor.
 * Note: This reads env vars which don't change at runtime,
 * so no need for useState/useEffect.
 */
export function useFeatureFlags(): FeatureFlags {
  return getFeatureFlags();
}
