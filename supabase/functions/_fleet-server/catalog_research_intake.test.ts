/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_research_intake.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DAILY_REQUEST_LIMIT,
  ensureCatalogResearchJob,
  jamaicaDayStartUtc,
  researchGroupKeyFromRow,
} from "./catalog_research_intake.ts";

Deno.test("researchGroupKeyFromRow never keys Find parts by its words (name empty)", async () => {
  const calls: Record<string, unknown>[] = [];
  const supabase = {
    rpc: (_name: string, args: Record<string, unknown>) => {
      calls.push(args);
      return Promise.resolve({ data: "v2|test", error: null });
    },
  };
  const key = await researchGroupKeyFromRow(supabase as never, {
    vehicle_catalog_id: "vc-1",
    maintenance_component_id: "cmp-1",
    fit_descriptor: "front:left",
    install_side: null,
    match_type: "OEM",
    need_text: "Pads",
    position_scheme: "wheel",
    position_codes: ["LF"],
    old_part_number: "04465",
  });
  assertEquals(key, "v2|test");
  assertEquals(calls[0].p_name, "");
  assertEquals(calls[0].p_part_number, "04465");
});

Deno.test("ensureCatalogResearchJob join_or_create with find_parts origin", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return Promise.resolve({ data: { jobId: "job-1", newJob: true }, error: null });
    },
  };
  const jobId = await ensureCatalogResearchJob(
    supabase as never,
    {
      need_text: "Need pads",
      old_part_number: " 04465-x ",
      vehicle_catalog_id: "vc",
      maintenance_component_id: "cmp",
      fit_descriptor: null,
      install_side: null,
      match_type: null,
    },
    "v2|key",
  );
  assertEquals(jobId, "job-1");
  assertEquals(calls[0].name, "catalog_research_join_or_create_job");
  assertEquals(calls[0].args.p_origin, "find_parts");
  assertEquals(calls[0].args.p_requested_name, "Need pads");
  assertEquals(calls[0].args.p_requested_part_number, "04465-x");
});

Deno.test("R5/B5: jamaica day start is ISO string", () => {
  const start = jamaicaDayStartUtc(new Date("2026-11-01T12:00:00Z"));
  assertEquals(start.endsWith("T05:00:00.000Z"), true);
});

Deno.test("request 31 hits daily limit constant", () => {
  assertEquals(DAILY_REQUEST_LIMIT, 30);
});