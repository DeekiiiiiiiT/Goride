import type { VehicleColor } from "./color.ts";

export type CatalogRow = {
  make: string;
  model: string;
  generation: string;
  body_type: string;
  trim_series: string | null;
  start_year: number | null;
  end_year: number | null;
};

export type VehicleLook = {
  key: string;
  make: string;
  model: string;
  generation: string;
  bodyType: string;
  faceliftStage: "standard" | "pre_facelift" | "facelift";
  startYear: number | null;
  endYear: number | null;
  color: VehicleColor;
};

export type BuildLookError = { error: "NON_LATIN_CATALOG_VALUE" };

const NON_LATIN_LETTER = /[^\u0000-\u007F]/;

export function normalizeLookPart(s: string): string {
  let t = s.trim().toLowerCase().replace(/[-_]/g, " ");
  t = t.replace(/\s+/g, " ");
  return t;
}

function normalizeBody(body: string): string {
  const b = normalizeLookPart(body.replace(/\//g, " "));
  if (b === "hatch back") return "hatchback";
  if (b === "stn waggon" || b === "station wagon" || b === "wagon") return "wagon";
  if (b === "saloon") return "sedan";
  if (b === "mini van") return "minivan";
  return b;
}

function normalizeGeneration(gen: string): string {
  const g = normalizeLookPart(gen);
  return g.replace(/\b(\d+)(st|nd|rd|th)\s+gen(?:eration)?\b/g, "$1$2 gen");
}

/** Facelift stage from catalogue trim_series (§3.1). */
export function faceliftStage(trimSeries: string | null): VehicleLook["faceliftStage"] {
  if (!trimSeries) return "standard";
  if (/\bpre[\s-]?facelift\b/i.test(trimSeries)) return "pre_facelift";
  if (/\b(facelift|minor change|mc)\b/i.test(trimSeries)) return "facelift";
  return "standard";
}

function hasNonLatin(...parts: string[]): boolean {
  return parts.some((p) => NON_LATIN_LETTER.test(p));
}

export function buildLook(
  catalogRow: CatalogRow,
  color: VehicleColor,
): VehicleLook | BuildLookError {
  const make = normalizeLookPart(catalogRow.make);
  const model = normalizeLookPart(catalogRow.model);
  const generation = normalizeGeneration(catalogRow.generation);
  const bodyType = normalizeBody(catalogRow.body_type);
  const stage = faceliftStage(catalogRow.trim_series);

  if (hasNonLatin(make, model, generation, bodyType)) {
    return { error: "NON_LATIN_CATALOG_VALUE" };
  }

  const key = `${make}|${model}|${generation}|${bodyType}|${stage}|${color}`;
  return {
    key,
    make,
    model,
    generation,
    bodyType,
    faceliftStage: stage,
    startYear: catalogRow.start_year,
    endYear: catalogRow.end_year,
    color,
  };
}

/** Look key without the trailing `|colour` segment (shared by all colours for one catalogue row). */
export function lookKeyBase(lookKey: string): string {
  const idx = lookKey.lastIndexOf("|");
  return idx <= 0 ? lookKey : lookKey.slice(0, idx);
}

/** One active catalogue row → one look base (no colour). */
export function catalogLookBaseKey(catalogRow: CatalogRow): string | BuildLookError {
  const probe = buildLook(catalogRow, "white");
  if ("error" in probe) return probe;
  return lookKeyBase(probe.key);
}