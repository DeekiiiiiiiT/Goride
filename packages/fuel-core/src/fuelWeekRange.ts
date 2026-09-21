/**
 * Pure YMD week/range helpers for fuel recon (no React / timezone UI).
 */

/** Calendar day YYYY-MM-DD from entry/adjustment date strings or Date objects. */
export function toEntryYmd(date: string | Date | undefined | null): string {
  if (date == null) return '';
  if (typeof date === 'string') {
    return date.split('T')[0]?.split(' ')[0] || '';
  }
  if (date instanceof Date && !isNaN(date.getTime())) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

/** Inclusive week/range check using calendar YMD (safe for ISO timestamps). */
export function isEntryInInclusiveYmdRange(
  entryDate: string | Date | undefined | null,
  startYmd: string,
  endYmd: string,
): boolean {
  if (!startYmd || !endYmd) return true;
  const d = toEntryYmd(entryDate);
  if (!d) return false;
  return d >= startYmd && d <= endYmd;
}

/**
 * Half-open [startYmd, endYmd) — buckets partition without double-counting boundary days.
 * Closing-day floating events belong to the next bucket (closing fill joins separately).
 */
export function isEntryInHalfOpenYmdRange(
  entryDate: string | Date | undefined | null,
  startYmd: string,
  endYmd: string,
): boolean {
  if (!startYmd || !endYmd) return true;
  const d = toEntryYmd(entryDate);
  if (!d) return false;
  return d >= startYmd && d < endYmd;
}

/** Filter any dated items into an inclusive fuel week using calendar YMD. */
export function entriesInFuelWeek<T extends { date?: string | null }>(
  items: T[],
  startYmd: string,
  endYmd: string,
): T[] {
  return items.filter((item) => isEntryInInclusiveYmdRange(item.date, startYmd, endYmd));
}

/**
 * Stop-to-stop week membership: bucket belongs to the week of its closing fill (endDate).
 * Closable gate + Fix sheet + week report stamp must all use this set.
 */
export function bucketClosesInFuelWeek(
  bucket: { endDate?: string | null },
  weekStartYmd: string,
  weekEndYmd: string,
): boolean {
  return isEntryInInclusiveYmdRange(bucket.endDate, weekStartYmd, weekEndYmd);
}

export function selectOdometerBucketsClosingInWeek<T extends { endDate?: string | null }>(
  buckets: T[] | null | undefined,
  weekStartYmd: string,
  weekEndYmd: string,
): T[] {
  if (!buckets?.length) return [];
  return buckets.filter((b) => bucketClosesInFuelWeek(b, weekStartYmd, weekEndYmd));
}
