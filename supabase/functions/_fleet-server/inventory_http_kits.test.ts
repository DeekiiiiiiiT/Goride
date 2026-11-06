import { assertEquals } from "jsr:@std/assert@1";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import {
  createInventoryTestApp,
  INVENTORY_API_PREFIX,
  testInventoryUser,
} from "./inventory_test_app.ts";

const runIntegration = Deno.env.get("INVENTORY_INTEGRATION_TESTS") === "1";
const KIT_ORG = "TEST-KIT-ORG";

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

async function ensureKitOrgFixture(sb: ReturnType<typeof serviceClient>) {
  await sb.from("fleet_inv_settings").upsert({ organization_id: KIT_ORG });
  for (const [sku, name] of [["ZZ-TEST-A", "ZZ Test Item A"], ["ZZ-TEST-B", "ZZ Test Item B"]] as const) {
    const { data: existing } = await sb.from("fleet_inv_item").select("id").eq("organization_id", KIT_ORG)
      .eq("sku", sku).maybeSingle();
    if (!existing?.id) {
      await sb.from("fleet_inv_item").insert({
        organization_id: KIT_ORG,
        sku,
        name,
        tracking: "quantity",
      });
    }
  }
  const { data: existing } = await sb.from("fleet_inv_kit_template").select("id").eq(
    "organization_id",
    KIT_ORG,
  ).eq("code", "ZZ-TEST-KIT-DRAFT-HTTP").maybeSingle();
  if (existing?.id) return String(existing.id);
  const { data: tpl, error } = await sb.from("fleet_inv_kit_template").insert({
    organization_id: KIT_ORG,
    code: "ZZ-TEST-KIT-DRAFT-HTTP",
    name: "ZZ HTTP Kit Draft",
    classification: "rideshare",
  }).select("id").single();
  if (error) throw error;
  const templateId = String(tpl.id);
  await sb.from("fleet_inv_kit_template_version").insert({
    organization_id: KIT_ORG,
    template_id: templateId,
    version: 1,
    status: "production",
  });
  return templateId;
}

Deno.test({
  name: "kit draft save publish via HTTP routes",
  ignore: !runIntegration,
  fn: async () => {
    const sb = serviceClient();
    const templateId = await ensureKitOrgFixture(sb);
    const { data: itemA } = await sb.from("fleet_inv_item").select("id").eq("organization_id", KIT_ORG)
      .eq("sku", "ZZ-TEST-A").maybeSingle();
    const { data: itemB } = await sb.from("fleet_inv_item").select("id").eq("organization_id", KIT_ORG)
      .eq("sku", "ZZ-TEST-B").maybeSingle();
    if (!itemA?.id || !itemB?.id) throw new Error("ZZ-TEST items missing");

    const app = createInventoryTestApp(testInventoryUser({ organizationId: KIT_ORG }));

    const draftRes = await app.request(
      `${INVENTORY_API_PREFIX}/kits/templates/${templateId}/draft`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: [
            { item_id: itemA.id, qty: 1 },
            { item_id: itemB.id, qty: 2 },
          ],
          change_note: "http test draft",
        }),
      },
    );
    assertEquals(draftRes.status, 200);
    const draftBody = await draftRes.json();
    const versionId = String(draftBody.version_id ?? draftBody.draft_version_id ?? "");
    if (!versionId) throw new Error("missing version_id from save draft");

    const listRes = await app.request(`${INVENTORY_API_PREFIX}/kits/templates`);
    assertEquals(listRes.status, 200);
    const list = await listRes.json();
    const row = (list.items as Record<string, unknown>[]).find((t) => String(t.id) === templateId);
    assertEquals(Array.isArray(row?.lines) && (row?.lines as unknown[]).length >= 2, true);

    const pubRes = await app.request(
      `${INVENTORY_API_PREFIX}/kits/templates/${templateId}/publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: versionId, move_vehicles: false }),
      },
    );
    assertEquals(pubRes.status, 200);
    const pub = await pubRes.json();
    assertEquals(typeof pub.version_id === "string" || typeof pub.version === "number", true);
  },
});

Deno.test({
  name: "POST kits/templates derives code and requires classification",
  ignore: !runIntegration,
  fn: async () => {
    await ensureKitOrgFixture(serviceClient());
    const app = createInventoryTestApp(testInventoryUser({ organizationId: KIT_ORG }));
    const bad = await app.request(`${INVENTORY_API_PREFIX}/kits/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Reflective vest" }),
    });
    assertEquals(bad.status, 400);
    const ok = await app.request(`${INVENTORY_API_PREFIX}/kits/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Reflective vest", classification: "delivery" }),
    });
    assertEquals(ok.status, 200);
    const body = await ok.json();
    assertEquals(String(body.template?.code ?? "").includes("REFLECTIVE"), true);
    if (body.template?.id) {
      await serviceClient().from("fleet_inv_kit_template").delete().eq("id", body.template.id);
    }
  },
});

const ROUNDTRIP_CODE = "ZZ-TEST-KIT-ROUNDTRIP-HTTP";

async function ensureKitRoundTripFixture(sb: ReturnType<typeof serviceClient>) {
  await ensureKitOrgFixture(sb);
  const { data: itemA } = await sb.from("fleet_inv_item").select("id").eq("organization_id", KIT_ORG)
    .eq("sku", "ZZ-TEST-A").maybeSingle();
  if (!itemA?.id) throw new Error("ZZ-TEST-A missing");

  let templateId: string;
  const { data: existingTpl } = await sb.from("fleet_inv_kit_template").select("id").eq(
    "organization_id",
    KIT_ORG,
  ).eq("code", ROUNDTRIP_CODE).maybeSingle();
  if (existingTpl?.id) {
    templateId = String(existingTpl.id);
  } else {
    const { data: tpl, error } = await sb.from("fleet_inv_kit_template").insert({
      organization_id: KIT_ORG,
      code: ROUNDTRIP_CODE,
      name: "ZZ Kit Roundtrip",
      classification: "rideshare",
    }).select("id").single();
    if (error) throw error;
    templateId = String(tpl.id);
    await sb.from("fleet_inv_kit_template_version").insert({
      organization_id: KIT_ORG,
      template_id: templateId,
      version: 1,
      status: "production",
    });
  }

  const { data: prodVer } = await sb.from("fleet_inv_kit_template_version").select("id").eq(
    "organization_id",
    KIT_ORG,
  ).eq("template_id", templateId).eq("status", "production").maybeSingle();
  if (!prodVer?.id) throw new Error("production version missing");
  const versionId = String(prodVer.id);

  await sb.from("fleet_inv_kit_template_line").delete().eq("organization_id", KIT_ORG).eq(
    "version_id",
    versionId,
  );

  await sb.from("fleet_inv_kit_template_line").insert([
    {
      organization_id: KIT_ORG,
      version_id: versionId,
      line_type: "linked_toll_tag",
      qty_required: 1,
      required: true,
      sort_order: 1,
    },
    {
      organization_id: KIT_ORG,
      version_id: versionId,
      line_type: "linked_fuel_card",
      qty_required: 1,
      required: true,
      sort_order: 2,
    },
    {
      organization_id: KIT_ORG,
      version_id: versionId,
      line_type: "item",
      item_id: itemA.id,
      qty_required: 2,
      required: true,
      install_position: "Boot",
      sort_order: 3,
    },
  ]);

  await sb.from("fleet_vehicles").upsert([
    {
      id: "TEST-001",
      organization_id: KIT_ORG,
      license_plate: "TEST-001",
      make: "Test",
      model: "Car",
      legacy_kv_id: "legacy-test-001",
    },
    {
      id: "TEST-002",
      organization_id: KIT_ORG,
      license_plate: "TEST-002",
      make: "Test",
      model: "Car",
      legacy_kv_id: "legacy-test-002",
    },
  ]);

  await sb.from("fleet_inv_vehicle_kit").upsert([
    {
      organization_id: KIT_ORG,
      vehicle_id: "TEST-001",
      template_id: templateId,
      version_id: versionId,
    },
    {
      organization_id: KIT_ORG,
      vehicle_id: "TEST-002",
      template_id: templateId,
      version_id: versionId,
    },
  ], { onConflict: "organization_id,vehicle_id" });

  return { templateId, itemAId: String(itemA.id), versionId };
}

function screenPayloadFromTemplateLines(lines: Record<string, unknown>[]) {
  const out: Record<string, unknown>[] = [];
  for (const row of lines) {
    const lineType = String(row.line_type ?? "item");
    if (lineType === "linked_toll_tag") {
      out.push({ line_type: "linked_toll_tag", qty_required: 1, required: true });
      continue;
    }
    if (lineType === "linked_fuel_card") {
      out.push({ line_type: "linked_fuel_card", qty_required: 1, required: true });
      continue;
    }
    out.push({
      line_type: "item",
      item_id: row.item_id,
      qty_required: Number(row.qty_required ?? row.qty ?? 1),
      required: row.required !== false,
      blocks_road_clearance: row.blocks_road_clearance === true,
      install_position: row.install_position ?? null,
      variant_note: row.variant_note ?? null,
    });
  }
  return out;
}

function normalizeKitLines(lines: Record<string, unknown>[]) {
  return lines.map((row) => ({
    line_type: String(row.line_type ?? "item"),
    item_id: row.item_id ? String(row.item_id) : null,
    qty_required: Number(row.qty_required ?? row.qty ?? 0),
    install_position: row.install_position ? String(row.install_position) : null,
    variant_note: row.variant_note ? String(row.variant_note) : null,
  })).sort((a, b) => `${a.line_type}:${a.item_id}`.localeCompare(`${b.line_type}:${b.item_id}`));
}

Deno.test({
  name: "kit template list returns vehicle_count and draft round-trip preserves linked lines qty and position",
  ignore: !runIntegration,
  fn: async () => {
    const sb = serviceClient();
    const { templateId } = await ensureKitRoundTripFixture(sb);
    const app = createInventoryTestApp(testInventoryUser({ organizationId: KIT_ORG }));

    const listBefore = await app.request(`${INVENTORY_API_PREFIX}/kits/templates`);
    assertEquals(listBefore.status, 200);
    const before = await listBefore.json();
    const tplBefore = (before.items as Record<string, unknown>[]).find((t) => String(t.id) === templateId);
    if (!tplBefore) throw new Error("template missing from list");
    assertEquals(Number(tplBefore.vehicle_count), 2);
    const linesBefore = tplBefore.lines as Record<string, unknown>[];
    assertEquals(linesBefore.length >= 3, true);

    const payload = screenPayloadFromTemplateLines(linesBefore);
    const draftRes = await app.request(
      `${INVENTORY_API_PREFIX}/kits/templates/${templateId}/draft`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: payload, change_note: "roundtrip" }),
      },
    );
    assertEquals(draftRes.status, 200, await draftRes.text());

    const listAfter = await app.request(`${INVENTORY_API_PREFIX}/kits/templates`);
    assertEquals(listAfter.status, 200);
    const after = await listAfter.json();
    const tplAfter = (after.items as Record<string, unknown>[]).find((t) => String(t.id) === templateId);
    if (!tplAfter) throw new Error("template missing after save");
    assertEquals(Number(tplAfter.vehicle_count), 2);
    assertEquals(typeof tplAfter.draft_version_id === "string" && tplAfter.draft_version_id !== "", true);

    const normBefore = normalizeKitLines(linesBefore);
    const normAfter = normalizeKitLines(tplAfter.lines as Record<string, unknown>[]);
    assertEquals(JSON.stringify(normAfter), JSON.stringify(normBefore));
  },
});
