/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_research_intake.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DAILY_REQUEST_LIMIT, jamaicaDayStartUtc, researchGroupKeyFromRow } from "./catalog_research_intake.ts";

Deno.test("intake group key matches pending parts format", () => {
  const key = researchGroupKeyFromRow({
    vehicle_catalog_id: "vc-1",
    maintenance_component_id: "cmp-1",
    fit_descriptor: "front:left",
    install_side: null,
    match_type: "OEM",
  });
  assertEquals(key, "vc-1:cmp-1:front:left:OEM");
});

Deno.test("R5/B5: jamaica day start is ISO string", () => {
  const start = jamaicaDayStartUtc(new Date("2026-11-01T12:00:00Z"));
  assertEquals(start.endsWith("T05:00:00.000Z"), true);
});

Deno.test("request 31 hits daily limit constant", () => {
  assertEquals(DAILY_REQUEST_LIMIT, 30);
});
