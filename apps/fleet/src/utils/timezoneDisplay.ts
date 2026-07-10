/**
 * Browser-side fleet timezone display utilities.
 * Mirrors the server-side formatInFleetTimezone() from timezone_helper.tsx.
 *
 * Usage:
 *   const tz = useFleetTimezone();
 *   const label = formatInFleetTz(someIsoString, tz);
 *   const dateOnly = formatInFleetTz(someIsoString, tz, { month: 'short', day: 'numeric', year: 'numeric' });
 */

import { useState, useEffect } from 'react';
import { fetchFleetTimezone } from '../services/api';
import { hasTzSuffix, resolveFleetInstantBrowser } from '../services/import-validator';

// ── formatInFleetTz ──────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
};

/**
 * Formats a UTC date string (or Date object) for display in the given timezone.
 *
 * @param utcDateStr  An ISO-8601 string or Date object (assumed UTC).
 * @param timezone    IANA timezone identifier (e.g. 'America/Jamaica').
 * @param options     Optional Intl.DateTimeFormatOptions override.
 * @returns           A human-readable date/time string in the fleet timezone.
 */
export function formatInFleetTz(
  utcDateStr: string | Date,
  timezone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  try {
    const date = typeof utcDateStr === 'string' && hasTzSuffix(utcDateStr)
      ? resolveFleetInstantBrowser(utcDateStr, timezone)
      : (typeof utcDateStr === 'string' ? new Date(utcDateStr) : utcDateStr);
    if (isNaN(date.getTime())) return String(utcDateStr);
    return new Intl.DateTimeFormat('en-US', {
      ...(options ?? DEFAULT_OPTIONS),
      timeZone: timezone,
    }).format(date);
  } catch {
    return String(utcDateStr);
  }
}

/**
 * Returns the calendar day (yyyy-MM-dd) of a date in the fleet timezone.
 *
 * Bare `yyyy-MM-dd` strings are treated as fleet calendar days (no UTC midnight
 * shift). Timestamps with a zone suffix are converted into the fleet timezone.
 */
export function fleetTzDateKey(input: string | Date, timezone: string): string {
  // Date-only ledger/claim anchors must not go through `new Date('yyyy-MM-dd')`
  // (UTC midnight → previous calendar day in US timezones).
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }
  const date = typeof input === 'string'
    ? (hasTzSuffix(input) ? resolveFleetInstantBrowser(input, timezone) : new Date(input))
    : input;
  if (isNaN(date.getTime())) {
    return typeof input === 'string' ? input.slice(0, 10) : '';
  }
  try {
    // en-CA formats as yyyy-MM-dd.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    return y && m && d ? `${y}-${m}-${d}` : '';
  } catch {
    return typeof input === 'string' ? input.slice(0, 10) : '';
  }
}

/** yyyy-MM-dd → local calendar Date (avoids parseISO UTC-midnight shifting the day). */
export function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

/** Date-only or naive datetime stored without a TZ suffix (toll ledger `date` field). */
export function isNaiveStoredDate(s: string): boolean {
  if (!s) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) return true;
  return false;
}

/**
 * Display a stored date the same way period filters group it.
 * Date-only / naive values keep their calendar day; UTC timestamps convert in fleet tz.
 */
export function formatStoredDateInFleetTz(
  dateStr: string | null | undefined,
  timezone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!dateStr) return '';
  const s = String(dateStr);
  if (isNaiveStoredDate(s)) {
    const ymd = s.slice(0, 10);
    const local = ymdToLocalDate(ymd);
    if (!isNaN(local.getTime())) {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...options,
      }).format(local);
    }
  }
  return formatInFleetTz(dateStr, timezone, options);
}

// ── useFleetTimezone hook ────────────────────────────────────────────────────

/** Module-level cache so repeated hook calls don't each fire a network request. */
let cachedTimezone: string | null = null;
let fetchPromise: Promise<string> | null = null;

/**
 * React hook that returns the fleet timezone string.
 * Defaults to 'America/Jamaica' until the server responds.
 * Uses a module-level cache — only one fetch per page load.
 */
export function useFleetTimezone(): string {
  const [tz, setTz] = useState<string>(cachedTimezone || 'America/Jamaica');

  useEffect(() => {
    if (cachedTimezone) {
      setTz(cachedTimezone);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = fetchFleetTimezone().then((result) => {
        cachedTimezone = result;
        return result;
      });
    }

    fetchPromise.then((result) => {
      setTz(result);
    });
  }, []);

  return tz;
}
