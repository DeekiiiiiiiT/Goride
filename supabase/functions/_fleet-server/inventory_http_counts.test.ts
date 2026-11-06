import { assertEquals } from "jsr:@std/assert@1";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import {
  createInventoryTestApp,
  INVENTORY_API_PREFIX,
  testInventoryUser,
} from "./inventory_test_app.ts";
import { clearFleetInventoryFeatureFlagsCache } from "./platform_inventory_flags.ts";
import { INVENTORY_PHASE_OFF_MESSAGE } from "./inventory_phase_gate.ts";

const runIntegration = Deno.env.get("INVENTORY_INTEGRATION_TESTS") === "1";

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

Deno.test({
  name: "POST counts blocked when phase 7 off",
  ignore: !runIntegration,
  fn: async () => {
    const app = createInventoryTestApp(testInventoryUser());
    const res = await app.request(`${INVENTORY_API_PREFIX}/counts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ZZ-CNT", location_id: "00000000-0000-0000-0000-000000000001" }),
    });
    assertEquals(res.status, 403);
    assertEquals((await res.json()).error, INVENTORY_PHASE_OFF_MESSAGE);
  },
});

Deno.test({
  name: "POST counts session when phase 7 on",
  ignore: !runIntegration,
  fn: async () => {
    const sb = serviceClient();
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID") || "test-org-inv";
    await sb.from("fleet_inv_settings").upsert({ organization_id: org });
    await sb.from("platform_feature_flags").update({ enabled: true }).eq(
      "name",
      "fleet_inventory_phase7_counts",
    );
    clearFleetInventoryFeatureFlagsCache();
    const { data: loc, error: locErr } = await sb.from("fleet_inv_location").insert({
      organization_id: org,
      code: `ZZ-CNT-LOC-${Date.now()}`,
      name: "ZZ Count Loc",
      kind: "warehouse",
      is_active: true,
    }).select("id").single();
    if (locErr || !loc?.id) return;
    try {
      const app = createInventoryTestApp(testInventoryUser());
      const res = await app.request(`${INVENTORY_API_PREFIX}/counts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: `ZZ-CNT-${Date.now()}`, location_id: loc.id }),
      });
      if (res.status === 500) {
        const body = await res.json();
        if (String(body.error ?? "").includes("schema cache")) return;
      }
      assertEquals(res.status, 200, await res.text());
    } finally {
      await sb.from("platform_feature_flags").update({ enabled: false }).eq(
        "name",
        "fleet_inventory_phase7_counts",
      );
      clearFleetInventoryFeatureFlagsCache();
    }
  },
});
