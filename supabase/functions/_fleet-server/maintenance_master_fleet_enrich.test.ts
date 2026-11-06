import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function formatInterval(km: number | null, mo: number | null): string {
  const parts: string[] = [];
  if (km != null) parts.push(`${km.toLocaleString("en-US")} km`);
  if (mo != null) parts.push(`${mo} months`);
  if (!parts.length) return "—";
  return parts.join(" or ");
}

Deno.test("interval_sentence falls back to rule when schedule used intervals are null", () => {
  const rule = {
    interval_km: 1000,
    interval_months: 1,
    severe_interval_km: null as number | null,
    severe_interval_months: null as number | null,
  };
  const severe = false;
  let kmDisplay: number | null = null;
  let moDisplay: number | null = null;
  if (rule) {
    if (kmDisplay == null) {
      if (severe && rule.severe_interval_km != null) kmDisplay = Number(rule.severe_interval_km);
      else if (rule.interval_km != null) kmDisplay = Number(rule.interval_km);
    }
    if (moDisplay == null) {
      if (severe && rule.severe_interval_months != null) moDisplay = Number(rule.severe_interval_months);
      else if (rule.interval_months != null) moDisplay = Number(rule.interval_months);
    }
  }
  assertEquals(formatInterval(kmDisplay, moDisplay), "1,000 km or 1 months");
});
