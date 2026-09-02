/**
 * Dual-write from KV writes into fleet.* tables (via public.fleet_* views).
 * Failures must throw — silent drops caused Approved fuel expenses with no Transaction Log row.
 */
import { getServiceClient } from "./service_client.ts";
import { resolveDomain } from "./fleet_domains.ts";
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

  const row = def.mapRow(key, value as Record<string, unknown>);
  if (!row) {
    await logMetric(def.domain, "skip", "map_null", key);
    return;
  }
  if (row.organization_id == null || row.organization_id === "") {
    console.warn(
      `[fleetDualWrite] mapRow produced null organization_id for key=${key} domain=${def.domain}`,
    );
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
