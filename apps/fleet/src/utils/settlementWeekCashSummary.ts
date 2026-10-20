/**
 * Aggregate passenger / returned / still-held by Settlement Week for the Cash logged tab.
 */
export type WeekCashSummary = {
  passenger: number;
  returned: number;
  stillHeld: number;
};

export type WeekCashSourceRow = {
  driverId?: string | null;
  periodAnchor?: string | null;
  cashCollected?: number | null;
  cashReturned?: number | null;
  cashStillHeld?: number | null;
};

function ymd(v: unknown): string {
  return String(v || '').slice(0, 10);
}

/** Merge period rows (collect + reconciled queues) into per-week cash picture. */
export function buildWeekCashSummaryByAnchor(
  rows: WeekCashSourceRow[],
): Record<string, WeekCashSummary> {
  // Dedupe by driver+week so a collect∪reconciled union never double-counts.
  const byDriverWeek = new Map<string, WeekCashSourceRow>();
  for (const r of rows) {
    const anchor = ymd(r.periodAnchor);
    if (!anchor) continue;
    const driver = String(r.driverId || '_');
    const key = `${driver}|${anchor}`;
    const prev = byDriverWeek.get(key);
    const nextReturned = Math.max(0, Number(r.cashReturned) || 0);
    const prevReturned = Math.max(0, Number(prev?.cashReturned) || 0);
    if (!prev || nextReturned >= prevReturned) {
      byDriverWeek.set(key, r);
    }
  }

  const out: Record<string, WeekCashSummary> = {};
  for (const r of byDriverWeek.values()) {
    const key = ymd(r.periodAnchor);
    if (!key) continue;
    const returned = Math.max(0, Number(r.cashReturned) || 0);
    const held = Math.max(0, Number(r.cashStillHeld) || 0);
    const collected = Math.max(0, Number(r.cashCollected) || 0);
    // Prefer stated passenger cash; else reconstruct from returned + held.
    const passenger =
      collected > 0.005 ? collected : Math.max(returned + held, held, returned);
    const cur = out[key] || { passenger: 0, returned: 0, stillHeld: 0 };
    cur.passenger += passenger;
    cur.returned += returned;
    cur.stillHeld += held;
    out[key] = cur;
  }
  // If returned was missing on API rows but passenger/held are present, derive it.
  for (const key of Object.keys(out)) {
    const s = out[key];
    if (s.returned <= 0.005 && s.passenger > s.stillHeld + 0.005) {
      s.returned = Math.round((s.passenger - s.stillHeld) * 100) / 100;
    }
  }
  return out;
}

/**
 * Ensure Cash logged movement totals are reflected in Returned when period
 * fields are stale or omitted by the queue.
 */
export function applyLoggedReceiptsToWeekCash(
  base: Record<string, WeekCashSummary>,
  loggedByAnchor: Record<string, number>,
): Record<string, WeekCashSummary> {
  const out: Record<string, WeekCashSummary> = { ...base };
  for (const [anchor, logged] of Object.entries(loggedByAnchor)) {
    const amt = Math.max(0, Number(logged) || 0);
    if (amt <= 0.005) continue;
    const cur = out[anchor] || { passenger: 0, returned: 0, stillHeld: 0 };
    out[anchor] = {
      ...cur,
      returned: Math.max(cur.returned, amt),
    };
  }
  return out;
}
