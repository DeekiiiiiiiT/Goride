/**
 * Dual-write from KV writes into fleet.* tables (via public.fleet_* views).
 * Failures must throw — silent drops caused Approved fuel expenses with no Transaction Log row.
 */
import { getServiceClient } from "./service_client.ts";
import { currentMasterActor, currentMasterReason } from "./master_actor.ts";
import { orgOf, resolveDomain } from "./fleet_domains.ts";
import {
  isFleetTableWriteEnabled,
  isLegacyKvWriteEnabled,
  type FleetDomain,
} from "./fleet_table_flags.ts";

function fleetClient() {
  return getServiceClient();
}

function tableName(table: string): string {
  return `fleet_${table}`;
}

/** Global catalogs. Every other fleet domain belongs to one company. */
const GLOBAL_DOMAINS = new Set(["stations", "toll_plazas", "platform_vendors"]);
const MASTER_TABLES = new Set(["stations", "toll_plazas", "platform_vendors"]);
// payload_json stays on these three tables. Typed columns do not hold contact,
// amenities, parish text, or plaza direction. Dropping the column would erase them.

async function logMetric(domain: FleetDomain, status: string, reason?: string, legacyKvId?: string) {
  try {
    await fleetClient().from("fleet_dual_write_metrics").insert({
      domain,
      status,
      reason: reason ?? null,
      legacy_kv_id: legacyKvId ?? null,
    });
  } catch {
    /* metrics best-effort */
  }
}

export async function dualWriteFleetKvUpsert(key: string, value: unknown): Promise<void> {
  const def = resolveDomain(key);
  if (!def) return;
  if (!isFleetTableWriteEnabled(def.domain)) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) return;

  const record = value as Record<string, unknown>;
  const companyId = orgOf(record);
  if (companyId && !record.organizationId) record.organizationId = companyId;
  const row = def.mapRow(key, record);
  if (!row) {
    await logMetric(def.domain, "skip", "map_null", key);
    return;
  }
  if (!GLOBAL_DOMAINS.has(def.domain) && (row.organization_id == null || row.organization_id === "")) {
    const reason = "missing_organization_id";
    await logMetric(def.domain, "fail", reason, key);
    throw new Error(`[fleetDualWrite] ${def.domain} ${key} is missing a company`);
  }
  if (MASTER_TABLES.has(def.table)) {
    const { error: rpcError } = await getServiceClient().rpc("fleet_upsert_master", {
      p_table: def.table,
      p_row: row,
      p_actor: currentMasterActor() ?? "",
      p_action: currentMasterReason(),
    });
    if (rpcError) {
      console.error(`[fleetDualWrite] upsert ${def.domain} ${key}:`, rpcError.message);
      await logMetric(def.domain, "fail", rpcError.message, key);
      throw new Error(`[fleetDualWrite] upsert ${def.domain} failed: ${rpcError.message}`);
    }
    await logMetric(def.domain, "ok", "upserted", key);
    return;
  }
  const { error } = await fleetClient().from(tableName(def.table)).upsert(row, { onConflict: "id" });
  if (error) {
    console.error(`[fleetDualWrite] upsert ${def.domain} ${key}:`, error.message);
    await logMetric(def.domain, "fail", error.message, key);
    throw new Error(`[fleetDualWrite] upsert ${def.domain} failed: ${error.message}`);
  }
  await logMetric(def.domain, "ok", "upserted", key);
}

export async function dualWriteFleetKvDelete(key: string): Promise<void> {
  const def = resolveDomain(key);
  if (!def) return;
  if (!isFleetTableWriteEnabled(def.domain)) return;
  if (MASTER_TABLES.has(def.table)) {
    const id = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
    const { error: rpcError } = await getServiceClient().rpc("fleet_delete_master", {
      p_table: def.table,
      p_id: id,
      p_actor: currentMasterActor() ?? "",
    });
    if (rpcError) {
      console.error(`[fleetDualWrite] delete ${def.domain} ${key}:`, rpcError.message);
      await logMetric(def.domain, "fail", rpcError.message, key);
      throw new Error(`[fleetDualWrite] delete ${def.domain} failed: ${rpcError.message}`);
    }
    await logMetric(def.domain, "ok", "deleted", key);
    return;
  }
  const { error } = await fleetClient().from(tableName(def.table)).delete().eq("legacy_kv_id", key);
  if (error) {
    const id = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
    const { error: byIdErr } = await fleetClient().from(tableName(def.table)).delete().eq("id", id);
    if (byIdErr) {
      console.error(`[fleetDualWrite] delete ${def.domain} ${key}:`, byIdErr.message);
      await logMetric(def.domain, "fail", byIdErr.message, key);
      throw new Error(`[fleetDualWrite] delete ${def.domain} failed: ${byIdErr.message}`);
    }
  }
  await logMetric(def.domain, "ok", "deleted", key);
}

/** Gate whether the KV body write should happen for this key's domain. */
export function shouldWriteLegacyKv(key: string): boolean {
  const def = resolveDomain(key);
  if (!def) return true;
  return isLegacyKvWriteEnabled(def.domain);
}
