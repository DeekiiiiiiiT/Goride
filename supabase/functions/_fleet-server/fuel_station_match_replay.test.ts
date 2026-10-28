/**
 * Replay every real GPS fill against the live fuel places.
 * gps_smart_matching and gps_handshake must land on the stored station.
 * The seven that do not are named below, with why.
 */
import { assertEquals } from "jsr:@std/assert";
import { findMatchingStationSmart } from "./geo_matcher.ts";
import { fuelStationFromNearbyRow } from "./fuel_station_match.ts";

type Fill = {
  id: string;
  lat: number;
  lng: number;
  accuracy: number;
  matchedStationId: string;
  verificationMethod: string | null;
};
type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
  pin: string;
  geofence: number;
  aliases: { lat: number; lng: number }[];
};
type Exception = { id: string; reason: "alias" | "near_miss" | "admin_move" };

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./fixtures/gps-fill-replay.json", import.meta.url)),
) as { fills: Fill[]; places: Place[]; exceptions: Exception[] };

const pool = fixture.places.map((place) => fuelStationFromNearbyRow({
  id: place.id,
  name: place.name,
  status: place.status,
  lat: place.lat,
  lng: place.lng,
  pin_state: place.pin,
  effective_geofence_m: place.geofence,
}, place.aliases || []));

const exceptions = new Map(fixture.exceptions.map((row) => [row.id, row.reason]));
const watched = new Set(["gps_smart_matching", "gps_handshake"]);

function replay(fill: Fill) {
  const accuracy = Math.min(Math.max(Number(fill.accuracy) || 0, 0), 500);
  return findMatchingStationSmart(fill.lat, fill.lng, pool as never, 600, accuracy);
}

Deno.test("real GPS fills replay onto the stored station", () => {
  const watchedFills = fixture.fills.filter((fill) => watched.has(String(fill.verificationMethod || "")));
  assertEquals(watchedFills.length > 200, true);
  const surprises: string[] = [];
  for (const fill of watchedFills) {
    const got = replay(fill).station?.id ?? null;
    const reason = exceptions.get(fill.id);
    if (reason) {
      if (got === fill.matchedStationId) {
        surprises.push(`${fill.id} is listed as ${reason} but now matches`);
      }
      continue;
    }
    if (got !== fill.matchedStationId) {
      surprises.push(`${fill.id} stored ${fill.matchedStationId} got ${got ?? "none"}`);
    }
  }
  assertEquals(surprises, []);
});

Deno.test("every replay exception names a known reason", () => {
  const ids = new Set(fixture.fills.map((fill) => fill.id));
  for (const row of fixture.exceptions) {
    assertEquals(ids.has(row.id), true);
    assertEquals(["alias", "near_miss", "admin_move"].includes(row.reason), true);
    const fill = fixture.fills.find((item) => item.id === row.id)!;
    assertEquals(watched.has(String(fill.verificationMethod || "")), true);
    assertEquals(replay(fill).station?.id === fill.matchedStationId, false);
  }
});
