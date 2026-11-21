/**
 * Roam Fleet Admin → Toll platforms (roamfleet.co/admin).
 * How Uber / InDrive / Roam pay tolls back is one Roam-wide list; saving it updates every fleet.
 * Fleets no longer see or change it (migration 20261121222218_toll_platform_rules_roam_wide).
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireProductAdmin } from "./product_admin_guard.ts";

const PREFIX = "/make-server-37f42386/fleet-admin/toll-platforms";
const EDIT_ROLES = new Set(["platform_owner", "fleet_admin", "superadmin"]);

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  put: (path: string, ...handlers: unknown[]) => void;
};

export type TollPlatformRow = {
  platform: string;
  paysTollsBack?: boolean;
  paybackMode?: string;
  takesDisputes?: boolean;
  disputeWindowDays?: number | null;
};

/** Keeps only the fields staff may change, so nothing else reaches the database. */
export function cleanPlatformRows(input: unknown): TollPlatformRow[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const out: TollPlatformRow[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.platform !== "string" || !r.platform) return null;
    const row: TollPlatformRow = { platform: r.platform };
    if (typeof r.paysTollsBack === "boolean") row.paysTollsBack = r.paysTollsBack;
    if (typeof r.paybackMode === "string") row.paybackMode = r.paybackMode;
    if (typeof r.takesDisputes === "boolean") row.takesDisputes = r.takesDisputes;
    if (r.disputeWindowDays === null || typeof r.disputeWindowDays === "number") {
      row.disputeWindowDays = r.disputeWindowDays as number | null;
    }
    out.push(row);
  }
  return out;
}

export function registerTollPlatformAdminRoutes(app: RouteApp, supabase: SupabaseClient) {
  app.get(PREFIX, async (c: Context) => {
    const auth = await requireProductAdmin(c, "fleet");
    if (auth instanceof Response) return auth;
    const { data, error } = await supabase.rpc("toll_sys_platform_defaults");
    if (error) {
      console.error("[toll-platforms] read failed", error.message);
      return c.json({ error: "Could not load the toll platforms." }, 500);
    }
    return c.json({ ...(data as Record<string, unknown>), canEdit: EDIT_ROLES.has(auth.role) });
  });

  app.put(PREFIX, async (c: Context) => {
    const auth = await requireProductAdmin(c, "fleet");
    if (auth instanceof Response) return auth;
    if (!EDIT_ROLES.has(auth.role)) {
      return c.json({ error: "Only the fleet owner can change the toll platforms." }, 403);
    }
    const body = await c.req.json().catch(() => null) as { platforms?: unknown } | null;
    const rows = cleanPlatformRows(body?.platforms);
    if (!rows) return c.json({ error: "Send the platforms to save." }, 400);
    const { data, error } = await supabase.rpc("toll_sys_platform_defaults_save", {
      p_rows: rows,
      p_by: auth.id,
    });
    if (error) {
      const msg = error.message === "BAD_REQUEST" && error.details ? error.details : "Could not save the toll platforms.";
      if (error.message !== "BAD_REQUEST") console.error("[toll-platforms] save failed", error.message);
      return c.json({ error: msg }, error.message === "BAD_REQUEST" ? 400 : 500);
    }
    return c.json(data);
  });
}
