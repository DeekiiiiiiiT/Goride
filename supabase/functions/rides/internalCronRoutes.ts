/**
 * Internal cron routes for rides hygiene / active-ride reconciliation.
 * Extracted from rides/index.ts — secret-gated, same behavior.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { DispatchSettings } from "./fare/dispatchSettings.ts";

export type InternalCronRoutesDeps = {
  pubSvc: () => {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  logLine: (payload: Record<string, unknown>) => void;
  loadMatchingRideIds: () => Promise<string[]>;
  reconcileMatching: (rideId: string) => Promise<unknown>;
  loadDispatchSettingsForRides: () => Promise<DispatchSettings>;
  loadActiveRideIds: () => Promise<string[]>;
  loadRideRequestById: (rideId: string) => Promise<Record<string, unknown> | null>;
  audit: (
    rideId: string | null,
    actor: string | null | undefined,
    eventType: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  /** Already closed over transitionDeps — mirrors applyRideTransition(transitionDeps(), params). */
  cancelNoShowRide: (rideId: string) => Promise<{ ok: boolean; skipped?: boolean }>;
};

function requireCronSecret(c: {
  req: { header: (n: string) => string | undefined };
  json: (body: unknown, status?: number) => Response;
}): Response | null {
  const secret = Deno.env.get("RIDES_CRON_SECRET");
  const token = c.req.header("X-Rides-Cron-Secret") ?? "";
  if (!secret || token !== secret) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return null;
}

export function registerInternalCronRoutes(app: Hono, deps: InternalCronRoutesDeps) {
  app.post("/v1/internal/reconcile-matching", async (c) => {
    const denied = requireCronSecret(c);
    if (denied) return denied;

    let hygiene: Record<string, unknown> | null = null;
    const { data: hygieneData, error: hygieneErr } = await deps.pubSvc().rpc(
      "rides_run_matching_hygiene",
    );
    if (!hygieneErr && hygieneData) {
      hygiene = hygieneData as Record<string, unknown>;
    } else if (hygieneErr) {
      deps.logLine({ event: "matching_hygiene_rpc_skipped", error: hygieneErr.message });
    }

    const rideIds = await deps.loadMatchingRideIds();
    let processed = 0;
    for (const rideId of rideIds) {
      await deps.reconcileMatching(rideId);
      processed += 1;
    }

    deps.logLine({ event: "reconcile_matching_batch", processed, hygiene });
    return c.json({ ok: true, processed, hygiene });
  });

  app.post("/v1/internal/reconcile-active-rides", async (c) => {
    const denied = requireCronSecret(c);
    if (denied) return denied;

    const settings = await deps.loadDispatchSettingsForRides();
    const rideIds = await deps.loadActiveRideIds();
    let noShowCancelled = 0;
    let staleAlerts = 0;
    const nowMs = Date.now();

    for (const rideId of rideIds) {
      const ride = await deps.loadRideRequestById(rideId);
      if (!ride) continue;

      const lastLocMs = ride.last_driver_location_at
        ? Date.parse(String(ride.last_driver_location_at))
        : NaN;
      if (
        Number.isFinite(lastLocMs) &&
        nowMs - lastLocMs > 2 * 60 * 60 * 1000 &&
        ["driver_en_route_pickup", "driver_arrived_pickup", "on_trip"].includes(String(ride.status))
      ) {
        staleAlerts += 1;
        await deps.audit(rideId, null, "ride_stale_location_alert", {
          last_driver_location_at: ride.last_driver_location_at,
          status: ride.status,
        });
      }

      if (
        settings.no_show_auto_cancel_enabled &&
        ride.status === "driver_arrived_pickup" &&
        ride.arrived_pickup_at
      ) {
        const arrivedMs = Date.parse(String(ride.arrived_pickup_at));
        const waitMin = (nowMs - arrivedMs) / 60_000;
        if (waitMin >= settings.no_show_cancel_minutes) {
          const tr = await deps.cancelNoShowRide(rideId);
          if (tr.ok && !tr.skipped) noShowCancelled += 1;
        }
      }
    }

    deps.logLine({
      event: "reconcile_active_rides",
      rides: rideIds.length,
      noShowCancelled,
      staleAlerts,
    });
    return c.json({
      ok: true,
      rides: rideIds.length,
      no_show_cancelled: noShowCancelled,
      stale_alerts: staleAlerts,
    });
  });
}
