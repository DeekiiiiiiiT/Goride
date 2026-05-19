/**
 * Super Admin routes for Roam Rides pricing (fare_rules + surge_cells).
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin } from "../_shared/productAdmin.ts";
import {
  getRidesAdminDb,
  isMissingRidesAdminTableError,
  type RidesAdminTables,
} from "../_shared/ridesAdminDb.ts";
import {
  buildLocationKey,
  formatLocationLabel,
  parseLocationKey,
  type JamaicaCountySlug,
  type JamaicaLocationSelection,
  type LocationScope,
} from "./fare/jamaicaLocations.ts";
import { normalizeVehicleType } from "./fare/ridesVehicleTypes.ts";
import { isKnownServiceSlug } from "./fare/vehicleTypesDb.ts";
import { registerVehicleTypeAdminRoutes } from "./admin/vehicleTypes.ts";
import { registerRiderAdminRoutes } from "./admin/riders.ts";

type RidesAdminDb = Awaited<ReturnType<typeof getRidesAdminDb>>;

async function ridesDbOrResponse(
  c: { json: (body: unknown, status?: number) => Response },
): Promise<RidesAdminDb | Response> {
  try {
    return await getRidesAdminDb();
  } catch (e) {
    const message = e instanceof Error
      ? e.message
      : "Rides admin database is not available";
    return c.json({ error: "rides_admin_db_unavailable", message }, 503);
  }
}

type FareRuleRow = {
  id: string;
  city: string;
  location_key?: string;
  county?: string | null;
  parish?: string | null;
  locality?: string | null;
  vehicle_type: string;
  base_fare_minor: number;
  price_per_km_minor: number;
  price_per_min_minor: number;
  booking_fee_minor: number;
  estimated_tolls_minor: number;
  min_fare_minor: number;
  currency: string;
  is_active: boolean;
  effective_from: string;
  created_at: string;
  updated_at: string;
};

type SurgeCellRow = {
  cell_key: string;
  surge_multiplier: number;
  open_requests: number;
  available_drivers: number;
  updated_at: string;
};

function fareRuleDto(row: FareRuleRow) {
  const locationKey = row.location_key ?? row.city;
  return {
    id: row.id,
    city: row.city,
    location_key: locationKey,
    location_label: formatLocationLabel(locationKey),
    county: row.county ?? null,
    parish: row.parish ?? null,
    locality: row.locality ?? null,
    vehicle_type: row.vehicle_type,
    currency: row.currency,
    is_active: row.is_active,
    effective_from: row.effective_from,
    created_at: row.created_at,
    updated_at: row.updated_at,
    base_fare_minor: row.base_fare_minor,
    price_per_km_minor: row.price_per_km_minor,
    price_per_min_minor: row.price_per_min_minor,
    booking_fee_minor: row.booking_fee_minor,
    estimated_tolls_minor: row.estimated_tolls_minor ?? 0,
    min_fare_minor: row.min_fare_minor,
    base_fare: row.base_fare_minor / 100,
    price_per_km: row.price_per_km_minor / 100,
    price_per_min: row.price_per_min_minor / 100,
    booking_fee: row.booking_fee_minor / 100,
    estimated_tolls: (row.estimated_tolls_minor ?? 0) / 100,
    min_fare: row.min_fare_minor / 100,
  };
}

function parseMajorMoney(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

function parseMoneyFields(body: Record<string, unknown>) {
  const base = parseMajorMoney(body.base_fare ?? body.base_fare_minor);
  const perKm = parseMajorMoney(body.price_per_km ?? body.price_per_km_minor);
  const perMin = parseMajorMoney(body.price_per_min ?? body.price_per_min_minor);
  const booking = parseMajorMoney(body.booking_fee ?? body.booking_fee_minor);
  const tollsRaw = body.estimated_tolls ?? body.estimated_tolls_minor;
  const tolls = tollsRaw == null || tollsRaw === ""
    ? 0
    : parseMajorMoney(tollsRaw);
  const minFare = parseMajorMoney(body.min_fare ?? body.min_fare_minor);
  if (base == null || perKm == null || perMin == null || booking == null || tolls == null || minFare == null) {
    return { error: "invalid_money_fields" as const };
  }
  return { base, perKm, perMin, booking, tolls, minFare };
}

function parseLocationFromBody(body: Record<string, unknown>):
  | {
    location_key: string;
    county: string | null;
    parish: string | null;
    locality: string | null;
    city: string;
  }
  | { error: string } {
  if (typeof body.location_key === "string" && body.location_key.trim()) {
    const location_key = body.location_key.trim().toLowerCase();
    const parsed = parseLocationKey(location_key);
    return {
      location_key,
      county: parsed.county ?? null,
      parish: parsed.parish ?? null,
      locality: parsed.locality ?? null,
      city: location_key,
    };
  }

  const scope = (body.location_scope ?? body.scope) as LocationScope | undefined;
  if (scope) {
    const selection: JamaicaLocationSelection = {
      scope,
      county: typeof body.county === "string"
        ? body.county.trim().toLowerCase() as JamaicaCountySlug
        : undefined,
      parish: typeof body.parish === "string" ? body.parish.trim().toLowerCase() : undefined,
      locality: typeof body.locality === "string" ? body.locality.trim().toLowerCase() : undefined,
    };
    const location_key = buildLocationKey(selection);
    const parsed = parseLocationKey(location_key);
    return {
      location_key,
      county: parsed.county ?? null,
      parish: parsed.parish ?? null,
      locality: parsed.locality ?? null,
      city: location_key,
    };
  }

  const city = typeof body.city === "string" ? body.city.trim().toLowerCase() : "";
  if (!city) return { error: "location_required" };
  const parsed = parseLocationKey(city);
  return {
    location_key: city,
    county: parsed.county ?? null,
    parish: parsed.parish ?? null,
    locality: parsed.locality ?? null,
    city,
  };
}

function ridesNativeDb(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "rides" } },
  );
}

async function deleteFareRuleById(
  db: SupabaseClient,
  tables: RidesAdminTables,
  id: string,
): Promise<{ existing: FareRuleRow | null; error: { message: string } | null }> {
  const { data: existing } = await db.from(tables.fare_rules).select("*").eq("id", id).maybeSingle();
  if (!existing) return { existing: null, error: null };

  // Use the same schema as list/create (public views on hosted Supabase).
  let { error } = await db.from(tables.fare_rules).delete().eq("id", id);

  // Fallback only when `rides` schema is exposed (local / custom API settings).
  if (error && tables.fare_rules !== "fare_rules") {
    const native = ridesNativeDb();
    const retry = await native.from("fare_rules").delete().eq("id", id);
    if (!retry.error) error = null;
    else if (!isMissingRidesAdminTableError(retry.error)) error = retry.error;
  }

  return { existing: existing as FareRuleRow, error: error ? { message: error.message } : null };
}

async function adminAudit(
  db: SupabaseClient,
  tables: RidesAdminTables,
  actorId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  await db.from(tables.audit_events).insert({
    ride_request_id: null,
    actor_user_id: actorId,
    event_type: eventType,
    payload,
  });
}

async function deactivateOtherActiveRules(
  db: SupabaseClient,
  tables: RidesAdminTables,
  locationKey: string,
  vehicleType: string,
  exceptId?: string,
) {
  let q = db.from(tables.fare_rules).update({
    is_active: false,
    updated_at: new Date().toISOString(),
  }).eq("location_key", locationKey).eq("vehicle_type", vehicleType).eq("is_active", true);
  if (exceptId) q = q.neq("id", exceptId);
  await q;
}

export function registerAdminRoutes(
  app: Hono,
  deps: {
    logLine: (p: Record<string, unknown>) => void;
  },
) {
  const admin = new Hono();

  admin.get("/fare-rules", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    const { data, error } = await db.from(tables.fare_rules).select("*").order("location_key").order("vehicle_type");
    if (error) return c.json({ error: "list_failed", message: error.message }, 500);
    return c.json({ rules: (data ?? []).map((r) => fareRuleDto(r as FareRuleRow)) });
  });

  admin.get("/fare-rules/:id", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    const { data, error } = await db.from(tables.fare_rules).select("*").eq("id", c.req.param("id")).maybeSingle();
    if (error) return c.json({ error: "fetch_failed" }, 500);
    if (!data) return c.json({ error: "not_found" }, 404);
    return c.json({ rule: fareRuleDto(data as FareRuleRow) });
  });

  admin.post("/fare-rules", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const vehicleTypeRaw = typeof body.vehicle_type === "string" ? body.vehicle_type.trim().toLowerCase() : "";
    if (!vehicleTypeRaw) return c.json({ error: "vehicle_type_required" }, 400);
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    if (!(await isKnownServiceSlug(db, tables.vehicle_types, vehicleTypeRaw))) {
      const { data: allowed } = await db.from(tables.vehicle_types).select("slug").eq("is_active", true)
        .eq("solution_kind", "service");
      return c.json({
        error: "unknown_service",
        allowed: (allowed ?? []).map((r: { slug: string }) => r.slug),
      }, 400);
    }
    const vehicleType = normalizeVehicleType(vehicleTypeRaw);

    const loc = parseLocationFromBody(body);
    if ("error" in loc) return c.json({ error: loc.error }, 400);

    const money = parseMoneyFields(body);
    if ("error" in money) return c.json({ error: money.error }, 400);

    const isActive = body.is_active !== false;
    const currency = typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : "JMD";
    if (isActive) {
      await deactivateOtherActiveRules(db, tables, loc.location_key, vehicleType);
    }

    const { data, error } = await db.from(tables.fare_rules).insert({
      city: loc.city,
      location_key: loc.location_key,
      county: loc.county,
      parish: loc.parish,
      locality: loc.locality,
      vehicle_type: vehicleType,
      base_fare_minor: money.base,
      price_per_km_minor: money.perKm,
      price_per_min_minor: money.perMin,
      booking_fee_minor: money.booking,
      estimated_tolls_minor: money.tolls,
      min_fare_minor: money.minFare,
      currency,
      is_active: isActive,
    }).select("*").single();

    if (error) {
      if (error.code === "23505") return c.json({ error: "duplicate_active_rule" }, 409);
      return c.json({ error: "insert_failed", message: error.message }, 500);
    }

    await adminAudit(db, tables, adminUser.id, "admin_fare_rule_created", {
      rule_id: data.id,
      location_key: loc.location_key,
      vehicle_type: vehicleType,
    });
    deps.logLine({ event: "admin_fare_rule_created", rule_id: data.id, admin_id: adminUser.id });
    return c.json({ rule: fareRuleDto(data as FareRuleRow) }, 201);
  });

  admin.patch("/fare-rules/:id", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const id = c.req.param("id");
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    const { data: existing } = await db.from(tables.fare_rules).select("*").eq("id", id).maybeSingle();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (
      body.location_scope != null || body.scope != null || body.location_key != null ||
      body.county != null || body.parish != null || body.locality != null ||
      (typeof body.city === "string" && body.city.trim())
    ) {
      const existingKey = (existing as FareRuleRow).location_key ?? existing.city;
      const existingParsed = parseLocationKey(existingKey);
      const loc = parseLocationFromBody({
        location_scope: body.location_scope ?? body.scope ?? existingParsed.scope,
        location_key: body.location_key,
        county: body.county ?? existing.county ?? existingParsed.county,
        parish: body.parish ?? existing.parish ?? existingParsed.parish,
        locality: body.locality ?? existing.locality ?? existingParsed.locality,
        city: body.city,
      });
      if ("error" in loc) return c.json({ error: loc.error }, 400);
      patch.city = loc.city;
      patch.location_key = loc.location_key;
      patch.county = loc.county;
      patch.parish = loc.parish;
      patch.locality = loc.locality;
    }
    if (typeof body.vehicle_type === "string" && body.vehicle_type.trim()) {
      const raw = body.vehicle_type.trim().toLowerCase();
      if (!(await isKnownServiceSlug(db, tables.vehicle_types, raw))) {
        const { data: allowed } = await db.from(tables.vehicle_types).select("slug").eq("is_active", true)
          .eq("solution_kind", "service");
        return c.json({
          error: "unknown_service",
          allowed: (allowed ?? []).map((r: { slug: string }) => r.slug),
        }, 400);
      }
      patch.vehicle_type = normalizeVehicleType(raw);
    }
    if (typeof body.currency === "string" && body.currency.trim()) {
      patch.currency = body.currency.trim().toUpperCase();
    }
    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

    const money = parseMoneyFields({
      base_fare: body.base_fare ?? existing.base_fare_minor / 100,
      price_per_km: body.price_per_km ?? existing.price_per_km_minor / 100,
      price_per_min: body.price_per_min ?? existing.price_per_min_minor / 100,
      booking_fee: body.booking_fee ?? existing.booking_fee_minor / 100,
      estimated_tolls: body.estimated_tolls ?? (existing.estimated_tolls_minor ?? 0) / 100,
      min_fare: body.min_fare ?? existing.min_fare_minor / 100,
    });
    if ("error" in money) return c.json({ error: money.error }, 400);

    patch.base_fare_minor = money.base;
    patch.price_per_km_minor = money.perKm;
    patch.price_per_min_minor = money.perMin;
    patch.booking_fee_minor = money.booking;
    patch.estimated_tolls_minor = money.tolls;
    patch.min_fare_minor = money.minFare;

    const nextLocationKey = (patch.location_key as string) ??
      (existing as FareRuleRow).location_key ?? existing.city;
    const nextVehicle = (patch.vehicle_type as string) ?? existing.vehicle_type;
    const nextActive = patch.is_active !== undefined ? patch.is_active : existing.is_active;

    if (nextActive) {
      await deactivateOtherActiveRules(db, tables, nextLocationKey, nextVehicle, id);
    }

    const { data, error } = await db.from(tables.fare_rules).update(patch).eq("id", id).select("*").single();
    if (error) return c.json({ error: "update_failed", message: error.message }, 500);

    await adminAudit(db, tables, adminUser.id, "admin_fare_rule_updated", {
      rule_id: id,
      before: fareRuleDto(existing as FareRuleRow),
      after: fareRuleDto(data as FareRuleRow),
    });
    deps.logLine({ event: "admin_fare_rule_updated", rule_id: id, admin_id: adminUser.id });
    return c.json({ rule: fareRuleDto(data as FareRuleRow) });
  });

  const handleFareRuleDelete = async (c: {
    req: { param: (k: string) => string };
    json: (body: unknown, status?: number) => Response;
  }) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const id = c.req.param("id");
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const { existing, error } = await deleteFareRuleById(db, tables, id);
    if (!existing) return c.json({ error: "not_found" }, 404);
    if (error) return c.json({ error: "delete_failed", message: error.message }, 500);

    await adminAudit(db, tables, adminUser.id, "admin_fare_rule_deleted", {
      rule_id: id,
      deleted: fareRuleDto(existing),
    });
    deps.logLine({ event: "admin_fare_rule_deleted", rule_id: id, admin_id: adminUser.id });
    return c.json({ ok: true, id });
  };

  admin.delete("/fare-rules/:id", (c) => handleFareRuleDelete(c));
  admin.post("/fare-rules/:id/delete", (c) => handleFareRuleDelete(c));

  admin.post("/fare-rules/:id/duplicate", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    const { data: existing } = await db.from(tables.fare_rules).select("*").eq("id", id).maybeSingle();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const loc = parseLocationFromBody({
      location_scope: body.location_scope ?? body.scope,
      location_key: body.location_key,
      county: body.county ?? existing.county,
      parish: body.parish ?? existing.parish,
      locality: body.locality ?? existing.locality,
      city: typeof body.city === "string" && body.city.trim() ? body.city : existing.city,
    });
    if ("error" in loc) return c.json({ error: loc.error }, 400);

    const vehicleType = typeof body.vehicle_type === "string" && body.vehicle_type.trim()
      ? body.vehicle_type.trim().toLowerCase()
      : `${existing.vehicle_type}_copy`;

    const isActive = body.is_active === true;
    if (isActive) await deactivateOtherActiveRules(db, tables, loc.location_key, vehicleType);

    const { data, error } = await db.from(tables.fare_rules).insert({
      city: loc.city,
      location_key: loc.location_key,
      county: loc.county,
      parish: loc.parish,
      locality: loc.locality,
      vehicle_type: vehicleType,
      base_fare_minor: existing.base_fare_minor,
      price_per_km_minor: existing.price_per_km_minor,
      price_per_min_minor: existing.price_per_min_minor,
      booking_fee_minor: existing.booking_fee_minor,
      estimated_tolls_minor: existing.estimated_tolls_minor ?? 0,
      min_fare_minor: existing.min_fare_minor,
      currency: existing.currency,
      is_active: isActive,
    }).select("*").single();

    if (error) {
      if (error.code === "23505") return c.json({ error: "duplicate_active_rule" }, 409);
      return c.json({ error: "duplicate_failed", message: error.message }, 500);
    }

    await adminAudit(db, tables, adminUser.id, "admin_fare_rule_duplicated", {
      source_id: id,
      rule_id: data.id,
    });
    return c.json({ rule: fareRuleDto(data as FareRuleRow) }, 201);
  });

  admin.get("/surge-cells", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const search = c.req.query("search")?.trim() ?? "";
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    let q = db.from(tables.surge_cells).select("*", { count: "exact" }).order("updated_at", { ascending: false });
    if (search) q = q.ilike("cell_key", `%${search}%`);

    const { data, error, count } = await q.range(from, to);
    if (error) return c.json({ error: "list_failed", message: error.message }, 500);

    return c.json({
      cells: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  });

  admin.post("/surge-cells/reset-all", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    if (adminUser.role !== "platform_owner" && adminUser.role !== "superadmin") {
      return c.json({ error: "owner_only" }, 403);
    }

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const resetMultiplier = body.reset_multiplier !== false;

    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    const patch: Record<string, unknown> = {
      open_requests: 0,
      available_drivers: 0,
      updated_at: new Date().toISOString(),
    };
    if (resetMultiplier) patch.surge_multiplier = 1;

    const { error, count } = await db.from(tables.surge_cells).update(patch, { count: "exact" }).neq("cell_key", "");
    if (error) return c.json({ error: "reset_all_failed" }, 500);

    await adminAudit(db, tables, adminUser.id, "admin_surge_cells_reset_all", {
      reset_multiplier: resetMultiplier,
      rows: count,
    });
    return c.json({ ok: true, rows_updated: count ?? 0 });
  });

  admin.get("/surge-cells/:cellKey", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const cellKey = decodeURIComponent(c.req.param("cellKey"));
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    const { data, error } = await db.from(tables.surge_cells).select("*").eq("cell_key", cellKey).maybeSingle();
    if (error) return c.json({ error: "fetch_failed" }, 500);
    if (!data) return c.json({ error: "not_found" }, 404);
    return c.json({ cell: data });
  });

  admin.patch("/surge-cells/:cellKey", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const cellKey = decodeURIComponent(c.req.param("cellKey"));
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const mult = Number(body.surge_multiplier);
    if (Number.isNaN(mult)) return c.json({ error: "invalid_multiplier" }, 400);
    const clamped = Math.min(3, Math.max(1, mult));

    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    const { data: before } = await db.from(tables.surge_cells).select("*").eq("cell_key", cellKey).maybeSingle();

    const { data, error } = await db.from(tables.surge_cells).upsert({
      cell_key: cellKey,
      surge_multiplier: clamped,
      open_requests: before?.open_requests ?? 0,
      available_drivers: before?.available_drivers ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "cell_key" }).select("*").single();

    if (error) return c.json({ error: "update_failed", message: error.message }, 500);

    await adminAudit(db, tables, adminUser.id, "admin_surge_cell_updated", {
      cell_key: cellKey,
      before,
      after: data,
    });
    deps.logLine({ event: "admin_surge_cell_updated", cell_key: cellKey, admin_id: adminUser.id });
    return c.json({ cell: data as SurgeCellRow });
  });

  admin.post("/surge-cells/:cellKey/reset", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const cellKey = decodeURIComponent(c.req.param("cellKey"));
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const resetMultiplier = body.reset_multiplier === true;

    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    const patch: Record<string, unknown> = {
      open_requests: 0,
      available_drivers: 0,
      updated_at: new Date().toISOString(),
    };
    if (resetMultiplier) patch.surge_multiplier = 1;

    const { data: before } = await db.from(tables.surge_cells).select("*").eq("cell_key", cellKey).maybeSingle();
    if (!before) return c.json({ error: "not_found" }, 404);

    const { data, error } = await db.from(tables.surge_cells).update(patch).eq("cell_key", cellKey).select("*").single();
    if (error) return c.json({ error: "reset_failed" }, 500);

    await adminAudit(db, tables, adminUser.id, "admin_surge_cell_reset", { cell_key: cellKey, reset_multiplier: resetMultiplier });
    return c.json({ cell: data });
  });

  registerVehicleTypeAdminRoutes(admin, ridesDbOrResponse, adminAudit);

  registerRiderAdminRoutes(admin);

  app.route("/admin", admin);
}
