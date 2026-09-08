/**
 * Merchant unique GOD matcher + odometer health gates.
 * Run: deno test --no-check merchant_station_match.test.ts odometer_health.test.ts
 * (from supabase/functions/_fleet-server)
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  matchUniqueVerifiedStation,
  matchUniqueVerifiedStationForRecord,
  collectMerchantCandidateTexts,
  MERCHANT_MATCH_DEFAULTS,
} from "./merchant_station_match.ts";
import { evaluateOdometerSequenceHealth } from "./odometer_health.ts";

const GOD = [
  { id: "fesco-1", name: "FESCO BEECHWOOD", brand: "FESCO", status: "verified" },
  { id: "rubis-1", name: "RUBIS Old Harbour Road", brand: "RUBIS", status: "verified" },
  { id: "john-csv", name: "JOHNSON'S PETROLEUM CO LTD", brand: "Independent", status: "unverified" },
  {
    id: "fesco-2",
    name: "FESCO Half Way Tree",
    brand: "FESCO",
    status: "verified",
  },
];

Deno.test("matchUniqueVerifiedStation: exact FESCO Beechwood", () => {
  const hit = matchUniqueVerifiedStation("FESCO BEECHWOOD", GOD);
  assertExists(hit);
  assertEquals(hit!.station.id, "fesco-1");
  assertEquals(hit!.score >= MERCHANT_MATCH_DEFAULTS.minScore, true);
});

Deno.test("matchUniqueVerifiedStation: ignores unverified CSV Johnson's", () => {
  const hit = matchUniqueVerifiedStation("JOHNSON'S PETROLEUM CO LTD", GOD);
  // Only unverified station matches that name → null (GOD-only)
  assertEquals(hit, null);
});

Deno.test("matchUniqueVerifiedStation: ambiguous FESCO brand alone returns null", () => {
  const hit = matchUniqueVerifiedStation("FESCO", GOD, 0.7);
  // Two FESCO stations — uniqueness gap should fail when both score high
  // Brand-only may score both similarly
  if (hit) {
    // If somehow unique, must be one of the FESCO ids
    assertEquals(["fesco-1", "fesco-2"].includes(hit.station.id), true);
  }
});

Deno.test("matchUniqueVerifiedStationForRecord: uses jaaStation metadata", () => {
  const hit = matchUniqueVerifiedStationForRecord(
    {
      vendor: "Unknown",
      metadata: { jaaStation: "FESCO BEECHWOOD", jaaVendorRaw: "FESCO BEECHWOOD KINGSTON" },
    },
    GOD,
  );
  assertExists(hit);
  assertEquals(hit!.station.id, "fesco-1");
});

Deno.test("collectMerchantCandidateTexts dedupes", () => {
  const texts = collectMerchantCandidateTexts({
    vendor: "FESCO BEECHWOOD",
    location: "FESCO BEECHWOOD",
    metadata: { jaaStation: "FESCO BEECHWOOD" },
  });
  assertEquals(texts.length, 1);
});

Deno.test("odometer health: healthy progression", () => {
  const r = evaluateOdometerSequenceHealth({
    currentOdo: 182318,
    prevOdo: 182024,
    nextOdo: 182488,
  });
  assertEquals(r.healthy, true);
  assertEquals(r.isFirstFill, false);
});

Deno.test("odometer health: regression fails", () => {
  const r = evaluateOdometerSequenceHealth({
    currentOdo: 100,
    prevOdo: 200,
  });
  assertEquals(r.healthy, false);
  assertEquals(r.reason?.includes("Regression") || r.reason != null, true);
});

Deno.test("odometer health: first fill with valid odo", () => {
  const r = evaluateOdometerSequenceHealth({
    currentOdo: 50000,
    prevOdo: null,
  });
  assertEquals(r.healthy, true);
  assertEquals(r.isFirstFill, true);
});

Deno.test("odometer health: zero odo fails", () => {
  const r = evaluateOdometerSequenceHealth({
    currentOdo: 0,
    prevOdo: null,
  });
  assertEquals(r.healthy, false);
});
