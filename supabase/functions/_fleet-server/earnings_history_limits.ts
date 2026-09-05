/**
 * Earnings History load guardrails (Phase 1+).
 * Caps, defaults, and envelope helpers so we never auto-scan full lifetime.
 */

export const EARNINGS_HISTORY_DEFAULT_LIMIT = 500;
export const EARNINGS_HISTORY_DEFAULT_DAYS_DAILY = 180;
export const EARNINGS_HISTORY_DEFAULT_YEARS_WEEKLY = 5;
export const EARNINGS_HISTORY_DEFAULT_YEARS_MONTHLY = 10;

export type EarningsHistoryMode = 'ledger' | 'periods';

export function parseHistoryRangeParams(params: {
  startDate?: string | null;
  endDate?: string | null;
  /** When true, default to last 7 days instead of full lifetime. */
  defaultWhenMissing?: boolean;
}): {
  startDate: string;
  endDate: string;
  scopedByRange: boolean;
} {
  const now = new Date();
  let startDate: string;
  let endDate: string;

  if (params.startDate && params.endDate) {
    startDate = String(params.startDate).slice(0, 10);
    endDate = String(params.endDate).slice(0, 10);
  } else if (params.defaultWhenMissing) {
    // Last 7 calendar days (UTC-ish local for admin tooling)
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 6);
    startDate = from.toISOString().slice(0, 10);
    endDate = now.toISOString().slice(0, 10);
  } else {
    // Caller must supply range — empty response
    return { startDate: '', endDate: '', scopedByRange: false };
  }

  if (startDate > endDate) {
    const tmp = startDate;
    startDate = endDate;
    endDate = tmp;
  }
  return { startDate, endDate, scopedByRange: true };
}

export function clampHistoryRange(
  startDate: string,
  endDate: string,
  periodType: 'daily' | 'weekly' | 'monthly',
): { startDate: string; endDate: string; maxRows: number } {
  const now = new Date();
  const ymdToday = now.toISOString().slice(0, 10);
  let end = endDate > ymdToday ? ymdToday : endDate;
  let start = startDate;
  let maxRows = EARNINGS_HISTORY_DEFAULT_LIMIT;

  const dayDiff = Math.floor(
    (new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) /
      86400000,
  ) + 1;

  if (periodType === 'daily') {
    if (dayDiff > EARNINGS_HISTORY_DEFAULT_DAYS_DAILY) {
      const d = new Date(end + 'T12:00:00');
      d.setUTCDate(d.getUTCDate() - (EARNINGS_HISTORY_DEFAULT_DAYS_DAILY - 1));
      start = d.toISOString().slice(0, 10);
      maxRows = EARNINGS_HISTORY_DEFAULT_DAYS_DAILY;
    }
  } else if (periodType === 'weekly') {
    // ~5 years of weeks ≈ 260 weeks; hard-cap rows at DEFAULT_LIMIT
    if (dayDiff > EARNINGS_HISTORY_DEFAULT_YEARS_WEEKLY * 365) {
      const d = new Date(end + 'T12:00:00');
      d.setUTCDate(d.getUTCDate() - EARNINGS_HISTORY_DEFAULT_YEARS_WEEKLY * 365);
      start = d.toISOString().slice(0, 10);
      maxRows = EARNINGS_HISTORY_DEFAULT_LIMIT;
    }
  } else {
    if (dayDiff > EARNINGS_HISTORY_DEFAULT_YEARS_MONTHLY * 365) {
      const d = new Date(end + 'T12:00:00');
      d.setUTCDate(d.getUTCDate() - EARNINGS_HISTORY_DEFAULT_YEARS_MONTHLY * 365);
      start = d.toISOString().slice(0, 10);
      maxRows = EARNINGS_HISTORY_DEFAULT_LIMIT;
    }
  }

  return { startDate: start, endDate: end, maxRows };
}

export function emptyEarningsHistoryEnvelope(durationMs: number) {
  return {
    success: true as const,
    data: [] as any[],
    durationMs,
    readModel: 'canonical' as const,
    hasMore: false,
    nextCursor: null as string | null,
    truncated: false,
  };
}
