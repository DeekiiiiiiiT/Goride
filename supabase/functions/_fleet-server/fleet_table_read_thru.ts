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
 * Throws on a failed mapped read. Never returns [] for an error.
 */
export class FleetReadThruError extends Error {
  prefix: string;
  constructor(prefix: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`fleet read failed for ${prefix}: ${message}`);
    this.name = "FleetReadThruError";
    this.prefix = prefix;
  }
}

/** Station master rows from the public table. Callers no longer scan the old key-value prefix. */
export async function listStationRecords(): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for await (const row of iterateFleet("stations", { order: { col: "id", ascending: true } })) {
    out.push(row as Record<string, unknown>);
  }
  return out;
}

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

    // Page every mapped prefix, including domains with more than one key prefix.
    const page = 1000;
    const out: any[] = [];
    let offset = 0;
    for (;;) {
      const more = await queryFleet(domainDef.domain, {
        legacyPrefix: matchPrefix,
        order: { col: "legacy_kv_id", ascending: true },
        limit: page,
        offset,
      });
      if (more.error) throw new FleetReadThruError(prefix, more.error);
      const rows = (more.data || []) as any[];
      out.push(...rows);
      if (rows.length < page) break;
      offset += rows.length;
      if (offset > 200000) throw new FleetReadThruError(prefix, "page cap");
    }
    return out;
  } catch (e) {
    if (e instanceof FleetReadThruError) throw e;
    console.error("[fleetReadThru] prefix", prefix, e);
    throw new FleetReadThruError(prefix, e);
  }
}
