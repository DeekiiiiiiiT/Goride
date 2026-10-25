/**
 * Per-company settlement approval cap. Default stays $50,000.
 * A missing or failed staff count is treated as a one-person company.
 */
import { getServiceClient } from "./service_client.ts";
import * as kv from "./kv_store.tsx";
import { SETTLEMENT_APPROVAL_THRESHOLD } from "../../../packages/finance-core/src/settlementApproval.ts";
import { fuelApproverIds } from "../../../packages/finance-core/src/fuelApprovers.ts";

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
    const sb = getServiceClient();
    const [{ data, error }, owner] = await Promise.all([
      sb
        .schema("platform")
        .from("user_roles")
        .select("user_id, status, roles(name)")
        .eq("scope_type", "organization")
        .eq("scope_id", orgId),
      sb.from("organizations").select("owner_id").eq("id", orgId).maybeSingle(),
    ]);
    if (error || !data) return false;
    const ids = fuelApproverIds({
      seats: data.map((row) => {
        const roles = (row as { roles?: { name?: string } | Array<{ name?: string }> }).roles;
        const role = Array.isArray(roles) ? roles[0]?.name : roles?.name;
        return {
          userId: String((row as { user_id: string }).user_id || ""),
          role: String(role || ""),
          status: String((row as { status?: string }).status || "active"),
        };
      }),
      ownerId: owner.data?.owner_id ? String(owner.data.owner_id) : null,
    });
    return ids.length >= 2;
  } catch {
    return false;
  }
}
