/* Table schema:
CREATE TABLE kv_store_37f42386 (
  key TEXT NOT NULL PRIMARY KEY,
  value JSONB NOT NULL
);
*/
// Permanent fleet cutover: mapped domains read/write fleet.* tables; KV left for ephemeral keys only.

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

/** Raw client — ephemeral KV keys only; mapped domains use readMappedKvKey / dual-write. */
const client = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

/** PostgREST default max rows is 1000 — must page or trips/fuel silently truncate. */
const KV_PAGE_SIZE = 1000;

/** Optional shared lookup cache for batch mset (S6). */
type StampOpts = { lookupCache?: import("./service_line_attribution.ts").ServiceLineLookupCache };

/** Fuel/expense service-line ladder — one choke point for every write path (Phase 0). */
async function stampCostRowServiceLine(
  key: string,
  value: any,
  opts?: StampOpts,
): Promise<any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  if (
    !key.startsWith("fuel_entry:") &&
    !key.startsWith("fuel-entry:") &&
    !key.startsWith("expense_journal:")
  ) {
    return value;
  }
  try {
    const { ensureCostRowServiceLine } = await import("./service_line_attribution.ts");
    return await ensureCostRowServiceLine(value as Record<string, unknown>, {
      lookupCache: opts?.lookupCache,
    });
  } catch (e) {
    // S4: never leave source NULL — stamp unattributed so sweeps can find the row.
    console.error("[kv] service-line stamp failed:", key, e);
    const { markCostRowUnattributedOnStampFailure } = await import("./service_line_attribution.ts");
    return markCostRowUnattributedOnStampFailure(value as Record<string, unknown>);
  }
}

async function afterUpsert(key: string, value: any): Promise<void> {
  try {
    const { dualWriteFleetKvUpsert } = await import("./fleet_table_dual_write.ts");
    await dualWriteFleetKvUpsert(key, value);
  } catch (e) {
    console.error("[kv] fleet table upsert failed:", key, e);
    throw e instanceof Error ? e : new Error(String(e));
  }
}

async function afterDelete(key: string): Promise<void> {
  try {
    const { dualWriteFleetKvDelete } = await import("./fleet_table_dual_write.ts");
    await dualWriteFleetKvDelete(key);
  } catch (e) {
    console.error("[kv] fleet table delete failed:", key, e);
    throw e instanceof Error ? e : new Error(String(e));
  }
}

async function allowLegacyWrite(key: string): Promise<boolean> {
  try {
    const { shouldWriteLegacyKv } = await import("./fleet_table_dual_write.ts");
    return shouldWriteLegacyKv(key);
  } catch {
    return true;
  }
}

// Set stores a key-value pair (fleet table for mapped domains; KV for ephemeral).
export const set = async (key: string, value: any): Promise<void> => {
  const stamped = await stampCostRowServiceLine(key, value);
  const writeKv = await allowLegacyWrite(key);
  if (writeKv) {
    const supabase = client();
    const { error } = await supabase.from("kv_store_37f42386").upsert({
      key,
      value: stamped,
    });
    if (error) {
      throw new Error(error.message);
    }
  }
  await afterUpsert(key, stamped);
  if (key.startsWith("transaction:") && stamped && typeof stamped === "object") {
    try {
      const { mirrorSettlementTransaction } = await import("./settlement_transactions.ts");
      await mirrorSettlementTransaction(stamped as Record<string, unknown>);
    } catch (e) {
      console.error("[kv] settlement transaction mirror failed:", key, e);
    }
  }
};

// Get retrieves a key-value pair (fleet table first for mapped domains).
export const get = async (key: string): Promise<any> => {
  try {
    const { readMappedKvKey } = await import("./fleet_table_read_thru.ts");
    const mapped = await readMappedKvKey(key);
    if (mapped !== undefined) return mapped;
  } catch (e) {
    console.error("[kv] fleet read-thru get failed:", key, e);
  }
  const supabase = client();
  const { data, error } = await supabase.from("kv_store_37f42386").select("value").eq("key", key).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data?.value;
};

async function afterSettlementTxDelete(key: string): Promise<void> {
  if (!key.startsWith("transaction:")) return;
  try {
    const { unmirrorSettlementTransaction } = await import("./settlement_transactions.ts");
    await unmirrorSettlementTransaction(key.slice("transaction:".length));
  } catch (e) {
    console.error("[kv] settlement transaction unmirror failed:", key, e);
  }
}

// Delete deletes a key-value pair.
export const del = async (key: string): Promise<void> => {
  const writeKv = await allowLegacyWrite(key);
  if (writeKv) {
    const supabase = client();
    const { error } = await supabase.from("kv_store_37f42386").delete().eq("key", key);
    if (error) {
      throw new Error(error.message);
    }
  }
  await afterDelete(key);
  await afterSettlementTxDelete(key);
};

// Sets multiple key-value pairs.
export const mset = async (keys: string[], values: any[]): Promise<void> => {
  // S6: one lookup cache for the whole batch — vehicle/driver/trip/card shared across rows.
  const { createServiceLineLookupCache } = await import("./service_line_attribution.ts");
  const lookupCache = createServiceLineLookupCache();
  const stampedValues: any[] = [];
  for (let i = 0; i < keys.length; i++) {
    stampedValues[i] = await stampCostRowServiceLine(keys[i], values[i], { lookupCache });
    // Keep caller array in sync so subsequent reads of values[i] see attribution.
    values[i] = stampedValues[i];
  }
  const pairs: { key: string; value: any }[] = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const writeKv = await allowLegacyWrite(k);
    if (writeKv) pairs.push({ key: k, value: stampedValues[i] });
  }
  if (pairs.length > 0) {
    const supabase = client();
    const { error } = await supabase.from("kv_store_37f42386").upsert(pairs);
    if (error) {
      throw new Error(error.message);
    }
  }
  await Promise.all(keys.map((k, i) => afterUpsert(k, stampedValues[i])));
};

// Gets multiple key-value pairs (same order as keys).
export const mget = async (keys: string[]): Promise<any[]> => {
  if (keys.length === 0) return [];
  let mapped = new Map<string, any>();
  try {
    const { readMappedKvKeys } = await import("./fleet_table_read_thru.ts");
    mapped = await readMappedKvKeys(keys);
  } catch (e) {
    console.error("[kv] fleet read-thru mget failed:", e);
  }
  const missing = keys.filter((k) => !mapped.has(k));
  const byKey = new Map(mapped);
  if (missing.length > 0) {
    const supabase = client();
    const { data, error } = await supabase.from("kv_store_37f42386").select("key, value").in("key", missing);
    if (error) {
      throw new Error(error.message);
    }
    for (const row of data ?? []) byKey.set(row.key, row.value);
  }
  return keys.map((k) => byKey.get(k) ?? null);
};

// Deletes multiple key-value pairs.
export const mdel = async (keys: string[]): Promise<void> => {
  const toDelete: string[] = [];
  for (const k of keys) {
    if (await allowLegacyWrite(k)) toDelete.push(k);
  }
  if (toDelete.length > 0) {
    const supabase = client();
    const { error } = await supabase.from("kv_store_37f42386").delete().in("key", toDelete);
    if (error) {
      throw new Error(error.message);
    }
  }
  await Promise.all(keys.map((k) => afterDelete(k)));
  await Promise.all(keys.map((k) => afterSettlementTxDelete(k)));
};

/**
 * Search by prefix — fleet tables for mapped domains; KV for ephemeral prefixes.
 */
export const getByPrefix = async (prefix: string): Promise<any[]> => {
  try {
    const { readMappedKvPrefix } = await import("./fleet_table_read_thru.ts");
    const mapped = await readMappedKvPrefix(prefix);
    if (mapped !== null) return mapped;
  } catch (e) {
    console.error("[kv] fleet read-thru prefix failed:", prefix, e);
  }
  const supabase = client();
  const out: any[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("kv_store_37f42386")
      .select("key, value")
      .like("key", prefix + "%")
      .order("key", { ascending: true })
      .range(from, from + KV_PAGE_SIZE - 1);
    if (error) {
      throw new Error(error.message);
    }
    const rows = data ?? [];
    for (const row of rows) out.push(row.value);
    if (rows.length < KV_PAGE_SIZE) break;
    from += KV_PAGE_SIZE;
  }
  return out;
};
