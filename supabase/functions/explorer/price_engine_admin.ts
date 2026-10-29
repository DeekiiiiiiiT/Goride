import type { Hono } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requirePlatformAdmin } from "../_shared/platformAdmin.ts";
import { attachStationAnalyticsRoute } from "./station_analytics_admin.ts";

function places(sb: SupabaseClient) {
  return sb.schema("places");
}

export function registerPriceEngineAdmin(
  app: Hono,
  deps: {
    admin: () => SupabaseClient;
    requireOwner: (c: any) => Promise<{ id: string }>;
  },
) {
  app.get("/admin/prices/overview", async (c) => {
    try {
      await deps.requireOwner(c);
      const db = places(deps.admin());
      const { data: overview, error } = await db.rpc("price_engine_overview");
      if (error) throw error;
      const o = (overview || {}) as Record<string, unknown>;
      return c.json({
        review: Number(o.reviewCount) || 0,
        published: Number(o.livePrices) || 0,
        outdated: Number(o.outdatedPrices) || 0,
        health: o.health,
        overview: o,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not load prices" }, 400);
    }
  });

  app.get("/admin/prices/review", async (c) => {
    try {
      await deps.requireOwner(c);
      const status = c.req.query("status") || "review";
      const { data, error } = await places(deps.admin())
        .from("price_review_row")
        .select(
          "source, report_id, status, reasons, detail, weight, checked_at, review_note, place_id, grade, price_per_litre, reported_at, reporter_key, place_name, parish, litres, amount",
        )
        .eq("status", status)
        .order("checked_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not load review" }, 400);
    }
  });

  app.post("/admin/prices/review/:source/:id", async (c) => {
    try {
      const owner = await deps.requireOwner(c);
      const body = await c.req.json().catch(() => ({}));
      const decision = String(body.decision || "");
      const { error } = await places(deps.admin()).rpc("price_engine_review", {
        p_source: c.req.param("source"),
        p_id: c.req.param("id"),
        p_decision: decision,
        p_note: body.note ? String(body.note) : null,
        p_reviewer: owner.id,
      });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not review price" }, 400);
    }
  });

  app.post("/admin/prices/review/:source/:id/fix", async (c) => {
    try {
      const owner = await deps.requireOwner(c);
      const body = await c.req.json();
      const { error } = await places(deps.admin()).rpc("price_engine_fix_and_approve", {
        p_source: c.req.param("source"),
        p_id: c.req.param("id"),
        p_litres: Number(body.litres),
        p_amount: Number(body.amount),
        p_reviewer: owner.id,
        p_note: body.note ? String(body.note) : null,
      });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not fix that price" }, 400);
    }
  });

  app.post("/admin/prices/review/:source/:id/grade", async (c) => {
    try {
      await deps.requireOwner(c);
      const body = await c.req.json();
      const { error } = await places(deps.admin()).rpc("price_engine_set_grade", {
        p_source: c.req.param("source"),
        p_id: c.req.param("id"),
        p_grade: String(body.grade || ""),
      });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not set that grade" }, 400);
    }
  });

  app.get("/admin/prices/published", async (c) => {
    try {
      await deps.requireOwner(c);
      const db = places(deps.admin());
      const { data, error } = await db
        .from("price_current")
        .select("place_id, grade, price_per_litre, confidence, report_count, fleet_count, plug_count, petrojam_week, observed_at, outdated, valid_until")
        .order("observed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const ids = [...new Set((data || []).map((row) => row.place_id).filter(Boolean))];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: placesRows, error: nameError } = await db.from("place").select("id, name").in("id", ids);
        if (nameError) throw nameError;
        for (const row of placesRows || []) names.set(row.id, row.name);
      }
      return c.json({
        items: (data || []).map((row) => ({ ...row, place_name: names.get(row.place_id) || row.place_id })),
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not load published prices" }, 400);
    }
  });

  app.get("/admin/prices/reporters", async (c) => {
    try {
      await deps.requireOwner(c);
      const { data, error } = await places(deps.admin())
        .from("price_reporter")
        .select("reporter_key, source, trust_weight, reports, accepted, owner_rejected, last_report_at")
        .order("reports", { ascending: false })
        .limit(100);
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not load reporters" }, 400);
    }
  });

  app.get("/admin/prices/settings", async (c) => {
    try {
      await deps.requireOwner(c);
      const { data, error } = await places(deps.admin()).from("price_engine_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return c.json({ settings: data });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not load settings" }, 400);
    }
  });

  app.post("/admin/prices/recalculate-all", async (c) => {
    try {
      await deps.requireOwner(c);
      const { data, error } = await places(deps.admin()).rpc("price_engine_recalculate_all");
      if (error) throw error;
      return c.json({ republished: data ?? 0 });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not recalculate prices" }, 400);
    }
  });

  app.patch("/admin/prices/settings", async (c) => {
    try {
      const owner = await deps.requireOwner(c);
      const body = await c.req.json();
      const { data, error } = await places(deps.admin()).rpc("price_engine_save_settings", {
        p_bounds_low: Number(body.bounds_low),
        p_bounds_high: Number(body.bounds_high),
        p_change_pct: Number(body.change_pct),
        p_mad_k: Number(body.mad_k),
        p_mad_min_reports: Number(body.mad_min_reports),
        p_window_days: Number(body.window_days),
        p_fleet_weight: Number(body.fleet_weight),
        p_plug_weight: Number(body.plug_weight),
        p_actor: owner.id,
      });
      if (error) throw error;
      return c.json({ settings: data });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not save settings" }, 400);
    }
  });

  attachStationAnalyticsRoute(app, {
    admin: deps.admin,
    requirePlatformAdmin,
  });
}
