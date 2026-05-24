/**
 * Global dispatch settings (singleton row) with in-memory cache.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { RidesAdminTables } from "../../_shared/ridesAdminDb.ts";

export type BodyTypeTierMode = "expand" | "strict";

export type DispatchSettings = {
  max_match_waves: number;
  wave_radius_km: number[];
  max_offers_per_wave: number;
  default_driver_offer_timeout_seconds: number;
  driver_location_max_age_minutes: number;
  quote_driver_radius_km: number;
  body_type_filtering_enabled: boolean;
  body_type_tier_mode: BodyTypeTierMode;
  require_body_type_for_offers: boolean;
  independent_only_matching: boolean;
  updated_at?: string;
  updated_by?: string | null;
};

export const DEFAULT_DISPATCH_SETTINGS: DispatchSettings = {
  max_match_waves: 3,
  wave_radius_km: [5, 15, 35],
  max_offers_per_wave: 8,
  default_driver_offer_timeout_seconds: 15,
  driver_location_max_age_minutes: 10,
  quote_driver_radius_km: 15,
  body_type_filtering_enabled: true,
  body_type_tier_mode: "expand",
  require_body_type_for_offers: true,
  independent_only_matching: true,
};

const CACHE_TTL_MS = 30_000;
let cached: { settings: DispatchSettings; at: number } | null = null;

export function invalidateDispatchSettingsCache(): void {
  cached = null;
}

function parseNumericArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...DEFAULT_DISPATCH_SETTINGS.wave_radius_km];
  const nums = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? nums : [...DEFAULT_DISPATCH_SETTINGS.wave_radius_km];
}

function normalizeRadii(radii: number[], maxWaves: number): number[] {
  if (!radii.length) return [...DEFAULT_DISPATCH_SETTINGS.wave_radius_km];
  const out = radii.slice(0, Math.max(maxWaves, radii.length));
  while (out.length < maxWaves) {
    out.push(out[out.length - 1] ?? radii[radii.length - 1] ?? 35);
  }
  return out.slice(0, maxWaves);
}

export function rowToDispatchSettings(row: Record<string, unknown>): DispatchSettings {
  const maxWaves = Math.min(
    5,
    Math.max(1, Number(row.max_match_waves ?? DEFAULT_DISPATCH_SETTINGS.max_match_waves)),
  );
  const rawRadii = parseNumericArray(row.wave_radius_km);
  const tierMode = row.body_type_tier_mode === "strict" ? "strict" : "expand";

  return {
    max_match_waves: maxWaves,
    wave_radius_km: normalizeRadii(rawRadii, maxWaves),
    max_offers_per_wave: Math.min(
      20,
      Math.max(1, Number(row.max_offers_per_wave ?? DEFAULT_DISPATCH_SETTINGS.max_offers_per_wave)),
    ),
    default_driver_offer_timeout_seconds: Math.min(
      120,
      Math.max(
        5,
        Number(
          row.default_driver_offer_timeout_seconds ??
            DEFAULT_DISPATCH_SETTINGS.default_driver_offer_timeout_seconds,
        ),
      ),
    ),
    driver_location_max_age_minutes: Math.min(
      30,
      Math.max(
        1,
        Number(
          row.driver_location_max_age_minutes ??
            DEFAULT_DISPATCH_SETTINGS.driver_location_max_age_minutes,
        ),
      ),
    ),
    quote_driver_radius_km: Math.min(
      50,
      Math.max(
        1,
        Number(row.quote_driver_radius_km ?? DEFAULT_DISPATCH_SETTINGS.quote_driver_radius_km),
      ),
    ),
    body_type_filtering_enabled: row.body_type_filtering_enabled !== false,
    body_type_tier_mode: tierMode,
    require_body_type_for_offers: row.require_body_type_for_offers !== false,
    independent_only_matching: row.independent_only_matching !== false,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
    updated_by: typeof row.updated_by === "string" ? row.updated_by : null,
  };
}

export function dispatchSettingsDto(settings: DispatchSettings) {
  return { ...settings };
}

export function getWaveRadiusKm(settings: DispatchSettings, wave: number): number {
  const idx = Math.min(Math.max(wave, 1) - 1, settings.wave_radius_km.length - 1);
  return settings.wave_radius_km[idx] ?? settings.wave_radius_km[settings.wave_radius_km.length - 1];
}

export function driverLocationMaxAgeMs(settings: DispatchSettings): number {
  return settings.driver_location_max_age_minutes * 60 * 1000;
}

export async function loadDispatchSettings(
  db: SupabaseClient,
  tables: Pick<RidesAdminTables, "dispatch_settings">,
): Promise<DispatchSettings> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.settings;

  const { data, error } = await db
    .from(tables.dispatch_settings)
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    cached = { settings: { ...DEFAULT_DISPATCH_SETTINGS }, at: now };
    return cached.settings;
  }

  const settings = rowToDispatchSettings(data as Record<string, unknown>);
  cached = { settings, at: now };
  return settings;
}
