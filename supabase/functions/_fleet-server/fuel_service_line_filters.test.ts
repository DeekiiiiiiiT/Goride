/**
 * R3 — buildFuelEntryServiceLineFilters parity tests.
 * Run: deno test --no-check supabase/functions/_fleet-server/fuel_service_line_filters.test.ts
 */
/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildFuelEntryServiceLineFilters } from "./fuel_service_line_filters.ts";

Deno.test("all / empty → no filters", () => {
  assertEquals(buildFuelEntryServiceLineFilters(""), []);
  assertEquals(buildFuelEntryServiceLineFilters("all"), []);
  assertEquals(buildFuelEntryServiceLineFilters("  "), []);
});

Deno.test("rideshare excludes unattributed source", () => {
  assertEquals(buildFuelEntryServiceLineFilters("rideshare"), [
    { op: "eq", col: "service_line", value: "rideshare" },
    {
      op: "or",
      value: "service_line_source.is.null,service_line_source.neq.unattributed",
    },
  ]);
});

Deno.test("rush_delivery excludes unattributed source", () => {
  assertEquals(buildFuelEntryServiceLineFilters("RUSH_DELIVERY"), [
    { op: "eq", col: "service_line", value: "rush_delivery" },
    {
      op: "or",
      value: "service_line_source.is.null,service_line_source.neq.unattributed",
    },
  ]);
});

Deno.test("unattributed is null line OR source unattributed", () => {
  assertEquals(buildFuelEntryServiceLineFilters("unattributed"), [
    {
      op: "or",
      value: "service_line.is.null,service_line_source.eq.unattributed",
    },
  ]);
});
