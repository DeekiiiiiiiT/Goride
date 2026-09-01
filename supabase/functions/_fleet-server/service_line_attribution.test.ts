/**
 * G16 service-line attribution tests.
 * Run: deno test --no-check service_line_attribution.test.ts
 */
/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  allocateSharedCostsByTripMix,
  inferTripServiceLine,
  stampServiceLineFromTripLink,
} from "./service_line_attribution.ts";

Deno.test("inferTripServiceLine prefers explicit rush_delivery", () => {
  assertEquals(inferTripServiceLine({ service_line: "rush_delivery" }), "rush_delivery");
  assertEquals(inferTripServiceLine({ platform: "Roam Rush" }), "rush_delivery");
  assertEquals(inferTripServiceLine({ platform: "Uber" }), "rideshare");
});

Deno.test("stampServiceLineFromTripLink copies line from trip", async () => {
  const record: Record<string, unknown> = { id: "fuel-1", metadata: {} };
  const stamped = await stampServiceLineFromTripLink(record, {
    trip: { id: "t1", service_line: "rush_delivery" },
  });
  assertEquals(stamped.service_line, "rush_delivery");
});

Deno.test("allocateSharedCostsByTripMix splits by trip count", () => {
  const trips = [
    { date: "2026-03-02", service_line: "rideshare", status: "completed" },
    { date: "2026-03-03", service_line: "rideshare", status: "completed" },
    { date: "2026-03-04", service_line: "rush_delivery", status: "completed" },
  ];
  const mix = allocateSharedCostsByTripMix(
    trips,
    "2026-03-02",
    "2026-03-08",
    (t) => String(t.date || "").slice(0, 10),
  );
  assertEquals(mix.rideshareTrips, 2);
  assertEquals(mix.rushDeliveryTrips, 1);
  assertEquals(mix.ratio.rideshare, 2 / 3);
  assertEquals(mix.ratio.rush_delivery, 1 / 3);
});
