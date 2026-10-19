/**
 * Alias upsert guards + re-heal merchant text matching (O4 / O6).
 * Run: deno test --allow-read --allow-env station_merchant_aliases.test.ts
 */
import { assertEquals } from "jsr:@std/assert";
import {
  entryMatchesAliasNormalizedName,
  entryNeedsAliasReheal,
  escapeIlike,
  resolveAliasUpsertAction,
} from "./station_merchant_aliases.ts";
import { normalizeVendorName } from "./vendor_matcher.ts";

Deno.test("O4: heal_auto cannot overwrite seed station_id", () => {
  const decision = resolveAliasUpsertAction(
    { station_id: "station-seed", source: "seed" },
    { stationId: "station-other", source: "heal_auto" },
  );
  assertEquals(decision.action, "skip");
});

Deno.test("Rev6: admin_link may overwrite seed station_id", () => {
  const decision = resolveAliasUpsertAction(
    { station_id: "god-super-lube-service-centre", source: "seed" },
    { stationId: "8cbe8d0e-06a7-471b-b19b-39435cfbd331", source: "admin_link" },
  );
  assertEquals(decision.action, "update");
});

Deno.test("Rev6: admin_link upgrades seed→admin_link on same station", () => {
  const decision = resolveAliasUpsertAction(
    { station_id: "st-1", source: "seed" },
    { stationId: "st-1", source: "admin_link" },
  );
  assertEquals(decision.action, "update");
});

Deno.test("Rev6: entryNeedsAliasReheal re-points wrong jaa_match_merchant_heal", () => {
  assertEquals(
    entryNeedsAliasReheal(
      {
        matchedStationId: "god-super-lube-service-centre",
        metadata: {
          locationStatus: "verified",
          verificationMethod: "jaa_match_merchant_heal",
          matchedStationId: "god-super-lube-service-centre",
        },
      },
      "8cbe8d0e-06a7-471b-b19b-39435cfbd331",
    ),
    true,
  );
  assertEquals(
    entryNeedsAliasReheal(
      {
        matchedStationId: "8cbe8d0e-06a7-471b-b19b-39435cfbd331",
        metadata: {
          locationStatus: "verified",
          verificationMethod: "jaa_match_merchant_heal",
        },
      },
      "8cbe8d0e-06a7-471b-b19b-39435cfbd331",
    ),
    false,
  );
});

Deno.test("O4: heal_auto cannot overwrite admin_link station_id", () => {
  const decision = resolveAliasUpsertAction(
    { station_id: "station-admin", source: "admin_link" },
    { stationId: "station-other", source: "heal_auto" },
  );
  assertEquals(decision.action, "skip");
});

Deno.test("O4: same station is noop", () => {
  const decision = resolveAliasUpsertAction(
    { station_id: "station-a", source: "seed" },
    { stationId: "station-a", source: "heal_auto" },
  );
  assertEquals(decision.action, "noop");
});

Deno.test("O4: admin_link may re-point heal_auto", () => {
  const decision = resolveAliasUpsertAction(
    { station_id: "station-old", source: "heal_auto" },
    { stationId: "station-new", source: "admin_link" },
  );
  assertEquals(decision.action, "update");
});

Deno.test("O4: insert when no existing row", () => {
  const decision = resolveAliasUpsertAction(null, {
    stationId: "station-a",
    source: "heal_auto",
  });
  assertEquals(decision.action, "insert");
});

Deno.test("O6: driver row with name only in location matches alias", () => {
  const raw = "FESCO OVAL SPANISH TOWN ROAD";
  const normalized = normalizeVendorName(raw);
  const driverEntry = {
    id: "drv-1",
    location: raw,
    vendor: "Unknown Vendor",
    metadata: { locationStatus: "unknown" },
  };
  assertEquals(entryMatchesAliasNormalizedName(driverEntry, normalized), true);
});

Deno.test("O6: unrelated location does not match", () => {
  const normalized = normalizeVendorName("FESCO OVAL SPANISH TOWN ROAD");
  const driverEntry = {
    id: "drv-2",
    location: "TEXACO Half Way Tree",
    metadata: {},
  };
  assertEquals(entryMatchesAliasNormalizedName(driverEntry, normalized), false);
});

Deno.test("escapeIlike escapes parentheses and dots for PostgREST or()", () => {
  const escaped = escapeIlike("ALWIL COMPANY LTD (FESCO)");
  assertEquals(escaped, "ALWIL COMPANY LTD \\(FESCO\\)");
  const withDot = escapeIlike("RUBIS WATERLANE ST.");
  assertEquals(withDot, "RUBIS WATERLANE ST\\.");
  assertEquals(escapeIlike("A,B").includes(","), false);
});
