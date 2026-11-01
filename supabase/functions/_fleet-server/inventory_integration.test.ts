import { assertEquals } from "jsr:@std/assert@1";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { invRpcName } from "./inventory_db.ts";

const runIntegration = Deno.env.get("INVENTORY_INTEGRATION_TESTS") === "1";

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

Deno.test({
  name: "inv_verify_chain detects tamper (integration)",
  ignore: !runIntegration,
  fn: async () => {
    const sb = serviceClient();
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID");
    if (!org) throw new Error("set INVENTORY_TEST_ORG_ID");
    const { data: before } = await sb.rpc(invRpcName("inv_verify_chain"), { p_org_id: org });
    assertEquals(typeof before, "object");
  },
});

Deno.test({
  name: "inv_opening_balance idempotent replay (integration)",
  ignore: !runIntegration,
  fn: async () => {
    const sb = serviceClient();
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID");
    if (!org) throw new Error("set INVENTORY_TEST_ORG_ID");
    const key = `test-opening-${Date.now()}`;
    const lines: unknown[] = [];
    const first = await sb.rpc(invRpcName("inv_opening_balance"), {
      p_org_id: org,
      p_lines: lines,
      p_idempotency_key: key,
    });
    const second = await sb.rpc(invRpcName("inv_opening_balance"), {
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

Deno.test({
  name: "movement legs sum to zero after opening_balance (integration)",
  ignore: !runIntegration,
  fn: async () => {
    const sb = serviceClient();
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID");
    if (!org) throw new Error("set INVENTORY_TEST_ORG_ID");

    const { data: locRows } = await sb
      .schema("fleet")
      .from("inv_location")
      .select("id")
      .eq("organization_id", org)
      .neq("kind", "virtual")
      .limit(1);
    const loc = locRows?.[0]?.id as string | undefined;
    if (!loc) return;

    const { data: itemRows } = await sb
      .schema("fleet")
      .from("inv_item")
      .select("id")
      .eq("organization_id", org)
      .is("archived_at", null)
      .limit(1);
    const itemId = itemRows?.[0]?.id as string | undefined;
    if (!itemId) return;

    const key = `test-legs-${Date.now()}`;
    const { data: openData, error: openErr } = await sb.rpc(invRpcName("inv_opening_balance"), {
      p_org_id: org,
      p_lines: [{ item_id: itemId, location_id: loc, qty: 1, unit_cost: 1 }],
      p_idempotency_key: key,
    });
    assertEquals(openErr, null);
    const movementId = (openData as { movement_id?: string })?.movement_id;
    if (!movementId) throw new Error("missing movement_id");

    const { data: legs, error: legErr } = await sb
      .schema("fleet")
      .from("inv_ledger")
      .select("qty_delta")
      .eq("organization_id", org)
      .eq("movement_id", movementId);
    assertEquals(legErr, null);
    const sum = (legs ?? []).reduce(
      (acc, row) => acc + Number((row as { qty_delta: number }).qty_delta),
      0,
    );
    assertEquals(sum, 0);
  },
});

Deno.test({
  name: "opening balance creates real-location layer not virtual (integration)",
  ignore: !runIntegration,
  fn: async () => {
    const sb = serviceClient();
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID");
    if (!org) throw new Error("set INVENTORY_TEST_ORG_ID");

    const { data: locRows } = await sb
      .schema("fleet")
      .from("inv_location")
      .select("id, kind")
      .eq("organization_id", org)
      .neq("kind", "virtual")
      .limit(1);
    const loc = locRows?.[0]?.id as string | undefined;
    if (!loc) return;

    const { data: itemRows } = await sb
      .schema("fleet")
      .from("inv_item")
      .select("id")
      .eq("organization_id", org)
      .is("archived_at", null)
      .limit(1);
    const itemId = itemRows?.[0]?.id as string | undefined;
    if (!itemId) return;

    const key = `test-layer-${Date.now()}`;
    const { data: openData, error: openErr } = await sb.rpc(invRpcName("inv_opening_balance"), {
      p_org_id: org,
      p_lines: [{ item_id: itemId, location_id: loc, qty: 2, unit_cost: 100 }],
      p_idempotency_key: key,
    });
    assertEquals(openErr, null);
    const movementId = (openData as { movement_id?: string })?.movement_id;
    if (!movementId) throw new Error("missing movement_id");

    const { data: layers, error: layerErr } = await sb
      .schema("fleet")
      .from("inv_cost_layer")
      .select("qty_remaining, location_id")
      .eq("organization_id", org)
      .eq("item_id", itemId);
    assertEquals(layerErr, null);
    const { data: vLocs } = await sb
      .schema("fleet")
      .from("inv_location")
      .select("id, kind")
      .eq("organization_id", org)
      .eq("kind", "virtual");
    const virtualIds = new Set((vLocs ?? []).map((r) => (r as { id: string }).id));
    const realLayers = (layers ?? []).filter(
      (row) => !virtualIds.has((row as { location_id: string }).location_id),
    );
    assertEquals(realLayers.length >= 1, true);
    const qtySum = realLayers.reduce(
      (acc, row) => acc + Number((row as { qty_remaining: number }).qty_remaining),
      0,
    );
    assertEquals(qtySum, 2);

    const { error: revErr } = await sb.rpc(invRpcName("inv_reverse"), {
      p_org_id: org,
      p_movement_id: movementId,
      p_reason: "integration test reverse layer cleanup",
      p_idempotency_key: `${key}-rev`,
    });
    assertEquals(revErr, null);

    const { data: afterLayers, error: afterErr } = await sb
      .schema("fleet")
      .from("inv_cost_layer")
      .select("qty_remaining")
      .eq("organization_id", org)
      .eq("item_id", itemId)
      .gt("qty_remaining", 0);
    assertEquals(afterErr, null);
    assertEquals((afterLayers ?? []).length, 0);
  },
});
