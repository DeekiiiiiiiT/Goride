/**
 * Parts sourcing rules. Run:
 * deno test supabase/functions/_fleet-server/parts_resolution.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  alsoKnownAsNumbers,
  buildFitMessage,
  classifyPartTier,
  engineFamilyRuleAllowed,
  latestSupersededPartId,
  ledgerAllowedAfterParts,
  MAINTENANCE_SAVE_ORDER,
  secondFleetBlocked,
  tieredSearchReady,
  partVisibleForComponent,
  usageWriteFailure,
} from "../../../packages/types/src/partsResolution.ts";
import { decodeFrameNumber } from "../../../packages/types/src/frameNumberDecode.ts";
import { repeatFailureAlerts } from "../../../packages/types/src/repeatPartFailure.ts";
import { parsePartsCatalogCsv } from "../../../packages/types/src/partsCatalogCsvImport.ts";

Deno.test("fitment matrix lands each part on the expected tier", () => {
  assertEquals(classifyPartTier({
    partKind: "oem",
    targetKind: "catalog_variant",
    manufacturer: "Toyota",
    vehicleMake: "Toyota",
  }), 1);
  assertEquals(classifyPartTier({
    partKind: "oem",
    targetKind: "platform",
    manufacturer: "Toyota",
    vehicleMake: "Daihatsu",
  }), 2);
  assertEquals(classifyPartTier({
    partKind: "oem",
    targetKind: "engine_family",
    manufacturer: "Toyota",
    vehicleMake: "Toyota",
  }), 1);
  assertEquals(classifyPartTier({
    partKind: "oem",
    targetKind: "engine_family",
    manufacturer: "Toyota",
    vehicleMake: "Nissan",
  }), 3);
  assertEquals(classifyPartTier({
    partKind: "aftermarket",
    targetKind: "engine_family",
    manufacturer: "Denso",
    vehicleMake: "Toyota",
  }), 4);
});

Deno.test("scope guard rejects an engine rule on a body group", () => {
  assertEquals(engineFamilyRuleAllowed("body"), false);
  assertEquals(engineFamilyRuleAllowed("chassis"), false);
  assertEquals(engineFamilyRuleAllowed("powertrain"), true);
  assertEquals(engineFamilyRuleAllowed("universal"), true);
});

Deno.test("category bridge matches the maintenance component, not the parts category", () => {
  const component = "component-1";
  const partsCategory = "category-9";
  assertEquals(partVisibleForComponent(component, component), true);
  assertEquals(partVisibleForComponent(partsCategory, component), false);
  assertEquals(partVisibleForComponent(component, undefined), true);
});

Deno.test("a failed usage write fails the save", () => {
  assertEquals(usageWriteFailure(null), null);
  assertEquals(usageWriteFailure({ message: "insert failed" }), "insert failed");
});

Deno.test("tiered search stays off until coverage is real", () => {
  assertEquals(tieredSearchReady(0), false);
  assertEquals(tieredSearchReady(59), false);
  assertEquals(tieredSearchReady(60), true);
});

Deno.test("a second fleet waits a week", () => {
  const week = 7 * 24 * 60 * 60 * 1000;
  const start = Date.parse("2026-10-01T00:00:00.000Z");
  assertEquals(secondFleetBlocked([], {}, "fleet-b", start), false);
  assertEquals(secondFleetBlocked(["fleet-a"], { "fleet-a": "2026-10-01T00:00:00.000Z" }, "fleet-a", start + week), false);
  assertEquals(secondFleetBlocked(["fleet-a"], { "fleet-a": "2026-10-01T00:00:00.000Z" }, "fleet-b", start + week - 1), true);
  assertEquals(secondFleetBlocked(["fleet-a"], { "fleet-a": "2026-10-01T00:00:00.000Z" }, "fleet-b", start + week), false);
  assertEquals(secondFleetBlocked(["fleet-a"], {}, "fleet-b", start + week), true);
});

Deno.test("a failed usage write never reaches the service record or the ledger", () => {
  const usageAt = MAINTENANCE_SAVE_ORDER.indexOf("parts_usage");
  const recordAt = MAINTENANCE_SAVE_ORDER.indexOf("service_record");
  const ledgerAt = MAINTENANCE_SAVE_ORDER.indexOf("ledger");
  assertEquals(usageAt < recordAt && usageAt < ledgerAt, true);
  assertEquals(ledgerAllowedAfterParts({ needsUsage: true, usageCommitted: false }), false);
  assertEquals(ledgerAllowedAfterParts({ needsUsage: true, usageCommitted: true }), true);
  assertEquals(ledgerAllowedAfterParts({ needsUsage: false, usageCommitted: false }), true);
});

Deno.test("superseded number is listed as also known as", () => {
  const links = [{ oldPartId: "old", newPartId: "new" }];
  assertEquals(latestSupersededPartId("old", links), "new");
  assertEquals(alsoKnownAsNumbers("new", links, { old: "89467-B1040", new: "89467-B1041" }), ["89467-B1040"]);
});

Deno.test("sister body parts do not claim a guaranteed fit", () => {
  const message = buildFitMessage({
    tier: 2,
    fitScope: "body",
    sisterNames: "Daihatsu Thor",
    sourceMake: null,
    manufacturer: "Toyota",
    referenceOem: "123",
    confirmedInstalls: 0,
  });
  assertEquals(message.matchReason.includes("check trim"), true);
  assertEquals(message.confirmedFit, false);
});

Deno.test("frame number ZRR80-0123456 decodes to the chassis prefix", () => {
  const row = decodeFrameNumber("ZRR80-0123456");
  assertEquals(row.chassisPrefix, "ZRR80");
  assertEquals(row.kind, "jdm_frame");
  assertEquals(decodeFrameNumber("DBA-M900A-GBME").chassisPrefix, "M900A");
});

Deno.test("two replacements inside the window create one alert", () => {
  const alerts = repeatFailureAlerts([
    { vehicleId: "v1", componentId: "pads", odometer: 1000, at: "2026-01-01" },
    { vehicleId: "v1", componentId: "pads", odometer: 4000, at: "2026-02-01" },
    { vehicleId: "v1", componentId: "pads", odometer: 7000, at: "2026-03-01" },
  ]);
  assertEquals(alerts.filter((a) => a.kind === "component").length, 1);
});

Deno.test("csv rejects an engine rule for a body part", () => {
  const parsed = parsePartsCatalogCsv(
    "interchange_code,part_number,fit_scope,target_kind,target_code\nIC-1,123,body,engine_family,1NZ-FE\n",
  );
  assertEquals(parsed.rows.length, 0);
  assertEquals(parsed.errors.length, 1);
});
