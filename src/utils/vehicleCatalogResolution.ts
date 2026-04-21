/**
 * Pure helpers to pick a single vehicle_catalog id when multiple DB rows may match
 * make/model/year (year within production span). Used by the edge resolver and unit tests.
 */

export type CatalogVariantRow = {
  id: string;
  trim_series?: string | null;
  generation_code?: string | null;
  model_code?: string | null;
  chassis_code?: string | null;
  drivetrain?: string | null;
  fuel_type?: string | null;
  transmission?: string | null;
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
  chassis_code?: string | null;
  drivetrain?: string | null;
  fuel_type?: string | null;
  transmission?: string | null;
};

/**
 * Given candidate catalog rows (already filtered by make/model and year-in-span), return exactly one id
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

  const ch = norm(hints.chassis_code);
  if (ch) {
    const filtered = pool.filter(
      (r) => norm(r.chassis_code) === ch || norm(r.generation_code) === ch,
    );
    if (filtered.length === 0) return null;
    pool = filtered;
    if (pool.length === 1) return pool[0].id;
  }

  const dt = norm(hints.drivetrain);
  if (dt) {
    const filtered = pool.filter((r) => norm(r.drivetrain) === dt);
    if (filtered.length === 0) return null;
    pool = filtered;
    if (pool.length === 1) return pool[0].id;
  }

  const ft = norm(hints.fuel_type);
  if (ft) {
    const filtered = pool.filter((r) => norm(r.fuel_type) === ft);
    if (filtered.length === 0) return null;
    pool = filtered;
    if (pool.length === 1) return pool[0].id;
  }

  const tx = norm(hints.transmission);
  if (tx) {
    const filtered = pool.filter((r) => norm(r.transmission) === tx);
    if (filtered.length === 0) return null;
    pool = filtered;
    if (pool.length === 1) return pool[0].id;
  }

  return null;
}
