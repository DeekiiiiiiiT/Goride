import { assertEquals } from "jsr:@std/assert@1";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import {
  createInventoryTestApp,
  INVENTORY_API_PREFIX,
  testInventoryUser,
} from "./inventory_test_app.ts";

const runIntegration = Deno.env.get("INVENTORY_INTEGRATION_TESTS") === "1";

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

Deno.test({
  name: "GET inventory alerts list",
  ignore: !runIntegration,
  fn: async () => {
    const app = createInventoryTestApp(testInventoryUser());
    const res = await app.request(`${INVENTORY_API_PREFIX}/alerts`);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(Array.isArray(body.items), true);
  },
});

Deno.test({
  name: "GET alerts includes derived faulty and inspection-due assets",
  ignore: !runIntegration,
  fn: async () => {
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID");
    if (!org) throw new Error("set INVENTORY_TEST_ORG_ID");
    const sb = serviceClient();
    const tag = `ZZ-ALERT-${Date.now()}`;
    const { data: item } = await sb.from("fleet_inv_item").insert({
      organization_id: org,
      sku: `SKU-${tag}`,
      name: "ZZ Alert Item",
      tracking: "serial",
    }).select("id").single();

    const due = new Date();
    due.setUTCDate(due.getUTCDate() + 14);
    const dueStr = due.toISOString().slice(0, 10);

    const { data: faultyAsset } = await sb.from("fleet_inv_asset").insert({
      organization_id: org,
      asset_tag: `${tag}-F`,
      item_id: item!.id,
      serial_number: `SN-F-${tag}`,
      status: "faulty",
    }).select("id").single();

    const { data: dueAsset } = await sb.from("fleet_inv_asset").insert({
      organization_id: org,
      asset_tag: `${tag}-D`,
      item_id: item!.id,
      serial_number: `SN-D-${tag}`,
      status: "in_store",
      next_inspection_due: dueStr,
    }).select("id").single();

    const app = createInventoryTestApp(testInventoryUser());
    const res = await app.request(`${INVENTORY_API_PREFIX}/alerts`);
    assertEquals(res.status, 200);
    const body = await res.json() as { items: Record<string, unknown>[] };
    const ids = new Set(body.items.map((a) => String(a.id)));
    assertEquals(ids.has(`derived:asset_faulty:${faultyAsset!.id}`), true);
    assertEquals(ids.has(`derived:asset_inspection_due:${dueAsset!.id}`), true);
  },
});
