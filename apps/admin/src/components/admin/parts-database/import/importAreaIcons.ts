/** Catalog DB icon_key slugs — not valid Material Symbols ligatures. */
const DB_ICON_SLUGS = new Set(["brakes", "oil", "droplet", "wind", "suspension", "tires", "gears", "belt"]);

const VALID_MATERIAL_KEYS = new Set([
  "bolt",
  "category",
  "highlight",
  "adjust",
  "air",
  "inventory_2",
  "filter_list",
  "flash_on",
  "lightbulb",
  "hvac",
  "battery_charging_full",
]);

const SLUG_TO_SYMBOL: Record<string, string> = {
  brakes: "album",
  tires: "tire_repair",
  belt: "cable",
  hoses: "cable",
  suspension: "swap_driving_apps",
  steering: "swap_driving_apps",
  transmission: "motion_sensor_active",
  hvac: "air",
  lighting: "lightbulb",
  visibility: "lightbulb",
  oil: "settings_suggest",
  droplet: "filter_alt",
  wind: "air",
  gears: "motion_sensor_active",
};

function iconFromAreaName(name: string): string {
  const text = name.toLowerCase();
  if (text.includes("battery") || text.includes("electrical")) return "bolt";
  if (text.includes("brake")) return "album";
  if (text.includes("engine")) return "settings_suggest";
  if (text.includes("filter")) return "filter_alt";
  if (text.includes("fluid")) return "water_drop";
  if (text.includes("hvac")) return "air";
  if (text.includes("light")) return "lightbulb";
  if (text.includes("suspension") || text.includes("steer")) return "swap_driving_apps";
  if (text.includes("tire") || text.includes("wheel")) return "tire_repair";
  if (text.includes("transmission")) return "motion_sensor_active";
  if (text.includes("belt") || text.includes("hose")) return "cable";
  return "category";
}

/** Map maintenance area icon_key (+ optional name) to a Material Symbols name. */
export function materialIconForArea(iconKey: string | null | undefined, areaName?: string): string {
  const key = String(iconKey ?? "").trim().toLowerCase();
  if (key && SLUG_TO_SYMBOL[key]) return SLUG_TO_SYMBOL[key]!;
  if (key && !DB_ICON_SLUGS.has(key) && (key.includes("_") || VALID_MATERIAL_KEYS.has(key))) {
    return key.replace(/-/g, "_");
  }
  if (areaName?.trim()) return iconFromAreaName(areaName);
  if (key) return SLUG_TO_SYMBOL[key] ?? "category";
  return "category";
}

export function catSysChip(sortOrder: number | undefined): string {
  const n = sortOrder ?? 0;
  return `CAT-SYS-${String(n).padStart(2, "0")}`;
}
