import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateGeofenceTransitions } from "./rideGeofence.ts";
import type { ApplyTransitionDeps } from "./rideLifecycle.ts";
import type { DispatchSettings } from "./fare/dispatchSettings.ts";

const defaultSettings: DispatchSettings = {
  max_match_waves: 3,
  wave_radius_km: [5, 15, 35],
  max_offers_per_wave: 5,
  default_driver_offer_timeout_seconds: 30,
  driver_location_max_age_minutes: 5,
  quote_driver_radius_km: 10,
  body_type_filtering_enabled: true,
  body_type_tier_mode: "expand",
  require_body_type_for_offers: false,
  independent_only_matching: true,
  trip_location_interval_seconds: 4,
  pickup_geofence_radius_m: 80,
  dropoff_geofence_radius_m: 100,
  arrival_dwell_seconds: 15,
  max_speed_mps_for_arrival: 4,
  auto_en_route_on_accept: true,
  auto_arrive_enabled: true,
  auto_complete_suggest_enabled: true,
  no_show_cancel_minutes: 5,
  gps_max_accuracy_m_for_arrival: 50,
  no_show_auto_cancel_enabled: false,
  max_matching_duration_minutes: 15,
};

function mockDb(liveState: Record<string, unknown> = {}) {
  const state = { ...liveState };
  return {
    from: (_table: string) => ({
      select: () => ({
        eq: (_col: string, rideId: string) => ({
          maybeSingle: async () => ({
            data: Object.keys(state).length ? { ride_request_id: rideId, ...state } : null,
          }),
        }),
      }),
      upsert: async (row: Record<string, unknown>) => {
        Object.assign(state, row);
        return { error: null };
      },
      delete: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  } as unknown as import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient;
}

function mockDeps(): ApplyTransitionDeps & { transitions: string[] } {
  const transitions: string[] = [];
  let ride: Record<string, unknown> = {
    id: "ride-1",
    status: "driver_en_route_pickup",
    pickup_lat: 18.0179,
    pickup_lng: -76.8099,
    dropoff_lat: 18.05,
    dropoff_lng: -76.78,
    fare_estimate_minor: 1000,
  };
  const deps: ApplyTransitionDeps & { transitions: string[] } = {
    transitions,
    loadRideRequestById: async () => ride,
    patchRideRequest: async (_id, patch) => {
      ride = { ...ride, ...patch };
      return true;
    },
    handleTerminalRideLedgerAndSync: async () => {},
    bumpSurgeDemand: async () => {},
    audit: async () => {},
    cleanupLiveState: async () => {},
  };
  return deps;
}

Deno.test("geofence: rejects arrive when accuracy too poor", async () => {
  const db = mockDb();
  const deps = mockDeps();
  const ride = {
    id: "ride-1",
    status: "driver_en_route_pickup",
    pickup_lat: 18.0179,
    pickup_lng: -76.8099,
    dropoff_lat: 18.05,
    dropoff_lng: -76.78,
  };
  const result = await evaluateGeofenceTransitions(
    db,
    deps,
    defaultSettings,
    ride,
    {
      lat: 18.0179,
      lng: -76.8099,
      accuracyM: 200,
      speedMps: 0,
      recordedAt: new Date().toISOString(),
    },
    "driver-1",
  );
  assertEquals(result.transitionApplied, undefined);
});

Deno.test("geofence: arrive after dwell inside pickup", async () => {
  const dwellStart = new Date(Date.now() - 20_000).toISOString();
  const db = mockDb({ pickup_dwell_started_at: dwellStart });
  const deps = mockDeps();
  const ride = {
    id: "ride-1",
    status: "driver_en_route_pickup",
    pickup_lat: 18.0179,
    pickup_lng: -76.8099,
    dropoff_lat: 18.05,
    dropoff_lng: -76.78,
    fare_estimate_minor: 1000,
  };
  const result = await evaluateGeofenceTransitions(
    db,
    deps,
    defaultSettings,
    ride,
    {
      lat: 18.0179,
      lng: -76.8099,
      accuracyM: 10,
      speedMps: 0,
      recordedAt: new Date().toISOString(),
    },
    "driver-1",
  );
  assertEquals(result.transitionApplied, "driver_arrived_pickup");
});

Deno.test("geofence: exiting pickup resets dwell (no arrive)", async () => {
  const dwellStart = new Date(Date.now() - 20_000).toISOString();
  const db = mockDb({ pickup_dwell_started_at: dwellStart });
  const deps = mockDeps();
  const ride = {
    id: "ride-1",
    status: "driver_en_route_pickup",
    pickup_lat: 18.0179,
    pickup_lng: -76.8099,
    dropoff_lat: 18.05,
    dropoff_lng: -76.78,
    fare_estimate_minor: 1000,
  };
  const result = await evaluateGeofenceTransitions(
    db,
    deps,
    defaultSettings,
    ride,
    {
      lat: 18.05,
      lng: -76.78,
      accuracyM: 10,
      speedMps: 0,
      recordedAt: new Date().toISOString(),
    },
    "driver-1",
  );
  assertEquals(result.transitionApplied, undefined);
});

Deno.test("geofence: idempotent when already arrived", async () => {
  const deps = mockDeps();
  deps.loadRideRequestById = async () => ({
    id: "ride-1",
    status: "driver_arrived_pickup",
    pickup_lat: 18.0179,
    pickup_lng: -76.8099,
    dropoff_lat: 18.05,
    dropoff_lng: -76.78,
    fare_estimate_minor: 1000,
  });
  const db = mockDb();
  const ride = await deps.loadRideRequestById("ride-1");
  const result = await evaluateGeofenceTransitions(
    db,
    deps,
    defaultSettings,
    ride!,
    {
      lat: 18.0179,
      lng: -76.8099,
      accuracyM: 10,
      speedMps: 0,
      recordedAt: new Date().toISOString(),
    },
    "driver-1",
  );
  assertEquals(result.transitionApplied, undefined);
});
