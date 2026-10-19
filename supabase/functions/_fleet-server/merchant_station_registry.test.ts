import { assertEquals } from "jsr:@std/assert";
import { matchUniqueVerifiedStation } from "./merchant_station_match.ts";
import { normalizeVendorName } from "./vendor_matcher.ts";

const fesco = {
  id: "9d72d4e7-369b-40eb-b730-e4f751c5640b",
  name: "FESCO Spanish Town Road",
  brand: "FESCO",
  status: "verified",
};

Deno.test("normalize FESCO OVAL name is stable for registry key", () => {
  const n = normalizeVendorName("FESCO OVAL SPANISH TOWN ROAD");
  assertEquals(n, "fesco oval spanish town road");
});

Deno.test("fuzzy alone may miss FESCO OVAL vs FESCO Spanish Town Road (registry covers this)", () => {
  const hit = matchUniqueVerifiedStation("FESCO OVAL SPANISH TOWN ROAD", [fesco], 0.88);
  // Historical score ~0.82 — expect null without registry; if fuzzy improves, hit must be FESCO
  if (hit) assertEquals(hit.station.id, fesco.id);
  else assertEquals(hit, null);
});
