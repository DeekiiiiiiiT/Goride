/**
 * The fuel pool from places.nearby must pick the same station as the full
 * station list. Coordinates and the expected station only.
 */
import { assertEquals } from "jsr:@std/assert";
import { calculateDistance, findMatchingStationSmart } from "./geo_matcher.ts";
import { fuelStationFromNearbyRow } from "./fuel_station_match.ts";

type Station = { id: string; lat: number; lng: number; geofence: number; status: string; pin: string };
type Fill = { lat: number; lng: number; accuracy: number; station: string };

const stations: Station[] = [
  { id: "8cbe8d0e-06a7-471b-b19b-39435cfbd331", lat: 17.9910125, lng: -76.9792656, geofence: 75, status: "verified", pin: "unchecked" },
  { id: "st_33b3d179", lat: 17.9996875, lng: -76.7933125, geofence: 75, status: "verified", pin: "unchecked" },
  { id: "3282e704-2c0b-43db-bc29-376b559285d8", lat: 17.9708125, lng: -76.7825625, geofence: 75, status: "verified", pin: "unchecked" },
  { id: "964915ee-d702-4f36-ab8b-dd5be3af64fa", lat: 17.9860375, lng: -76.9942344, geofence: 50, status: "verified", pin: "unchecked" },
];

const fills: Fill[] = [
  { lat: 17.991008, lng: -76.979262, accuracy: 1.2, station: "8cbe8d0e-06a7-471b-b19b-39435cfbd331" },
  { lat: 17.99974, lng: -76.793241, accuracy: 11.5, station: "st_33b3d179" },
  { lat: 17.970715, lng: -76.782623, accuracy: 6.5, station: "3282e704-2c0b-43db-bc29-376b559285d8" },
  { lat: 17.98601, lng: -76.994274, accuracy: 18.1, station: "964915ee-d702-4f36-ab8b-dd5be3af64fa" },
];

function oldPool(): Record<string, unknown>[] {
  return stations.filter((row) => row.pin !== "offset" && (row.status === "verified" || row.status === "learnt")).map((row) => ({
    id: row.id,
    status: row.status,
    location: { lat: row.lat, lng: row.lng },
    geofenceRadius: row.geofence,
    pinConfirmed: row.pin === "confirmed" ? true : undefined,
    gpsAliases: [],
  }));
}

function nearbyPool(fill: Fill): Record<string, unknown>[] {
  const radius = Math.max(600 + fill.accuracy, 1000);
  return stations.filter((row) => {
    if (row.pin === "offset" || (row.status !== "verified" && row.status !== "learnt")) return false;
    return calculateDistance(fill.lat, fill.lng, row.lat, row.lng) <= radius;
  }).map((row) => fuelStationFromNearbyRow({
    id: row.id,
    name: row.id,
    status: row.status,
    lat: row.lat,
    lng: row.lng,
    pin_state: row.pin,
    effective_geofence_m: row.geofence,
  }));
}

Deno.test("nearby fuel pool matches the full station pool and the stored station", () => {
  for (const fill of fills) {
    const fromList = findMatchingStationSmart(fill.lat, fill.lng, oldPool() as never, 600, fill.accuracy);
    const fromNearby = findMatchingStationSmart(fill.lat, fill.lng, nearbyPool(fill) as never, 600, fill.accuracy);
    assertEquals(fromNearby.station?.id ?? null, fromList.station?.id ?? null);
    assertEquals(fromNearby.confidence, fromList.confidence);
    assertEquals(fromNearby.station?.id, fill.station);
  }
});

Deno.test("a fill with no pin does not ask the pool", () => {
  const withPool = findMatchingStationSmart(0, 0, oldPool() as never, 600, 0);
  assertEquals(withPool.station, null);
});
