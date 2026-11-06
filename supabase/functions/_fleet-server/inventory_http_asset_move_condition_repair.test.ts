import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import {
  createInventoryTestApp,
  INVENTORY_API_PREFIX,
  testInventoryUser,
} from "./inventory_test_app.ts";
import { invRpcName } from "./inventory_db.ts";

const runIntegration = Deno.env.get("INVENTORY_INTEGRATION_TESTS") === "1";

const EXTENDED_SRC = await Deno.readTextFile(
  new URL("./inventory_controller_extended.ts", import.meta.url),
);

const CONTROLLER_SOURCES = [
  await Deno.readTextFile(new URL("./inventory_controller.tsx", import.meta.url)),
  await Deno.readTextFile(new URL("./inventory_controller_extended.ts", import.meta.url)),
  await Deno.readTextFile(new URL("./inventory_controller_r16.ts", import.meta.url)),
].join("\n");

const REMOVED_ROUTE_MARKERS = [
  "/purchase-orders",
  "`${PREFIX}/counts`",
  "/counts/sessions",
  "/diagnostics",
  "/analytics/where-used",
  "/analytics/report-sla",
  "/analytics/asset-kpis",
];

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

Deno.test("extended controller exposes asset condition move repair POST routes", () => {
  for (const fragment of [
    "app.post(`${PREFIX}/assets/:id/condition`",
    "app.post(`${PREFIX}/assets/:id/move`",
    "app.post(`${PREFIX}/assets/:id/repair`",
  ]) {
    if (!EXTENDED_SRC.includes(fragment)) {
      throw new Error(`missing extended route: ${fragment}`);
    }
  }
  if (!EXTENDED_SRC.includes('"inv_asset_move_vehicle"')) {
    throw new Error("vehicle move must call inv_asset_move_vehicle RPC");
  }
  if (!EXTENDED_SRC.includes('"inv_asset_move_to_store"')) {
    throw new Error("store move must call inv_asset_move_to_store RPC");
  }
  const moveBlock = EXTENDED_SRC.slice(
    EXTENDED_SRC.indexOf("app.post(`${PREFIX}/assets/:id/move`"),
    EXTENDED_SRC.indexOf("app.post(`${PREFIX}/assets/:id/condition`"),
  );
  if (moveBlock.includes('.from("fleet_inv_asset").update(patch)')) {
    throw new Error("move route must not patch location_id directly on fleet_inv_asset");
  }
  assertEquals(true, true);
});

Deno.test("Rev 52 cutdown removed purchasing counts diagnostics HTTP routes", () => {
  for (const marker of REMOVED_ROUTE_MARKERS) {
    if (CONTROLLER_SOURCES.includes(marker)) {
      throw new Error(`removed route still registered: ${marker}`);
    }
  }
  assertEquals(true, true);
});

Deno.test({
  name: "removed inventory routes return 404 when integration tests on",
  ignore: !runIntegration,
  fn: async () => {
    const app = createInventoryTestApp(testInventoryUser());
    const assetId = "00000000-0000-0000-0000-000000000099";
    const cases: { path: string; method: string; body?: unknown }[] = [
      { path: "/purchase-orders", method: "POST", body: { number: "ZZ-PO-REMOVED" } },
      { path: "/counts", method: "POST", body: { code: "ZZ-CNT", location_id: assetId } },
      { path: `/assets/${assetId}/diagnostics`, method: "GET" },
      { path: "/analytics/where-used", method: "GET" },
      { path: "/analytics/report-sla", method: "GET" },
      { path: "/analytics/asset-kpis", method: "GET" },
    ];
    for (const { path, method, body } of cases) {
      const res = await app.request(`${INVENTORY_API_PREFIX}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      assertEquals(res.status, 404, path);
    }
  },
});

Deno.test({
  name: "POST asset condition validates required fields",
  ignore: !runIntegration,
  fn: async () => {
    const app = createInventoryTestApp(testInventoryUser());
    const assetId = "00000000-0000-0000-0000-000000000099";
    const res = await app.request(`${INVENTORY_API_PREFIX}/assets/${assetId}/condition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assertEquals(res.status, 400);
  },
});

async function ensureMoveToStoreFixture(org: string) {
  const sb = serviceClient();
  const tag = `ZZ-MTS-${Date.now()}`;

  const { data: whFrom, error: whFromErr } = await sb.from("fleet_inv_location").insert({
    organization_id: org,
    code: `WH-F-${tag}`,
    name: "ZZ From store",
    kind: "warehouse",
    is_active: true,
  }).select("id").single();
  if (whFromErr) throw whFromErr;

  const { data: whTo, error: whToErr } = await sb.from("fleet_inv_location").insert({
    organization_id: org,
    code: `WH-T-${tag}`,
    name: "ZZ To store",
    kind: "warehouse",
    is_active: true,
  }).select("id").single();
  if (whToErr) throw whToErr;

  const { data: item, error: itemErr } = await sb.from("fleet_inv_item").insert({
    organization_id: org,
    sku: `SKU-${tag}`,
    name: "ZZ Move Store Item",
    tracking: "serial",
  }).select("id").single();
  if (itemErr) throw itemErr;

  const openKey = `open-${tag}`;
  const { error: openErr } = await sb.rpc(invRpcName("inv_opening_balance"), {
    p_org_id: org,
    p_lines: [{ item_id: item.id, location_id: whFrom.id, qty: 1, unit_cost: 100 }],
    p_idempotency_key: openKey,
  });
  if (openErr) throw openErr;

  const { data: asset, error: assetErr } = await sb.from("fleet_inv_asset").insert({
    organization_id: org,
    asset_tag: tag,
    item_id: item.id,
    serial_number: `SN-${tag}`,
    status: "in_store",
    location_id: whFrom.id,
  }).select("id").single();
  if (assetErr) throw assetErr;

  return {
    assetId: String(asset.id),
    warehouseId: String(whTo.id),
    fromWarehouseId: String(whFrom.id),
    itemId: String(item.id),
  };
}

Deno.test({
  name: "POST asset move to store writes transfer movement and history",
  ignore: !runIntegration,
  fn: async () => {
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID");
    if (!org) throw new Error("set INVENTORY_TEST_ORG_ID");
    const sb = serviceClient();
    const { assetId, warehouseId } = await ensureMoveToStoreFixture(org);
    const app = createInventoryTestApp(testInventoryUser());

    const { count: eventsBefore } = await sb.from("fleet_inv_asset_event")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("asset_id", assetId);

    const res = await app.request(`${INVENTORY_API_PREFIX}/assets/${assetId}/move`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `move-store-${assetId}`,
      },
      body: JSON.stringify({ location_id: warehouseId, note: "Return to storeroom" }),
    });
    assertEquals(res.status, 200);
    const moveBody = await res.json() as { transfer?: unknown };

    const { count: eventsAfter } = await sb.from("fleet_inv_asset_event")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("asset_id", assetId)
      .eq("type", "move");
    assertEquals((eventsAfter ?? 0) > (eventsBefore ?? 0), true);

    const { data: xferRows } = await sb.from("fleet_inv_movement")
      .select("id, type")
      .eq("organization_id", org)
      .eq("type", "transfer")
      .order("created_at", { ascending: false })
      .limit(5);
    assertExists(xferRows?.length);
    assertEquals(xferRows!.length > 0, true);
    assertExists(moveBody.transfer);

    const { data: updated } = await sb.from("fleet_inv_asset").select("location_id, status")
      .eq("organization_id", org).eq("id", assetId).single();
    assertEquals(String(updated?.location_id), warehouseId);
    assertEquals(updated?.status, "in_store");
  },
});

Deno.test({
  name: "inv_asset_set_condition rolls back on invalid status",
  ignore: !runIntegration,
  fn: async () => {
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID");
    if (!org) throw new Error("set INVENTORY_TEST_ORG_ID");
    const sb = serviceClient();
    const tag = `ZZ-COND-${Date.now()}`;
    const { data: item } = await sb.from("fleet_inv_item").insert({
      organization_id: org,
      sku: `SKU-${tag}`,
      name: "ZZ Condition Item",
      tracking: "serial",
    }).select("id").single();
    const { data: asset } = await sb.from("fleet_inv_asset").insert({
      organization_id: org,
      asset_tag: tag,
      item_id: item!.id,
      serial_number: `SN-${tag}`,
      status: "in_store",
    }).select("id, status").single();

    const assetId = String(asset!.id);
    const { count: beforeEvents } = await sb.from("fleet_inv_asset_event")
      .select("id", { count: "exact", head: true })
      .eq("asset_id", assetId);

    const { error } = await sb.rpc(invRpcName("inv_asset_set_condition"), {
      p_org_id: org,
      p_asset_id: assetId,
      p_status: "not_a_valid_status",
      p_note: "should fail",
    });
    assertExists(error);

    const { data: after } = await sb.from("fleet_inv_asset").select("status")
      .eq("id", assetId).single();
    assertEquals(after?.status, "in_store");

    const { count: afterEvents } = await sb.from("fleet_inv_asset_event")
      .select("id", { count: "exact", head: true })
      .eq("asset_id", assetId);
    assertEquals(afterEvents, beforeEvents);
  },
});

Deno.test({
  name: "POST asset repair stores cost_jmd on history entry",
  ignore: !runIntegration,
  fn: async () => {
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID");
    if (!org) throw new Error("set INVENTORY_TEST_ORG_ID");
    const sb = serviceClient();
    const tag = `ZZ-REP-${Date.now()}`;
    const { data: item } = await sb.from("fleet_inv_item").insert({
      organization_id: org,
      sku: `SKU-${tag}`,
      name: "ZZ Repair Item",
      tracking: "serial",
    }).select("id").single();
    const { data: asset } = await sb.from("fleet_inv_asset").insert({
      organization_id: org,
      asset_tag: tag,
      item_id: item!.id,
      serial_number: `SN-${tag}`,
      status: "installed",
    }).select("id").single();
    const assetId = String(asset!.id);
    const app = createInventoryTestApp(testInventoryUser());

    const res = await app.request(`${INVENTORY_API_PREFIX}/assets/${assetId}/repair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Replaced gasket",
        cost_jmd: 2000,
        set_status: "installed",
      }),
    });
    assertEquals(res.status, 200, await res.text());

    const { data: ev } = await sb.from("fleet_inv_asset_event")
      .select("cost_jmd, type, body")
      .eq("organization_id", org)
      .eq("asset_id", assetId)
      .eq("type", "repair")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assertEquals(Number(ev?.cost_jmd), 2000);
    assertEquals(String(ev?.body).includes("Cost (JMD)"), false);
  },
});
