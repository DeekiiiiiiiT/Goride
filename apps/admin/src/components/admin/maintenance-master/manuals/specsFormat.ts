/** Plain words for owner's-manual specs (build step 6b). Pure, so it is tested without a screen. */
import type { SpecRow } from "./manualsApi";

const KEY_LABELS: Record<string, string> = {
  engine_oil_capacity_l: "Engine oil capacity",
  engine_oil_capacity_with_filter_l: "Engine oil capacity with filter",
  engine_oil_grade: "Engine oil grade",
  coolant_capacity_l: "Coolant capacity",
  coolant_type: "Coolant",
  transmission_fluid: "Transmission fluid",
  transmission_fluid_capacity_l: "Transmission fluid capacity",
  transfer_oil_grade: "Transfer oil grade",
  transfer_oil_capacity_l: "Transfer oil capacity",
  differential_oil_grade: "Differential oil grade",
  differential_oil_capacity_l: "Differential oil capacity",
  washer_capacity_l: "Washer fluid capacity",
  washer_fluid: "Washer fluid",
  battery_jis: "Battery size",
  battery_type: "Battery type",
  fuel_tank_capacity: "Fuel tank",
  fuel_tank_capacity_l: "Fuel tank",
  fuel_grade: "Fuel",
  front: "Tyres · front",
  rear: "Tyres · rear",
  spare: "Spare tyre",
};

export const SPEC_GROUPS: Array<{ kind: string; title: string; icon: string }> = [
  { kind: "fluid", title: "Fluids", icon: "water_drop" },
  { kind: "fuel", title: "Fuel", icon: "local_gas_station" },
  { kind: "tyre", title: "Tyres", icon: "tire_repair" },
  { kind: "battery", title: "Battery", icon: "battery_charging_full" },
  { kind: "bulb", title: "Bulbs", icon: "lightbulb" },
];

function humanise(key: string): string {
  const s = key.replace(/_l$/, "").replace(/_/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Value";
}

export function specLabel(row: Pick<SpecRow, "kind" | "key">): string {
  if (row.kind === "bulb") return row.key || "Lamp";
  return KEY_LABELS[row.key] ?? humanise(row.key);
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** "2.9 L", "0W-20 (also 5W-30)", "165/65R14 79S · 14×5J · 260 kPa · optional", "H4 · 60/55 W", "LED". */
export function specValueText(row: Pick<SpecRow, "kind" | "value">): string {
  const v = (row.value ?? {}) as Record<string, unknown>;
  if (row.kind === "tyre") {
    const bits = [
      [str(v.size), str(v.load_speed_index)].filter(Boolean).join(" "),
      str(v.wheel_size),
      v.pressure_kpa != null ? `${str(v.pressure_kpa)} kPa` : "",
      v.is_optional === true ? "optional" : "",
    ].filter(Boolean);
    return bits.join(" · ") || "—";
  }
  if (row.kind === "bulb") {
    if (v.is_led === true || str(v.bulb_ref).toUpperCase() === "LED") return "LED";
    const ref = str(v.bulb_ref);
    if (!ref || ref === "Unknown") return "Not printed — check the page";
    const watts = str(v.wattage_w);
    return watts ? `${ref} · ${watts.replace(/\s*W$/i, "")} W` : ref;
  }
  const main = str(v.value);
  const unit = str(v.unit);
  const also = Array.isArray(v.also) && v.also.length ? ` (also ${(v.also as unknown[]).map(str).join(", ")})` : "";
  const withFilter = v.with_filter != null ? ` · ${str(v.with_filter)} ${unit || "L"} with filter` : "";
  const value = main ? `${main}${unit && !main.endsWith(unit) ? ` ${unit}` : ""}` : "—";
  return `${value}${withFilter}${also}`;
}

/** "Now 3.2 L → Manual 2.9 L" parts for one spec over the ticked versions. */
export function nowText(row: Pick<SpecRow, "now" | "version_ids">): string {
  const values = [
    ...new Set(row.now.filter((n) => row.version_ids.includes(n.vehicle_catalog_id)).map((n) => n.value.trim()).filter(Boolean)),
  ];
  if (!values.length) return "—";
  return values.join(" / ");
}

/** "520–526, 412–413, 3" → compact ranges from a list of printed page numbers. */
export function pageListText(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const out: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i += 1) {
    const p = sorted[i];
    if (p === prev + 1) {
      prev = p;
      continue;
    }
    if (start !== undefined) out.push(start === prev ? String(start) : `${start}–${prev}`);
    start = p;
    prev = p;
  }
  return out.join(", ");
}
