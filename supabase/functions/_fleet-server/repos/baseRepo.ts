/**
 * Thin repository helpers for fleet.* tables (via public.fleet_* views for PostgREST).
 */
import { getServiceClient } from "../service_client.ts";
import { FLEET_DOMAINS, type FleetDomainDef } from "../fleet_domains.ts";
import type { FleetDomain } from "../fleet_table_flags.ts";
import { isFleetReadTableEnabled } from "../fleet_table_flags.ts";

export function fleetDb() {
  return getServiceClient();
}

export function fleetTable(table: string): string {
  return `fleet_${table}`;
}

export function getDomainDef(domain: FleetDomain): FleetDomainDef {
  const d = FLEET_DOMAINS.find((x) => x.domain === domain);
  if (!d) throw new Error(`Unknown fleet domain: ${domain}`);
  return d;
}

/** Row → legacy KV-like value (prefer payload_json). */
export function rowToKvValue(row: Record<string, unknown>): Record<string, unknown> {
  const payload =
    row.payload_json && typeof row.payload_json === "object" && !Array.isArray(row.payload_json)
      ? { ...(row.payload_json as Record<string, unknown>) }
      : {};
  if (!payload.id && row.id) payload.id = row.id;
  if (!payload.organizationId && row.organization_id) payload.organizationId = row.organization_id;
  return payload;
}

export async function listByOrg(
  domain: FleetDomain,
  organizationId: string | null | undefined,
  opts?: { limit?: number },
): Promise<Record<string, unknown>[]> {
  const def = getDomainDef(domain);
  let q = fleetDb().from(fleetTable(def.table)).select("*").order("updated_at", { ascending: false });
  if (organizationId) q = q.eq("organization_id", organizationId);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((r) => rowToKvValue(r as Record<string, unknown>));
}

export async function getById(
  domain: FleetDomain,
  id: string,
): Promise<Record<string, unknown> | null> {
  const def = getDomainDef(domain);
  const { data, error } = await fleetDb().from(fleetTable(def.table)).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToKvValue(data as Record<string, unknown>);
}

export async function countTable(domain: FleetDomain, organizationId?: string | null): Promise<number> {
  const def = getDomainDef(domain);
  let q = fleetDb().from(fleetTable(def.table)).select("*", { count: "exact", head: true });
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export function shouldReadTable(domain: FleetDomain): boolean {
  return isFleetReadTableEnabled(domain);
}
