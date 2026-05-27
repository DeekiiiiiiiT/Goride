import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyRideTransition,
  type ApplyTransitionDeps,
  type RideStatus,
} from "./rideLifecycle.ts";

function mockDeps(ride: Record<string, unknown>, patchFn?: (id: string, patch: Record<string, unknown>) => Promise<boolean>): ApplyTransitionDeps {
  let current = { ...ride };
  return {
    loadRideRequestById: async () => current,
    patchRideRequest: patchFn ?? (async (_id, patch) => {
      current = { ...current, ...patch };
      return true;
    }),
    handleTerminalRideLedgerAndSync: async () => {},
    bumpSurgeDemand: async () => {},
    audit: async () => {},
    cleanupLiveState: async () => {},
  };
}

Deno.test("applyRideTransition rejects invalid transition", async () => {
  const deps = mockDeps({ id: "r1", status: "matching", pickup_lat: 18, pickup_lng: -77 });
  const result = await applyRideTransition(deps, {
    rideId: "r1",
    next: "on_trip",
    actorUserId: "d1",
    source: "manual",
  });
  assertEquals(result.ok, false);
  assertEquals(result.error, "invalid_transition");
});

Deno.test("applyRideTransition is idempotent when already in target state", async () => {
  const deps = mockDeps({
    id: "r1",
    status: "driver_arrived_pickup",
    pickup_lat: 18,
    pickup_lng: -77,
    fare_estimate_minor: 1000,
  });
  const result = await applyRideTransition(deps, {
    rideId: "r1",
    next: "driver_arrived_pickup",
    actorUserId: "d1",
    source: "geofence",
  });
  assertEquals(result.ok, true);
  assertEquals(result.skipped, true);
});

Deno.test("applyRideTransition sets lifecycle timestamps", async () => {
  let patched: Record<string, unknown> = {};
  const deps = mockDeps(
    {
      id: "r1",
      status: "driver_assigned",
      pickup_lat: 18,
      pickup_lng: -77,
      fare_estimate_minor: 500,
    },
    async (_id, patch) => {
      patched = patch;
      return true;
    },
  );
  const result = await applyRideTransition(deps, {
    rideId: "r1",
    next: "driver_en_route_pickup",
    actorUserId: "d1",
    source: "system",
  });
  assertEquals(result.ok, true);
  assertEquals(typeof patched.en_route_at, "string");
});

Deno.test("applyRideTransition respects expectedFrom guard", async () => {
  const deps = mockDeps({ id: "r1", status: "on_trip", pickup_lat: 18, pickup_lng: -77, fare_estimate_minor: 500 });
  const result = await applyRideTransition(deps, {
    rideId: "r1",
    next: "completed",
    actorUserId: "d1",
    source: "geofence",
    expectedFrom: "driver_en_route_pickup" as RideStatus,
  });
  assertEquals(result.ok, false);
  assertEquals(result.error, "status_changed");
});
