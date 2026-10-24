/**
 * Rush side of a Dominion border publish.
 * Preview is read-only. Apply writes the next coverage grid beside the live one,
 * then flips Dominion's version, Rush's copy, and the grid in one database step.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { activeCoverageGeneration, compileMarketCoverageCells } from "../coverageCompile.ts";

function geoDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "geo" } },
  );
}

type Impact = {
  pcode: string;
  name: string;
  version: number;
  live_markets: number;
  zones_linked: number;
  merchants_checked: number;
  merchants_moving: number;
  area_change_pct: number;
  needs_typed_name: boolean;
  moves: Array<{ merchant_id: string; market_id: string }>;
  market_ids: string[];
};

export async function buildGeoImpact(
  db: SupabaseClient,
  pcode: string,
  versionId: string,
): Promise<Impact> {
  const geo = geoDb();
  const { data: version, error } = await geo
    .from("boundary_versions")
    .select("id, pcode, version, area_sqkm")
    .eq("id", versionId)
    .eq("pcode", pcode)
    .maybeSingle();
  if (error || !version) throw new Error(error?.message || "version_not_found");
  const { data: place } = await geo.from("boundaries").select("name, admin_level").eq("pcode", pcode).maybeSingle();

  const { data: parish } = await db
    .from("service_parishes")
    .select("id, adopted_geom")
    .eq("pcode", pcode)
    .maybeSingle();

  let areaChange = 0;
  if (parish?.id) {
    const { data: delta } = await geo.rpc("border_area_change_pct", {
      p_pcode: pcode,
      p_version_id: versionId,
    });
    areaChange = Number(delta ?? 0);
  }

  const { data: markets } = await db
    .from("service_markets")
    .select("id, is_active, parish_id")
    .or(`pcode.eq.${pcode}${parish?.id ? `,parish_id.eq.${parish.id}` : ""}`);
  const marketRows = markets ?? [];
  const live = marketRows.filter((m) => m.is_active).length;
  const marketIds = marketRows.map((m) => String(m.id));

  const { count: zoneCount } = await db
    .from("service_zone_polygons")
    .select("id", { count: "exact", head: true })
    .eq("boundary_pcode", pcode);

  const { count: merchantCount } = marketIds.length
    ? await db.from("merchants").select("id", { count: "exact", head: true }).in("market_id", marketIds)
    : { count: 0 };

  const { data: shift, error: shiftError } = await geo.rpc("preview_merchant_moves", {
    p_pcode: pcode,
    p_version_id: versionId,
  });
  if (shiftError) throw new Error(shiftError.message);
  const moves = ((shift ?? []) as Array<{ merchant_id: string; market_id: string }>).map((row) => ({
    merchant_id: String(row.merchant_id),
    market_id: String(row.market_id),
  }));
  const checked = merchantCount ?? moves.length;

  return {
    pcode,
    name: String(place?.name ?? pcode),
    version: Number(version.version),
    live_markets: live,
    zones_linked: zoneCount ?? 0,
    merchants_checked: checked,
    merchants_moving: moves.length,
    area_change_pct: Math.round(areaChange * 10) / 10,
    needs_typed_name: live > 0 && areaChange > 10,
    moves,
    market_ids: marketIds,
  };
}

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
  const impact = await buildGeoImpact(db, input.pcode, input.versionId);
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

  const generation = (await activeCoverageGeneration(db)) + 1;
  if (generation > 1) {
    await db.from("coverage_cells").delete().eq("generation", generation);
  }
  for (const marketId of impact.market_ids) {
    const { data: zones } = await db.from("service_zone_polygons").select("*").eq("market_id", marketId);
    await compileMarketCoverageCells(db, marketId, zones ?? [], generation);
  }

  const geo = geoDb();
  const { data, error } = await geo.rpc("commit_boundary_publish", {
    p_pcode: input.pcode,
    p_version_id: input.versionId,
    p_pending_generation: impact.market_ids.length > 0 ? generation : await activeCoverageGeneration(db),
    p_recompiled_markets: impact.market_ids,
    p_merchant_moves: impact.moves,
    p_actor: input.actorId,
    p_impact: {
      live_markets: impact.live_markets,
      merchants_moving: impact.merchants_moving,
      area_change_pct: impact.area_change_pct,
    },
  });
  if (error) throw new Error(error.message);
  return { ok: true, impact, result: data };
}
