/**
 * Shared helpers for maintenance category icons + line cost rollup.
 * Icon keys map to lucide-react component names used in fleet/admin UIs.
 */

export const MAINTENANCE_ICON_KEYS = [
  "basic",
  "intermediate",
  "major",
  "long_term",
  "wrench",
  "oil",
  "tires",
  "gauge",
  "droplet",
  "lightbulb",
  "rotate",
  "filter",
  "wind",
  "wipers",
  "brakes",
  "gears",
  "belt",
  "suspension",
  "spark",
  "thermometer",
] as const;

export type MaintenanceIconKey = (typeof MAINTENANCE_ICON_KEYS)[number];

/** Preset category codes used when seeding package memberships from A–D. */
export const PACKAGE_CATEGORY_CODES: Record<"A" | "B" | "C" | "D", string[]> = {
  A: ["oil", "tires", "tire_pressure", "fluids", "lights"],
  B: ["oil", "tires", "tire_pressure", "fluids", "lights", "rotate_tires", "air_filter", "cabin_filter", "wipers", "brakes"],
  C: [
    "oil",
    "tires",
    "tire_pressure",
    "fluids",
    "lights",
    "rotate_tires",
    "air_filter",
    "cabin_filter",
    "wipers",
    "brakes",
    "transmission",
    "brake_fluid",
    "belt",
    "suspension",
  ],
  D: ["spark_plugs", "coolant_flush"],
};

export function inferPackageIconKey(taskName: string, taskCode?: string | null): string {
  const code = (taskCode || "").toLowerCase().trim();
  const name = (taskName || "").toLowerCase().trim();
  if (code === "a" || code === "basic" || name.startsWith("basic")) return "basic";
  if (code === "b" || code === "intermediate" || name.startsWith("intermediate")) return "intermediate";
  if (code === "c" || code === "major" || name.startsWith("major")) return "major";
  if (code === "d" || code === "long_term" || code === "long-term" || name.includes("long") && name.includes("term")) {
    return "long_term";
  }
  return "wrench";
}
