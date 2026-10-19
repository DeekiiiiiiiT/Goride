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

/** Pure guard: never let heal_auto overwrite admin_link/seed station_id. */
export function resolveAliasUpsertAction(
  existing: { station_id: string; source: MerchantAliasSource } | null,
  incoming: { stationId: string; source: MerchantAliasSource },
): AliasUpsertAction {
  if (!existing) return { action: "insert" };
  if (existing.station_id === incoming.stationId) return { action: "noop" };
  if (PROTECTED_SOURCES.has(existing.source)) {
    return {
      action: "skip",
      reason: `protected source=${existing.source} keeps station_id=${existing.station_id}`,
    };
  }
  // admin_link may re-point heal_auto; heal_auto may update other heal_auto
  if (incoming.source === "admin_link" || existing.source === "heal_auto") {
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

  const { data, error } = await supabaseAdmin()
    .from("station_merchant_aliases")
    .select("*")
    .eq("organization_id", org)
    .eq("issuer", issuer)
    .eq("normalized_name", normalized)
    .maybeSingle();

  if (error) {
    console.warn("[station_merchant_aliases] lookup failed:", error.message);
    return null;
  }
  return (data as StationMerchantAliasRow) || null;
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

  const { data: existing, error: existingErr } = await supabaseAdmin()
    .from("station_merchant_aliases")
    .select("*")
    .eq("organization_id", org)
    .eq("issuer", issuer)
    .eq("normalized_name", normalized)
    .maybeSingle();

  if (existingErr) {
    console.warn("[station_merchant_aliases] select failed:", existingErr.message);
    return null;
  }

  const decision = resolveAliasUpsertAction(
    existing
      ? {
        station_id: String((existing as StationMerchantAliasRow).station_id),
        source: (existing as StationMerchantAliasRow).source,
      }
      : null,
    { stationId, source: opts.source },
  );

  if (decision.action === "skip") {
    console.warn(
      `[station_merchant_aliases] Conflict: "${raw}" → ${stationId} blocked (${decision.reason})`,
    );
    return (existing as StationMerchantAliasRow) || null;
  }

  if (decision.action === "noop") {
    return (existing as StationMerchantAliasRow) || null;
  }

  const row = {
    organization_id: org,
    issuer,
    raw_name: raw,
    normalized_name: normalized,
    station_id: stationId,
    source: opts.source,
    confirmed_by: opts.confirmedBy || null,
  };

  const { data, error } = await supabaseAdmin()
    .from("station_merchant_aliases")
    .upsert(row, { onConflict: "organization_id,issuer,normalized_name" })
    .select("*")
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

  return (data as StationMerchantAliasRow) || null;
}

function escapeIlike(value: string): string {
  return value.replace(/[%_,]/g, "\\$&").replace(/,/g, " ");
}

/**
 * Find fuel entries still needing a station whose merchant text matches this alias,
 * and attach them (pair-aware) to the GOD station (no GPS alias).
 */
async function rehealOpenRowsForAlias(opts: {
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
    if (!res.error && Array.isArray(res.data)) {
      entries = res.data as Record<string, unknown>[];
    }
  } catch (e) {
    console.warn("[station_merchant_aliases] SQL reheal query failed — KV org fallback", e);
  }

  // Fallback: org-scoped KV scan only if SQL returned nothing usable
  if (entries.length === 0) {
    const all = ((await kv.getByPrefix("fuel_entry:")) || []) as Record<string, unknown>[];
    entries = all.filter((e) => String(e.organizationId || "") === opts.organizationId);
  }

  const healable = new Set([
    "unknown",
    "provisional",
    "review_required",
    "statement_vendor",
    "",
  ]);
  const seenPair = new Set<string>();
  let healed = 0;

  for (const entry of entries) {
    const meta = (entry.metadata || {}) as Record<string, unknown>;
    const status = String(meta.locationStatus || "");
    if (!healable.has(status)) continue;
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
