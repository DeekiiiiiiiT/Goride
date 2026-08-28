/**
 * Suggest parish coverage_mode after publish — ops must confirm before applying.
 */
import { parseFoundationPolygon, type ParishCoverageMode } from "./coverageEval.ts";
import { hasValidInclude } from "./coveragePlatform.ts";

// deno-lint-ignore no-explicit-any
type ServiceSb = { from: (t: string) => any };

export type ParishModeSuggestion = {
  parish_id: string;
  parish_name: string;
  current: ParishCoverageMode;
  suggested: ParishCoverageMode;
  reason: string;
};

async function countActiveTownsWithIncludes(
  sb: ServiceSb,
  parishId: string,
): Promise<number> {
  const { data: markets } = await sb
    .from("service_markets")
    .select("id, is_active")
    .eq("parish_id", parishId)
    .eq("is_active", true);
  if (!markets?.length) return 0;

  let count = 0;
  for (const m of markets) {
    const marketId = String((m as Record<string, unknown>).id);
    const { data: zones } = await sb
      .from("service_zone_polygons")
      .select("kind, polygon, geom, multiPolygon")
      .eq("market_id", marketId);
    if (hasValidInclude(zones ?? [])) count += 1;
  }
  return count;
}

/** Returns a mode switch suggestion, or null when no change is recommended. */
export async function suggestParishCoverageMode(
  sb: ServiceSb,
  parishId: string,
): Promise<ParishModeSuggestion | null> {
  const { data: parish, error } = await sb
    .from("service_parishes")
    .select("id, name, coverage_mode, foundation_polygon, foundation_geom")
    .eq("id", parishId)
    .maybeSingle();
  if (error || !parish) return null;

  const row = parish as Record<string, unknown>;
  const current: ParishCoverageMode =
    row.coverage_mode === "parish_boundary" ? "parish_boundary" : "town_zones";
  const hasGeom = row.foundation_geom != null;
  const foundation = parseFoundationPolygon(row.foundation_polygon);
  const hasFoundation = hasGeom || Boolean(foundation);
  const activeWithIncludes = await countActiveTownsWithIncludes(sb, parishId);
  const parishName = String(row.name ?? "Parish");

  if (
    current === "town_zones" &&
    hasFoundation &&
    activeWithIncludes === 1
  ) {
    return {
      parish_id: parishId,
      parish_name: parishName,
      current,
      suggested: "parish_boundary",
      reason: hasGeom
        ? "This parish has a full PostGIS foundation border and one active town with a delivery area — parish border mode may be simpler for whole-parish launch."
        : "This parish has a foundation border and one active town with a delivery area — parish border mode may be simpler for whole-parish launch.",
    };
  }

  if (current === "parish_boundary" && activeWithIncludes >= 2) {
    return {
      parish_id: parishId,
      parish_name: parishName,
      current,
      suggested: "town_zones",
      reason:
        "This parish now has multiple active towns with delivery areas — town zones mode gives per-town control.",
    };
  }

  return null;
}

export async function applyParishCoverageModeIfRequested(
  sb: ServiceSb,
  adminUser: { id: string; email?: string },
  parishId: string,
  applyMode: string | undefined,
  suggestion: ParishModeSuggestion | null,
  writeAudit: (
    user: { id: string; email?: string },
    action: string,
    entityId: string,
    email: string,
    detail: string,
  ) => Promise<void>,
): Promise<{ applied: ParishCoverageMode | null; error: string | null }> {
  if (!applyMode) return { applied: null, error: null };

  const mode = applyMode === "parish_boundary" ? "parish_boundary" : "town_zones";
  if (!suggestion || suggestion.suggested !== mode) {
    return {
      applied: null,
      error: "apply_parish_mode does not match the current suggestion for this parish",
    };
  }

  const { error } = await sb
    .from("service_parishes")
    .update({ coverage_mode: mode })
    .eq("id", parishId);
  if (error) return { applied: null, error: error.message };

  await writeAudit(
    adminUser,
    "roam_dash.parish_mode_applied",
    parishId,
    "",
    JSON.stringify({ from: suggestion.current, to: mode, reason: suggestion.reason }),
  );

  return { applied: mode, error: null };
}
