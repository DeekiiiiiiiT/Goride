/** Pure rules for a Dominion publish. Signup never calls these. */

export type CompileZone = {
  kind?: string | null;
  polygon?: unknown;
  boundary_pcode?: string | null;
  source?: string | null;
  market_id?: string | null;
};

export function decideMerchantMove(input: {
  currentMarketId: string | null;
  currentLive: boolean;
  suggestedMarketId: string | null;
  suggestedLive: boolean;
}): string | null {
  if (!input.suggestedMarketId) return null;
  if (input.currentMarketId && input.suggestedMarketId === input.currentMarketId) return null;
  if (input.currentLive && !input.suggestedLive) return null;
  return input.suggestedMarketId;
}

/**
 * Swap the border being published onto the zones checkout compiles.
 * Parish-border markets take the new parish shape as their include area.
 * Town publishes only replace the include zone linked to that place.
 * Hole and no-go rows are left alone.
 */
export function overlayZonesForCompile<T extends CompileZone>(
  zones: T[],
  pcode: string,
  parts: unknown,
  parishBoundary: boolean,
): T[] {
  if (parishBoundary) {
    const excludes = zones.filter((z) => String(z.kind ?? "").toLowerCase() === "exclude");
    const include = {
      ...(zones[0] ?? {}),
      kind: "include",
      source: "manual",
      polygon: parts,
      boundary_pcode: pcode,
    } as T;
    return [include, ...excludes];
  }
  return zones.map((z) => {
    const include = String(z.kind ?? "include").toLowerCase() !== "exclude";
    if (!include || String(z.boundary_pcode ?? "") !== pcode) return z;
    return { ...z, polygon: parts };
  });
}

/** Pending hex rows are discarded only when the border save itself did not commit. */
export function shouldDeletePendingGrid(committed: boolean): boolean {
  return !committed;
}

/**
 * Nightly repair rewrites Rush only when its copy is not Dominion's live version.
 * A missing parish row is not drift. An include zone with a different (or empty)
 * version id is. Exclude zones are not passed in.
 */
export function shouldRepairRushCopy(input: {
  versionId: string;
  hasParish: boolean;
  parishAdoptedVersionId: string | null;
  includeZoneVersionIds: string[];
}): boolean {
  if (!input.versionId) return false;
  if (input.hasParish && (input.parishAdoptedVersionId ?? "") !== input.versionId) return true;
  return input.includeZoneVersionIds.some((id) => id !== input.versionId);
}
