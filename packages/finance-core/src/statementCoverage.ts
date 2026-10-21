/**
 * Declared statement coverage vs the dates that actually appear in a file.
 * Coverage is what the operator says the statement covers. Data span is
 * the first and last transaction date.
 */
import { periodEndForAnchor } from './periodKey.ts';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const MONTH_INDEX: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
  nov: 10, november: 10, dec: 11, december: 11,
};

export function asYmd(value: unknown): string | null {
  const s = String(value ?? '').trim().slice(0, 10);
  return YMD.test(s) ? s : null;
}

export function ymdSpan(dates: Array<string | null | undefined>): { start: string | null; end: string | null } {
  const sorted = dates.map(asYmd).filter((d): d is string => !!d).sort();
  if (sorted.length === 0) return { start: null, end: null };
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

/** "Mon 12 Oct" — fleet calendar day, no comma. */
export function formatCoverDay(ymd: string): string {
  const day = asYmd(ymd);
  if (!day) return '';
  const [y, m, d] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[utc.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

function looseDay(token: string): string | null {
  const trimmed = token.trim();
  if (YMD.test(trimmed.slice(0, 10))) return trimmed.slice(0, 10);
  const match = trimmed.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/i);
  if (!match) return asYmd(token);
  const month = MONTH_INDEX[match[2].toLowerCase()];
  if (month == null) return null;
  const dd = match[1].padStart(2, '0');
  const mm = String(month + 1).padStart(2, '0');
  return asYmd(`${match[3]}-${mm}-${dd}`);
}

/**
 * Statement period printed above the table, if the file has one.
 * Looks at the first lines only. Returns nulls when the file does not say.
 */
export function parseStatementPeriodBanner(text: string): { start: string | null; end: string | null } {
  const head = String(text || '').split(/\r?\n/).slice(0, 25).join('\n');
  const iso = head.match(
    /(?:period|statement|from|cover|between)[^\n]{0,40}?(\d{4}-\d{2}-\d{2})\s*(?:to|through|–|—|-)\s*(\d{4}-\d{2}-\d{2})/i,
  );
  if (iso) {
    const start = asYmd(iso[1]);
    const end = asYmd(iso[2]);
    if (start && end && start <= end) return { start, end };
  }
  const loose = head.match(
    /(?:period|statement|from|cover|between)[^\n]{0,40}?(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})\s*(?:to|through|–|—|-)\s*(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i,
  );
  if (loose) {
    const start = looseDay(loose[1]);
    const end = looseDay(loose[2]);
    if (start && end && start <= end) return { start, end };
  }
  return { start: null, end: null };
}

/**
 * Prefill for "This file covers". A period printed on the file wins.
 * Otherwise the run's Monday–Sunday. Otherwise the transaction span.
 */
export function defaultDeclaredCoverage(input: {
  weekKey?: string | null;
  dataStart?: string | null;
  dataEnd?: string | null;
  filePeriodStart?: string | null;
  filePeriodEnd?: string | null;
}): { coverageStart: string | null; coverageEnd: string | null } {
  const fileStart = asYmd(input.filePeriodStart);
  const fileEnd = asYmd(input.filePeriodEnd);
  if (fileStart && fileEnd && fileStart <= fileEnd) {
    return { coverageStart: fileStart, coverageEnd: fileEnd };
  }
  const week = asYmd(input.weekKey);
  if (week) {
    return { coverageStart: week, coverageEnd: periodEndForAnchor(week) };
  }
  const dataStart = asYmd(input.dataStart);
  const dataEnd = asYmd(input.dataEnd);
  if (dataStart && dataEnd && dataStart <= dataEnd) {
    return { coverageStart: dataStart, coverageEnd: dataEnd };
  }
  return { coverageStart: dataStart, coverageEnd: dataEnd };
}

/**
 * The declared range must include every transaction that will be saved.
 * Empty saved span (nothing new to save) only checks that the range is ordered.
 */
export function coverageGapMessage(input: {
  coverageStart: string | null;
  coverageEnd: string | null;
  dataStart: string | null;
  dataEnd: string | null;
}): string | null {
  const coverageStart = asYmd(input.coverageStart);
  const coverageEnd = asYmd(input.coverageEnd);
  if (!coverageStart || !coverageEnd) return 'Choose the first and last day this file covers.';
  if (coverageStart > coverageEnd) return 'The covered range has to start on or before the day it ends.';
  const dataStart = asYmd(input.dataStart);
  const dataEnd = asYmd(input.dataEnd);
  if (dataStart && coverageStart > dataStart) {
    return `This file has a transaction on ${formatCoverDay(dataStart)}, so coverage can't start later than that.`;
  }
  if (dataEnd && coverageEnd < dataEnd) {
    return `This file has a transaction on ${formatCoverDay(dataEnd)}, so coverage can't end earlier than that.`;
  }
  return null;
}
