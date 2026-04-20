/**
 * Pure helpers to pick a single vehicle_catalog id when multiple DB rows may match
 * make/model/year. Used by the edge resolver and unit tests.
 */

export type CatalogVariantRow = {
  id: string;
  trim_series?: string | null;
  generation_code?: string | null;
  model_code?: string | null;
};

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

export type CatalogMatchHints = {
  trim_series?: string | null;
  generation_code?: string | null;
  /** Legacy OEM code; treated like generation_code for narrowing when generation_code is empty */
  model_code?: string | null;
};

/**
 * Given candidate catalog rows (already filtered by make/model/year), return exactly one id
 * when unambiguous; otherwise null.
 */
export function pickCatalogIdFromCandidates(
  candidates: CatalogVariantRow[],
  hints: CatalogMatchHints,
): string | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;

  let pool = candidates;

  const tr = norm(hints.trim_series);
  if (tr) {
    const filtered = pool.filter((r) => norm(r.trim_series) === tr);
    if (filtered.length === 0) return null;
    pool = filtered;
    if (pool.length === 1) return pool[0].id;
  }

  const gen = norm(hints.generation_code);
  if (gen) {
    const filtered = pool.filter((r) => norm(r.generation_code) === gen);
    if (filtered.length === 0) return null;
    pool = filtered;
    if (pool.length === 1) return pool[0].id;
  }

  const mc = norm(hints.model_code);
  if (mc) {
    const filtered = pool.filter(
      (r) => norm(r.generation_code) === mc || norm(r.model_code) === mc,
    );
    if (filtered.length === 0) return null;
    pool = filtered;
    if (pool.length === 1) return pool[0].id;
  }

  return null;
}