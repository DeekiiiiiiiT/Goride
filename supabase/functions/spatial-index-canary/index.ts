/**
 * Spatial index canary — detect resolution mismatch + stale H3 cells.
 * Detect only; never auto-rewrite production rows.
 * Auth: X-Fleet-Cron-Secret / X-Rides-Cron-Secret
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalSecret } from "../_shared/requireInternalSecret.ts";
import { DEFAULT_H3_RESOLUTION, latLngToH3 } from "../_shared/h3/geoIndex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-fleet-cron-secret, x-rides-cron-secret",
};

const SAMPLE_SIZE = 80;
const LIVE_RES = DEFAULT_H3_RESOLUTION;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const denied = requireInternalSecret(req, {
    envKeys: ["FLEET_CRON_SECRET", "RIDES_CRON_SECRET"],
    headerNames: ["X-Fleet-Cron-Secret", "X-Rides-Cron-Secret"],
  });
  if (denied) {
    const body = await denied.text();
    return new Response(body, {
      status: denied.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const report: Record<string, unknown> = {
    svc: "spatial-index-canary",
    ts: new Date().toISOString(),
    live_res: LIVE_RES,
    ok: true,
    alerts: [] as string[],
  };

  try {
    // --- Rides: resolution mismatch among available drivers ---
    const { count: ridesResMismatch, error: ridesResErr } = await sb
      .from("rides_driver_locations")
      .select("user_id", { count: "exact", head: true })
      .eq("available_for_rides", true)
      .not("h3_cell", "is", null)
      .neq("h3_res", LIVE_RES);

    if (ridesResErr) throw ridesResErr;
    report.rides_res_mismatch = ridesResMismatch ?? 0;
    if ((ridesResMismatch ?? 0) > 0) {
      (report.alerts as string[]).push("rides_res_mismatch");
      report.ok = false;
    }

    // --- Rush: resolution mismatch among online couriers ---
    const { count: rushResMismatch, error: rushResErr } = await sb
      .from("courier_availability")
      .select("driver_id", { count: "exact", head: true })
      .eq("is_online", true)
      .not("h3_cell", "is", null)
      .neq("h3_res", LIVE_RES);

    if (rushResErr) throw rushResErr;
    report.rush_res_mismatch = rushResMismatch ?? 0;
    if ((rushResMismatch ?? 0) > 0) {
      (report.alerts as string[]).push("rush_res_mismatch");
      report.ok = false;
    }

    // --- Online with null cell (should be zero after CHECK) ---
    const { count: rushNullCell, error: rushNullErr } = await sb
      .from("courier_availability")
      .select("driver_id", { count: "exact", head: true })
      .eq("is_online", true)
      .is("h3_cell", null);

    if (rushNullErr) throw rushNullErr;
    report.rush_online_null_cell = rushNullCell ?? 0;
    if ((rushNullCell ?? 0) > 0) {
      (report.alerts as string[]).push("rush_online_null_cell");
      report.ok = false;
    }

    // --- Stale-cell sample: recompute H3 and compare ---
    let ridesStale = 0;
    let ridesSampled = 0;
    const { data: rideRows, error: rideSampleErr } = await sb
      .from("rides_driver_locations")
      .select("user_id, lat, lng, h3_cell, h3_res")
      .eq("available_for_rides", true)
      .not("h3_cell", "is", null)
      .order("updated_at", { ascending: false })
      .limit(SAMPLE_SIZE);

    if (rideSampleErr) throw rideSampleErr;
    for (const row of rideRows ?? []) {
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      ridesSampled += 1;
      try {
        const expected = latLngToH3(lat, lng, LIVE_RES);
        if (String(row.h3_cell) !== expected) ridesStale += 1;
      } catch {
        ridesStale += 1;
      }
    }
    report.rides_stale_sample = { sampled: ridesSampled, stale: ridesStale };
    if (ridesStale > 0) {
      (report.alerts as string[]).push("rides_stale_cell");
      report.ok = false;
    }

    let rushStale = 0;
    let rushSampled = 0;
    const { data: rushRows, error: rushSampleErr } = await sb
      .from("courier_availability")
      .select("driver_id, current_lat, current_lng, h3_cell, h3_res")
      .eq("is_online", true)
      .not("h3_cell", "is", null)
      .order("last_location_update", { ascending: false })
      .limit(SAMPLE_SIZE);

    if (rushSampleErr) throw rushSampleErr;
    for (const row of rushRows ?? []) {
      const lat = Number(row.current_lat);
      const lng = Number(row.current_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      rushSampled += 1;
      try {
        const expected = latLngToH3(lat, lng, LIVE_RES);
        if (String(row.h3_cell) !== expected) rushStale += 1;
      } catch {
        rushStale += 1;
      }
    }
    report.rush_stale_sample = { sampled: rushSampled, stale: rushStale };
    if (rushStale > 0) {
      (report.alerts as string[]).push("rush_stale_cell");
      report.ok = false;
    }

    const level = report.ok ? "info" : "error";
    console.log(JSON.stringify({ ...report, level, event: "spatial_index_canary" }));

    return new Response(JSON.stringify(report), {
      status: report.ok ? 200 : 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({
      svc: "spatial-index-canary",
      event: "spatial_index_canary_failed",
      error: message,
    }));
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
