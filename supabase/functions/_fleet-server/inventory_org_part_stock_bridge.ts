import { getServiceClient } from "./service_client.ts";
import { invDb, invRpcName } from "./inventory_db.ts";

type FleetDb = ReturnType<typeof invDb>;

export async function upsertOrgPartStockViaEngine(
  orgId: string,
  partId: string | null,
  universalPartId: string | null,
  locationCode: string | null,
  targetQty: number,
  reorderPoint: number | null,
  idempotencyKey: string,
): Promise<{ item: Record<string, unknown> }> {
  const fleet = invDb();
  const itemId = await ensureInvItem(fleet, orgId, partId, universalPartId);
  const locationId = await resolveLocationId(fleet, orgId, locationCode);

  const { data: balances } = await fleet
    .from("fleet_inv_balance")
    .select("on_hand")
    .eq("organization_id", orgId)
    .eq("item_id", itemId)
    .eq("location_id", locationId)
    .limit(1);

  const currentQty = Number((balances?.[0] as { on_hand?: number } | undefined)?.on_hand ?? 0);

  if (currentQty === 0 && targetQty > 0) {
    const { data, error } = await fleet.rpc(invRpcName("inv_opening_balance"), {
      p_org_id: orgId,
      p_lines: [
        {
          item_id: itemId,
          location_id: locationId,
          qty: targetQty,
          unit_cost: 0,
        },
      ],
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    void data;
  } else if (targetQty !== currentQty) {
    const delta = targetQty - currentQty;
    const { error } = await fleet.rpc(invRpcName("inv_adjust"), {
      p_org_id: orgId,
      p_item_id: itemId,
      p_location_id: locationId,
      p_bin_id: null,
      p_qty_delta: delta,
      p_unit_cost: 0,
      p_reason: "Org part stock update (Find parts)",
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
  }

  if (reorderPoint != null) {
    await fleet.from("fleet_inv_reorder_policy").upsert(
      {
        organization_id: orgId,
        item_id: itemId,
        location_id: locationId,
        reorder_point: reorderPoint,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,item_id,location_id" },
    );
  }

  const publicClient = getServiceClient();
  let q = publicClient.from("org_part_stock").select("*").eq("organization_id", orgId);
  if (partId) q = q.eq("part_id", partId);
  else q = q.eq("universal_part_id", universalPartId);
  q = locationCode ? q.eq("location", locationCode) : q.is("location", null);
  const { data: row, error: readErr } = await q.maybeSingle();
  if (readErr) throw readErr;
  if (!row) throw new Error("Stock row not found after engine update");
  return { item: row as Record<string, unknown> };
}

async function ensureInvItem(
  fleet: FleetDb,
  orgId: string,
  partId: string | null,
  universalPartId: string | null,
): Promise<string> {
  let q = fleet.from("fleet_inv_item").select("id").eq("organization_id", orgId);
  q = partId ? q.eq("part_master_id", partId) : q.eq("universal_part_id", universalPartId!);
  const { data: existing } = await q.maybeSingle();
  if (existing?.id) return String(existing.id);

  const skuPrefix = partId ? `PM-${partId.slice(0, 8)}` : `UP-${universalPartId!.slice(0, 8)}`;
  const { data: created, error } = await fleet
    .from("fleet_inv_item")
    .insert({
      organization_id: orgId,
      sku: skuPrefix,
      short_code: skuPrefix,
      name: "Catalog part stock",
      tracking: "quantity",
      part_master_id: partId,
      universal_part_id: universalPartId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(created.id);
}

async function resolveLocationId(
  fleet: FleetDb,
  orgId: string,
  locationCode: string | null,
): Promise<string> {
  if (locationCode) {
    const { data } = await fleet
      .from("fleet_inv_location")
      .select("id")
      .eq("organization_id", orgId)
      .eq("code", locationCode)
      .maybeSingle();
    if (data?.id) return String(data.id);
    const { data: created, error } = await fleet
      .from("fleet_inv_location")
      .insert({
        organization_id: orgId,
        code: locationCode,
        name: locationCode,
        kind: "warehouse",
        is_active: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    return String(created.id);
  }

  const { data: def } = await fleet
    .from("fleet_inv_location")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_default", true)
    .maybeSingle();
  if (def?.id) return String(def.id);

  const { data: created, error } = await fleet
    .from("fleet_inv_location")
    .insert({
      organization_id: orgId,
      code: "JM-KIN-ST01",
      name: "Main store",
      kind: "warehouse",
      is_default: true,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(created.id);
}
