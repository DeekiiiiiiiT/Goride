/**
 * Powertrain job fit — one list of codes, plain names and presets for every Dominion screen
 * (docs/powertrain-job-fit-audit.md sections 2, 4, 5). The fit RULE itself lives only in the database
 * (job_fits_car / job_fit_count); this file only names things and maps presets ↔ saved lists.
 */

export const POWERTRAINS = ["ice", "mhev", "hev", "phev", "erev", "bev", "fcev"] as const;
export type Powertrain = (typeof POWERTRAINS)[number];

export const FUELS = ["petrol", "diesel", "cng", "hydrogen", "electric"] as const;
export type Fuel = (typeof FUELS)[number];

export const POWERTRAIN_LABEL: Record<Powertrain, string> = {
  ice: "Petrol / diesel engine",
  mhev: "Mild hybrid",
  hev: "Hybrid",
  phev: "Plug-in hybrid",
  erev: "Range-extender",
  bev: "Electric",
  fcev: "Hydrogen fuel cell",
};

/** Short names for chips and the mix bar. */
export const POWERTRAIN_SHORT: Record<Powertrain, string> = {
  ice: "Petrol / diesel",
  mhev: "Mild hybrid",
  hev: "Hybrid",
  phev: "Plug-in hybrid",
  erev: "Range-extender",
  bev: "Electric",
  fcev: "Hydrogen",
};

export const FUEL_LABEL: Record<Fuel, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  cng: "CNG (gas)",
  hydrogen: "Hydrogen",
  electric: "Electric",
};

export const POWERTRAIN_ICON: Record<Powertrain, string> = {
  ice: "local_gas_station",
  mhev: "battery_plus",
  hev: "battery_charging_full",
  phev: "power",
  erev: "ev_station",
  bev: "bolt",
  fcev: "water_drop",
};

/** Mix-bar colours (light, dark). */
export const POWERTRAIN_COLOUR: Record<Powertrain | "needs_check", string> = {
  ice: "#8e9bb3",
  mhev: "#6366f1",
  hev: "#14b8a6",
  phev: "#0ea5e9",
  erev: "#22d3ee",
  bev: "#10b981",
  fcev: "#a855f7",
  needs_check: "#f59e0b",
};

export type PresetId = "all" | "custom" | string;
export type Preset = { id: string; label: string; hint: string; codes: readonly string[] };

export const POWERTRAIN_PRESETS: Preset[] = [
  { id: "all", label: "All cars", hint: "Every car in the catalogue", codes: POWERTRAINS },
  { id: "combustion", label: "Combustion", hint: "Has a fuel-burning engine", codes: ["ice", "mhev", "hev", "phev", "erev"] },
  { id: "electrified", label: "Electrified", hint: "Has a high-voltage drive battery", codes: ["hev", "phev", "erev", "bev", "fcev"] },
  { id: "plugin", label: "Plug-in", hint: "Charged from a socket", codes: ["phev", "erev", "bev"] },
];

export const FUEL_PRESETS: Preset[] = [
  { id: "all", label: "All fuels", hint: "Any fuel", codes: FUELS },
  { id: "petrol", label: "Petrol", hint: "Petrol only", codes: ["petrol"] },
  { id: "diesel", label: "Diesel", hint: "Diesel only", codes: ["diesel"] },
  { id: "spark", label: "Spark-ignition", hint: "Petrol and CNG", codes: ["petrol", "cng"] },
];

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Which preset a saved list is. NULL (any) reads as "all"; a list that matches no preset is "custom". */
export function presetFor(list: readonly string[] | null | undefined, presets: Preset[]): PresetId {
  if (list == null) return "all";
  return presets.find((p) => sameSet(p.codes, list))?.id ?? "custom";
}

/** Plain words for a saved list: preset name, or the codes' names joined. NULL = "All". */
export function describeList(
  list: readonly string[] | null | undefined,
  presets: Preset[],
  labels: Record<string, string>,
): string {
  if (list == null) return presets[0].label;
  const id = presetFor(list, presets);
  if (id !== "custom") return presets.find((p) => p.id === id)!.label;
  return list.map((c) => labels[c] ?? c).join(", ");
}

/** Keep codes in the canonical order, no duplicates. */
export function ordered<T extends string>(codes: Iterable<string>, all: readonly T[]): T[] {
  const set = new Set(codes);
  return all.filter((c) => set.has(c));
}

/**
 * One row of the job drawer's "Fits" section. `inherit` = "Same as group" (saves NULL on a job).
 * Otherwise `codes` is the list to save; the "All" preset saves the FULL list on a job (audit 4:
 * NULL on a job already means "same as group"). On a group, All saves NULL (= any car).
 */
export type FitRow = { inherit: boolean; codes: string[] };

export function rowFromSaved(saved: string[] | null | undefined, all: readonly string[], isGroup: boolean): FitRow {
  if (saved == null) return isGroup ? { inherit: false, codes: [...all] } : { inherit: true, codes: [...all] };
  return { inherit: false, codes: [...saved] };
}

/** What to save for a row: null or a non-empty list. Returns undefined when the row can't be saved (nothing ticked). */
export function rowToSave(row: FitRow, all: readonly string[], isGroup: boolean): string[] | null | undefined {
  if (!isGroup && row.inherit) return null;
  if (row.codes.length === 0) return undefined;
  if (isGroup && sameSet(row.codes, all)) return null;
  return ordered(row.codes, all as readonly string[]);
}

export function powertrainName(code: string | null | undefined): string {
  return code && code in POWERTRAIN_SHORT ? POWERTRAIN_SHORT[code as Powertrain] : "Not known";
}

export function fuelName(code: string | null | undefined): string {
  return code && code in FUEL_LABEL ? FUEL_LABEL[code as Fuel] : "Not known";
}

/** Data-disagreement line for the "Powertrain to check" list (3a rule 2), or null. */
export function disagreementText(fuelType: string | null | undefined, category: string | null | undefined): string | null {
  if (fuelType === "Hybrid(petrol)" && category === "Gas") {
    return `The data disagrees: fuel type says ${fuelType}, category says ${category}.`;
  }
  return null;
}

/** "Worked out from '<fuel_type> / <engine_type>'" — the raw text the rule read. */
export function workedOutFrom(fuelType: string | null | undefined, engineType: string | null | undefined): string {
  const parts = [fuelType, engineType].map((s) => (s ?? "").trim()).filter(Boolean);
  return parts.length ? `Worked out from '${parts.join(" / ")}'` : "Worked out from the car's record";
}
