/**
 * Super Admin routes for Roam Rides pricing (fare_rules + surge_cells).
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin } from "../_shared/productAdmin.ts";

/** PostgREST views in `public` (see migration rides_public_admin_views). */
const T = {
  fare_rules: "rides_fare_rules",
  surge_cells: "rides_surge_cells",
  audit_events: "rides_audit_events",
} as const;

function adminDb(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "public" } },
  );
}

type FareRuleRow = {
  id: string;
  city: string;
  vehicle_type: string;
  base_fare_minor: number;
  price_per_km_minor: number;
  price_per_min_minor: number;
  booking_fee_minor: number;
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
  return {
    id: row.id,
    city: row.city,
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
    min_fare_minor: row.min_fare_minor,
    base_fare: row.base_fare_minor / 100,
    price_per_km: row.price_per_km_minor / 100,
    price_per_min: row.price_per_min_minor / 100,
    booking_fee: row.booking_fee_minor / 100,
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
  const minFare = parseMajorMoney(body.min_fare ?? body.min_fare_minor);
  if (base == null || perKm == null || perMin == null || booking == null || minFare == null) {
    return { error: "invalid_money_fields" as const };
  }
  return { base, perKm, perMin, booking, minFare };
}

async function adminAudit(
  db: SupabaseClient,
  actorId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  await db.from(T.audit_events).insert({
    ride_request_id: null,
    actor_user_id: actorId,
    event_type: eventType,
    payload,
  });
}

async function deactivateOtherActiveRules(
  db: SupabaseClient,
  city: string,
  vehicleType: string,
  exceptId?: string,
) {
  let q = db.from(T.fare_rules).update({
    is_active: false,
    updated_at: new Date().toISOString(),
  }).eq("city", city).eq("vehicle_type", vehicleType).eq("is_active", true);
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
    const db = adminDb();
    const { data, error } = await db.from(T.fare_rules).select("*").order("city").order("vehicle_type");
    if (error) return c.json({ error: "list_failed", message: error.message }, 500);
    return c.json({ rules: (data ?? []).map((r) => fareRuleDto(r as FareRuleRow)) });
  });

  admin.get("/fare-rules/:id", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const db = adminDb();
    const { data, error } = await db.from(T.fare_rules).select("*").eq("id", c.req.param("id")).maybeSingle();
    if (error) return c.json({ error: "fetch_failed" }, 500);
    if (!data) return c.json({ error: "not_found" }, 404);
    return c.json({ rule: fareRuleDto(data as FareRuleRow) });
  });

  admin.post("/fare-rules", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const city = typeof body.city === "string" ? body.city.trim().toLowerCase() : "";
    const vehicleType = typeof body.vehicle_type === "string" ? body.vehicle_type.trim().toLowerCase() : "";
    if (!city || !vehicleType) return c.json({ error: "city_and_vehicle_required" }, 400);

    const money = parseMoneyFields(body);
    if ("error" in money) return c.json({ error: money.error }, 400);

    const isActive = body.is_active !== false;
    const currency = typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : "JMD";

    const db = adminDb();
    if (isActive) {
      await deactivateOtherActiveRules(db, city, vehicleType);
    }

    const { data, error } = await db.from(T.fare_rules).insert({
      city,
      vehicle_type: vehicleType,
      base_fare_minor: money.base,
      price_per_km_minor: money.perKm,
      price_per_min_minor: money.perMin,
      booking_fee_minor: money.booking,
      min_fare_minor: money.minFare,
      currency,
      is_active: isActive,
    }).select("*").single();

    if (error) {
      if (error.code === "23505") return c.json({ error: "duplicate_active_rule" }, 409);
      return c.json({ error: "insert_failed", message: error.message }, 500);
    }

    await adminAudit(db, adminUser.id, "admin_fare_rule_created", {
      rule_id: data.id,
      city,
      vehicle_type: vehicleType,
    });
    deps.logLine({ event: "admin_fare_rule_created", rule_id: data.id, admin_id: adminUser.id });
    return c.json({ rule: fareRuleDto(data as FareRuleRow) }, 201);
  });

  admin.patch("/fare-rules/:id", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const id = c.req.param("id");
    const db = adminDb();
    const { data: existing } = await db.from(T.fare_rules).select("*").eq("id", id).maybeSingle();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.city === "string" && body.city.trim()) patch.city = body.city.trim().toLowerCase();
    if (typeof body.vehicle_type === "string" && body.vehicle_type.trim()) {
      patch.vehicle_type = body.vehicle_type.trim().toLowerCase();
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
      min_fare: body.min_fare ?? existing.min_fare_minor / 100,
    });
    if ("error" in money) return c.json({ error: money.error }, 400);

    patch.base_fare_minor = money.base;
    patch.price_per_km_minor = money.perKm;
    patch.price_per_min_minor = money.perMin;
    patch.booking_fee_minor = money.booking;
    patch.min_fare_minor = money.minFare;

    const nextCity = (patch.city as string) ?? existing.city;
    const nextVehicle = (patch.vehicle_type as string) ?? existing.vehicle_type;
    const nextActive = patch.is_active !== undefined ? patch.is_active : existing.is_active;

    if (nextActive) {
      await deactivateOtherActiveRules(db, nextCity, nextVehicle, id);
    }

    const { data, error } = await db.from(T.fare_rules).update(patch).eq("id", id).select("*").single();
    if (error) return c.json({ error: "update_failed", message: error.message }, 500);

    await adminAudit(db, adminUser.id, "admin_fare_rule_updated", {
      rule_id: id,
      before: fareRuleDto(existing as FareRuleRow),
      after: fareRuleDto(data as FareRuleRow),
    });
    deps.logLine({ event: "admin_fare_rule_updated", rule_id: id, admin_id: adminUser.id });
    return c.json({ rule: fareRuleDto(data as FareRuleRow) });
  });

  admin.post("/fare-rules/:id/duplicate", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const db = adminDb();
    const { data: existing } = await db.from(T.fare_rules).select("*").eq("id", id).maybeSingle();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const city = typeof body.city === "string" && body.city.trim()
      ? body.city.trim().toLowerCase()
      : existing.city;
    const vehicleType = typeof body.vehicle_type === "string" && body.vehicle_type.trim()
      ? body.vehicle_type.trim().toLowerCase()
      : `${existing.vehicle_type}_copy`;

    const isActive = body.is_active === true;
    if (isActive) await deactivateOtherActiveRules(db, city, vehicleType);

    const { data, error } = await db.from(T.fare_rules).insert({
      city,
      vehicle_type: vehicleType,
      base_fare_minor: existing.base_fare_minor,
      price_per_km_minor: existing.price_per_km_minor,
      price_per_min_minor: existing.price_per_min_minor,
      booking_fee_minor: existing.booking_fee_minor,
      min_fare_minor: existing.min_fare_minor,
      currency: existing.currency,
      is_active: isActive,
    }).select("*").single();

    if (error) {
      if (error.code === "23505") return c.json({ error: "duplicate_active_rule" }, 409);
      return c.json({ error: "duplicate_failed", message: error.message }, 500);
    }

    await adminAudit(db, adminUser.id, "admin_fare_rule_duplicated", {
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

    const db = adminDb();
    let q = db.from(T.surge_cells).select("*", { count: "exact" }).order("updated_at", { ascending: false });
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

    const db = adminDb();
    const patch: Record<string, unknown> = {
      open_requests: 0,
      available_drivers: 0,
      updated_at: new Date().toISOString(),
    };
    if (resetMultiplier) patch.surge_multiplier = 1;

    const { error, count } = await db.from(T.surge_cells).update(patch, { count: "exact" }).neq("cell_key", "");
    if (error) return c.json({ error: "reset_all_failed" }, 500);

    await adminAudit(db, adminUser.id, "admin_surge_cells_reset_all", {
      reset_multiplier: resetMultiplier,
      rows: count,
    });
    return c.json({ ok: true, rows_updated: count ?? 0 });
  });

  admin.get("/surge-cells/:cellKey", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const cellKey = decodeURIComponent(c.req.param("cellKey"));
    const db = adminDb();
    const { data, error } = await db.from(T.surge_cells).select("*").eq("cell_key", cellKey).maybeSingle();
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

    const db = adminDb();
    const { data: before } = await db.from(T.surge_cells).select("*").eq("cell_key", cellKey).maybeSingle();

    const { data, error } = await db.from(T.surge_cells).upsert({
      cell_key: cellKey,
      surge_multiplier: clamped,
      open_requests: before?.open_requests ?? 0,
      available_drivers: before?.available_drivers ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "cell_key" }).select("*").single();

    if (error) return c.json({ error: "update_failed", message: error.message }, 500);

    await adminAudit(db, adminUser.id, "admin_surge_cell_updated", {
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

    const db = adminDb();
    const patch: Record<string, unknown> = {
      open_requests: 0,
      available_drivers: 0,
      updated_at: new Date().toISOString(),
    };
    if (resetMultiplier) patch.surge_multiplier = 1;

    const { data: before } = await db.from(T.surge_cells).select("*").eq("cell_key", cellKey).maybeSingle();
    if (!before) return c.json({ error: "not_found" }, 404);

    const { data, error } = await db.from(T.surge_cells).update(patch).eq("cell_key", cellKey).select("*").single();
    if (error) return c.json({ error: "reset_failed" }, 500);

    await adminAudit(db, adminUser.id, "admin_surge_cell_reset", { cell_key: cellKey, reset_multiplier: resetMultiplier });
    return c.json({ cell: data });
  });

  app.route("/admin", admin);
}
