/**
 * Per-company settlement approval cap. Default stays $50,000.
 * A missing or failed staff count is treated as a one-person company.
 */
import { getServiceClient } from "./service_client.ts";
import * as kv from "./kv_store.tsx";
import { SETTLEMENT_APPROVAL_THRESHOLD } from "../../../packages/finance-core/src/settlementApproval.ts";

const keyFor = (orgId: string) => `settlement_approval:${orgId}`;

export async function loadSettlementApprovalThreshold(orgId: string): Promise<number> {
  const row = (await kv.get(keyFor(orgId))) as { threshold?: number } | null;
  const n = Number(row?.threshold);
  if (Number.isFinite(n) && n >= 0) return n;
  return SETTLEMENT_APPROVAL_THRESHOLD;
}

export async function saveSettlementApprovalThreshold(
  orgId: string,
  threshold: number,
  actorId: string,
): Promise<number> {
  const next = Number(threshold);
  if (!Number.isFinite(next) || next < 0) throw new Error("INVALID_THRESHOLD");
  const prev = await loadSettlementApprovalThreshold(orgId);
  await kv.set(keyFor(orgId), { threshold: next, updatedAt: new Date().toISOString(), updatedBy: actorId });
  await kv.set(`settlement_approval_log:${orgId}:${new Date().toISOString()}`, {
    before: prev,
    after: next,
    actorId,
  });
  return next;
}

export async function anotherApproverExists(orgId: string): Promise<boolean> {
  try {
    const { data, error } = await getServiceClient()
      .schema("platform")
      .from("user_roles")
      .select("user_id, status")
      .eq("scope_type", "organization")
      .eq("scope_id", orgId);
    if (error || !data) return false;
    const ids = new Set(
      data
        .filter((row) => String((row as { status?: string }).status || "active") !== "suspended")
        .map((row) => String((row as { user_id: string }).user_id)),
    );
    return ids.size >= 2;
  } catch {
    return false;
  }
}
