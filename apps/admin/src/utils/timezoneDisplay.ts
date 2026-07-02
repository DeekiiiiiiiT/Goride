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
    const date = typeof utcDateStr === 'string' ? new Date(utcDateStr) : utcDateStr;
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
 * This is the day the row is *displayed* under (it uses the same `new Date()`
 * parsing as {@link formatInFleetTz}), so grouping by this key guarantees a row
 * always lands in a week whose label contains its own displayed date.
 */
export function fleetTzDateKey(input: string | Date, timezone: string): string {
  const date = typeof input === 'string' ? new Date(input) : input;
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
