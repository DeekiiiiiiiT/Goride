/** Step 16e: the Hard use rule card — fields, how they show, and what changed in each log line. */
import type { HardUsePolicy } from "./maintenanceMasterApi";

export type HardUseField = {
  key: keyof HardUsePolicy;
  label: string;
  unit: string;
  /** Shown as a percentage, stored as a share (0.30). */
  percent?: boolean;
  step?: number;
};

export const HARD_USE_FIELDS: HardUseField[] = [
  { key: "baseline_km_per_year", label: "Normal use", unit: "km a year", step: 500 },
  { key: "high_use_multiple", label: "Hard use starts at", unit: "× normal", step: 0.1 },
  { key: "short_trip_share", label: "Or short trips make up", unit: "% of trips", percent: true, step: 1 },
  { key: "short_trip_km", label: "A short trip is under", unit: "km", step: 1 },
  { key: "min_trips", label: "Short trips count from", unit: "trips", step: 1 },
  { key: "window_days", label: "Measured over", unit: "days", step: 1 },
  { key: "min_span_days", label: "Readings needed across", unit: "days", step: 1 },
  { key: "clear_days", label: "Back to normal after", unit: "days below the line", step: 1 },
  { key: "kept_normal_days", label: "Fleet keeps normal schedules for", unit: "days", step: 1 },
  { key: "kept_hard_days", label: "Fleet keeps shorter schedules for", unit: "days", step: 1 },
];

/** The value shown in the box. */
export function fieldText(field: HardUseField, policy: HardUsePolicy | null): string {
  const v = policy ? Number(policy[field.key]) : NaN;
  if (!Number.isFinite(v)) return "";
  return field.percent ? String(Math.round(v * 100)) : String(v);
}

/** The value sent to the server, or null when the box is empty or not a number. */
export function fieldValue(field: HardUseField, text: string): number | null {
  const t = text.replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return field.percent ? n / 100 : n;
}

/** "Normal use: 10,000 → 12,000 km a year" for every field a log line changed. */
export function logChanges(before: Partial<HardUsePolicy> | null, after: Partial<HardUsePolicy> | null): string[] {
  const out: string[] = [];
  for (const f of HARD_USE_FIELDS) {
    const a = before?.[f.key];
    const b = after?.[f.key];
    if (a == null || b == null || Number(a) === Number(b)) continue;
    const show = (v: unknown) =>
      f.percent ? `${Math.round(Number(v) * 100)}` : Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
    out.push(`${f.label}: ${show(a)} → ${show(b)} ${f.unit}`);
  }
  return out;
}

/** "27 km a day · 833 a month" under Normal use. */
export function baselineLine(kmPerYear: number | null): string | null {
  if (kmPerYear == null || !(kmPerYear > 0)) return null;
  const day = Math.round(kmPerYear / 365);
  const week = Math.round(kmPerYear / 52);
  const month = Math.round(kmPerYear / 12);
  return `${day} km a day · ${week.toLocaleString("en-US")} a week · ${month.toLocaleString("en-US")} a month`;
}
