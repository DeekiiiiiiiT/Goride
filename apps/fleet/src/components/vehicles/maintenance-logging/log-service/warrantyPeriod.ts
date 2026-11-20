/**
 * LC-22 Warranty period (owner 20 Nov): ticking Warranty asks how long the part's warranty lasts. Kept in the job's
 * values (values_json): warranty_months + warranty_until (YYYY-MM-DD, from the service date).
 */
type Values = Record<string, string | number | boolean | null | undefined>;

export type Warranty = { months: number; until: string | null };

export const WARRANTY_CHOICES = [3, 6, 12, 18, 24, 36] as const;

/** "6 months", "1 year", "18 months", "2 years". */
export function warrantyLength(months: number): string {
  if (months % 12 === 0) {
    const y = months / 12;
    return y === 1 ? "1 year" : `${y} years`;
  }
  return months === 1 ? "1 month" : `${months} months`;
}

/** The service date + months, as YYYY-MM-DD (month ends clamp: 31 Jan + 1 month → 28/29 Feb). */
export function warrantyUntil(serviceDate: string | null | undefined, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(serviceDate ?? "");
  if (!m || !(months > 0)) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const d = Number(m[3]);
  const ty = y + Math.floor(mo / 12);
  const tm = ((mo % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const out = new Date(Date.UTC(ty, tm, Math.min(d, last)));
  return out.toISOString().slice(0, 10);
}

/** "19 Nov 2027" */
export function shortUntil(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${names[m - 1]} ${y}`;
}

/** "1 year · until 19 Nov 2027" */
export function warrantyText(w: Warranty): string {
  return [warrantyLength(w.months), w.until ? `until ${shortUntil(w.until)}` : null].filter(Boolean).join(" · ");
}

export function warrantyValues(w: Warranty | null): { warranty_months: number | null; warranty_until: string | null } {
  return { warranty_months: w?.months ?? null, warranty_until: w?.until ?? null };
}

export function warrantyFromValues(values: Values | null | undefined): Warranty | null {
  const months = Number(values?.warranty_months);
  if (!Number.isFinite(months) || months <= 0) return null;
  const until = typeof values?.warranty_until === "string" && values.warranty_until ? values.warranty_until : null;
  return { months: Math.round(months), until };
}
