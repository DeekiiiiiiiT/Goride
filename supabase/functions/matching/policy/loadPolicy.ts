/**
 * Policy Loader with Dual-Read Support
 *
 * When MATCHING_BRAIN_ENABLED=1:
 *   Reads from matching.policies + matching.product_profiles
 *
 * When MATCHING_BRAIN_ENABLED=0 (or unset):
 *   Falls back to rides.dispatch_settings for backward compatibility
 *
 * This enables zero-breakage rollout: rides continues using legacy path
 * until matching brain is explicitly enabled.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type BodyTypeTierMode = "expand" | "strict";

export type ProductKey = "rides" | "fleet" | "dash" | "enterprise";

export type SurfaceKey = "rider" | "driver" | "default";

export interface MatchingPolicy {
  id: string;
  name: string;
  max_match_waves: number;
  wave_radius_km: number[];
  max_offers_per_wave: number;
  default_driver_offer_timeout_seconds: number;
  driver_location_max_age_minutes: number;
  max_matching_duration_minutes: number;
  quote_driver_radius_km: number;
  body_type_filtering_enabled: boolean;
  body_type_tier_mode: BodyTypeTierMode;
  require_body_type_for_offers: boolean;
  independent_only_matching: boolean;
  trip_location_interval_seconds: number;
  pickup_geofence_radius_m: number;
  dropoff_geofence_radius_m: number;
  arrival_dwell_seconds: number;
  max_speed_mps_for_arrival: number;
  auto_en_route_on_accept: boolean;
  auto_arrive_enabled: boolean;
  auto_complete_suggest_enabled: boolean;
  no_show_cancel_minutes: number;
  gps_max_accuracy_m_for_arrival: number;
  no_show_auto_cancel_enabled: boolean;
  wait_time_grace_minutes: number;
  wait_time_rate_per_min_minor: number;
  wait_time_charge_enabled: boolean;
  wait_time_max_minutes: number;
  pin_verification_enabled: boolean;
  pin_verification_required_for_start: boolean;
  toll_detection_enabled: boolean;
  toll_geofence_radius_m: number;
  serial_dispatch_enabled: boolean;
  h3_resolution: number;
  h3_supply_enabled: boolean;
  h3_surge_enabled: boolean;
  wave_h3_k_rings: number[];
  is_default: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface ResolvedPolicy extends MatchingPolicy {
  product_key: ProductKey;
  surface_key: SurfaceKey;
  policy_id: string;
  profile_id: string | null;
  source: "matching_brain" | "legacy_rides";
}

// -----------------------------------------------------------------------------
// Defaults
// -----------------------------------------------------------------------------

export const DEFAULT_POLICY: Omit<MatchingPolicy, "id" | "updated_at" | "updated_by"> = {
  name: "default",
  max_match_waves: 3,
  wave_radius_km: [5, 15, 35],
  max_offers_per_wave: 8,
  default_driver_offer_timeout_seconds: 15,
  driver_location_max_age_minutes: 10,
  max_matching_duration_minutes: 15,
  quote_driver_radius_km: 15,
  body_type_filtering_enabled: true,
  body_type_tier_mode: "expand",
  require_body_type_for_offers: true,
  independent_only_matching: true,
  trip_location_interval_seconds: 4,
  pickup_geofence_radius_m: 80,
  dropoff_geofence_radius_m: 100,
  arrival_dwell_seconds: 15,
  max_speed_mps_for_arrival: 4,
  auto_en_route_on_accept: true,
  auto_arrive_enabled: true,
  auto_complete_suggest_enabled: true,
  no_show_cancel_minutes: 5,
  gps_max_accuracy_m_for_arrival: 50,
  no_show_auto_cancel_enabled: false,
  wait_time_grace_minutes: 2,
  wait_time_rate_per_min_minor: 50,
  wait_time_charge_enabled: false,
  wait_time_max_minutes: 15,
  pin_verification_enabled: false,
  pin_verification_required_for_start: false,
  toll_detection_enabled: false,
  toll_geofence_radius_m: 100,
  serial_dispatch_enabled: false,
  h3_resolution: 7,
  h3_supply_enabled: false,
  h3_surge_enabled: false,
  wave_h3_k_rings: [0, 2, 6],
  is_default: true,
};

// -----------------------------------------------------------------------------
// Cache
// -----------------------------------------------------------------------------

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  policy: ResolvedPolicy;
  at: number;
}

const policyCache = new Map<string, CacheEntry>();

export function invalidatePolicyCache(): void {
  policyCache.clear();
}

function cacheKey(productKey: ProductKey, surfaceKey: SurfaceKey): string {
  return `${productKey}:${surfaceKey}`;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function isMatchingBrainEnabled(): boolean {
  return Deno.env.get("MATCHING_BRAIN_ENABLED") === "1";
}

function parseNumericArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...DEFAULT_POLICY.wave_radius_km];
  const nums = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? nums : [...DEFAULT_POLICY.wave_radius_km];
}

function normalizeRadii(radii: number[], maxWaves: number): number[] {
  if (!radii.length) return [...DEFAULT_POLICY.wave_radius_km];
  const out = radii.slice(0, Math.max(maxWaves, radii.length));
  while (out.length < maxWaves) {
    out.push(out[out.length - 1] ?? radii[radii.length - 1] ?? 35);
  }
  return out.slice(0, maxWaves);
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function rowToPolicy(row: Record<string, unknown>): MatchingPolicy {
  const maxWaves = clamp(Number(row.max_match_waves), 1, 5, DEFAULT_POLICY.max_match_waves);
  const rawRadii = parseNumericArray(row.wave_radius_km);
  const tierMode = row.body_type_tier_mode === "strict" ? "strict" : "expand";

  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "default"),
    max_match_waves: maxWaves,
    wave_radius_km: normalizeRadii(rawRadii, maxWaves),
    max_offers_per_wave: clamp(Number(row.max_offers_per_wave), 1, 20, DEFAULT_POLICY.max_offers_per_wave),
    default_driver_offer_timeout_seconds: clamp(Number(row.default_driver_offer_timeout_seconds), 5, 120, DEFAULT_POLICY.default_driver_offer_timeout_seconds),
    driver_location_max_age_minutes: clamp(Number(row.driver_location_max_age_minutes), 1, 30, DEFAULT_POLICY.driver_location_max_age_minutes),
    max_matching_duration_minutes: clamp(Number(row.max_matching_duration_minutes), 2, 120, DEFAULT_POLICY.max_matching_duration_minutes),
    quote_driver_radius_km: clamp(Number(row.quote_driver_radius_km), 1, 50, DEFAULT_POLICY.quote_driver_radius_km),
    body_type_filtering_enabled: row.body_type_filtering_enabled !== false,
    body_type_tier_mode: tierMode,
    require_body_type_for_offers: row.require_body_type_for_offers !== false,
    independent_only_matching: row.independent_only_matching !== false,
    trip_location_interval_seconds: clamp(Number(row.trip_location_interval_seconds), 2, 30, DEFAULT_POLICY.trip_location_interval_seconds),
    pickup_geofence_radius_m: clamp(Number(row.pickup_geofence_radius_m), 20, 500, DEFAULT_POLICY.pickup_geofence_radius_m),
    dropoff_geofence_radius_m: clamp(Number(row.dropoff_geofence_radius_m), 20, 500, DEFAULT_POLICY.dropoff_geofence_radius_m),
    arrival_dwell_seconds: clamp(Number(row.arrival_dwell_seconds), 0, 120, DEFAULT_POLICY.arrival_dwell_seconds),
    max_speed_mps_for_arrival: clamp(Number(row.max_speed_mps_for_arrival), 0, 20, DEFAULT_POLICY.max_speed_mps_for_arrival),
    auto_en_route_on_accept: row.auto_en_route_on_accept !== false,
    auto_arrive_enabled: row.auto_arrive_enabled !== false,
    auto_complete_suggest_enabled: row.auto_complete_suggest_enabled !== false,
    no_show_cancel_minutes: clamp(Number(row.no_show_cancel_minutes), 0, 60, DEFAULT_POLICY.no_show_cancel_minutes),
    gps_max_accuracy_m_for_arrival: clamp(Number(row.gps_max_accuracy_m_for_arrival), 10, 200, DEFAULT_POLICY.gps_max_accuracy_m_for_arrival),
    no_show_auto_cancel_enabled: row.no_show_auto_cancel_enabled === true,
    wait_time_grace_minutes: clamp(Number(row.wait_time_grace_minutes), 0, 10, DEFAULT_POLICY.wait_time_grace_minutes),
    wait_time_rate_per_min_minor: Math.max(0, Number(row.wait_time_rate_per_min_minor ?? DEFAULT_POLICY.wait_time_rate_per_min_minor)),
    wait_time_charge_enabled: row.wait_time_charge_enabled === true,
    wait_time_max_minutes: clamp(Number(row.wait_time_max_minutes), 1, 60, DEFAULT_POLICY.wait_time_max_minutes),
    pin_verification_enabled: row.pin_verification_enabled === true,
    pin_verification_required_for_start: row.pin_verification_required_for_start === true,
    toll_detection_enabled: row.toll_detection_enabled === true,
    toll_geofence_radius_m: clamp(Number(row.toll_geofence_radius_m), 50, 500, DEFAULT_POLICY.toll_geofence_radius_m),
    serial_dispatch_enabled: row.serial_dispatch_enabled === true,
    h3_resolution: clamp(Number(row.h3_resolution), 4, 10, DEFAULT_POLICY.h3_resolution),
    h3_supply_enabled: row.h3_supply_enabled === true,
    h3_surge_enabled: row.h3_surge_enabled === true,
    wave_h3_k_rings: parseNumericArray(row.wave_h3_k_rings).length ? parseNumericArray(row.wave_h3_k_rings) : [...DEFAULT_POLICY.wave_h3_k_rings],
    is_default: row.is_default === true,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
    updated_by: typeof row.updated_by === "string" ? row.updated_by : null,
  };
}

function mergeOverrides(policy: MatchingPolicy, overrides: Record<string, unknown> | null): MatchingPolicy {
  if (!overrides) return policy;

  const merged = { ...policy };
  for (const key of Object.keys(overrides)) {
    if (key in policy && overrides[key] !== undefined && overrides[key] !== null) {
      (merged as Record<string, unknown>)[key] = overrides[key];
    }
  }
  return merged;
}

// -----------------------------------------------------------------------------
// Load from Matching Brain (matching.policies + product_profiles)
// -----------------------------------------------------------------------------

async function loadFromMatchingBrain(
  db: SupabaseClient,
  productKey: ProductKey,
  surfaceKey: SurfaceKey,
): Promise<ResolvedPolicy | null> {
  // Try to load product profile
  const { data: profile, error: profileError } = await db
    .from("matching_product_profiles")
    .select("*, policy:matching_policies(*)")
    .eq("product_key", productKey)
    .eq("surface_key", surfaceKey)
    .eq("is_active", true)
    .maybeSingle();

  if (profileError) {
    console.warn(`[matching] profile lookup failed: ${profileError.message}`);
  }

  if (profile?.policy) {
    const basePolicy = rowToPolicy(profile.policy as Record<string, unknown>);
    const mergedPolicy = mergeOverrides(basePolicy, profile.overrides as Record<string, unknown> | null);

    return {
      ...mergedPolicy,
      product_key: productKey,
      surface_key: surfaceKey,
      policy_id: basePolicy.id,
      profile_id: profile.id as string,
      source: "matching_brain",
    };
  }

  // Fallback to default profile for product (surface_key = 'default')
  if (surfaceKey !== "default") {
    const { data: defaultProfile } = await db
      .from("matching_product_profiles")
      .select("*, policy:matching_policies(*)")
      .eq("product_key", productKey)
      .eq("surface_key", "default")
      .eq("is_active", true)
      .maybeSingle();

    if (defaultProfile?.policy) {
      const basePolicy = rowToPolicy(defaultProfile.policy as Record<string, unknown>);
      const mergedPolicy = mergeOverrides(basePolicy, defaultProfile.overrides as Record<string, unknown> | null);

      return {
        ...mergedPolicy,
        product_key: productKey,
        surface_key: "default",
        policy_id: basePolicy.id,
        profile_id: defaultProfile.id as string,
        source: "matching_brain",
      };
    }
  }

  // Fallback to default policy (is_default = true)
  const { data: defaultPolicy } = await db
    .from("matching_policies")
    .select("*")
    .eq("is_default", true)
    .maybeSingle();

  if (defaultPolicy) {
    const policy = rowToPolicy(defaultPolicy as Record<string, unknown>);
    return {
      ...policy,
      product_key: productKey,
      surface_key: surfaceKey,
      policy_id: policy.id,
      profile_id: null,
      source: "matching_brain",
    };
  }

  return null;
}

// -----------------------------------------------------------------------------
// Load from Legacy (rides.dispatch_settings)
// -----------------------------------------------------------------------------

async function loadFromLegacyRides(
  db: SupabaseClient,
  productKey: ProductKey,
  surfaceKey: SurfaceKey,
): Promise<ResolvedPolicy> {
  // Only meaningful for rides product; others get defaults
  if (productKey !== "rides") {
    return {
      ...DEFAULT_POLICY,
      id: "default",
      updated_at: new Date().toISOString(),
      updated_by: null,
      product_key: productKey,
      surface_key: surfaceKey,
      policy_id: "default",
      profile_id: null,
      source: "legacy_rides",
    };
  }

  // Try rides.dispatch_settings via public view
  const { data: settings, error } = await db
    .from("rides_dispatch_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.warn(`[matching] legacy rides settings lookup failed: ${error.message}`);
  }

  if (settings) {
    const policy = rowToPolicy(settings as Record<string, unknown>);
    return {
      ...policy,
      id: "rides_dispatch_settings",
      product_key: productKey,
      surface_key: surfaceKey,
      policy_id: "rides_dispatch_settings",
      profile_id: null,
      source: "legacy_rides",
    };
  }

  // Return defaults
  return {
    ...DEFAULT_POLICY,
    id: "default",
    updated_at: new Date().toISOString(),
    updated_by: null,
    product_key: productKey,
    surface_key: surfaceKey,
    policy_id: "default",
    profile_id: null,
    source: "legacy_rides",
  };
}

// -----------------------------------------------------------------------------
// Main Load Function
// -----------------------------------------------------------------------------

/**
 * Load matching policy for a product/surface.
 *
 * - If MATCHING_BRAIN_ENABLED=1: loads from matching.policies + product_profiles
 * - Otherwise: falls back to rides.dispatch_settings (for rides) or defaults (for others)
 *
 * Results are cached for 30 seconds. Call invalidatePolicyCache() after admin updates.
 */
export async function loadMatchingPolicy(
  db: SupabaseClient,
  productKey: ProductKey,
  surfaceKey: SurfaceKey = "default",
): Promise<ResolvedPolicy> {
  const key = cacheKey(productKey, surfaceKey);
  const now = Date.now();

  const cached = policyCache.get(key);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.policy;
  }

  let policy: ResolvedPolicy;

  if (isMatchingBrainEnabled()) {
    const brainPolicy = await loadFromMatchingBrain(db, productKey, surfaceKey);
    if (brainPolicy) {
      policy = brainPolicy;
    } else {
      // Brain enabled but no policy found - use legacy fallback
      policy = await loadFromLegacyRides(db, productKey, surfaceKey);
    }
  } else {
    // Brain disabled - use legacy
    policy = await loadFromLegacyRides(db, productKey, surfaceKey);
  }

  policyCache.set(key, { policy, at: now });
  return policy;
}

// -----------------------------------------------------------------------------
// Utility exports (for use in matching dispatch logic)
// -----------------------------------------------------------------------------

export function getWaveRadiusKm(policy: Pick<MatchingPolicy, "wave_radius_km">, wave: number): number {
  const idx = Math.min(Math.max(wave, 1) - 1, policy.wave_radius_km.length - 1);
  return policy.wave_radius_km[idx] ?? policy.wave_radius_km[policy.wave_radius_km.length - 1] ?? 35;
}

export function driverLocationMaxAgeMs(policy: Pick<MatchingPolicy, "driver_location_max_age_minutes">): number {
  return policy.driver_location_max_age_minutes * 60 * 1000;
}

export function isSerialDispatchEnabled(policy: Pick<MatchingPolicy, "serial_dispatch_enabled">): boolean {
  if (Deno.env.get("MATCHING_SERIAL_DISPATCH") !== "1") return false;
  return policy.serial_dispatch_enabled;
}

export function isH3SupplyEnabled(policy: Pick<MatchingPolicy, "h3_supply_enabled">): boolean {
  if (Deno.env.get("MATCHING_H3_SUPPLY") !== "1") return false;
  return policy.h3_supply_enabled;
}

export function isH3SurgeEnabled(policy: Pick<MatchingPolicy, "h3_surge_enabled">): boolean {
  if (Deno.env.get("MATCHING_H3_SURGE") !== "1") return false;
  return policy.h3_surge_enabled;
}
