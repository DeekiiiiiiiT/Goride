/**
 * Fleet-calendar Mon–Sun ranges for ledger reads (never unbounded).
 * Deno-safe — no date-fns.
 */

export const LEDGER_TZ = "America/Jamaica";

const calendarFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = calendarFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    calendarFormatters.set(timeZone, fmt);
  }
  return fmt;
}

function calendarDayKey(input: Date, timeZone: string): string {
  const parts = formatterFor(timeZone).formatToParts(input);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : input.toISOString().slice(0, 10);
}

function mondayOfYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const local = new Date(y, m - 1, d, 12, 0, 0);
  const dow = local.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  local.setDate(local.getDate() + delta);
  const yy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, "0");
  const dd = String(local.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const local = new Date(y, m - 1, d, 12, 0, 0);
  local.setDate(local.getDate() + days);
  const yy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, "0");
  const dd = String(local.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export type YmdRange = { from: string; to: string };

/** This Mon–Sun week in the fleet timezone (default America/Jamaica). */
export function thisWeekRange(tz: string = LEDGER_TZ): YmdRange {
  const today = calendarDayKey(new Date(), tz);
  const from = mondayOfYmd(today);
  return { from, to: addDaysYmd(from, 6) };
}

/**
 * Inclusive range covering the last `n` Mon–Sun weeks ending this Sunday.
 * n=1 → this week; n=12 → bank/wallet expected default; n=4 → driver earnings default.
 */
export function lastNWeeksRange(n: number, tz: string = LEDGER_TZ): YmdRange {
  const weeks = Math.max(1, Math.floor(n) || 1);
  const { from: thisMon, to } = thisWeekRange(tz);
  const from = addDaysYmd(thisMon, -7 * (weeks - 1));
  return { from, to };
}

/** ISO bounds for SQL/RPC (start of from day → end of to day, UTC). */
export function rangeToIsoBounds(range: YmdRange): { from: string; to: string } {
  return {
    from: `${range.from}T00:00:00.000Z`,
    to: `${range.to}T23:59:59.999Z`,
  };
}
