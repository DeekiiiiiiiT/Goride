/**
 * Plain-words car picking for Dominion (owner rule: people pick make → model → year, never a frame or engine code).
 * Pure helpers so the screen and its tests share one truth.
 */
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";

export type PickOption = { value: string; label: string; hint?: string };

/** Year value for catalogue rows with no build years on file. */
export const UNKNOWN_YEAR = "unknown";

const key = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

/** One entry per name whatever its capitals ("Toyota" = "TOYOTA"); shows the most common spelling. */
function distinct(names: string[]): string[] {
  const spellings = new Map<string, Map<string, number>>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const k = key(name);
    const m = spellings.get(k) ?? new Map<string, number>();
    m.set(name, (m.get(name) ?? 0) + 1);
    spellings.set(k, m);
  }
  return [...spellings.values()].map((m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]).sort(byText);
}

const sameMakeModel = (c: VehicleCatalogRecord, make: string, model: string) => key(c.make) === key(make) && key(c.model) === key(model);

export function makesOf(cars: VehicleCatalogRecord[]): string[] {
  return distinct(cars.map((c) => c.make ?? ""));
}

export function modelsOf(cars: VehicleCatalogRecord[], make: string): string[] {
  return distinct(cars.filter((c) => key(c.make) === key(make)).map((c) => c.model ?? ""));
}

const hasYear = (c: VehicleCatalogRecord) => Number.isFinite(Number(c.production_start_year)) && Number(c.production_start_year) > 0;

/**
 * Year choices for this make + model, newest first; ongoing models run to `thisYear`. Rows with no build years on file
 * add a last choice, "Year not known", so they can still be picked.
 */
export function yearOptions(cars: VehicleCatalogRecord[], make: string, model: string, thisYear = new Date().getFullYear()): PickOption[] {
  const years = new Set<number>();
  let unknown = false;
  for (const c of cars) {
    if (!sameMakeModel(c, make, model)) continue;
    if (!hasYear(c)) {
      unknown = true;
      continue;
    }
    const end = c.production_end_year ?? thisYear;
    for (let y = Number(c.production_start_year); y <= end; y++) years.add(y);
  }
  const out: PickOption[] = [...years].sort((a, b) => b - a).map((y) => ({ value: String(y), label: String(y) }));
  if (unknown) out.push({ value: UNKNOWN_YEAR, label: "Year not known" });
  return out;
}

/** The versions of this make + model built in that year (or those with no years, for "Year not known"). */
export function versionsFor(cars: VehicleCatalogRecord[], make: string, model: string, year: string, thisYear = new Date().getFullYear()): VehicleCatalogRecord[] {
  if (year === UNKNOWN_YEAR) return cars.filter((c) => sameMakeModel(c, make, model) && !hasYear(c));
  const y = Number(year);
  if (!Number.isFinite(y)) return [];
  return cars.filter(
    (c) => sameMakeModel(c, make, model) && hasYear(c) && Number(c.production_start_year) <= y && (c.production_end_year ?? thisYear) >= y,
  );
}

function engineWords(c: VehicleCatalogRecord): string {
  const litres = Number(c.engine_displacement_l);
  const size = Number.isFinite(litres) && litres > 0 ? `${litres.toFixed(1)} L` : "";
  const kind = (c.engine_type ?? "").trim();
  const plainKind = /^n\/?a$/i.test(kind) ? "" : kind.toLowerCase();
  return [size, plainKind].filter(Boolean).join(" ");
}

function yearsText(c: VehicleCatalogRecord): string {
  return hasYear(c) ? `${c.production_start_year}–${c.production_end_year ?? "now"}` : "";
}

/**
 * Each version in plain words: trim · 2WD/4WD · engine size (turbo/hybrid) · gearbox · years. No frame or engine codes.
 * When two still read the same, the body type, then the model update (e.g. Facelift), then "version N" are added, so
 * every label is different.
 */
export function versionLabels(versions: VehicleCatalogRecord[]): Map<string, string> {
  const parts = (c: VehicleCatalogRecord, level: number) =>
    [
      (c.catalog_trim ?? "").trim(),
      (c.drivetrain ?? "").trim(),
      engineWords(c),
      (c.transmission ?? "").trim(),
      level >= 1 ? (c.body_type ?? "").trim() : "",
      level >= 2 ? (c.trim_series ?? "").trim() : "",
      yearsText(c),
    ]
      .filter(Boolean)
      .join(" · ");
  const level = new Map<string, number>(versions.map((c) => [c.id, 0]));
  const label = (c: VehicleCatalogRecord) => parts(c, level.get(c.id) ?? 0);
  for (let round = 1; round <= 2; round++) {
    const counts = new Map<string, number>();
    for (const c of versions) counts.set(label(c), (counts.get(label(c)) ?? 0) + 1);
    for (const c of versions) if ((counts.get(label(c)) ?? 0) > 1) level.set(c.id, round);
  }
  const out = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const c of versions) {
    const text = label(c) || `${c.make} ${c.model}`;
    const n = (seen.get(text) ?? 0) + 1;
    seen.set(text, n);
    out.set(c.id, n === 1 ? text : `${text} · version ${n}`);
  }
  // The first of a still-clashing group gets its number too, so no two read the same.
  for (const c of versions) {
    const text = out.get(c.id)!;
    if (!/ · version \d+$/.test(text) && (seen.get(text) ?? 0) > 1) out.set(c.id, `${text} · version 1`);
  }
  return out;
}

/**
 * Numbers already on file for the chosen car, as dropdown options ("Brake pads" → its number). Numbers that are not
 * checked yet say so in the hint.
 */
export function partNumberOptions(
  parts: Array<{ name: string; partNumber: string | null; maker?: string | null; cell?: string | null }>,
): PickOption[] {
  const seen = new Set<string>();
  const out: PickOption[] = [];
  for (const p of parts) {
    const n = (p.partNumber ?? "").trim();
    if (!n || seen.has(n.toUpperCase())) continue;
    seen.add(n.toUpperCase());
    const unchecked = p.cell != null && p.cell !== "verified";
    out.push({ value: n, label: p.name, hint: [p.maker, n, unchecked ? "not checked yet" : ""].filter(Boolean).join(" · ") });
  }
  return out;
}
