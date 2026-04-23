/** Parse catalog production month from CSV (1–12, 01) or English month names. */

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;
const MONTH_ABBREV = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

const MONTH_LOOKUP: Record<string, number> = {};
for (let i = 0; i < 12; i++) {
  MONTH_LOOKUP[MONTH_NAMES[i]] = i + 1;
  MONTH_LOOKUP[MONTH_ABBREV[i]] = i + 1;
}

export function parseCatalogMonthFromString(
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  const key = t.toLowerCase();
  const fromName = MONTH_LOOKUP[key];
  if (fromName != null) return { ok: true, value: fromName };
  if (!/^\d{1,2}$/.test(t)) return { ok: false, error: "use 1–12 or an English month name" };
  const n = parseInt(t, 10);
  if (n < 1 || n > 12) return { ok: false, error: "must be between 1 and 12" };
  return { ok: true, value: n };
}

export function parseCatalogMonthFromUnknown(
  raw: unknown,
  label: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.trunc(raw);
    if (n >= 1 && n <= 12) return { ok: true, value: n };
    return { ok: false, error: `${label} must be between 1 and 12, or empty` };
  }
  const r = parseCatalogMonthFromString(String(raw));
  if (!r.ok) return { ok: false, error: `${label}: ${r.error}` };
  return r;
}
