/**
 * Refresh one tag's stored balance after a ledger write.
 * Does not change updatedAt, so an open edit is not rejected as a conflict.
 */
import * as kv from "./kv_store.tsx";
import { getServiceClient } from "./service_client.ts";

export async function refreshTagBalanceForLedgerWrite(entry: Record<string, unknown>): Promise<void> {
  const tagId = String(entry.tollTagId || entry.toll_tag_id || "").trim();
  const orgId = String(entry.organizationId || "").trim();
  if (!tagId || !orgId) return;

  const { data, error } = await getServiceClient().rpc("fleet_toll_tag_balance_rows", { p_org: orgId, p_tag_id: tagId });
  if (error || !Array.isArray(data)) return;
  const row = (data as Array<{ tag_id?: string; ledger_count?: number; balance?: number }>).find(
    (r) => String(r.tag_id) === tagId,
  );
  if (!row || Number(row.ledger_count) <= 0 || !Number.isFinite(Number(row.balance))) return;

  const existing = await kv.get(`toll_tag:${tagId}`) as Record<string, unknown> | null;
  if (!existing || String(existing.organizationId || "") !== orgId) return;
  await kv.set(`toll_tag:${tagId}`, {
    ...existing,
    lastCalculatedBalance: Number(row.balance),
    lastBalanceSyncedAt: new Date().toISOString(),
  });
}
