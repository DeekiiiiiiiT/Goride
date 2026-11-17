/** The 16 standard vehicle colours (audit §3.2). Stored lowercase; shown capitalised. */
export const VEHICLE_COLORS = [
  "white",
  "pearl white",
  "black",
  "silver",
  "grey",
  "dark grey",
  "blue",
  "dark blue",
  "red",
  "maroon",
  "green",
  "brown",
  "beige",
  "gold",
  "yellow",
  "orange",
] as const;

export type VehicleColor = (typeof VEHICLE_COLORS)[number];

/** Swatch shown in the colour dot. White and pearl white get a grey ring in the UI. */
export const COLOR_SWATCH: Record<VehicleColor, string> = {
  white: "#ffffff",
  "pearl white": "#f7f4ec",
  black: "#111111",
  silver: "#c0c4c8",
  grey: "#8a8f96",
  "dark grey": "#4b5058",
  blue: "#2563eb",
  "dark blue": "#1e3a8a",
  red: "#dc2626",
  maroon: "#7f1d1d",
  green: "#15803d",
  brown: "#78350f",
  beige: "#d6c7a1",
  gold: "#c9a227",
  yellow: "#facc15",
  orange: "#f97316",
};

export function isVehicleColor(v: unknown): v is VehicleColor {
  return typeof v === "string" && (VEHICLE_COLORS as readonly string[]).includes(v);
}

/** "pearl white" → "Pearl White". */
export function colorLabel(c: VehicleColor): string {
  return c.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function needsSwatchRing(c: VehicleColor): boolean {
  return c === "white" || c === "pearl white";
}
