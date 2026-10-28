/**
 * Issuer merchant alias registry (JAA / OCR) → verified GOD station id.
 * Kept separate from station.gpsAliases (coordinates).
 */
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { normalizeVendorName } from "./vendor_matcher.ts";
import { collectMerchantCandidateTexts } from "./merchant_station_match.ts";
import { attachRecordIdToStation, type VerifiedStation } from "./station_attach.ts";
import { resolveLinkedFuelEntryIds } from "./fuel_entry_pair.ts";
import { queryFleet } from "./repos/baseRepo.ts";
import * as kv from "./kv_store.tsx";

function supabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

type PlaceAliasRow = {
  id: string;
  organization_id: string | null;
  issuer: string | null;
  raw_value: string | null;
  normalized_value: string | null;
  place_id: string;
  source: MerchantAliasSource;
};

function aliasFromPlace(row: PlaceAliasRow): StationMerchantAliasRow {
  return {
    id: row.id,
    organization_id: String(row.organization_id || ""),
    issuer: String(row.issuer || ""),
    raw_name: String(row.raw_value || ""),
    normalized_name: String(row.normalized_value || ""),
    station_id: String(row.place_id || ""),
    source: row.source,
  };
}

function merchantAliases() {
  return supabaseAdmin().schema("places").from("place_alias");
}

export type MerchantAliasSource = "admin_link" | "heal_auto" | "seed";

export type StationMerchantAliasRow = {
  id: string;
  organization_id: string;
  issuer: string;
  raw_name: string;
  normalized_name: string;
  station_id: string;
  source: MerchantAliasSource;
};

const PROTECTED_SOURCES = new Set<MerchantAliasSource>(["admin_link", "seed"]);

export type AliasUpsertAction =
  | { action: "insert" }
  | { action: "update" }
  | { action: "noop" }
  | { action: "skip"; reason: string };

/**
 * Pure guard: never let heal_auto overwrite admin_link/seed station_id.
 * admin_link may correct a wrong seed (Rev 6 G5 duplicate repair).
 */
export function resolveAliasUpsertAction(
  existing: { station_id: string; source: MerchantAliasSource } | null,
  incoming: { stationId: string; source: MerchantAliasSource },
): AliasUpsertAction {
  if (!existing) return { action: "insert" };
  if (existing.station_id === incoming.stationId) {
    // Same station — still allow seed → admin_link upgrade
    if (existing.source === "seed" && incoming.source === "admin_link") {
      return { action: "update" };
    }
    return { action: "noop" };
  }
  // Platform admin may re-point a bad seed to the real GOD station
  if (incoming.source === "admin_link") {
    return { action: "update" };
  }
  if (PROTECTED_SOURCES.has(existing.source)) {
    return {
      action: "skip",
      reason: `protected source=${existing.source} keeps station_id=${existing.station_id}`,
    };
  }
  // heal_auto may update other heal_auto
  if (existing.source === "heal_auto") {
    return { action: "update" };
  }
  return { action: "skip", reason: "source conflict" };
}

/** True when any merchant candidate text normalizes to the alias name. */
export function entryMatchesAliasNormalizedName(
  entry: Record<string, unknown>,
  normalizedName: string,
): boolean {
  const want = String(normalizedName || "").trim();
  if (!want) return false;
  return collectMerchantCandidateTexts(entry)
    .map((t) => normalizeVendorName(t))
    .includes(want);
}

const OPEN_HEALABLE_STATUSES = new Set([
  "unknown",
  "provisional",
  "review_required",
  "statement_vendor",
  "",
]);

/**
 * Open statuses, or verified merchant-heal pointing at the wrong station
 * (Rev 6: re-point G5 GOD placeholders → real Jampet/Unipet).
 */
export function entryNeedsAliasReheal(
  entry: Record<string, unknown>,
  targetStationId: string,
): boolean {
  const meta = (entry.metadata || {}) as Record<string, unknown>;
  const status = String(meta.locationStatus || "");
  const method = String(meta.verificationMethod || "");
  const matched = String(entry.matchedStationId || meta.matchedStationId || "");
  const target = String(targetStationId || "").trim();
  if (target && matched === target) return false;
  if (OPEN_HEALABLE_STATUSES.has(status)) return true;
  if (
    status === "verified" &&
    method === "jaa_match_merchant_heal" &&
    matched &&
    matched !== target
  ) {
    return true;
  }
  return false;
}

/** Exact registry hit for a merchant string (score 1.0 equivalent). */
export async function lookupStationMerchantAlias(opts: {
  organizationId: string;
  issuer?: string;
  rawName: string;
}): Promise<StationMerchantAliasRow | null> {
  const org = String(opts.organizationId || "").trim();
  const raw = String(opts.rawName || "").trim();
  if (!org || !raw) return null;
  const normalized = normalizeVendorName(raw);
  if (!normalized) return null;
  const issuer = opts.issuer || "jaa";

  const { data, error } = await merchantAliases()
    .select("id, organization_id, issuer, raw_value, normalized_value, place_id, source")
    .eq("kind", "merchant_name")
    .eq("organization_id", org)
    .eq("issuer", issuer)
    .eq("normalized_value", normalized)
    .maybeSingle();

  if (error) {
    console.warn("[station_merchant_aliases] lookup failed:", error.message);
    return null;
  }
  return data ? aliasFromPlace(data as PlaceAliasRow) : null;
}

export async function upsertStationMerchantAlias(opts: {
  organizationId: string;
  issuer?: string;
  rawName: string;
  stationId: string;
  source: MerchantAliasSource;
  confirmedBy?: string;
}): Promise<StationMerchantAliasRow | null> {
  const org = String(opts.organizationId || "").trim();
  const raw = String(opts.rawName || "").trim();
  const stationId = String(opts.stationId || "").trim();
  if (!org || !raw || !stationId) return null;
  const normalized = normalizeVendorName(raw);
  if (!normalized) return null;
  const issuer = opts.issuer || "jaa";

  const { data: existing, error: existingErr } = await merchantAliases()
    .select("id, organization_id, issuer, raw_value, normalized_value, place_id, source")
    .eq("kind", "merchant_name")
    .eq("organization_id", org)
    .eq("issuer", issuer)
    .eq("normalized_value", normalized)
    .maybeSingle();

  if (existingErr) {
    console.warn("[station_merchant_aliases] select failed:", existingErr.message);
    return null;
  }

  const current = existing ? aliasFromPlace(existing as PlaceAliasRow) : null;
  const decision = resolveAliasUpsertAction(
    current
      ? { station_id: current.station_id, source: current.source }
      : null,
    { stationId, source: opts.source },
  );

  if (decision.action === "skip") {
    console.warn(
      `[station_merchant_aliases] Conflict: "${raw}" → ${stationId} blocked (${decision.reason})`,
    );
    return current;
  }

  if (decision.action === "noop") {
    return current;
  }

  const row = {
    place_id: stationId,
    kind: "merchant_name",
    organization_id: org,
    issuer,
    raw_value: raw,
    normalized_value: normalized,
    source: opts.source,
    confirmed_by: opts.confirmedBy || null,
  };

  const existingId = current?.id;
  const write = existingId
    ? merchantAliases().update(row).eq("id", existingId)
    : merchantAliases().insert(row);
  const { data, error } = await write
    .select("id, organization_id, issuer, raw_value, normalized_value, place_id, source")
    .maybeSingle();

  if (error) {
    console.warn("[station_merchant_aliases] upsert failed:", error.message);
    return null;
  }

  // Re-heal only when the alias row is new or station_id changed
  try {
    await rehealOpenRowsForAlias({
      organizationId: org,
      issuer,
      normalizedName: normalized,
      stationId,
      rawName: raw,
    });
  } catch (e) {
    console.warn("[station_merchant_aliases] reheal failed:", e);
  }

  return data ? aliasFromPlace(data as PlaceAliasRow) : null;
}

/** Escape for PostgREST `or()` ilike filters — commas → space; escape % _ ( ) . */
export function escapeIlike(value: string): string {
  return value.replace(/,/g, " ").replace(/[%_().]/g, "\\$&");
}

/**
 * Find fuel entries still needing a station whose merchant text matches this alias,
 * and attach them (pair-aware) to the GOD station (no GPS alias).
 * Export for admin re-heal after SQL-seeded aliases (R2).
 */
export async function rehealOpenRowsForAlias(opts: {
  organizationId: string;
  issuer: string;
  normalizedName: string;
  stationId: string;
  rawName: string;
}): Promise<number> {
  const station = (await kv.get(`station:${opts.stationId}`)) as VerifiedStation | null;
  if (!station || (station.status && station.status !== "verified")) return 0;

  const needle = escapeIlike(opts.rawName.trim());
  let entries: Record<string, unknown>[] = [];
  let sqlFailed = false;
  try {
    const res = await queryFleet("fuel_entries", {
      org: opts.organizationId,
      limit: 2000,
      filters: needle
        ? [
          {
            op: "or",
            value:
              `payload_json->>vendor.ilike.%${needle}%,` +
              `payload_json->>location.ilike.%${needle}%,` +
              `payload_json->metadata->>jaaStation.ilike.%${needle}%,` +
              `payload_json->metadata->>jaaVendorRaw.ilike.%${needle}%,` +
              `payload_json->metadata->>originalVendor.ilike.%${needle}%,` +
              `payload_json->metadata->>stationName.ilike.%${needle}%`,
          },
        ]
        : undefined,
    });
    if (res.error) {
      sqlFailed = true;
      console.warn("[station_merchant_aliases] SQL reheal query error — KV org fallback", res.error);
    } else if (Array.isArray(res.data)) {
      entries = res.data as Record<string, unknown>[];
    }
  } catch (e) {
    sqlFailed = true;
    console.warn("[station_merchant_aliases] SQL reheal query failed — KV org fallback", e);
  }

  // Fallback only on SQL failure — empty SQL is the healthy "nothing to heal" case
  if (sqlFailed) {
    const all = ((await kv.getByPrefix("fuel_entry:")) || []) as Record<string, unknown>[];
    entries = all.filter((e) => String(e.organizationId || "") === opts.organizationId);
  }

  const seenPair = new Set<string>();
  let healed = 0;

  for (const entry of entries) {
    if (!entryNeedsAliasReheal(entry, opts.stationId)) continue;
    if (!entryMatchesAliasNormalizedName(entry, opts.normalizedName)) continue;

    const id = String(entry.id || "");
    if (!id || seenPair.has(id)) continue;

    const pair = await resolveLinkedFuelEntryIds(id);
    for (const peerId of pair.ids) seenPair.add(peerId);

    for (const peerId of pair.ids) {
      const result = await attachRecordIdToStation(peerId, station, {
        method: "jaa_match_merchant_heal",
        reason: `Re-heal: issuer alias ${opts.rawName}`,
        autoHealMerchantText: opts.rawName,
        dismissLearnt: true,
      });
      if (result.ok) healed++;
    }
  }

  if (healed > 0) {
    console.log(
      `[station_merchant_aliases] Re-healed ${healed} open row(s) for "${opts.rawName}" → ${opts.stationId}`,
    );
  }
  return healed;
}

/**
 * Admin / runbook: re-heal open rows for an existing alias (even when upsert would noop).
 */
export async function rehealMerchantAliasByLookup(opts: {
  organizationId: string;
  issuer?: string;
  rawName: string;
  stationId?: string;
}): Promise<{ healed: number; stationId: string; normalizedName: string } | null> {
  const org = String(opts.organizationId || "").trim();
  const raw = String(opts.rawName || "").trim();
  if (!org || !raw) return null;
  const issuer = opts.issuer || "jaa";
  const alias = await lookupStationMerchantAlias({ organizationId: org, issuer, rawName: raw });
  const stationId = String(opts.stationId || alias?.station_id || "").trim();
  if (!stationId) return null;
  const normalizedName = alias?.normalized_name || normalizeVendorName(raw);
  const healed = await rehealOpenRowsForAlias({
    organizationId: org,
    issuer,
    normalizedName,
    stationId,
    rawName: alias?.raw_name || raw,
  });
  return { healed, stationId, normalizedName };
}
