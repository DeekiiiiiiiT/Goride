/**
 * Rush side of a Dominion border publish.
 * Preview is read-only. Apply writes the next coverage grid from the new shape,
 * then flips Dominion's version, Rush's copy, net coverage, and merchant moves
 * in one database step.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { activeCoverageGeneration, compileMarketCoverageCells, recomputeMerchantCoverageCells } from "../coverageCompile.ts";
import { suggestMarketIdsAgainstBorder, type BorderPreviewOverlay } from "./coverageZones.ts";
import {
  decideMerchantMove,
  overlayZonesForCompile,
  shouldDeletePendingGrid,
  shouldRepairRushCopy,
} from "./geoPublishRules.ts";

function geoDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "geo" } },
  );
}

type MoveSummary = {
  merchant_name: string;
  from_market: string;
  to_market: string;
};

type Impact = {
  pcode: string;
  name: string;
  version: number;
  already_live: boolean;
  live_markets: number;
  zones_linked: number;
  merchants_checked: number;
  merchants_moving: number;
  area_change_pct: number;
  needs_typed_name: boolean;
  places_moving: number;
  places_sample: string[];
  moves: Array<{ merchant_id: string; market_id: string }>;
  move_summaries: MoveSummary[];
  market_ids: string[];
};

type Candidate = {
  merchant_id: string;
  lat: number;
  lng: number;
  market_id: string | null;
  market_is_active: boolean;
};

async function marketsToRecompile(
  db: SupabaseClient,
  pcode: string,
  adminLevel: number,
): Promise<{ marketIds: string[]; parishBoundaryIds: Set<string> }> {
  const marketIds = new Set<string>();
  const parishBoundaryIds = new Set<string>();
  const { data: zones } = await db
    .from("service_zone_polygons")
    .select("market_id, kind")
    .eq("boundary_pcode", pcode);
  for (const zone of zones ?? []) {
    const include = String(zone.kind ?? "include").toLowerCase() !== "exclude";
    if (include && zone.market_id) marketIds.add(String(zone.market_id));
  }
  if (adminLevel === 1) {
    const { data: parish } = await db
      .from("service_parishes")
      .select("id, coverage_mode")
      .eq("pcode", pcode)
      .maybeSingle();
    if (parish?.coverage_mode === "parish_boundary" && parish.id) {
      const { data: markets } = await db
        .from("service_markets")
        .select("id")
        .eq("parish_id", parish.id);
      for (const market of markets ?? []) {
        const id = String(market.id);
        marketIds.add(id);
        parishBoundaryIds.add(id);
      }
    }
  }
  return { marketIds: [...marketIds], parishBoundaryIds };
}

export async function buildGeoImpact(
  db: SupabaseClient,
  pcode: string,
  versionId: string,
  options?: { computeMovesWhenLive?: boolean },
): Promise<Impact> {
  const geo = geoDb();
  const { data: version, error } = await geo
    .from("boundary_versions")
    .select("id, pcode, version, area_sqkm")
    .eq("id", versionId)
    .eq("pcode", pcode)
    .maybeSingle();
  if (error || !version) throw new Error(error?.message || "version_not_found");
  const { data: place } = await geo
    .from("boundaries")
    .select("name, admin_level, current_version_id")
    .eq("pcode", pcode)
    .maybeSingle();
  const alreadyLive = String(place?.current_version_id ?? "") === versionId;

  const { data: delta } = await geo.rpc("border_area_change_pct", {
    p_pcode: pcode,
    p_version_id: versionId,
  });
  const areaChange = Number(delta ?? 0);

  const { data: parish } = await db
    .from("service_parishes")
    .select("id")
    .eq("pcode", pcode)
    .maybeSingle();
  const { data: markets } = await db
    .from("service_markets")
    .select("id, name, is_active, parish_id")
    .or(`pcode.eq.${pcode}${parish?.id ? `,parish_id.eq.${parish.id}` : ""}`);
  const marketRows = markets ?? [];
  const live = marketRows.filter((m) => m.is_active).length;
  const liveById = new Map(marketRows.map((m) => [String(m.id), m.is_active !== false]));
  const nameById = new Map(marketRows.map((m) => [String(m.id), String(m.name ?? "Market")]));

  const { count: zoneCount } = await db
    .from("service_zone_polygons")
    .select("id", { count: "exact", head: true })
    .eq("boundary_pcode", pcode);

  const { marketIds } = await marketsToRecompile(db, pcode, Number(place?.admin_level ?? 0));

  let moves: Impact["moves"] = [];
  let summaries: MoveSummary[] = [];
  let checked = 0;

  if (!alreadyLive || options?.computeMovesWhenLive) {
    const { data: shift, error: shiftError } = await geo.rpc("preview_merchant_moves", {
      p_pcode: pcode,
      p_version_id: versionId,
    });
    if (shiftError) throw new Error(shiftError.message);
    const candidates = (shift ?? []) as Candidate[];
    checked = candidates.length;
    const { data: parts, error: partsError } = await geo.rpc("version_coverage_parts", {
      p_version_id: versionId,
    });
    if (partsError) throw new Error(partsError.message);
    const overlay: BorderPreviewOverlay = {
      pcode,
      adminLevel: Number(place?.admin_level ?? 0),
      parts: Array.isArray(parts) ? parts : [],
    };
    const suggested = await suggestMarketIdsAgainstBorder(
      db,
      candidates.map((row) => ({ lat: Number(row.lat), lng: Number(row.lng) })),
      overlay,
    );
    const missingLive = suggested.filter((id) => id && !liveById.has(id)) as string[];
    if (missingLive.length) {
      const { data: extra } = await db
        .from("service_markets")
        .select("id, name, is_active")
        .in("id", missingLive);
      for (const row of extra ?? []) {
        liveById.set(String(row.id), row.is_active !== false);
        nameById.set(String(row.id), String(row.name ?? "Market"));
      }
    }
    const decided: Impact["moves"] = [];
    for (let i = 0; i < candidates.length; i++) {
      const row = candidates[i];
      const currentId = row.market_id != null ? String(row.market_id) : null;
      const destination = decideMerchantMove({
        currentMarketId: currentId,
        currentLive: row.market_is_active === true,
        suggestedMarketId: suggested[i] ?? null,
        suggestedLive: suggested[i] ? liveById.get(String(suggested[i])) === true : false,
      });
      if (!destination) continue;
      decided.push({ merchant_id: String(row.merchant_id), market_id: destination });
    }
    moves = decided;
    if (moves.length) {
      const { data: named } = await db
        .from("merchants")
        .select("id, name")
        .in("id", moves.map((m) => m.merchant_id));
      const merchantName = new Map((named ?? []).map((m) => [String(m.id), String(m.name ?? "Merchant")]));
      summaries = moves.map((move) => {
        const candidate = candidates.find((row) => String(row.merchant_id) === move.merchant_id);
        const fromId = candidate?.market_id != null ? String(candidate.market_id) : "";
        return {
          merchant_name: merchantName.get(move.merchant_id) ?? "Merchant",
          from_market: nameById.get(fromId) ?? "Unassigned",
          to_market: nameById.get(move.market_id) ?? "Market",
        };
      });
    }
  }

  let placesMoving = 0;
  let placesSample: string[] = [];
  const { data: moving, error: movingError } = await geo.rpc("preview_places_moving", {
    p_pcode: pcode,
    p_version_id: versionId,
  });
  if (movingError) throw new Error(movingError.message);
  if (moving && typeof moving === "object") {
    placesMoving = Number((moving as { count?: number }).count ?? 0);
    const sample = (moving as { sample?: unknown }).sample;
    if (Array.isArray(sample)) placesSample = sample.map((name) => String(name));
  }

  return {
    pcode,
    name: String(place?.name ?? pcode),
    version: Number(version.version),
    already_live: alreadyLive,
    live_markets: live,
    zones_linked: zoneCount ?? 0,
    merchants_checked: checked,
    merchants_moving: moves.length,
    area_change_pct: Math.round(areaChange * 10) / 10,
    needs_typed_name: !alreadyLive && live > 0 && areaChange > 10,
    places_moving: placesMoving,
    places_sample: placesSample,
    moves,
    move_summaries: summaries,
    market_ids: marketIds,
  };
}

async function refreshMerchantCells(
  db: SupabaseClient,
  marketIds: string[],
  extraMerchantIds: string[],
): Promise<void> {
  const merchants: Array<Record<string, unknown>> = [];
  if (marketIds.length) {
    const { data, error } = await db
      .from("merchants")
      .select("id, lat, lng, delivery_radius_km, market_id")
      .in("market_id", marketIds);
    if (error) throw new Error(error.message);
    merchants.push(...((data ?? []) as Array<Record<string, unknown>>));
  }
  const have = new Set(merchants.map((m) => String(m.id)));
  const missing = extraMerchantIds.filter((id) => !have.has(id));
  if (missing.length) {
    const { data, error } = await db
      .from("merchants")
      .select("id, lat, lng, delivery_radius_km, market_id")
      .in("id", missing);
    if (error) throw new Error(error.message);
    merchants.push(...((data ?? []) as Array<Record<string, unknown>>));
  }
  for (const merchant of merchants) {
    await recomputeMerchantCoverageCells(db, String(merchant.id), {
      lat: Number(merchant.lat),
      lng: Number(merchant.lng),
      deliveryRadiusKm: Number(merchant.delivery_radius_km) || 8,
      marketId: merchant.market_id != null ? String(merchant.market_id) : null,
    });
  }
}

/** True when Rush's parish or include-zone copy is not this Dominion version. */
export async function rushCopyDiffers(
  db: SupabaseClient,
  pcode: string,
  versionId: string,
): Promise<boolean> {
  const { data: parish, error: parishError } = await db
    .from("service_parishes")
    .select("adopted_version_id")
    .eq("pcode", pcode)
    .maybeSingle();
  if (parishError) throw new Error(parishError.message);
  const { data: zones, error: zoneError } = await db
    .from("service_zone_polygons")
    .select("boundary_version_id, kind")
    .eq("boundary_pcode", pcode);
  if (zoneError) throw new Error(zoneError.message);
  const includeZoneVersionIds = (zones ?? [])
    .filter((zone) => String(zone.kind ?? "include").toLowerCase() !== "exclude")
    .map((zone) => String(zone.boundary_version_id ?? ""));
  return shouldRepairRushCopy({
    versionId,
    hasParish: parish != null,
    parishAdoptedVersionId: parish ? String(parish.adopted_version_id ?? "") : null,
    includeZoneVersionIds,
  });
}

const PUBLISH_BUSY_MESSAGE = "Another publish is still finishing. Wait a minute and try again.";

export async function applyGeoPublish(
  db: SupabaseClient,
  input: {
    pcode: string;
    versionId: string;
    confirmName: string | null;
    actorId: string | null;
    systemHeal?: boolean;
  },
): Promise<Record<string, unknown>> {
  // One publish at a time. The lock is taken before any grid row is deleted.
  const geo = geoDb();
  const holder = crypto.randomUUID();
  const { data: claimed, error: lockError } = await geo.rpc("try_begin_publish", { p_holder: holder });
  if (lockError) throw new Error(lockError.message);
  if (claimed !== true) {
    return { error: "publish_in_progress", message: PUBLISH_BUSY_MESSAGE };
  }
  try {
    return await applyGeoPublishLocked(db, geo, input);
  } finally {
    const { error: releaseError } = await geo.rpc("finish_publish", { p_holder: holder });
    if (releaseError) console.warn("[geo] publish lock release failed", releaseError.message);
  }
}

async function applyGeoPublishLocked(
  db: SupabaseClient,
  geo: ReturnType<typeof geoDb>,
  input: {
    pcode: string;
    versionId: string;
    confirmName: string | null;
    actorId: string | null;
    systemHeal?: boolean;
  },
): Promise<Record<string, unknown>> {
  // Heal republishes Dominion's current version onto a stale Rush copy.
  // A person publishing that same version still gets "nothing to do."
  const repair = input.systemHeal
    ? await rushCopyDiffers(db, input.pcode, input.versionId)
    : false;
  const impact = await buildGeoImpact(db, input.pcode, input.versionId, {
    computeMovesWhenLive: repair,
  });
  if (impact.already_live && !repair) {
    return { ok: true, unchanged: true, repaired: false, impact };
  }
  if (impact.needs_typed_name && !input.systemHeal) {
    const typed = (input.confirmName || "").trim().toLowerCase();
    if (typed !== impact.name.trim().toLowerCase()) {
      return {
        error: "confirmation_required",
        message: `Type ${impact.name} to publish. This changes a live delivery area by ${impact.area_change_pct}%.`,
        impact,
      };
    }
  }

  const { data: parts, error: partsError } = await geo.rpc("version_coverage_parts", {
    p_version_id: input.versionId,
  });
  if (partsError) throw new Error(partsError.message);
  const { data: place } = await geo
    .from("boundaries")
    .select("admin_level")
    .eq("pcode", input.pcode)
    .maybeSingle();
  const { marketIds, parishBoundaryIds } = await marketsToRecompile(
    db,
    input.pcode,
    Number(place?.admin_level ?? 0),
  );

  const currentGeneration = await activeCoverageGeneration(db);
  const pending = marketIds.length > 0 ? currentGeneration + 1 : null;
  let committed = false;
  if (pending != null) {
    await db.from("coverage_cells").delete().eq("generation", pending);
  }

  try {
    if (pending != null) {
      for (const marketId of marketIds) {
        const { data: zones } = await db
          .from("service_zone_polygons")
          .select("*")
          .eq("market_id", marketId);
        const compiled = overlayZonesForCompile(
          zones ?? [],
          input.pcode,
          parts,
          parishBoundaryIds.has(marketId),
        );
        await compileMarketCoverageCells(db, marketId, compiled, pending);
      }
    }

    const { data, error } = await geo.rpc("commit_boundary_publish", {
      p_pcode: input.pcode,
      p_version_id: input.versionId,
      p_pending_generation: pending ?? currentGeneration,
      p_recompiled_markets: marketIds,
      p_merchant_moves: impact.moves,
      p_actor: input.actorId,
      p_impact: {
        live_markets: impact.live_markets,
        merchants_moving: impact.merchants_moving,
        places_moving: impact.places_moving,
        area_change_pct: impact.area_change_pct,
      },
    });
    if (error) throw new Error(error.message);
    committed = true;

    let merchantCellsWarning: string | null = null;
    try {
      await refreshMerchantCells(db, marketIds, impact.moves.map((move) => move.merchant_id));
    } catch (cellError) {
      merchantCellsWarning = cellError instanceof Error ? cellError.message : String(cellError);
    }
    return {
      ok: true,
      repaired: true,
      impact,
      result: data,
      ...(merchantCellsWarning ? { merchant_cells_warning: merchantCellsWarning } : {}),
    };
  } catch (e) {
    if (pending != null && shouldDeletePendingGrid(committed)) {
      await db.from("coverage_cells").delete().eq("generation", pending);
    }
    throw e;
  }
}
