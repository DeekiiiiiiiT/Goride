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

// ─── Constants ───────────────────────────────────────────────────────
const DEFAULT_TIMEZONE = "America/Jamaica";
const CACHE_TTL_MS = 60_000; // 1 minute

// ─── Cache ───────────────────────────────────────────────────────────
let cachedTimezone: string | null = null;
let cacheExpiry = 0;

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Reads the fleet timezone from KV with a 1-minute cache.
 * Returns an IANA timezone string (e.g. "America/Jamaica").
 */
export async function getFleetTimezone(): Promise<string> {
  const now = Date.now();
  if (cachedTimezone && now < cacheExpiry) {
    return cachedTimezone;
  }

  try {
    // KV stores the settings object directly at "platform:settings"
    // (see PUT /admin/platform-settings in index.tsx)
    const record = await kv.get("platform:settings") as Record<string, any> | null;
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