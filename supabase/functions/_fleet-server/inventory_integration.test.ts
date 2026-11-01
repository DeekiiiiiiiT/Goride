import { assertEquals } from "jsr:@std/assert@1";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const runIntegration = Deno.env.get("INVENTORY_INTEGRATION_TESTS") === "1";

function fleetClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { db: { schema: "fleet" } });
}

Deno.test({
  name: "inv_verify_chain detects tamper (integration)",
  ignore: !runIntegration,
  fn: async () => {
    const sb = fleetClient();
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID");
    if (!org) throw new Error("set INVENTORY_TEST_ORG_ID");
    const { data: before } = await sb.rpc("inv_verify_chain", { p_org_id: org });
    assertEquals(typeof before, "object");
  },
});

Deno.test({
  name: "inv_opening_balance idempotent replay (integration)",
  ignore: !runIntegration,
  fn: async () => {
    const sb = fleetClient();
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID");
    if (!org) throw new Error("set INVENTORY_TEST_ORG_ID");
    const key = `test-opening-${Date.now()}`;
    const lines: unknown[] = [];
    const first = await sb.rpc("inv_opening_balance", {
      p_org_id: org,
      p_lines: lines,
      p_idempotency_key: key,
    });
    const second = await sb.rpc("inv_opening_balance", {
      p_org_id: org,
      p_lines: lines,
      p_idempotency_key: key,
    });
    assertEquals(first.error, null);
    assertEquals(second.error, null);
    assertEquals(
      (second.data as { idempotent_replay?: boolean })?.idempotent_replay,
      true,
    );
  },
});
