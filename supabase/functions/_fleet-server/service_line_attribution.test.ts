/**
 * G16 service-line attribution tests.
 * Run: deno test --no-check supabase/functions/_fleet-server/service_line_attribution.test.ts
 */
/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  allocateSharedCostsByTripMix,
  applyServiceLineResolution,
  inferTripServiceLine,
  markCostRowUnattributedOnStampFailure,
  resolveFuelEntryServiceLine,
  setExplicitServiceLine,
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
  assertEquals(stamped.service_line_source, "trip");
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

Deno.test("resolveFuelEntryServiceLine T1 explicit is sticky", () => {
  const r = resolveFuelEntryServiceLine({
    existingLine: "rideshare",
    existingSource: "explicit",
    programServiceLine: "rush_delivery",
    vehicleServiceLines: ["rush_delivery"],
  });
  assertEquals(r.serviceLine, "rideshare");
  assertEquals(r.source, "explicit");
});

Deno.test("resolveFuelEntryServiceLine T0 program wins over vehicle", () => {
  const r = resolveFuelEntryServiceLine({
    programServiceLine: "rush_delivery",
    vehicleServiceLines: ["rideshare"],
  });
  assertEquals(r.serviceLine, "rush_delivery");
  assertEquals(r.source, "program");
});

Deno.test("resolveFuelEntryServiceLine T2 trip before vehicle", () => {
  const r = resolveFuelEntryServiceLine({
    tripServiceLine: "rush_delivery",
    vehicleServiceLines: ["rideshare"],
  });
  assertEquals(r.serviceLine, "rush_delivery");
  assertEquals(r.source, "trip");
});

Deno.test("resolveFuelEntryServiceLine T3 single vehicle line", () => {
  const r = resolveFuelEntryServiceLine({
    vehicleServiceLines: ["rideshare"],
  });
  assertEquals(r.serviceLine, "rideshare");
  assertEquals(r.source, "vehicle");
});

Deno.test("resolveFuelEntryServiceLine dual vehicle falls through to single driver (T4)", () => {
  const r = resolveFuelEntryServiceLine({
    vehicleServiceLines: ["rideshare", "rush_delivery"],
    driverServiceLines: ["rideshare"],
  });
  assertEquals(r.serviceLine, "rideshare");
  assertEquals(r.source, "driver");
});

Deno.test("resolveFuelEntryServiceLine T5 dual vehicle+driver → unattributed", () => {
  const r = resolveFuelEntryServiceLine({
    vehicleServiceLines: ["rideshare", "rush_delivery"],
    driverServiceLines: ["rideshare", "rush_delivery"],
  });
  assertEquals(r.serviceLine, null);
  assertEquals(r.source, "unattributed");
});

Deno.test("setExplicitServiceLine stamps provenance", () => {
  const record: Record<string, unknown> = { id: "f1" };
  setExplicitServiceLine(record, "rush_delivery", "user-1");
  assertEquals(record.service_line, "rush_delivery");
  assertEquals(record.service_line_source, "explicit");
  assertEquals(record.service_line_set_by, "user-1");
  assertEquals(typeof record.service_line_set_at, "string");
});

Deno.test("applyServiceLineResolution nulls line when unattributed", () => {
  const record: Record<string, unknown> = { id: "f1", service_line: "rideshare" };
  applyServiceLineResolution(record, { serviceLine: null, source: "unattributed" });
  assertEquals(record.service_line, null);
  assertEquals(record.service_line_source, "unattributed");
});

Deno.test("S4 stamp failure path stamps unattributed (not NULL source)", () => {
  const record: Record<string, unknown> = {
    id: "f-fail",
    amount: 42,
    service_line: "rideshare",
    metadata: {},
  };
  markCostRowUnattributedOnStampFailure(record);
  assertEquals(record.service_line, null);
  assertEquals(record.service_line_source, "unattributed");
  assertEquals(record.serviceLineSource, "unattributed");
});
