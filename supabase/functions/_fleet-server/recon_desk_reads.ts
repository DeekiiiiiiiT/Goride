/**
 * Week Reconciliation Round 4c — shaping for the step 6 cash check and the
 * step 8 History (WRA-07, WRA-30, WRA-32). Pure where it can be, so it is testable.
 */
import {
  isCashSourceAckValid,
} from "../../../packages/finance-core/src/closeInvariants.ts";
import { readFinanceCoreCash } from "../../../packages/finance-core/src/closeInvariantInput.ts";
import { hasPermission as catalogHasPermission } from "../../../packages/auth-client/src/permissions.ts";
import { getServiceClient } from "./service_client.ts";

/** Same tolerance the close check uses for statement cash. */
const CASH_EPS = 0.01;

export type DeskCashMismatch = {
  driverId: string;
  driverName: string | null;
  weekKey: string;
  uberCash: number;
  uberTripCash: number;
  mismatch: number;
  /** True when an earlier "Accept statement cash" still covers this difference. */
  accepted: boolean;
};

/** Statement cash vs trip cash per driver, from saved driver weeks only. */
export function deskCashMismatches(
  rows: Array<{ driver_id: string; driver_name?: string | null; metadata: Record<string, unknown> | null }>,
  weekKey: string,
): DeskCashMismatch[] {
  const out: DeskCashMismatch[] = [];
  for (const row of rows) {
    const cash = readFinanceCoreCash(row.metadata);
    if (Math.abs(cash.cashSourceMismatch) <= CASH_EPS && !cash.cashSourceAck) continue;
    out.push({
      driverId: String(row.driver_id),
      driverName: row.driver_name != null ? String(row.driver_name) : null,
      weekKey,
      uberCash: cash.uberCash,
      uberTripCash: cash.uberTripCash,
      mismatch: cash.cashSourceMismatch,
      accepted: isCashSourceAckValid(cash.cashSourceAck, cash.cashSourceMismatch),
    });
  }
  return out.sort((a, b) => Math.abs(b.mismatch) - Math.abs(a.mismatch));
}

/** Calculator bookkeeping rows are not decisions; History leaves them out. */
export const HISTORY_HIDDEN_KINDS = new Set(["calculator_publish", "refresh"]);

const KIND_LABEL: Record<string, string> = {
  source_attest_none: "Marked no activity",
  source_waived: "Waived a required file",
  external_source_requested: "Reminded Roam",
  attribution_manual: "Assigned service lines",
  step_complete: "Completed a step",
  seal_earnings: "Sealed earnings",
  week_close_started: "Closed the week",
  week_reopened: "Reopened the week",
  cash_source_accepted: "Accepted statement cash",
  approval_request: "Sent for approval",
  approval_failed: "Approved, but the change failed",
  change_failed: "Change failed",
  data_restatement: "Correction raised automatically",
  sign_data_restatement: "Signed correction",
  legacy_cleanup: "Closed as old clean-up week",
  upload: "Uploaded a file",
};

export type HistoryRow = {
  id: string | number;
  kind: string;
  step: string | null;
  actor: string | null;
  at: string;
  reason: string | null;
  payload: Record<string, unknown> | null;
  prepared_by: string | null;
  approved_by: string | null;
  self_approved: boolean | null;
  status: string | null;
};

export type HistoryItem = {
  id: string;
  at: string;
  step: string | null;
  label: string;
  reason: string | null;
  by: string;
  /** "Prepared by A · Approved by B", "Self-approved", or null. */
  approval: string | null;
  selfApproved: boolean;
  status: string;
  system: boolean;
};

function nameOf(id: string | null | undefined, names: Map<string, string>): string {
  const key = String(id || "").trim();
  if (!key || key === "system") return "System";
  return names.get(key) || key;
}

export function historyItem(row: HistoryRow, names: Map<string, string>): HistoryItem {
  const payloadLabel = typeof row.payload?.label === "string" ? String(row.payload.label) : null;
  const base = KIND_LABEL[row.kind] || row.kind.replace(/_/g, " ");
  const label = row.kind === "approval_request" && payloadLabel ? `${payloadLabel} — sent for approval` : base;
  const self = Boolean(row.self_approved);
  let approval: string | null = null;
  if (self) approval = "Self-approved";
  else if (row.prepared_by && row.approved_by && row.prepared_by !== row.approved_by) {
    approval = `Prepared by ${nameOf(row.prepared_by, names)} · Approved by ${nameOf(row.approved_by, names)}`;
  }
  return {
    id: String(row.id),
    at: row.at,
    step: row.step,
    label,
    reason: row.reason,
    by: nameOf(row.prepared_by || row.actor, names),
    approval,
    selfApproved: self,
    status: String(row.status || "applied"),
    system: !row.actor || row.actor === "system" || row.prepared_by === "system",
  };
}

/** Names for user ids (staff profile name, else email). Unknown ids are left as they are. */
export async function displayNamesFor(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids.map((i) => String(i || "").trim()).filter((i) => i && i !== "system"))].slice(0, 50);
  for (const id of unique) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
    try {
      const { data } = await getServiceClient().auth.admin.getUserById(id);
      const u = data?.user;
      const meta = (u?.user_metadata ?? {}) as { full_name?: string; name?: string };
      const name = String(meta.full_name || meta.name || u?.email || "").trim();
      if (name) names.set(id, name);
    } catch {
      /* keep the id */
    }
  }
  return names;
}

/** Does any other active person in the org hold recon.approve? (hides "Send for approval" when not). */
export function countOtherApprovers(
  members: Array<{ userId: string; roleName: string }>,
  ownerId: string | null,
  me: string,
): number {
  const approvers = new Set<string>();
  for (const m of members) {
    if (catalogHasPermission(m.roleName as never, "recon.approve" as never)) approvers.add(m.userId);
  }
  if (ownerId) approvers.add(ownerId);
  approvers.delete(me);
  return approvers.size;
}

export async function loadOtherApproverCount(orgId: string, me: string): Promise<number> {
  const sb = getServiceClient();
  const platform = sb.schema("platform");
  const { data: links } = await platform.from("user_roles")
    .select("user_id, role_id, status").eq("scope_type", "organization").eq("scope_id", orgId);
  const active = (links ?? []).filter((r) => String((r as { status?: string }).status || "active") === "active");
  const roleIds = [...new Set(active.map((r) => String((r as { role_id: string }).role_id)))];
  const roleName = new Map<string, string>();
  if (roleIds.length) {
    const { data: roles } = await platform.from("roles").select("id, name").in("id", roleIds);
    for (const r of roles ?? []) roleName.set(String((r as { id: string }).id), String((r as { name: string }).name));
  }
  const { data: org } = await sb.from("organizations").select("owner_id").eq("id", orgId).maybeSingle();
  return countOtherApprovers(
    active.map((r) => ({
      userId: String((r as { user_id: string }).user_id),
      roleName: roleName.get(String((r as { role_id: string }).role_id)) || "",
    })),
    String((org as { owner_id?: string } | null)?.owner_id || "") || null,
    me,
  );
}

/** Driver name from the driver record (`driver:<id>` in the KV store). Empty when unknown. */
export function driverNameFromRecord(record: unknown): string | null {
  if (!record || typeof record !== "object") return null;
  const d = record as Record<string, unknown>;
  const name = d.name ?? d.driverName ?? d.fullName ?? d.displayName;
  const text = name != null ? String(name).trim() : "";
  return text || null;
}

/**
 * driver_financial_periods has no name column; add each driver's name from the driver records.
 * `lookup` is the KV read (passed in so tests need no database).
 */
export async function withDriverNames<T extends { driver_id: string }>(
  rows: T[],
  lookup?: (key: string) => Promise<unknown>,
): Promise<Array<T & { driver_name: string | null }>> {
  const get = lookup ?? (async (key: string) => (await import("./kv_store.tsx")).get(key));
  const ids = [...new Set(rows.map((r) => String(r.driver_id)).filter(Boolean))];
  const names = new Map<string, string | null>();
  await Promise.all(ids.map(async (id) => {
    try {
      names.set(id, driverNameFromRecord(await get(`driver:${id}`)));
    } catch {
      names.set(id, null);
    }
  }));
  return rows.map((r) => ({ ...r, driver_name: names.get(String(r.driver_id)) ?? null }));
}
