/**
 * Best-effort dual-write from KV writes into fleet.* tables (via public.fleet_* views).
 * Called from kv_store set/mset/del/mdel (non-blocking on failure).
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

  try {
    const row = def.mapRow(key, value as Record<string, unknown>);
    if (!row) {
      await logMetric(def.domain, "skip", "map_null", key);
      return;
    }
    const { error } = await fleetClient().from(tableName(def.table)).upsert(row, { onConflict: "id" });
    if (error) {
      console.error(`[fleetDualWrite] upsert ${def.domain} ${key}:`, error.message);
      await logMetric(def.domain, "fail", error.message, key);
      return;
    }
    await logMetric(def.domain, "ok", "upserted", key);
  } catch (e) {
    console.error(`[fleetDualWrite] upsert ${def.domain} ${key}:`, e);
    await logMetric(def.domain, "fail", e instanceof Error ? e.message : String(e), key);
  }
}

export async function dualWriteFleetKvDelete(key: string): Promise<void> {
  const def = resolveDomain(key);
  if (!def) return;
  if (!isFleetTableWriteEnabled(def.domain)) return;
  try {
    const { error } = await fleetClient().from(tableName(def.table)).delete().eq("legacy_kv_id", key);
    if (error) {
      const id = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
      await fleetClient().from(tableName(def.table)).delete().eq("id", id);
    }
    await logMetric(def.domain, "ok", "deleted", key);
  } catch (e) {
    console.error(`[fleetDualWrite] delete ${def.domain} ${key}:`, e);
    await logMetric(def.domain, "fail", e instanceof Error ? e.message : String(e), key);
  }
}

/** Gate whether the KV body write should happen for this key's domain. */
export function shouldWriteLegacyKv(key: string): boolean {
  const def = resolveDomain(key);
  if (!def) return true;
  return isLegacyKvWriteEnabled(def.domain);
}
