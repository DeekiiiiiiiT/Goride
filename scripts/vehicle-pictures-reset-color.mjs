/** Colour rules duplicated in reset script (audit §3.2); kept in sync via parity Deno test. */
const COLOR_RULES = [
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

export function mapVehicleColor(raw) {
  const s = String(raw ?? "").trim().split(/[/&]/)[0]?.trim() ?? "";
  const upper = s.toUpperCase();
  if (!upper) return null;
  for (const rule of COLOR_RULES) {
    for (const needle of rule.needles) {
      if (upper.includes(needle)) return rule.color;
    }
  }
  return null;
}