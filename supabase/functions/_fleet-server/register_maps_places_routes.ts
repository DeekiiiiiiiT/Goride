/**
 * Peeled from index.tsx — Wave F0. Behavior unchanged.
 */
import type { Hono } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";
import { logProviderCall } from "./api_usage_logger.ts";
import {
  fleetAutocompletePlaces,
  fleetFetchPlaceDetails,
  isFleetPlacesConfigured,
} from "./places_proxy.ts";

export function registerMapsPlacesRoutes(app: Hono) {
  // Google Maps Config Endpoint
  app.get("/make-server-37f42386/maps-config", async (c) => {
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    // Log as a proxy for client-side JS Maps loads — we cannot meter tile loads
    // directly, but each fresh Maps JS load fetches this endpoint once.
    logProviderCall({
      provider: "google_maps",
      service: "maps_js_load",
      route: "/make-server-37f42386/maps-config",
      status: "success",
      httpStatus: 200,
      requests: 1,
    }).catch(() => { /* never break the primary call */ });
    return c.json({ apiKey: apiKey || "", timestamp: Date.now() });
  });

  /** Roam Rides passenger — separate browser key (`GOOGLE_MAPS_API_KEY_RIDES` secret). */
  app.get("/make-server-37f42386/maps-config-rides", async (c) => {
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY_RIDES");
    logProviderCall({
      provider: "google_maps",
      service: "maps_js_load_rides",
      route: "/make-server-37f42386/maps-config-rides",
      status: "success",
      httpStatus: 200,
      requests: 1,
    }).catch(() => { /* never break the primary call */ });
    return c.json({ apiKey: apiKey || "", timestamp: Date.now() });
  });

  /** Fleet address autocomplete — server Places (avoids browser referrer / Places JS failures). */
  app.get("/make-server-37f42386/places/autocomplete", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (q.length < 3) return c.json({ suggestions: [] });

    if (!isFleetPlacesConfigured()) {
      console.error("[fleet] places autocomplete: GOOGLE_MAPS_API_KEY not set");
      return c.json({ error: "places_not_configured", suggestions: [] }, 503);
    }

    try {
      const suggestions = await fleetAutocompletePlaces(q);
      logProviderCall({
        provider: "google_maps",
        service: "places_autocomplete",
        route: "/make-server-37f42386/places/autocomplete",
        status: "success",
        httpStatus: 200,
        requests: 1,
      }).catch(() => {});
      return c.json({ suggestions });
    } catch (e) {
      console.error("[fleet] places autocomplete:", e);
      return c.json({ error: "places_unavailable", suggestions: [] }, 502);
    }
  });

  app.get("/make-server-37f42386/places/:placeId/details", async (c) => {
    const placeId = (c.req.param("placeId") ?? "").trim();
    if (!placeId) return c.json({ error: "place_id_required" }, 400);

    if (!isFleetPlacesConfigured()) {
      return c.json({ error: "places_not_configured" }, 503);
    }

    try {
      const details = await fleetFetchPlaceDetails(placeId);
      if (!details) return c.json({ error: "place_not_found" }, 404);
      logProviderCall({
        provider: "google_maps",
        service: "places_details",
        route: "/make-server-37f42386/places/details",
        status: "success",
        httpStatus: 200,
        requests: 1,
      }).catch(() => {});
      return c.json(details);
    } catch (e) {
      console.error("[fleet] places details:", e);
      return c.json({ error: "places_unavailable" }, 502);
    }
  });

  // Audit Config Endpoints (configurable frequency threshold)
  app.get("/make-server-37f42386/audit-config", async (c) => {
    try {
      const config = await kv.get("config:audit_settings");
      return c.json(config || { frequencyThreshold: 3, efficiencyThreshold: 0.30 });
    } catch (e: any) {
      console.log(`[AuditConfig] GET error: ${e.message}`);
      return c.json({ error: e.message }, 500);
    }
  });

  app.post("/make-server-37f42386/audit-config", async (c) => {
    try {
      const body = await c.req.json();
      const existing = await kv.get("config:audit_settings") || {};
      const updated = { ...existing, ...body, updatedAt: new Date().toISOString() };
      await kv.set("config:audit_settings", updated);
      console.log(`[AuditConfig] Saved: ${JSON.stringify(updated)}`);
      return c.json({ success: true, data: updated });
    } catch (e: any) {
      console.log(`[AuditConfig] POST error: ${e.message}`);
      return c.json({ error: e.message }, 500);
    }
  });

}
