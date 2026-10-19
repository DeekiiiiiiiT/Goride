import { assertEquals } from "jsr:@std/assert";
import { findMatchingStationSmart, NEAR_MISS_CANDIDATE_M } from "./geo_matcher.ts";

const fesco = {
  id: "9d72d4e7-369b-40eb-b730-e4f751c5640b",
  name: "FESCO Spanish Town Road",
  brand: "FESCO",
  address: "Spanish Town Road",
  status: "verified" as const,
  geofenceRadius: 75,
  location: { lat: 18.0103125, lng: -76.8375625 },
};

Deno.test("near-miss 397m from lone verified station: no match, candidate list includes it", () => {
  // Audit incident coords ~397 m from FESCO pin
  const lat = 18.0075033;
  const lng = -76.8352467;
  const result = findMatchingStationSmart(lat, lng, [fesco], 600, 2.4);
  assertEquals(result.confidence, "none");
  assertEquals(result.station, null);
  assertEquals((result.nearMissCandidates || []).length >= 1, true);
  const hit = (result.nearMissCandidates || []).find((c) => c.stationId === fesco.id);
  assertEquals(!!hit, true);
  assertEquals(hit!.distanceM > 75, true);
  assertEquals(hit!.distanceM <= NEAR_MISS_CANDIDATE_M, true);
  assertEquals(hit!.distanceM >= 350 && hit!.distanceM <= 450, true);
});
