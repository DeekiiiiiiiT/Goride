/**
 * Fleet table read-through for KV-shaped access (permanent cutover).
 */
import { FLEET_DOMAINS } from "./fleet_domains.ts";
import { isFleetReadTableEnabled } from "./fleet_table_flags.ts";
import {
  getByLegacyKvId,
  listAll,
  rowToKvValue,
  fleetDb,
  fleetTable,
} from "./repos/baseRepo.ts";
import { resolveDomain } from "./fleet_domains.ts";

export async function readMappedKvKey(key: string): Promise<any | undefined> {
  const def = resolveDomain(key);
  if (!def || !isFleetReadTableEnabled(def.domain)) return undefined;
  try {
    const row = await getByLegacyKvId(def.domain, key);
    // Distinguish "not mapped" (undefined) vs "mapped missing" (null)
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
 */
export async function readMappedKvPrefix(prefix: string): Promise<any[] | null> {
  const domainDef = FLEET_DOMAINS.find((d) =>
    d.prefixes.some((p) => prefix === p || prefix.startsWith(p) || p.startsWith(prefix)),
  );
  if (!domainDef || !isFleetReadTableEnabled(domainDef.domain)) return null;

  try {
    // Exact single-prefix domain load
    if (domainDef.prefixes.length === 1 && (prefix === domainDef.prefixes[0] || domainDef.prefixes[0].startsWith(prefix))) {
      return await listAll(domainDef.domain);
    }

    // Multi-prefix or partial: filter legacy_kv_id by caller's prefix
    const matchPrefix =
      domainDef.prefixes.find((p) => p === prefix) ??
      domainDef.prefixes.find((p) => p.startsWith(prefix)) ??
      prefix;

    const PAGE = 1000;
    const out: any[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await fleetDb()
        .from(fleetTable(domainDef.table))
        .select("*")
        .like("legacy_kv_id", `${matchPrefix}%`)
        .order("legacy_kv_id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = data || [];
      for (const r of rows) out.push(rowToKvValue(r as Record<string, unknown>));
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return out;
  } catch (e) {
    console.error("[fleetReadThru] prefix", prefix, e);
    return [];
  }
}
