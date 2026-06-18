/**
 * Admin CRUD for rides.vehicle_types (body types + services).
 */
import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import type { RidesAdminTables } from "../../_shared/ridesAdminDb.ts";
import {
  slugFromCommandoBodyType,
  normalizeTransportSolutionSlug,
  TRANSPORT_SOLUTION_SLUG_RE,
} from "../../_shared/transportSlug.ts";
import { registerCommandoBodyTypeRoutes } from "./commandoBodyTypes.ts";
import { registerServiceBodyTypeRoutes } from "./serviceBodyTypes.ts";
import {
  invalidateVehicleTypesCache,
  type VehicleTypeDto,
  type VehicleTypeRow,
} from "../fare/vehicleTypesDb.ts";
import { invalidateServiceMatchingCache } from "../fare/serviceMatching.ts";

function inferSolutionKind(slug: string, kind?: string | null): "vehicle" | "service" {
  if (kind === "service" || kind === "vehicle") return kind;
  return slug === "courier" ? "service" : "vehicle";
}

function inferServiceCategory(slug: string, stored?: string | null): "rideshare" | "courier" | "event" | "haulage" {
  if (stored === "rideshare" || stored === "courier" || stored === "event" || stored === "haulage") {
    return stored;
  }
  const normalized = slug.trim().toLowerCase();
  if (normalized === "courier") return "courier";
  if (normalized === "event-booking" || normalized === "event") return "event";
  if (normalized === "haulage") return "haulage";
  return "rideshare";
}

function dto(row: VehicleTypeRow): VehicleTypeDto {
  const kind = inferSolutionKind(row.slug, row.solution_kind);
  return {
    slug: row.slug,
    label: row.label,
    description: row.description ?? "",
    seats: row.seats ?? 0,
    capacity_label: row.capacity_label,
    tagline: row.tagline,
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active !== false,
    solution_kind: kind,
    service_category: kind === "service" ? inferServiceCategory(row.slug, row.service_category) : null,
    commando_body_type: row.commando_body_type ?? null,
  };
}

function parseSeats(body: Record<string, unknown>, defaultSeats: number): number | { error: string } {
  const seats = typeof body.seats === "number"
    ? Math.round(body.seats)
    : typeof body.seats === "string"
    ? parseInt(body.seats, 10)
    : defaultSeats;
  if (!Number.isFinite(seats) || seats < 0 || seats > 99) return { error: "invalid_seats" };
  return seats;
}

function parseBodyTypeCreate(body: Record<string, unknown>) {
  const commando = typeof body.commando_body_type === "string"
    ? body.commando_body_type.trim()
    : typeof body.label === "string"
    ? body.label.trim()
    : "";
  if (!commando) return { error: "commando_body_type_required" } as const;

  let slug = typeof body.slug === "string"
    ? normalizeTransportSolutionSlug(body.slug)
    : slugFromCommandoBodyType(commando);
  if (!slug) return { error: "invalid_slug" } as const;
  if (!TRANSPORT_SOLUTION_SLUG_RE.test(slug)) return { error: "invalid_slug" } as const;

  const seats = parseSeats(body, 4);
  if (typeof seats === "object") return seats;

  const sort_order = typeof body.sort_order === "number"
    ? Math.round(body.sort_order)
    : typeof body.sort_order === "string"
    ? parseInt(body.sort_order, 10)
    : 0;

  return {
    slug,
    patch: {
      slug,
      label: commando,
      commando_body_type: commando,
      description: "",
      seats,
      capacity_label: null,
      tagline: null,
      solution_kind: "vehicle" as const,
      sort_order: Number.isFinite(sort_order) ? sort_order : 0,
      is_active: body.is_active !== false,
      updated_at: new Date().toISOString(),
    },
  } as const;
}

function parseServiceCreate(body: Record<string, unknown>) {
  let slug = typeof body.slug === "string"
    ? normalizeTransportSolutionSlug(body.slug)
    : "";
  if (!slug) return { error: "slug_required" } as const;
  if (!TRANSPORT_SOLUTION_SLUG_RE.test(slug)) return { error: "invalid_slug" } as const;

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return { error: "label_required" } as const;

  const description = typeof body.description === "string" ? body.description.trim() : "";
  const seats = parseSeats(body, 4);
  if (typeof seats === "object") return seats;

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

  const service_category = typeof body.service_category === "string"
    ? inferServiceCategory(slug, body.service_category)
    : inferServiceCategory(slug);

  return {
    slug,
    patch: {
      label,
      commando_body_type: null,
      description,
      seats,
      solution_kind: "service" as const,
      service_category,
      ...(capacity_label !== undefined ? { capacity_label } : {}),
      ...(tagline !== undefined ? { tagline } : {}),
      sort_order: Number.isFinite(sort_order) ? sort_order : 0,
      is_active: body.is_active !== false,
      updated_at: new Date().toISOString(),
    },
  } as const;
}

function parseCreate(body: Record<string, unknown>) {
  const kind = body.solution_kind === "service" ? "service" : "vehicle";
  return kind === "service" ? parseServiceCreate(body) : parseBodyTypeCreate(body);
}

function parsePatch(body: Record<string, unknown>, existing: VehicleTypeRow) {
  const isBody = inferSolutionKind(existing.slug, existing.solution_kind) === "vehicle";
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (isBody) {
    if (body.seats !== undefined) {
      const seats = parseSeats(body, existing.seats ?? 4);
      if (typeof seats === "object") return seats;
      patch.seats = seats;
    }
    if (body.sort_order !== undefined) {
      const sort_order = typeof body.sort_order === "number"
        ? Math.round(body.sort_order)
        : parseInt(String(body.sort_order), 10);
      if (Number.isFinite(sort_order)) patch.sort_order = sort_order;
    }
    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
    return { patch } as const;
  }

  if (typeof body.label === "string" && body.label.trim()) patch.label = body.label.trim();
  if (typeof body.description === "string") patch.description = body.description.trim();
  if (body.seats !== undefined) {
    const seats = parseSeats(body, existing.seats ?? 4);
    if (typeof seats === "object") return seats;
    patch.seats = seats;
  }
  if (body.capacity_label !== undefined) {
    patch.capacity_label = typeof body.capacity_label === "string"
      ? (body.capacity_label.trim() || null)
      : null;
  }
  if (body.tagline !== undefined) {
    patch.tagline = typeof body.tagline === "string" ? (body.tagline.trim() || null) : null;
  }
  if (body.sort_order !== undefined) {
    const sort_order = typeof body.sort_order === "number"
      ? Math.round(body.sort_order)
      : parseInt(String(body.sort_order), 10);
    if (Number.isFinite(sort_order)) patch.sort_order = sort_order;
  }
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
  if (body.service_category !== undefined) {
    patch.service_category = inferServiceCategory(
      existing.slug,
      typeof body.service_category === "string" ? body.service_category : null,
    );
  }

  return { patch } as const;
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
    const parsed = parseCreate(body);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);

    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const { data, error } = await db.from(tables.vehicle_types).insert({
      slug: parsed.slug,
      ...parsed.patch,
    } as Record<string, unknown>).select("*").single();

    if (error) {
      if (error.code === "23505") return c.json({ error: "slug_exists" }, 409);
      return c.json({ error: "insert_failed", message: error.message }, 500);
    }

    invalidateVehicleTypesCache();
    invalidateServiceMatchingCache();
    await adminAudit(db, tables, adminUser.id, "admin_vehicle_type_created", { slug: parsed.slug });
    return c.json({ vehicle_type: dto(data as VehicleTypeRow) }, 201);
  });

  admin.patch("/vehicle-types/:slug", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const slug = decodeURIComponent(c.req.param("slug")).trim().toLowerCase();
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const { data: existing } = await db.from(tables.vehicle_types).select("*").eq("slug", slug).maybeSingle();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const parsed = parsePatch(body, existing as VehicleTypeRow);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);

    const { data, error } = await db.from(tables.vehicle_types).update(parsed.patch).eq("slug", slug).select("*")
      .maybeSingle();
    if (error) return c.json({ error: "update_failed", message: error.message }, 500);

    invalidateVehicleTypesCache();
    invalidateServiceMatchingCache();
    await adminAudit(db, tables, adminUser.id, "admin_vehicle_type_updated", { slug });
    return c.json({ vehicle_type: dto(data as VehicleTypeRow) });
  });

  admin.delete("/vehicle-types/:slug", (c) => handleDelete(c, ridesDbOrResponse, adminAudit));
  admin.post("/vehicle-types/:slug/delete", (c) => handleDelete(c, ridesDbOrResponse, adminAudit));

  registerCommandoBodyTypeRoutes(admin);
  registerServiceBodyTypeRoutes(admin, ridesDbOrResponse);
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
  invalidateServiceMatchingCache();
  await adminAudit(db, tables, adminUser.id, "admin_vehicle_type_deleted", { slug });
  return c.json({ ok: true });
}
