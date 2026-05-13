/**
 * Pure helpers to pick a single vehicle_catalog id when multiple DB rows may match
 * make/model/year (year within production span). Used by the edge resolver and unit tests.
 */

export type CatalogVariantRow = {
  id: string;
  production_start_year: number;
  production_start_month?: number | null;
  production_end_year: number | null;
  production_end_month?: number | null;
  trim_series?: string | null;
  generation?: string | null;
  full_model_code?: string | null;
  catalog_trim?: string | null;
  emissions_prefix?: string | null;
  trim_suffix_code?: string | null;
  chassis_code?: string | null;
  engine_code?: string | null;
  engine_type?: string | null;
  drivetrain?: string | null;
  fuel_type?: string | null;
  transmission?: string | null;
};

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function ordinal(y: number, m: number | null | undefined): number {
  const mo = m == null || m < 1 || m > 12 ? 1 : m;
  return y * 12 + mo;
}

/** True if (fleetYear, fleetMonth) lies in the catalog row production window; month null = year-only overlap (caller pre-filters by year). */
export function catalogRowContainsFleetMonth(
  r: Pick<
    CatalogVariantRow,
    | "production_start_year"
    | "production_start_month"
    | "production_end_year"
    | "production_end_month"
  >,
  fleetYear: number,
  fleetMonth: number | null,
): boolean {
  if (fleetMonth == null || fleetMonth < 1 || fleetMonth > 12) {
    return (
      r.production_start_year <= fleetYear &&
      (r.production_end_year == null || r.production_end_year >= fleetYear)
    );
  }
  const fo = ordinal(fleetYear, fleetMonth);
  const so = ordinal(r.production_start_year, r.production_start_month ?? null);
  if (fo < so) return false;
  if (r.production_end_year == null) return true;
  const eo = ordinal(r.production_end_year, r.production_end_month ?? null);
  return fo <= eo;
}

export function filterCatalogRowsByFleetMonth<T extends CatalogVariantRow>(
  candidates: T[],
  fleetYear: number,
  fleetMonth: number | null,
): T[] {
  if (fleetMonth == null || fleetMonth < 1 || fleetMonth > 12) return candidates;
  return candidates.filter((r) => catalogRowContainsFleetMonth(r, fleetYear, fleetMonth));
}

export type CatalogMatchHints = {
  /** Matches `vehicle_catalog.trim_series` (trim, series, or facelift phase). */
  trim_series?: string | null;
  /** Market trim / grade (`vehicle_catalog.catalog_trim`); also matches `trim_series` when catalog_trim is empty on row. */
  catalog_trim?: string | null;
  full_model_code?: string | null;
  emissions_prefix?: string | null;
  trim_suffix_code?: string | null;
  chassis_code?: string | null;
  engine_code?: string | null;
  /** Free-text hint (trimmed/lowercased when matching catalog rows). */
  engine_type?: string | null;
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

  const ctr = norm(hints.catalog_trim);
  if (ctr) {
    const filtered = pool.filter(
      (r) => norm(r.catalog_trim) === ctr || (norm(r.catalog_trim) === "" && norm(r.trim_series) === ctr),
    );
    if (filtered.length === 0) return null;
    pool = filtered;
    if (pool.length === 1) return pool[0].id;
  }

  const fmc = norm(hints.full_model_code);
  if (fmc) {
    const filtered = pool.filter((r) => norm(r.full_model_code) === fmc);
    if (filtered.length === 0) return null;
    pool = filtered;
    if (pool.length === 1) return pool[0].id;
  }

  const ep = norm(hints.emissions_prefix);
  if (ep) {
    const filtered = pool.filter((r) => norm(r.emissions_prefix) === ep);
    if (filtered.length === 0) return null;
    pool = filtered;
    if (pool.length === 1) return pool[0].id;
  }

  const tsc = norm(hints.trim_suffix_code);
  if (tsc) {
    const filtered = pool.filter((r) => norm(r.trim_suffix_code) === tsc);
    if (filtered.length === 0) return null;
    pool = filtered;
    if (pool.length === 1) return pool[0].id;
  }

  const ch = norm(hints.chassis_code);
  if (ch) {
    const filtered = pool.filter((r) => norm(r.chassis_code) === ch);
    if (filtered.length === 0) return null;
    pool = filtered;
    if (pool.length === 1) return pool[0].id;
  }

  const ec = norm(hints.engine_code);
  if (ec) {
    const filtered = pool.filter((r) => norm(r.engine_code) === ec);
    if (filtered.length === 0) return null;
    pool = filtered;
    if (pool.length === 1) return pool[0].id;
  }

  const et = norm(hints.engine_type);
  if (et) {
    const filtered = pool.filter((r) => norm(r.engine_type) === et);
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
