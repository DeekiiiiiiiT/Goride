import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { dominionCan } from "../../../packages/auth-client/src/dominionPermissions.ts";
import { assertPlatformStaffResponse } from "./rbac_middleware.ts";

export type CatalogGuard = "staff_read" | "catalog.write" | "catalog.govern";

export function catalogActorRole(c: Context): string | null {
  const rbacUser = c.get("rbacUser") as { resolvedRole?: string; role?: string } | undefined;
  return rbacUser?.resolvedRole || rbacUser?.role || null;
}

export function catalogActorId(c: Context): string | null {
  const rbacUser = c.get("rbacUser") as { userId?: string; id?: string } | undefined;
  const id = String(rbacUser?.userId ?? rbacUser?.id ?? "").trim();
  return id || null;
}

/** Platform staff read (GET). Blocks non-staff. */
export function assertCatalogStaffReadResponse(c: Context): Response | null {
  return assertPlatformStaffResponse(c);
}

/** Draft / non-govern writes: staff + catalog.write (blocks analyst). */
export function assertCatalogWriteResponse(c: Context): Response | null {
  const staff = assertPlatformStaffResponse(c);
  if (staff) return staff;
  if (!dominionCan(catalogActorRole(c), "catalog.write")) {
    return c.json({ error: "Forbidden", message: "You cannot change that" }, 403);
  }
  return null;
}

/** Owner-level govern actions. */
export function assertCatalogGovernResponse(c: Context): Response | null {
  const staff = assertPlatformStaffResponse(c);
  if (staff) return staff;
  if (!dominionCan(catalogActorRole(c), "catalog.govern")) {
    return c.json({ error: "Forbidden", message: "Owner approval required" }, 403);
  }
  return null;
}

export function ruleStatusNeedsGovern(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim();
  return s === "active" || s === "retired" || s === "needs_checking";
}

export function bodyRequestsGovernActivation(body: Record<string, unknown>): boolean {
  if (body.status === undefined || body.status === null) return false;
  return ruleStatusNeedsGovern(String(body.status));
}

export async function insertCatalogGovernanceProposal(
  supabase: SupabaseClient,
  row: {
    entityTable: string;
    entityId: string;
    action: string;
    payload: Record<string, unknown>;
    proposedBy: string | null;
  },
) {
  const { data, error } = await supabase
    .from("catalog_governance_proposal")
    .insert({
      entity_table: row.entityTable,
      entity_id: row.entityId,
      action: row.action,
      payload: row.payload,
      proposed_by: row.proposedBy,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Support catalog.write without govern → proposal; owner applies immediately. */
export async function governWriteOrProposal(
  c: Context,
  supabase: SupabaseClient,
  proposal: {
    entityTable: string;
    entityId: string;
    action: string;
    payload: Record<string, unknown>;
  },
  apply: () => Promise<Response>,
): Promise<Response> {
  const writeDenied = assertCatalogWriteResponse(c);
  if (writeDenied) return writeDenied;
  if (dominionCan(catalogActorRole(c), "catalog.govern")) {
    const governDenied = assertCatalogGovernResponse(c);
    if (governDenied) return governDenied;
    return await apply();
  }
  const created = await insertCatalogGovernanceProposal(supabase, {
    ...proposal,
    proposedBy: catalogActorId(c),
  });
  return c.json(
    { proposal: created, message: "Submitted for owner approval" },
    202,
  );
}
