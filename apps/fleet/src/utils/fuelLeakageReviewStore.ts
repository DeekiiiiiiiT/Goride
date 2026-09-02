/**
 * Interim device-local leakage review until server period row owns H8.
 * Keyed by week Monday YMD in localStorage (not org-scoped; not cross-device).
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

/** All week starts marked reviewed on this device — for pure derive input. */
export function listFuelLeakageReviewedWeeks(): Set<string> {
  const out = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const week = key.slice(PREFIX.length);
      if (week && loadFuelLeakageReview(week)) out.add(week);
    }
  } catch {
    /* ignore */
  }
  return out;
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
