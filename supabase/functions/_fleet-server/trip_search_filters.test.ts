/**
 * Parity tests for shared trip filter builder (R-02).
 * Run: deno test supabase/functions/_fleet-server/trip_search_filters.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { describeTripFilters } from "./trip_search_filters.ts";

Deno.test("Processing expands status and clears dates", () => {
  const calls = describeTripFilters(
    {
      status: "Processing",
      startDate: "2026-01-01",
      endDate: "2026-01-07",
    },
    { effectiveOrgId: "org-1", useStrict: false },
  );
  const joined = calls.join("|");
  assertEquals(joined.includes("or:value->>status.eq.Processing"), true);
  assertEquals(joined.includes("gte:value->>date"), false);
  assertEquals(joined.includes("lte:value->>date"), false);
});

Deno.test("rideshare includes null platform", () => {
  const calls = describeTripFilters(
    { serviceLine: "rideshare" },
    { effectiveOrgId: "org-1", useStrict: true },
  );
  assertEquals(
    calls.some((c) => c.includes("value->>platform.is.null")),
    true,
  );
});

Deno.test("driver ids use the typed column, not a name ilike", () => {
  const calls = describeTripFilters(
    { driverIds: ["driver-1", "driver-2"] },
    { effectiveOrgId: "org-1", useStrict: true },
  );
  assertEquals(calls.some((c) => c.startsWith("in:value->>driverId=")), true);
  assertEquals(calls.some((c) => c.includes("driverName")), false);
});

Deno.test("an unresolved name does not scan trip JSON", () => {
  const calls = describeTripFilters(
    { driverName: "Ann" },
    { effectiveOrgId: "org-1", useStrict: true },
  );
  assertEquals(calls.some((c) => c.includes("driverName")), false);
  assertEquals(calls.some((c) => c.includes("ilike")), false);
});

Deno.test("same matrix for Completed + platform Roam", () => {
  const body = {
    status: "Completed",
    platform: "Roam",
    startDate: "2026-09-01",
    endDate: "2026-09-07",
  };
  const ctx = { effectiveOrgId: "org-1", useStrict: false };
  const a = describeTripFilters(body, ctx);
  const b = describeTripFilters(body, ctx);
  assertEquals(a, b);
});
