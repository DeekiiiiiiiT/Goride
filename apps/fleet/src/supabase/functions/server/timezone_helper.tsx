/**
 * timezone_helper.tsx — Fleet Timezone Utilities
 *
 * Reads the fleet timezone from KV (platform:settings → fleetTimezone)
 * and provides helpers to convert naive datetime strings to UTC using
 * Intl.DateTimeFormat for DST-aware offset resolution.
 *
 * Browser-side counterpart: /services/import-validator.ts has a matching
 * naiveToUtcBrowser() (added in Phase 6) using the same algorithm.
 */

import * as kv from "./kv_store.tsx";
import { LEGACY_PLATFORM_SETTINGS_KEY, platformSettingsKvKey } from "./platform_settings.ts";

// ─── Constants ───────────────────────────────────────────────────────
const DEFAULT_TIMEZONE = "America/Jamaica";
const CACHE_TTL_MS = 60_000; // 1 minute

// ─── Cache ───────────────────────────────────────────────────────────
let cachedTimezone: string | null = null;
let cacheExpiry = 0;
let lastProductLine: "fleet" | "enterprise" = "fleet";

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Reads the fleet timezone from KV with a 1-minute cache.
 * Dual-read: platform:settings:{productLine} → legacy platform:settings → default.
 */
export async function getFleetTimezone(productLine: "fleet" | "enterprise" = "fleet"): Promise<string> {
  const now = Date.now();
  if (cachedTimezone && now < cacheExpiry && lastProductLine === productLine) {
    return cachedTimezone;
  }

  try {
    let record = await kv.get(platformSettingsKvKey(productLine)) as Record<string, any> | null;
    if (!record || typeof record !== "object") {
      record = await kv.get(LEGACY_PLATFORM_SETTINGS_KEY) as Record<string, any> | null;
    }
    const tz =
      record && typeof record === "object" && record.fleetTimezone
        ? record.fleetTimezone
        : DEFAULT_TIMEZONE;

    // Validate that the timezone is usable by Intl
    try {
      Intl.DateTimeFormat("en-US", { timeZone: tz });
    } catch {
      console.log(`[timezone_helper] Invalid IANA timezone "${tz}", falling back to ${DEFAULT_TIMEZONE}`);
      cachedTimezone = DEFAULT_TIMEZONE;
      cacheExpiry = now + CACHE_TTL_MS;
      return DEFAULT_TIMEZONE;
    }

    cachedTimezone = tz;
    cacheExpiry = now + CACHE_TTL_MS;
    lastProductLine = productLine;
    return tz;
  } catch (err) {
    console.log(`[timezone_helper] Error reading fleet timezone from KV: ${err}`);
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Returns true if the string already has a timezone suffix
 * (Z, z, +HH:MM, or -HH:MM at the end).
 */
export function hasTzSuffix(s: string): boolean {
  return /[Zz]|[+-]\d{2}:\d{2}$/.test(s);
}

/**
 * Legacy imports stored CSV wall-clock components via browser `toISOString()`,
 * baking the importing browser's offset into a Z-suffixed UTC string. Recover
 * the original Y-M-D H:M:S digits and reinterpret them in the fleet timezone.
 */
function reinterpretUtcDigitsAsFleetLocal(d: Date, timezone: string): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  const naive =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return naiveToUtc(naive, timezone);
}

/** yyyy-MM-dd calendar day for an instant in the fleet timezone. */
export function toFleetCalendarDay(instant: Date, timezone: string): string {
  if (isNaN(instant.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return y && m && d ? `${y}-${m}-${d}` : "";
  } catch {
    return "";
  }
}

function fleetLocalHour(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(instant);
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

/**
 * Resolve a stored timestamp for matching/display without re-importing.
 * - Already-fleetTz imports (v2): parse directly.
 * - Jamaica-browser legacy: direct parseISO is correct.
 * - UTC-browser legacy: UTC digit clock was local wall time — reinterpret.
 */
export function resolveFleetInstant(stored: string, timezone: string): Date {
  if (!stored) return new Date(NaN);
  if (!hasTzSuffix(stored)) return naiveToUtc(stored, timezone);

  const direct = new Date(stored);
  if (isNaN(direct.getTime())) return direct;

  const reinterpreted = reinterpretUtcDigitsAsFleetLocal(direct, timezone);
  if (direct.getTime() === reinterpreted.getTime()) return direct;

  const utcYmd = stored.slice(0, 10);
  const directYmd = toFleetCalendarDay(direct, timezone);
  const reinterpretYmd = toFleetCalendarDay(reinterpreted, timezone);

  // Cross-midnight UTC-browser import: fleet day from direct ≠ UTC digit day.
  if (reinterpretYmd === utcYmd && directYmd !== utcYmd) {
    return reinterpreted;
  }

  // Same day but shifted hours: e.g. 11:39 stored as UTC → displays 6:39 AM fleet.
  const utcH = direct.getUTCHours();
  const reH = fleetLocalHour(reinterpreted, timezone);
  const diH = fleetLocalHour(direct, timezone);
  const utcMatchesRe = Math.abs(utcH - reH) <= 1;
  const utcMatchesDi = Math.abs(utcH - diH) <= 1;
  if (utcMatchesRe && !utcMatchesDi && diH <= 7) {
    return reinterpreted;
  }

  return direct;
}

/** In-memory repair for legacy trip rows — safe to call on every load. */
export function repairTripTimesForMatching(trip: any, timezone: string): void {
  if (!trip || trip.timesSource === "fleetTzV2") return;

  const fields = ["requestTime", "dropoffTime", "startTime"] as const;
  for (const key of fields) {
    const raw = trip[key];
    if (!raw || typeof raw !== "string") continue;
    const fixed = resolveFleetInstant(raw, timezone);
    if (!isNaN(fixed.getTime())) trip[key] = fixed.toISOString();
  }

  if (trip.date && typeof trip.date === "string" && hasTzSuffix(trip.date)) {
    const fixed = resolveFleetInstant(trip.date, timezone);
    if (!isNaN(fixed.getTime())) trip.date = fixed.toISOString();
  }
}

/** @deprecated Use resolveFleetInstant */
export function parseFleetLocalInstant(stored: string, timezone: string): Date {
  return resolveFleetInstant(stored, timezone);
}

/** Normalize "3:16:00 PM" / "15:16:00" to HH:MM:SS for naiveToUtc. */
export function normalizeWallClockTime(raw: string): string {
  const pm = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (pm) {
    let h = parseInt(pm[1], 10);
    const m = pm[2];
    const s = pm[3] || "00";
    const ampm = pm[4].toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}:${s}`;
  }
  const parts = raw.trim().split(":");
  if (parts.length >= 2) {
    const sec = (parts[2] || "00").replace(/\D/g, "") || "00";
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:${sec.padStart(2, "0")}`;
  }
  return "00:00:00";
}

/**
 * Converts a naive (no timezone) datetime string to a UTC Date object,
 * interpreting it as local time in the given IANA timezone.
 *
 * Handles DST transitions correctly via a two-pass offset check.
 *
 * Accepted formats:
 *   "2026-02-27T14:30:00"
 *   "2026-02-27 14:30:00"
 *   "2026-02-27"            (time defaults to 00:00:00)
 *
 * If the string already has a TZ suffix, it is parsed directly (no offset applied).
 */
export function naiveToUtc(naiveDateStr: string, timezone: string): Date {
  // If already has timezone info, just parse directly
  if (hasTzSuffix(naiveDateStr)) {
    return new Date(naiveDateStr);
  }

  const { year, month, day, hour, minute, second } = parseComponents(naiveDateStr);

  // First guess: treat the components as if they were UTC
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  // Find the offset that the target timezone has at this "guess" moment
  const offsetMs1 = getTimezoneOffsetMs(guess, timezone);

  // The naive time IS local time, so:  UTC = naive-as-UTC − offset
  const corrected = new Date(guess.getTime() - offsetMs1);

  // DST edge case: the offset at the corrected time might differ
  // (e.g. the guess was in DST but the corrected time is in standard, or vice versa)
  const offsetMs2 = getTimezoneOffsetMs(corrected, timezone);
  if (offsetMs1 !== offsetMs2) {
    return new Date(guess.getTime() - offsetMs2);
  }

  return corrected;
}

/**
 * Formats a UTC Date (or ISO string) in the fleet timezone for display.
 * Uses Intl.DateTimeFormat under the hood.
 */
export function formatInFleetTimezone(
  utcDate: Date | string,
  timezone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  if (isNaN(date.getTime())) return String(utcDate);

  const defaults: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  };

  return new Intl.DateTimeFormat("en-US", {
    ...defaults,
    ...options,
    timeZone: timezone,
  }).format(date);
}

/**
 * Calendar day (yyyy-MM-dd) for period/date-range filters.
 * Bare/naive dates keep their written day; Z/offset timestamps convert in fleet tz
 * (so 2026-01-05T00:06Z → 2026-01-04 in America/Jamaica — matches period weeks).
 */
export function fleetCalendarDay(dateStr: string, timezone: string): string {
  const s = String(dateStr || "");
  if (!s) return "";
  if (!hasTzSuffix(s)) return s.slice(0, 10);
  const instant = new Date(s);
  if (isNaN(instant.getTime())) return s.slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return y && m && d ? `${y}-${m}-${d}` : s.slice(0, 10);
  } catch {
    return s.slice(0, 10);
  }
}

// ─── Internal helpers ────────────────────────────────────────────────

/**
 * Parses a naive datetime string into numeric components.
 */
function parseComponents(s: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  // Split on T or space to separate date and time
  const separator = s.includes("T") ? "T" : " ";
  const parts = s.split(separator);
  const datePart = parts[0];
  const timePart = parts[1] || "00:00:00";

  const [y, m, d] = datePart.split("-").map(Number);
  const timePieces = timePart.replace(/[Zz].*$/, "").split(":");
  const h = Number(timePieces[0]) || 0;
  const min = Number(timePieces[1]) || 0;
  const sec = Math.floor(Number(timePieces[2]) || 0);

  return { year: y, month: m, day: d, hour: h, minute: min, second: sec };
}

/**
 * Returns the offset in milliseconds between UTC and the given timezone
 * at a specific instant.
 *
 * offset = (local-time-as-if-UTC) − (actual-UTC)
 *
 * For America/Jamaica (UTC−5): offset = −5 * 3600000 = −18000000
 * For America/New_York in summer (EDT, UTC−4): offset = −4 * 3600000
 */
function getTimezoneOffsetMs(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string): number => {
    const val = parts.find((p) => p.type === type)?.value || "0";
    return parseInt(val, 10);
  };

  let hour = get("hour");
  // Intl can return hour=24 for midnight in some locales
  if (hour === 24) hour = 0;

  const localAsUtcMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );

  return localAsUtcMs - date.getTime();
}