/**
 * Admin API for global dispatch settings (Control Panel).
 */
import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import type { RidesAdminTables } from "../../_shared/ridesAdminDb.ts";
import {
  DEFAULT_DISPATCH_SETTINGS,
  dispatchSettingsDto,
  invalidateDispatchSettingsCache,
  loadDispatchSettings,
  rowToDispatchSettings,
  type BodyTypeTierMode,
  type DispatchSettings,
} from "../fare/dispatchSettings.ts";

const WRITE_ROLES = new Set(["platform_owner", "superadmin", "rides_admin"]);

function canWriteDispatchSettings(role: string): boolean {
  return WRITE_ROLES.has(role);
}

type ParseResult =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; error: string; status?: number };

function parseWaveRadii(raw: unknown): number[] | { error: string } {
  if (!Array.isArray(raw)) return { error: "invalid_wave_radius_km" };
  const nums = raw.map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return { error: "invalid_wave_radius_km" };
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] <= nums[i - 1]) return { error: "wave_radius_km_must_ascend" };
  }
  return nums;
}

function parsePatch(
  body: Record<string, unknown>,
  current: DispatchSettings,
): ParseResult {
  const patch: Record<string, unknown> = {};
  const nextMaxWaves = body.max_match_waves !== undefined
    ? Math.min(5, Math.max(1, Number(body.max_match_waves)))
    : current.max_match_waves;

  if (body.max_match_waves !== undefined) {
    if (!Number.isFinite(nextMaxWaves)) return { ok: false, error: "invalid_max_match_waves" };
    patch.max_match_waves = nextMaxWaves;
  }

  if (body.wave_radius_km !== undefined) {
    const parsed = parseWaveRadii(body.wave_radius_km);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    if (parsed.length < nextMaxWaves) {
      return { ok: false, error: "wave_radius_km_length", status: 400 };
    }
    patch.wave_radius_km = parsed.slice(0, nextMaxWaves);
  } else if (body.max_match_waves !== undefined && current.wave_radius_km.length < nextMaxWaves) {
    return { ok: false, error: "wave_radius_km_length", status: 400 };
  }

  if (body.max_offers_per_wave !== undefined) {
    const n = Number(body.max_offers_per_wave);
    if (!Number.isFinite(n) || n < 1 || n > 20) return { ok: false, error: "invalid_max_offers_per_wave" };
    patch.max_offers_per_wave = Math.round(n);
  }

  if (body.default_driver_offer_timeout_seconds !== undefined) {
    const n = Number(body.default_driver_offer_timeout_seconds);
    if (!Number.isFinite(n) || n < 5 || n > 120) {
      return { ok: false, error: "invalid_default_driver_offer_timeout_seconds" };
    }
    patch.default_driver_offer_timeout_seconds = Math.round(n);
  }

  if (body.driver_location_max_age_minutes !== undefined) {
    const n = Number(body.driver_location_max_age_minutes);
    if (!Number.isFinite(n) || n < 1 || n > 30) {
      return { ok: false, error: "invalid_driver_location_max_age_minutes" };
    }
    patch.driver_location_max_age_minutes = Math.round(n);
  }

  if (body.max_matching_duration_minutes !== undefined) {
    const n = Number(body.max_matching_duration_minutes);
    if (!Number.isFinite(n) || n < 2 || n > 120) {
      return { ok: false, error: "invalid_max_matching_duration_minutes" };
    }
    patch.max_matching_duration_minutes = Math.round(n);
  }

  if (body.quote_driver_radius_km !== undefined) {
    const n = Number(body.quote_driver_radius_km);
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      return { ok: false, error: "invalid_quote_driver_radius_km" };
    }
    patch.quote_driver_radius_km = n;
  }

  if (body.body_type_filtering_enabled !== undefined) {
    patch.body_type_filtering_enabled = body.body_type_filtering_enabled === true;
  }

  if (body.body_type_tier_mode !== undefined) {
    const mode = body.body_type_tier_mode;
    if (mode !== "expand" && mode !== "strict") {
      return { ok: false, error: "invalid_body_type_tier_mode" };
    }
    patch.body_type_tier_mode = mode as BodyTypeTierMode;
  }

  if (body.require_body_type_for_offers !== undefined) {
    patch.require_body_type_for_offers = body.require_body_type_for_offers === true;
  }

  if (body.independent_only_matching !== undefined) {
    patch.independent_only_matching = body.independent_only_matching === true;
  }

  const boolField = (key: string) => {
    if (body[key] !== undefined) patch[key] = body[key] === true;
  };
  const intField = (key: string, min: number, max: number) => {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < min || n > max) return { ok: false as const, error: `invalid_${key}` };
      patch[key] = Math.round(n);
    }
    return null;
  };
  const numField = (key: string, min: number, max: number) => {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < min || n > max) return { ok: false as const, error: `invalid_${key}` };
      patch[key] = n;
    }
    return null;
  };

  for (const check of [
    intField("trip_location_interval_seconds", 2, 30),
    intField("pickup_geofence_radius_m", 20, 500),
    intField("dropoff_geofence_radius_m", 20, 500),
    intField("arrival_dwell_seconds", 0, 120),
    numField("max_speed_mps_for_arrival", 0, 20),
    intField("no_show_cancel_minutes", 0, 60),
    intField("gps_max_accuracy_m_for_arrival", 10, 200),
    intField("wait_time_grace_minutes", 0, 10),
    intField("wait_time_rate_per_min_minor", 0, 10000),
    intField("wait_time_max_minutes", 1, 60),
  ]) {
    if (check) return check;
  }

  if (body.auto_en_route_on_accept !== undefined) {
    patch.auto_en_route_on_accept = body.auto_en_route_on_accept === true;
  }
  if (body.auto_arrive_enabled !== undefined) {
    patch.auto_arrive_enabled = body.auto_arrive_enabled === true;
  }
  if (body.auto_complete_suggest_enabled !== undefined) {
    patch.auto_complete_suggest_enabled = body.auto_complete_suggest_enabled === true;
  }
  boolField("no_show_auto_cancel_enabled");
  boolField("wait_time_charge_enabled");
  boolField("pin_verification_enabled");
  boolField("pin_verification_required_for_start");
  boolField("toll_detection_enabled");
  boolField("toll_detect_enroute");
  boolField("route_toll_estimation_enabled");

  const tollRadiusCheck = intField("toll_geofence_radius_m", 50, 500);
  if (tollRadiusCheck) return tollRadiusCheck;

  if (!Object.keys(patch).length) return { ok: false, error: "no_changes" };

  return { ok: true, patch };
}

export function registerDispatchSettingsAdminRoutes(
  admin: Hono,
  ridesDbOrResponse: (
    c: Context,
  ) => Promise<{ db: import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient; tables: RidesAdminTables } | Response>,
  adminAudit: (
    db: import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient,
    tables: RidesAdminTables,
    actorId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) => Promise<void>,
) {
  admin.get("/dispatch-settings", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    const settings = await loadDispatchSettings(db, tables);
    return c.json({ settings: dispatchSettingsDto(settings) });
  });

  admin.patch("/dispatch-settings", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    if (!canWriteDispatchSettings(adminUser.role)) {
      return c.json({ error: "forbidden", message: "rides_admin role required to edit dispatch settings" }, 403);
    }

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const current = await loadDispatchSettings(db, tables);
    const parsed = parsePatch(body, current);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, parsed.status ?? 400);
    }

    const { data: before } = await db.from(tables.dispatch_settings).select("*").eq("id", 1).maybeSingle();

    const updateRow = {
      ...parsed.patch,
      updated_at: new Date().toISOString(),
      updated_by: adminUser.id,
    };

    const { data, error } = await db
      .from(tables.dispatch_settings)
      .update(updateRow)
      .eq("id", 1)
      .select("*")
      .single();

    if (error) {
      return c.json({ error: "update_failed", message: error.message }, 500);
    }

    invalidateDispatchSettingsCache();
    const settings = rowToDispatchSettings(data as Record<string, unknown>);

    await adminAudit(db, tables, adminUser.id, "admin_dispatch_settings_updated", {
      before: before ? dispatchSettingsDto(rowToDispatchSettings(before as Record<string, unknown>)) : null,
      after: dispatchSettingsDto(settings),
    });

    return c.json({ settings: dispatchSettingsDto(settings) });
  });
}

export { DEFAULT_DISPATCH_SETTINGS };
