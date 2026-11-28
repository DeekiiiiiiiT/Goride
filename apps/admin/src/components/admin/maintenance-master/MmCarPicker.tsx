import { useMemo } from "react";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";

/**
 * Make → Model → Years → Version, all from the catalogue (owner rule, 21 Nov: nobody types or sees a frame
 * code). The version is said in plain words: trim · 2WD/4WD · engine size · fuel · gearbox.
 */

type Row = VehicleCatalogRecord & {
  catalog_trim?: string | null;
  trim_series?: string | null;
  engine_type?: string | null;
  transmission?: string | null;
  body_type?: string | null;
  drivetrain?: string | null;
  engine_displacement_l?: number | null;
  status?: string | null;
};

export type CarPick = { make: string; model: string; years: string; versionId: string };

export const EMPTY_PICK: CarPick = { make: "", model: "", years: "", versionId: "" };

function yearsOf(r: Row): string {
  const a = r.production_start_year;
  const b = r.production_end_year;
  if (a && b) return a === b ? String(a) : `${a}–${b}`;
  if (a) return `${a}–`;
  return "Years not known";
}

function fuelWord(engineType: string | null | undefined): string {
  const t = String(engineType ?? "").toLowerCase();
  if (t.includes("hybrid")) return "hybrid";
  if (t.includes("diesel")) return "diesel";
  if (t.includes("electric") || t === "ev") return "electric";
  if (t.includes("petrol") || t.includes("gasoline") || t.includes("gas")) return "petrol";
  return "";
}

function gearboxWord(transmission: string | null | undefined): string {
  const t = String(transmission ?? "").toLowerCase();
  if (t.includes("cvt")) return "CVT";
  if (t.includes("auto")) return "automatic";
  if (t.includes("manual")) return "manual";
  return "";
}

export function versionLabel(r: Row): string {
  const size = r.engine_displacement_l ? `${Number(r.engine_displacement_l).toFixed(1)}` : "";
  const fuel = fuelWord(r.engine_type);
  const engine = [size, fuel].filter(Boolean).join(" ");
  const drive = String(r.drivetrain ?? "").toUpperCase().match(/\b(2WD|4WD|AWD|FWD|RWD)\b/)?.[1] ?? "";
  const trim = String(r.catalog_trim ?? r.trim_series ?? "").trim();
  const parts = [trim, drive, engine, gearboxWord(r.transmission)].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Standard";
}

export function carPickLabel(rows: Row[], pick: CarPick): string {
  const r = rows.find((x) => x.id === pick.versionId);
  if (!r) return "";
  return `${r.make} ${r.model} ${yearsOf(r)} · ${versionLabel(r)}`;
}

type Props = {
  catalog: VehicleCatalogRecord[];
  value: CarPick;
  onChange: (next: CarPick) => void;
  disabled?: boolean;
  /** Two columns (drawer) or four in a row (upload overlay). */
  layout?: "grid" | "row";
};

const SELECT =
  "mt-1 h-11 w-full rounded-[10px] border border-[#c5c6d0] bg-white px-3 text-[15px] text-[#30323b] focus:border-[#0153dc] focus:outline-none focus:ring-2 focus:ring-[#0153dc]/30 disabled:opacity-50";
const LABEL = "block text-[12px] font-semibold uppercase tracking-wide text-[#5d5f68]";

export function MmCarPicker({ catalog, value, onChange, disabled, layout = "grid" }: Props) {
  const rows = useMemo(
    () => (catalog as Row[]).filter((r) => r.make && r.model && r.status !== "retired" && r.status !== "merged"),
    [catalog],
  );
  const makes = useMemo(() => [...new Set(rows.map((r) => r.make))].sort((a, b) => a.localeCompare(b)), [rows]);
  const models = useMemo(
    () =>
      [...new Set(rows.filter((r) => r.make === value.make).map((r) => r.model))].sort((a, b) => a.localeCompare(b)),
    [rows, value.make],
  );
  const yearOptions = useMemo(() => {
    const list = rows.filter((r) => r.make === value.make && r.model === value.model).map(yearsOf);
    return [...new Set(list)].sort((a, b) => b.localeCompare(a));
  }, [rows, value.make, value.model]);
  const versions = useMemo(
    () => rows.filter((r) => r.make === value.make && r.model === value.model && yearsOf(r) === value.years),
    [rows, value.make, value.model, value.years],
  );

  const pick = (patch: Partial<CarPick>) => {
    const next = { ...value, ...patch };
    // When only one version is left, it is the answer.
    if (patch.years !== undefined || patch.model !== undefined || patch.make !== undefined) {
      const left = rows.filter((r) => r.make === next.make && r.model === next.model && yearsOf(r) === next.years);
      next.versionId = left.length === 1 ? left[0].id : "";
    }
    onChange(next);
  };

  const grid = layout === "row" ? "grid grid-cols-2 gap-2 md:grid-cols-4" : "grid grid-cols-2 gap-3";

  return (
    <div className={grid} data-testid="mm-car-picker">
      <label className={LABEL}>
        Make
        <select
          className={SELECT}
          value={value.make}
          disabled={disabled}
          aria-label="Make"
          onChange={(e) => pick({ make: e.target.value, model: "", years: "" })}
        >
          <option value="">Choose a make</option>
          {makes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        Model
        <select
          className={SELECT}
          value={value.model}
          disabled={disabled || !value.make}
          aria-label="Model"
          onChange={(e) => pick({ model: e.target.value, years: "" })}
        >
          <option value="">Choose a model</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        Years
        <select
          className={SELECT}
          value={value.years}
          disabled={disabled || !value.model}
          aria-label="Years"
          onChange={(e) => pick({ years: e.target.value })}
        >
          <option value="">Choose the years</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        Version
        <select
          className={SELECT}
          value={value.versionId}
          disabled={disabled || !value.years}
          aria-label="Version"
          onChange={(e) => onChange({ ...value, versionId: e.target.value })}
        >
          <option value="">Choose the version</option>
          {versions.map((r) => (
            <option key={r.id} value={r.id}>
              {versionLabel(r)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Find the pick that matches a saved catalogue car (editing an existing "One car version" rule). */
export function pickForCatalogId(catalog: VehicleCatalogRecord[], id: string): CarPick {
  const r = (catalog as Row[]).find((x) => x.id === id);
  if (!r) return EMPTY_PICK;
  return { make: r.make, model: r.model, years: yearsOf(r), versionId: r.id };
}
