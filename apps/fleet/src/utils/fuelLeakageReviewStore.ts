/**
 * Interim durable leakage review (H8) until fuel_reconciliation_period table ships.
 * Keyed by org-agnostic week Monday YMD in localStorage (fleet browser session).
 */
const PREFIX = 'fuel.leakageReviewed.';

export type FuelLeakageReviewRecord = {
  weekStart: string;
  reviewedAt: string;
  note?: string;
  actorLabel?: string;
};

export function loadFuelLeakageReview(weekStartYmd: string): FuelLeakageReviewRecord | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${weekStartYmd}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FuelLeakageReviewRecord;
    if (!parsed?.reviewedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveFuelLeakageReview(
  weekStartYmd: string,
  opts?: { note?: string; actorLabel?: string },
): FuelLeakageReviewRecord {
  const record: FuelLeakageReviewRecord = {
    weekStart: weekStartYmd,
    reviewedAt: new Date().toISOString(),
    note: opts?.note,
    actorLabel: opts?.actorLabel,
  };
  try {
    localStorage.setItem(`${PREFIX}${weekStartYmd}`, JSON.stringify(record));
  } catch {
    /* ignore quota */
  }
  return record;
}

export function clearFuelLeakageReview(weekStartYmd: string): void {
  try {
    localStorage.removeItem(`${PREFIX}${weekStartYmd}`);
  } catch {
    /* ignore */
  }
}
