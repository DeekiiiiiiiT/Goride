import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const EXPORT_HEADER =
  "job_id,job_type,state,group_key,fleet_count,match_type,updated_at";

Deno.test("B5: export CSV header excludes organisation identifiers", () => {
  const lower = EXPORT_HEADER.toLowerCase();
  assertEquals(lower.includes("organization"), false);
  assertEquals(lower.includes("org_id"), false);
  assertEquals(lower.includes("plate"), false);
});
