/**
 * Driver id → canonical driver id, across every id a driver is known by (Roam, Uber, InDrive, legacy KV ids).
 * Moved out of the old toll controller (docs/toll-old-system-removal-audit.md S2); same data, same 5-minute cache.
 */
import { buildDriverAliasMap, type DriverIdentityLike } from "./driver_identity.ts";
import { domainForPrefix, iterateFleet } from "./repos/baseRepo.ts";
import * as kv from "./kv_store.tsx";

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: Map<string, string> | null = null;
let cachedAt = 0;

async function loadAllDrivers(): Promise<DriverIdentityLike[]> {
  try {
    const def = domainForPrefix("driver:");
    if (def) {
      const out: DriverIdentityLike[] = [];
      for await (const row of iterateFleet(def.domain, {
        legacyPrefix: "driver:",
        order: { col: "legacy_kv_id", ascending: true },
      })) {
        out.push(row as DriverIdentityLike);
      }
      return out;
    }
  } catch (e) {
    console.warn("[driver_alias_map] fleet drivers read failed, falling back to KV:", e instanceof Error ? e.message : e);
  }
  return ((await kv.getByPrefix("driver:")) ?? []) as DriverIdentityLike[];
}

export async function getDriverAliasMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cache && now - cachedAt < CACHE_TTL_MS) return cache;
  cache = buildDriverAliasMap(await loadAllDrivers());
  cachedAt = now;
  return cache;
}
