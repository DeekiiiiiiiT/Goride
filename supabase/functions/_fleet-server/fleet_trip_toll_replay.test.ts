import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectFleetTripTollCrossings,
  normalizeFleetRoutePoints,
} from "./fleet_trip_toll_replay.ts";
import type { TollPlazaGeo } from "../_shared/tollGeofenceCore.ts";

const PLAZA: TollPlazaGeo = {
  id: "portmore",
  name: "Portmore",
  location: { lat: 18.0, lng: -76.8 },
  geofenceRadius: 200,
  defaultRateMinor: 36000,
  currency: "JMD",
  verificationStatus: "verified",
  direction: "Eastbound",
};

Deno.test("normalizeFleetRoutePoints accepts lon or lng", () => {
  const { points } = normalizeFleetRoutePoints([
    { lat: 18, lon: -76.8 },
    { lat: 18.01, lng: -76.79 },
  ]);
  assertEquals(points.length, 2);
  assertEquals(points[0].lng, -76.8);
});

Deno.test("fleet post-trip replay detects segment crossing on saved route", () => {
  const west = { lat: 18.0, lon: -76.8023, timestamp: 1_000 };
  const east = { lat: 18.0, lon: -76.7977, timestamp: 20_000 };
  const hits = detectFleetTripTollCrossings(
    { id: "trip-1", route: [west, east], driverId: "d1", vehicleId: "v1" },
    [PLAZA],
  );
  assertEquals(hits.length, 1);
  assertEquals(hits[0].plazaId, "portmore");
});

Deno.test("fleet replay skips unverified plazas", () => {
  const unverified = { ...PLAZA, verificationStatus: "unverified" as const };
  const west = { lat: 18.0, lon: -76.8023 };
  const east = { lat: 18.0, lon: -76.7977 };
  const hits = detectFleetTripTollCrossings(
    { id: "trip-1", route: [west, east] },
    [unverified],
  );
  assertEquals(hits.length, 0);
});

Deno.test("fleet replay returns empty when route too short", () => {
  const hits = detectFleetTripTollCrossings(
    { id: "trip-1", route: [{ lat: 18, lon: -76.8 }] },
    [PLAZA],
  );
  assertEquals(hits.length, 0);
});
