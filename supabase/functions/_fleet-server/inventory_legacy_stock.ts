/**
 * Interim stock draw for POST /fleet/equipment/bulk (Phase 0) until inv_issue_to_vehicles ships.
 */
import type { Context } from "npm:hono@4.3.11";
import { invDb, invRpcName } from "./inventory_db.ts";
import { getOrgId, stampOrgRequired } from "./org_scope.ts";

export async function legacyDrawInventoryQuantity(
  inventoryId: string,
  draw: number,
  c: Context,
): Promise<
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const orgId = getOrgId(c);
  if (!orgId) {
    return { ok: false, status: 403, body: { error: "Organization required" } };
  }

  const sb = invDb();
  const { data: row, error: readErr } = await sb
    .from("fleet_inv_inventory")
    .select("id, organization_id, payload_json")
    .eq("id", inventoryId)
    .maybeSingle();

  if (readErr) {
    return { ok: false, status: 500, body: { error: readErr.message } };
  }
  if (!row) {
    return { ok: false, status: 404, body: { error: `Inventory item not found: ${inventoryId}` } };
  }
  if (row.organization_id && row.organization_id !== orgId) {
    return { ok: false, status: 403, body: { error: "Forbidden", inventoryId } };
  }

  const payload = (row.payload_json ?? {}) as Record<string, unknown>;
  const expectedQty = Number(payload.quantity) || 0;
  if (expectedQty < draw) {
    const name = String(payload.name || inventoryId);
    return {
      ok: false,
      status: 409,
      body: {
        error: `Insufficient stock for "${name}": need ${draw}, have ${expectedQty}`,
        inventoryId,
        available: expectedQty,
        requested: draw,
      },
    };
  }

  const { data: nextPayload, error: drawErr } = await sb.rpc(invRpcName("legacy_inventory_draw"), {
    p_inventory_id: inventoryId,
    p_org_id: orgId,
    p_draw: draw,
    p_expected_qty: expectedQty,
  });

  if (drawErr) {
    const msg = drawErr.message || String(drawErr);
    if (/concurrently|40001|stock changed/i.test(msg)) {
      return {
        ok: false,
        status: 409,
        body: { error: "Stock changed — retry bulk assign", inventoryId, code: "concurrent_draw" },
      };
    }
    if (/insufficient stock/i.test(msg)) {
      return {
        ok: false,
        status: 409,
        body: { error: msg, inventoryId, available: expectedQty, requested: draw },
      };
    }
    return { ok: false, status: 500, body: { error: msg } };
  }

  const merged = stampOrgRequired(
    { ...payload, ...(nextPayload as Record<string, unknown>) },
    c,
  );
  return { ok: true, payload: merged };
}
