/**
 * Resolve JAA statement ↔ driver/ops linked fuel_entry pairs for Silent Attach twin sync.
 * Does not invent links — only follows jaaMatchedDriverEntryId / jaaMatchedStatementId.
 */

import * as kv from "./kv_store.tsx";
import { isJaaStatementLedgerRow } from "./fuel_jaa_ledger.ts";

function metaOf(entry: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const m = entry?.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

function asId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Peer ids declared on this entry's JAA match metadata (one hop). */
export function collectDeclaredTwinIds(entry: Record<string, unknown>): string[] {
  const m = metaOf(entry);
  const out: string[] = [];
  const driver = asId(m.jaaMatchedDriverEntryId);
  const statement = asId(m.jaaMatchedStatementId);
  if (driver) out.push(driver);
  if (statement) out.push(statement);
  return out;
}

/**
 * Pure pair expansion given a seed id and an id→entry map (for unit tests).
 * Always includes seed. Follows one hop each way; accepts one-way or reciprocal links.
 */
export function expandLinkedFuelEntryIdsFromMap(
  seedId: string,
  byId: Map<string, Record<string, unknown>>,
): string[] {
  const seed = String(seedId || "").trim();
  if (!seed) return [];

  const ids = new Set<string>([seed]);
  const seedEntry = byId.get(seed);
  if (seedEntry) {
    for (const peerId of collectDeclaredTwinIds(seedEntry)) {
      ids.add(peerId);
      const peer = byId.get(peerId);
      if (peer) {
        for (const back of collectDeclaredTwinIds(peer)) {
          ids.add(back);
        }
      }
    }
  }

  return Array.from(ids).sort();
}

/**
 * Prefer the Fleet Fuel Logs (ops/driver) row id when present in the pair.
 * Statement ledger rows are Card Inventory only.
 */
export function pickFleetVisibleEntryId(
  ids: string[],
  byId: Map<string, Record<string, unknown>>,
): string | null {
  if (ids.length === 0) return null;
  for (const id of ids) {
    const e = byId.get(id);
    if (e && !isJaaStatementLedgerRow(e)) return id;
  }
  return ids[0] || null;
}

export type LinkedFuelPair = {
  /** All ids in the linked set (sorted). Always includes seed. */
  ids: string[];
  /** True when more than the seed was resolved. */
  expanded: boolean;
  /** Ops/driver id when distinguishable; else first id. */
  fleetVisibleEntryId: string | null;
  linkage: "jaa_pair" | "solo";
};

async function loadFuelEntry(id: string): Promise<Record<string, unknown> | null> {
  const row = await kv.get(`fuel_entry:${id}`);
  if (row && typeof row === "object") return row as Record<string, unknown>;
  return null;
}

/**
 * Load seed + declared peers from KV and return the linked pair.
 */
export async function resolveLinkedFuelEntryIds(entryId: string): Promise<LinkedFuelPair> {
  const seed = String(entryId || "").trim();
  if (!seed) {
    return { ids: [], expanded: false, fleetVisibleEntryId: null, linkage: "solo" };
  }

  const byId = new Map<string, Record<string, unknown>>();
  const seedEntry = await loadFuelEntry(seed);
  if (seedEntry) byId.set(seed, seedEntry);

  const declared = seedEntry ? collectDeclaredTwinIds(seedEntry) : [];
  for (const peerId of declared) {
    if (byId.has(peerId)) continue;
    const peer = await loadFuelEntry(peerId);
    if (peer) {
      byId.set(peerId, peer);
      for (const back of collectDeclaredTwinIds(peer)) {
        if (byId.has(back)) continue;
        const backEntry = await loadFuelEntry(back);
        if (backEntry) byId.set(back, backEntry);
      }
    }
  }

  const ids = expandLinkedFuelEntryIdsFromMap(seed, byId);
  const fleetVisibleEntryId = pickFleetVisibleEntryId(ids, byId);
  const expanded = ids.length > 1;
  return {
    ids,
    expanded,
    fleetVisibleEntryId,
    linkage: expanded ? "jaa_pair" : "solo",
  };
}

/**
 * Union pair expansion for many seed ids (Silent Attach / delete batches).
 */
export async function resolveLinkedFuelEntryIdsUnion(entryIds: string[]): Promise<{
  ids: string[];
  pairExpanded: number;
  twinIds: string[];
}> {
  const all = new Set<string>();
  const twins = new Set<string>();
  let pairExpanded = 0;

  for (const raw of entryIds) {
    const seed = String(raw || "").trim();
    if (!seed) continue;
    const pair = await resolveLinkedFuelEntryIds(seed);
    for (const id of pair.ids) all.add(id);
    if (pair.expanded) {
      pairExpanded += pair.ids.length - 1;
      for (const id of pair.ids) {
        if (id !== seed) twins.add(id);
      }
    }
  }

  const ids = Array.from(all).sort();
  return {
    ids,
    pairExpanded,
    twinIds: Array.from(twins).sort(),
  };
}
