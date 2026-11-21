/**
 * deno test --no-check supabase/functions/_fleet-server/pending_parts_group.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  applyPendingPartsGroupFilter,
  groupIdForRow,
  parseGroupKeyV2,
  researchGroupKeyV2,
} from "./pending_parts_group.ts";

Deno.test("groupIdForRow uses stored key or legacy id", () => {
  assertEquals(
    groupIdForRow({ id: "req-1", research_group_key: "v2|a|b|c|d|e|f|g" }),
    "v2|a|b|c|d|e|f|g",
  );
  assertEquals(groupIdForRow({ id: "req-1", research_group_key: "" }), "legacy:req-1");
  assertEquals(groupIdForRow({ id: "req-1" }), "legacy:req-1");
});

Deno.test("applyPendingPartsGroupFilter legacy and v2", () => {
  const legacyCalls: string[] = [];
  const v2Calls: string[] = [];
  const legacyQuery = {
    eq: (col: string, val: string) => {
      legacyCalls.push(`${col}=${val}`);
      return legacyQuery;
    },
  };
  applyPendingPartsGroupFilter(legacyQuery, "legacy:abc");
  assertEquals(legacyCalls, ["id=abc"]);

  const v2Query = {
    eq: (col: string, val: string) => {
      v2Calls.push(`${col}=${val}`);
      return v2Query;
    },
  };
  applyPendingPartsGroupFilter(v2Query, "v2|cat|comp|||scheme|code|nm:abc");
  assertEquals(v2Calls, ["research_group_key=v2|cat|comp|||scheme|code|nm:abc"]);
});

Deno.test("parseGroupKeyV2 reads identity with colons in name segment", () => {
  const key = "v2|cat|comp|fit|match|scheme|a,b|nm:deadbeef";
  const parsed = parseGroupKeyV2(key);
  assertEquals(parsed?.vehicleCatalogId, "cat");
  assertEquals(parsed?.positionCodes, ["a", "b"]);
  assertEquals(parsed?.identity, "nm:deadbeef");
  assertEquals(parseGroupKeyV2("v1:old:key"), null);
});

Deno.test("researchGroupKeyV2 one rpc", async () => {
  const rpcCalls: unknown[] = [];
  const supabase = {
    rpc: (_name: string, args: Record<string, unknown>) => {
      rpcCalls.push(args);
      return Promise.resolve({ data: "v2|x", error: null });
    },
  };
  const key = await researchGroupKeyV2(supabase as never, {
    vehicle_catalog_id: "vc",
    maintenance_component_id: "cmp",
    need_text: "Brake pad",
    position_codes: ["LF"],
    position_scheme: "wheel",
  });
  assertEquals(key, "v2|x");
  assertEquals(rpcCalls.length, 1);
  const args = rpcCalls[0] as Record<string, unknown>;
  assertEquals(args.p_name, "Brake pad");
});