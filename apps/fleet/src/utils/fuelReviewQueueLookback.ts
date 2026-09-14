/** Shared lookback for Review Queue badge + queue page (R6). */

export const FUEL_REVIEW_QUEUE_LOOKBACK_DAYS = 180;

/** Shared paging ceiling so badge and queue cannot drift (R10). */
export const FUEL_REVIEW_QUEUE_TX_PAGE_SIZE = 1500;
export const FUEL_REVIEW_QUEUE_TX_MAX_PAGES = 40;

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Inclusive YYYY-MM-DD range used by nav badge and Review Queue transaction load. */
export function fuelReviewQueueLookbackRange(
  days: number = FUEL_REVIEW_QUEUE_LOOKBACK_DAYS,
): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { startDate: ymdLocal(start), endDate: ymdLocal(end) };
}
