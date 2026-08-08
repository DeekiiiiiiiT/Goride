/**
 * Dominion CRUD for public.intake_warehouse_catalog (master warehouses, any country).
 */
import type { Context } from "npm:hono";
import type { Hono } from "npm:hono";
import { requireAuth } from "./rbac_middleware.ts";
import { hasPlatformStaffAccess } from "./rbac_middleware.ts";

type SupabaseLike = {
  from: (table: string) => any;
};

const BASE = "/make-server-37f42386/admin/intake-warehouses";

function assertPlatform(c: Context): Response | null {
  const rbacUser = (c.get("rbacUser") || c.get("user")) as {
    roles?: string[];
    role?: string;
  } | null;
  if (!rbacUser || !hasPlatformStaffAccess(rbacUser as any)) {
    return c.json({ error: "Forbidden — platform staff only" }, 403);
  }
  return null;
}

function slugCode(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function registerIntakeWarehouseRoutes(app: Hono, supabase: SupabaseLike) {
  app.get(BASE, requireAuth(), async (c) => {
    const denied = assertPlatform(c);
    if (denied) return denied;
    const { data, error } = await supabase
      .from("intake_warehouse_catalog")
      .select("*")
      .order("name");
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ warehouses: data ?? [] });
  });

  app.post(BASE, requireAuth(), async (c) => {
    const denied = assertPlatform(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name || "").trim();
    const code = slugCode(String(body.code || name));
    const addressLine = String(body.addressLine || body.address_line || "").trim();
    const city = String(body.city || "").trim();
    const state = String(body.state || "").trim().slice(0, 80);
    const postalCode = String(body.postalCode || body.postal_code || "").trim();
    const countryCode = String(body.countryCode || body.country_code || "")
      .trim()
      .toUpperCase()
      .slice(0, 2);
    const timezone = String(body.timezone || "").trim();
    if (!name || !code || !addressLine || !city || !postalCode || !countryCode || !timezone) {
      return c.json(
        {
          error:
            "name, code, addressLine, city, postalCode, countryCode, and timezone are required",
        },
        400,
      );
    }
    const row = {
      name,
      code,
      address_line: addressLine,
      city,
      state,
      postal_code: postalCode,
      country_code: countryCode,
      timezone,
      status: body.status === "inactive" ? "inactive" : "active",
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("intake_warehouse_catalog")
      .insert(row)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ warehouse: data }, 201);
  });

  app.patch(`${BASE}/:id`, requireAuth(), async (c) => {
    const denied = assertPlatform(c);
    if (denied) return denied;
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name != null) patch.name = String(body.name).trim();
    if (body.code != null) patch.code = slugCode(String(body.code));
    if (body.addressLine != null || body.address_line != null) {
      patch.address_line = String(body.addressLine ?? body.address_line).trim();
    }
    if (body.city != null) patch.city = String(body.city).trim();
    if (body.state != null) patch.state = String(body.state).trim().slice(0, 80);
    if (body.postalCode != null || body.postal_code != null) {
      patch.postal_code = String(body.postalCode ?? body.postal_code).trim();
    }
    if (body.countryCode != null || body.country_code != null) {
      patch.country_code = String(body.countryCode ?? body.country_code)
        .trim()
        .toUpperCase()
        .slice(0, 2);
    }
    if (body.timezone != null) patch.timezone = String(body.timezone).trim();
    if (body.status === "active" || body.status === "inactive") patch.status = body.status;

    const { data, error } = await supabase
      .from("intake_warehouse_catalog")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ warehouse: data });
  });
}
