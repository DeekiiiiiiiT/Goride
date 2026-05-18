/**
 * Admin CRUD for rides.vehicle_types
 */
import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import type { RidesAdminTables } from "../../_shared/ridesAdminDb.ts";
import {
  invalidateVehicleTypesCache,
  type VehicleTypeDto,
  type VehicleTypeRow,
} from "../fare/vehicleTypesDb.ts";

const SLUG_RE = /^[a-z][a-z0-9_-]{0,30}$/;

function dto(row: VehicleTypeRow): VehicleTypeDto {
  return {
    slug: row.slug,
    label: row.label,
    description: row.description ?? "",
    seats: row.seats ?? 0,
    capacity_label: row.capacity_label,
    tagline: row.tagline,
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active !== false,
  };
}

function parseBody(body: Record<string, unknown>, forCreate: boolean) {
  const errors: string[] = [];
  let slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (forCreate) {
    if (!slug) errors.push("slug_required");
    else if (!SLUG_RE.test(slug)) errors.push("invalid_slug");
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) errors.push("label_required");

  const description = typeof body.description === "string" ? body.description.trim() : "";
  const seats = typeof body.seats === "number"
    ? Math.round(body.seats)
    : typeof body.seats === "string"
    ? parseInt(body.seats, 10)
    : 4;
  if (!Number.isFinite(seats) || seats < 0 || seats > 99) errors.push("invalid_seats");

  const capacity_label = typeof body.capacity_label === "string"
    ? (body.capacity_label.trim() || null)
    : body.capacity_label === null
    ? null
    : undefined;

  const tagline = typeof body.tagline === "string"
    ? (body.tagline.trim() || null)
    : body.tagline === null
    ? null
    : undefined;

  const sort_order = typeof body.sort_order === "number"
    ? Math.round(body.sort_order)
    : typeof body.sort_order === "string"
    ? parseInt(body.sort_order, 10)
    : 0;

  const is_active = body.is_active !== false;

  if (errors.length) return { error: errors[0] } as const;

  return {
    slug,
    patch: {
      label,
      description,
      seats,
      ...(capacity_label !== undefined ? { capacity_label } : {}),
      ...(tagline !== undefined ? { tagline } : {}),
      sort_order: Number.isFinite(sort_order) ? sort_order : 0,
      is_active,
      updated_at: new Date().toISOString(),
    },
  } as const;
}

type DbBundle = {
  db: import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient;
  tables: RidesAdminTables;
};

export function registerVehicleTypeAdminRoutes(
  admin: Hono,
  ridesDbOrResponse: (c: { json: (body: unknown, status?: number) => Response }) => Promise<DbBundle | Response>,
  adminAudit: (
    db: DbBundle["db"],
    tables: RidesAdminTables,
    adminId: string,
    event: string,
    payload: Record<string, unknown>,
  ) => Promise<void>,
) {
  admin.get("/vehicle-types", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    const { data, error } = await db.from(tables.vehicle_types).select("*").order("sort_order").order("slug");
    if (error) {
      return c.json({ error: "list_failed", message: error.message }, 500);
    }
    return c.json({ vehicle_types: (data ?? []).map((r) => dto(r as VehicleTypeRow)) });
  });

  admin.post("/vehicle-types", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const parsed = parseBody(body, true);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);

    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const { data, error } = await db.from(tables.vehicle_types).insert({
      slug: parsed.slug,
      ...parsed.patch,
    }).select("*").single();

    if (error) {
      if (error.code === "23505") return c.json({ error: "slug_exists" }, 409);
      return c.json({ error: "insert_failed", message: error.message }, 500);
    }

    invalidateVehicleTypesCache();
    await adminAudit(db, tables, adminUser.id, "admin_vehicle_type_created", { slug: parsed.slug });
    return c.json({ vehicle_type: dto(data as VehicleTypeRow) }, 201);
  });

  admin.patch("/vehicle-types/:slug", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const slug = decodeURIComponent(c.req.param("slug")).trim().toLowerCase();
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const parsed = parseBody(body, false);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);

    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const { data, error } = await db.from(tables.vehicle_types).update(parsed.patch).eq("slug", slug).select("*")
      .maybeSingle();
    if (error) return c.json({ error: "update_failed", message: error.message }, 500);
    if (!data) return c.json({ error: "not_found" }, 404);

    invalidateVehicleTypesCache();
    await adminAudit(db, tables, adminUser.id, "admin_vehicle_type_updated", { slug });
    return c.json({ vehicle_type: dto(data as VehicleTypeRow) });
  });

  admin.delete("/vehicle-types/:slug", (c) => handleDelete(c, ridesDbOrResponse, adminAudit));
  admin.post("/vehicle-types/:slug/delete", (c) => handleDelete(c, ridesDbOrResponse, adminAudit));
}

async function handleDelete(
  c: Context,
  ridesDbOrResponse: (c: { json: (body: unknown, status?: number) => Response }) => Promise<DbBundle | Response>,
  adminAudit: (
    db: DbBundle["db"],
    tables: RidesAdminTables,
    adminId: string,
    event: string,
    payload: Record<string, unknown>,
  ) => Promise<void>,
) {
  const adminUser = await requireProductAdmin(c, "rides");
  if (adminUser instanceof Response) return adminUser;
  const slug = decodeURIComponent(c.req.param("slug")).trim().toLowerCase();

  const resolved = await ridesDbOrResponse(c);
  if (resolved instanceof Response) return resolved;
  const { db, tables } = resolved;

  const { count, error: countErr } = await db.from(tables.fare_rules).select("id", {
    count: "exact",
    head: true,
  }).eq("vehicle_type", slug);
  if (countErr) return c.json({ error: "check_failed" }, 500);
  if ((count ?? 0) > 0) {
    return c.json({ error: "vehicle_type_in_use", fare_rules: count }, 409);
  }

  const { error } = await db.from(tables.vehicle_types).delete().eq("slug", slug);
  if (error) return c.json({ error: "delete_failed", message: error.message }, 500);

  invalidateVehicleTypesCache();
  await adminAudit(db, tables, adminUser.id, "admin_vehicle_type_deleted", { slug });
  return c.json({ ok: true });
}
