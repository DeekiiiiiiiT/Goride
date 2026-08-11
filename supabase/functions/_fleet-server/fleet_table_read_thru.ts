/**
 * Fleet table read-through for KV-shaped access (permanent cutover).
 * Prefer filtered queryFleet for large domains — listAll is a last resort.
 */
import { FLEET_DOMAINS } from "./fleet_domains.ts";
import { isFleetReadTableEnabled } from "./fleet_table_flags.ts";
import {
  getByLegacyKvId,
  queryFleet,
  iterateFleet,
} from "./repos/baseRepo.ts";
import { resolveDomain } from "./fleet_domains.ts";

export async function readMappedKvKey(key: string): Promise<any | undefined> {
  const def = resolveDomain(key);
  if (!def || !isFleetReadTableEnabled(def.domain)) return undefined;
  try {
    const row = await getByLegacyKvId(def.domain, key);
    return row;
  } catch (e) {
    console.error("[fleetReadThru] get", key, e);
    return null;
  }
}

export async function readMappedKvKeys(keys: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  await Promise.all(
    keys.map(async (key) => {
      const def = resolveDomain(key);
      if (!def || !isFleetReadTableEnabled(def.domain)) return;
      const val = await readMappedKvKey(key);
      if (val != null) out.set(key, val);
    }),
  );
  return out;
}

/**
 * Returns null if prefix is not a mapped fleet domain (caller should hit KV).
 * Returns array (possibly empty) for mapped domains.
 * Uses paged iterate — never a single unbounded PostgREST response.
 */
export async function readMappedKvPrefix(prefix: string): Promise<any[] | null> {
  const domainDef = FLEET_DOMAINS.find((d) =>
    d.prefixes.some((p) => prefix === p || prefix.startsWith(p) || p.startsWith(prefix)),
  );
  if (!domainDef || !isFleetReadTableEnabled(domainDef.domain)) return null;

  try {
    const matchPrefix =
      domainDef.prefixes.find((p) => p === prefix) ??
      domainDef.prefixes.find((p) => p.startsWith(prefix)) ??
      prefix;

    // Exact domain prefix → page whole table
    const exact =
      domainDef.prefixes.length === 1 &&
      (prefix === domainDef.prefixes[0] || domainDef.prefixes[0].startsWith(prefix));

    if (exact) {
      const out: any[] = [];
      for await (const row of iterateFleet(domainDef.domain, {
        order: { col: "legacy_kv_id", ascending: true },
      })) {
        out.push(row);
      }
      return out;
    }

    // Partial / multi-prefix: filter legacy_kv_id in SQL with pagination
    const res = await queryFleet(domainDef.domain, {
      legacyPrefix: matchPrefix,
      order: { col: "legacy_kv_id", ascending: true },
      limit: 50000,
      offset: 0,
    });
    // queryFleet caps at 5000 per call — page remaining
    const out = [...(res.data as any[])];
    let offset = out.length;
    while (out.length >= 5000 && out.length % 5000 === 0) {
      const more = await queryFleet(domainDef.domain, {
        legacyPrefix: matchPrefix,
        order: { col: "legacy_kv_id", ascending: true },
        limit: 5000,
        offset,
      });
      if (more.error || more.data.length === 0) break;
      out.push(...(more.data as any[]));
      offset += more.data.length;
      if (more.data.length < 5000) break;
    }
    return out;
  } catch (e) {
    console.error("[fleetReadThru] prefix", prefix, e);
    return [];
  }
}
