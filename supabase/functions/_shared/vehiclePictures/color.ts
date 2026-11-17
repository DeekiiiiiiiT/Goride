/** Standard colours stored lowercase (§3.2). */
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

const RULES: { needles: string[]; color: VehicleColor }[] = [
  { needles: ["PEARL"], color: "pearl white" },
  { needles: ["GUN", "CHARCOAL", "DARK GREY", "DARK GRAY"], color: "dark grey" },
  { needles: ["NAVY", "DARK BLUE"], color: "dark blue" },
  { needles: ["MAROON", "WINE", "BURGUNDY"], color: "maroon" },
  { needles: ["WHITE"], color: "white" },
  { needles: ["BLACK"], color: "black" },
  { needles: ["SILVER"], color: "silver" },
  { needles: ["GREY", "GRAY"], color: "grey" },
  { needles: ["BLUE"], color: "blue" },
  { needles: ["RED"], color: "red" },
  { needles: ["GREEN"], color: "green" },
  { needles: ["BROWN", "BRONZE"], color: "brown" },
  { needles: ["BEIGE", "CHAMPAGNE", "CREAM"], color: "beige" },
  { needles: ["GOLD"], color: "gold" },
  { needles: ["YELLOW"], color: "yellow" },
  { needles: ["ORANGE"], color: "orange" },
];

function firstTone(raw: string): string {
  const s = raw.trim();
  const slash = s.split(/[/&]/)[0]?.trim() ?? s;
  return slash;
}

/** Map certificate colour text to a standard colour, or null when unknown (§3.2). */
export function mapVehicleColor(raw: string): VehicleColor | null {
  const upper = firstTone(raw).toUpperCase();
  if (!upper) return null;
  for (const rule of RULES) {
    for (const needle of rule.needles) {
      if (upper.includes(needle)) return rule.color;
    }
  }
  return null;
}

/** Screen label: capitalise each word ("pearl white" → "Pearl White"). */
export function colorLabel(c: VehicleColor): string {
  return c.replace(/\b\w/g, (ch) => ch.toUpperCase());
}