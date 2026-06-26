import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ALL_JOB_STATIONS,
  type JobStation,
} from "./merchantStationDevice.ts";
import {
  assertOwnerAccess,
} from "./merchantTeam.ts";
import { resolveMerchantAccess, type ResolvedMerchantAccess } from "./merchantAuth.ts";

export type VenueStyle =
  | "fast_food"
  | "sports_bar"
  | "fine_dining"
  | "cafe"
  | "ghost_kitchen"
  | "delivery_only"
  | "custom";

export const VALID_VENUE_STYLES = new Set<VenueStyle>([
  "fast_food",
  "sports_bar",
  "fine_dining",
  "cafe",
  "ghost_kitchen",
  "delivery_only",
  "custom",
]);

/** Default enabled stations per venue template (server-side presets). */
export const VENUE_TEMPLATE_PRESETS: Record<
  Exclude<VenueStyle, "custom">,
  JobStation[]
> = {
  fast_food: ["pos", "kitchen", "counter", "drive_thru", "manager"],
  sports_bar: ["pos", "bar", "kitchen", "expo", "counter", "manager"],
  fine_dining: ["pos", "kitchen", "expo", "manager"],
  cafe: ["pos", "kitchen", "manager"],
  ghost_kitchen: ["kitchen", "counter", "manager"],
  delivery_only: ["kitchen", "counter", "manager"],
};

export const DEFAULT_ENABLED_STATIONS: JobStation[] = [
  "counter",
  "kitchen",
  "manager",
  "pos",
];

type VenueOpsDeps = {
  getSupabase: (authHeader: string | null) => SupabaseClient;
  getServiceSupabase: () => SupabaseClient;
};

let venueOpsDepsRef: VenueOpsDeps | null = null;

function getSupabaseFromDeps(authHeader: string | null) {
  if (!venueOpsDepsRef) throw new Error("merchantVenueOps routes not initialized");
  return venueOpsDepsRef.getSupabase(authHeader);
}

function getServiceSb() {
  if (!venueOpsDepsRef) throw new Error("merchantVenueOps routes not initialized");
  return venueOpsDepsRef.getServiceSupabase();
}

async function requireOwnerMerchant(
  authHeader: string,
): Promise<
  | { ok: true; user: { id: string; email?: string | null }; resolved: ResolvedMerchantAccess }
  | { ok: false; status: number; message: string }
> {
  const supabase = getSupabaseFromDeps(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, message: "Unauthorized" };

  const resolved = await resolveMerchantAccess(user.id, user.email);
  if (!resolved) return { ok: false, status: 403, message: "Not a merchant" };

  const ownerCheck = assertOwnerAccess(resolved);
  if (!ownerCheck.ok) return ownerCheck;

  return { ok: true, user, resolved };
}

function readEnabledStations(value: unknown): JobStation[] | null {
  if (!Array.isArray(value)) return null;
  const stations = value.map(String);
  if (stations.length === 0) return null;
  if (!stations.every((s) => (ALL_JOB_STATIONS as readonly string[]).includes(s))) {
    return null;
  }
  return stations as JobStation[];
}

function mapVenueOpsRow(row: Record<string, unknown>) {
  const enabled = row.enabled_stations;
  const enabledStations = Array.isArray(enabled)
    ? enabled.map(String).filter((s) =>
      (ALL_JOB_STATIONS as readonly string[]).includes(s)
    )
    : [...DEFAULT_ENABLED_STATIONS];

  const venueStyle = row.venue_style;
  return {
    venueStyle: venueStyle && VALID_VENUE_STYLES.has(venueStyle as VenueStyle)
      ? String(venueStyle)
      : null,
    enabledStations,
    templatePresets: Object.entries(VENUE_TEMPLATE_PRESETS).map(([style, stations]) => ({
      venueStyle: style,
      enabledStations: stations,
    })),
  };
}

function mapPrepStationRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export function registerMerchantVenueOpsRoutes(app: Hono, deps: VenueOpsDeps) {
  venueOpsDepsRef = deps;

  app.get("/merchant/venue-ops/prep-stations", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const merchantId = access.resolved.merchant.id as string;
    const sb = getServiceSb();
    const { data, error } = await sb
      .from("merchant_prep_stations")
      .select("id, name, sort_order")
      .eq("merchant_id", merchantId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) return c.json({ error: error.message }, 500);
    return c.json({
      prepStations: (data ?? []).map((row) =>
        mapPrepStationRow(row as Record<string, unknown>)
      ),
    });
  });

  app.post("/merchant/venue-ops/prep-stations", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const body = await c.req.json();
    const name = String(body.name || "").trim();
    if (!name) return c.json({ error: "Name is required" }, 400);

    const merchantId = access.resolved.merchant.id as string;
    const sb = getServiceSb();
    const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : 0;
    const { data, error } = await sb
      .from("merchant_prep_stations")
      .insert({
        merchant_id: merchantId,
        name,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      })
      .select("id, name, sort_order")
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({
      prepStation: mapPrepStationRow(data as Record<string, unknown>),
    }, 201);
  });

  app.patch("/merchant/venue-ops/prep-stations/:id", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const { id } = c.req.param();
    const body = await c.req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) return c.json({ error: "Name is required" }, 400);
      updates.name = name;
    }
    if (body.sortOrder !== undefined) {
      const sortOrder = Number(body.sortOrder);
      if (!Number.isFinite(sortOrder)) {
        return c.json({ error: "Invalid sort order" }, 400);
      }
      updates.sort_order = sortOrder;
    }

    if (Object.keys(updates).length === 1) {
      return c.json({ error: "No fields to update" }, 400);
    }

    const merchantId = access.resolved.merchant.id as string;
    const sb = getServiceSb();
    const { data, error } = await sb
      .from("merchant_prep_stations")
      .update(updates)
      .eq("id", id)
      .eq("merchant_id", merchantId)
      .select("id, name, sort_order")
      .single();

    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Prep station not found" }, 404);
    return c.json({
      prepStation: mapPrepStationRow(data as Record<string, unknown>),
    });
  });

  app.delete("/merchant/venue-ops/prep-stations/:id", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const { id } = c.req.param();
    const merchantId = access.resolved.merchant.id as string;
    const sb = getServiceSb();
    const { error } = await sb
      .from("merchant_prep_stations")
      .delete()
      .eq("id", id)
      .eq("merchant_id", merchantId);

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  app.get("/merchant/venue-ops", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const merchantId = access.resolved.merchant.id as string;
    const sb = getServiceSb();
    const { data, error } = await sb
      .from("merchants")
      .select("venue_style, enabled_stations")
      .eq("id", merchantId)
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ venueOps: mapVenueOpsRow(data as Record<string, unknown>) });
  });

  app.patch("/merchant/venue-ops", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const body = await c.req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.venueStyle !== undefined) {
      if (body.venueStyle === null || body.venueStyle === "") {
        updates.venue_style = null;
      } else {
        const style = String(body.venueStyle);
        if (!VALID_VENUE_STYLES.has(style as VenueStyle)) {
          return c.json({ error: "Invalid venue style" }, 400);
        }
        updates.venue_style = style;
      }
    }

    if (body.enabledStations !== undefined) {
      const stations = readEnabledStations(body.enabledStations);
      if (!stations) return c.json({ error: "Invalid enabled stations" }, 400);
      updates.enabled_stations = stations;
    }

    if (Object.keys(updates).length === 1) {
      return c.json({ error: "No fields to update" }, 400);
    }

    const merchantId = access.resolved.merchant.id as string;
    const sb = getServiceSb();
    const { data, error } = await sb
      .from("merchants")
      .update(updates)
      .eq("id", merchantId)
      .select("venue_style, enabled_stations")
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ venueOps: mapVenueOpsRow(data as Record<string, unknown>) });
  });

  app.post("/merchant/venue-ops/apply-template", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const body = await c.req.json();
    const style = String(body.venueStyle || "");
    if (!VALID_VENUE_STYLES.has(style as VenueStyle)) {
      return c.json({ error: "Invalid venue style" }, 400);
    }
    if (style === "custom") {
      return c.json({ error: "Custom venues must set stations manually" }, 400);
    }

    const preset = VENUE_TEMPLATE_PRESETS[style as Exclude<VenueStyle, "custom">];
    const merchantId = access.resolved.merchant.id as string;
    const sb = getServiceSb();
    const { data, error } = await sb
      .from("merchants")
      .update({
        venue_style: style,
        enabled_stations: preset,
        updated_at: new Date().toISOString(),
      })
      .eq("id", merchantId)
      .select("venue_style, enabled_stations")
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ venueOps: mapVenueOpsRow(data as Record<string, unknown>) });
  });
}
