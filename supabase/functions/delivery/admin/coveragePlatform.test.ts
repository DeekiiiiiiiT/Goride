/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildReadinessChecks } from "./coveragePlatform.ts";

const published = [{
  kind: "include",
  polygon: [
    { lat: 18, lng: -77 },
    { lat: 18, lng: -76.9 },
    { lat: 18.1, lng: -76.9 },
  ],
}];

function checks(extra: Partial<Parameters<typeof buildReadinessChecks>[0]> = {}) {
  return buildReadinessChecks({
    publishedZones: published,
    draftDirty: false,
    merchantCount: 2,
    courierCount: 4,
    merchantsMin: 0,
    couriersMin: 0,
    couriersConfirmed: true,
    borderAreaSqKm: 12,
    borderReviewed: false,
    splitBorder: false,
    splitBorderOk: true,
    ...extra,
  });
}

Deno.test("a town with no local store cannot go live", () => {
  const result = checks({ merchantCount: 0 });
  const merchants = result.checks.find((c) => c.id === "merchants_ready");
  assertEquals(merchants?.ok, false);
  assertEquals(result.ready, false);
});

Deno.test("a border under 50 km does not ask for a review", () => {
  const result = checks({ borderAreaSqKm: 12 });
  assertEquals(result.checks.some((c) => c.id === "border_reviewed"), false);
});

Deno.test("a wide border stays off until it is reviewed", () => {
  const blocked = checks({ borderAreaSqKm: 102.7, borderReviewed: false });
  assertEquals(blocked.checks.find((c) => c.id === "border_reviewed")?.ok, false);
  const allowed = checks({ borderAreaSqKm: 102.7, borderReviewed: true });
  assertEquals(allowed.checks.find((c) => c.id === "border_reviewed")?.ok, true);
});

Deno.test("a split border stays off when the short ring still covers an extra piece", () => {
  const result = checks({
    splitBorder: true,
    splitBorderOk: false,
    splitBorderDetail: "Coverage is still using the short border. This town stays off.",
  });
  const gate = result.checks.find((c) => c.id === "split_border_coverage");
  assertEquals(gate?.ok, false);
  assertEquals(result.ready, false);
});

Deno.test("couriers must be confirmed even when the island has riders", () => {
  const result = checks({ couriersConfirmed: false, courierCount: 12 });
  assertEquals(result.checks.find((c) => c.id === "couriers_confirmed")?.ok, false);
});
