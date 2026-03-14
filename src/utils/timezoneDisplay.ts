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
