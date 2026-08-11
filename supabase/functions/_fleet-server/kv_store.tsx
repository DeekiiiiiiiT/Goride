/* Table schema:
CREATE TABLE kv_store_37f42386 (
  key TEXT NOT NULL PRIMARY KEY,
  value JSONB NOT NULL
);
*/
// Fleet strangler: set/mset/del/mdel dual-write into fleet.* when mapped (see fleet_table_dual_write.ts).

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const client = () => createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
);

/** PostgREST default max rows is 1000 — must page or trips/fuel silently truncate. */
const KV_PAGE_SIZE = 1000;

async function afterUpsert(key: string, value: any): Promise<void> {
  try {
    const { dualWriteFleetKvUpsert } = await import("./fleet_table_dual_write.ts");
    await dualWriteFleetKvUpsert(key, value);
  } catch (e) {
    console.error("[kv] fleet dual-write upsert failed:", key, e);
  }
}

async function afterDelete(key: string): Promise<void> {
  try {
    const { dualWriteFleetKvDelete } = await import("./fleet_table_dual_write.ts");
    await dualWriteFleetKvDelete(key);
  } catch (e) {
    console.error("[kv] fleet dual-write delete failed:", key, e);
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

// Set stores a key-value pair in the database.
export const set = async (key: string, value: any): Promise<void> => {
  const writeKv = await allowLegacyWrite(key);
  if (writeKv) {
    const supabase = client();
    const { error } = await supabase.from("kv_store_37f42386").upsert({
      key,
      value,
    });
    if (error) {
      throw new Error(error.message);
    }
  }
  await afterUpsert(key, value);
};

// Get retrieves a key-value pair from the database.
export const get = async (key: string): Promise<any> => {
  const supabase = client()
  const { data, error } = await supabase.from("kv_store_37f42386").select("value").eq("key", key).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data?.value;
};

// Delete deletes a key-value pair in the database.
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
};

// Sets multiple key-value pairs in the database.
export const mset = async (keys: string[], values: any[]): Promise<void> => {
  const pairs: { key: string; value: any }[] = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const writeKv = await allowLegacyWrite(k);
    if (writeKv) pairs.push({ key: k, value: values[i] });
  }
  if (pairs.length > 0) {
    const supabase = client();
    const { error } = await supabase.from("kv_store_37f42386").upsert(pairs);
    if (error) {
      throw new Error(error.message);
    }
  }
  await Promise.all(keys.map((k, i) => afterUpsert(k, values[i])));
};

// Gets multiple key-value pairs in the database.
// Results are returned in the same order as `keys` (Postgres IN does not guarantee order).
export const mget = async (keys: string[]): Promise<any[]> => {
  if (keys.length === 0) return [];
  const supabase = client()
  const { data, error } = await supabase.from("kv_store_37f42386").select("key, value").in("key", keys);
  if (error) {
    throw new Error(error.message);
  }
  const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));
  return keys.map((k) => byKey.get(k) ?? null);
};

// Deletes multiple key-value pairs in the database.
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
};

/**
 * Search for key-value pairs by prefix.
 * Pages through all matches — never return a silent 1000-row slice.
 */
export const getByPrefix = async (prefix: string): Promise<any[]> => {
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
