/**
 * Single fleet-loss netting for Business Finance P&L and Toll Reconciliation
 * "Net Toll Loss". Plaza/tag charges are cost; unmatched Uber trip charges are
 * reimbursement coverage (same identity as Spend vs Reimbursed cards).
 */

export type TollLedgerLikeEvent = Record<string, unknown>;

export type TollFleetLossNetting = {
  gross: number;
  recovered: number;
  reinstated: number;
  /** Unrecovered fleet toll cost (floored at $0). */
  net: number;
  clipped: boolean;
  /** Unmatched Uber trip tolls counted as reimbursement, not extra spend. */
  provisional: number;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function tollEventDate(e: TollLedgerLikeEvent): string {
  return String(e.date || e.postingAt || e.createdAt || '').slice(0, 10);
}

export function tollEventAmount(e: TollLedgerLikeEvent): number {
  const net = num(e.netAmount);
  if (net !== 0) return Math.abs(net);
  return Math.abs(num(e.grossAmount));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** True when the event participates in fleet Tolls netting. */
export function isTollFleetLossEvent(e: TollLedgerLikeEvent): boolean {
  const t = String(e.eventType || '');
  return (
    t === 'toll_charge' ||
    t === 'toll_refund' ||
    t === 'toll_charge_offset' ||
    t === 'toll_reimbursement'
  );
}

/** Uber trip toll credit — legacy trip-sourced toll_charge or explicit reimbursement. */
export function isUberTollReimbursement(e: TollLedgerLikeEvent): boolean {
  const t = String(e.eventType || '');
  if (t === 'toll_reimbursement') return true;
  return t === 'toll_charge' && String(e.sourceType || '') === 'trip';
}

export function isTripSourcedTollCharge(e: TollLedgerLikeEvent): boolean {
  return isUberTollReimbursement(e);
}

/**
 * Net toll figures from raw canonical events.
 *
 * Canonical posts TWO `toll_charge` outflows for one Uber crossing:
 *  - plaza/tag (`sourceType` transaction / toll_ledger) — real fleet spend
 *  - trip (`sourceType` trip) — Uber reimbursed it on the fare
 * Summing both as cost doubled Net Toll Loss (spend $X + reimbursed $X = $2X).
 *
 * Unmatched trip charges are platform coverage (same as the Reimbursed card),
 * not a second bill. Trip charges that already have a `toll_charge_offset`
 * (cash_wash / phantom / expense_logged) stay on the books with that offset
 * so a washed trip cannot wipe a real tag debit.
 *
 * Also subtract:
 *  - `toll_refund` — the toll operator literally refunded it
 *  - `toll_charge_offset` (inflow) — personal / cash_wash / phantom / expense_logged
 * and add back:
 *  - `toll_charge_offset` (outflow) — prior offset reinstated
 * `toll_charged_to_driver` / `toll_charge_reversed` are deliberately NOT
 * netted here (wallet path, not fleet cost).
 */
export function computeTollFleetLossNetting(scoped: TollLedgerLikeEvent[]): TollFleetLossNetting {
  let plazaCharges = 0;
  let washedTripCharges = 0;
  let recovered = 0;
  let reinstated = 0;
  const offsetSourceIds = new Set<string>();
  const tripCharges: Array<{ sourceId: string; amt: number }> = [];

  for (const e of scoped) {
    if (String(e.eventType || '') !== 'toll_charge_offset') continue;
    if (String(e.direction || '') === 'inflow') {
      offsetSourceIds.add(String(e.sourceId || ''));
    }
  }

  for (const e of scoped) {
    const t = String(e.eventType || '');
    const amt = tollEventAmount(e);
    if (t === 'toll_charge' || t === 'toll_reimbursement') {
      if (isUberTollReimbursement(e)) {
        tripCharges.push({ sourceId: String(e.sourceId || ''), amt });
      } else if (t === 'toll_charge') {
        plazaCharges += amt;
      }
    } else if (t === 'toll_refund') {
      recovered += amt;
    } else if (t === 'toll_charge_offset') {
      const dir = String(e.direction || '');
      if (dir === 'inflow') {
        recovered += amt;
      } else if (dir === 'outflow') {
        reinstated += amt;
      }
    }
  }

  let platformCoverage = 0;
  for (const tc of tripCharges) {
    if (offsetSourceIds.has(tc.sourceId)) {
      washedTripCharges += tc.amt;
    } else {
      platformCoverage += tc.amt;
    }
  }
  recovered += platformCoverage;

  const gross = plazaCharges + washedTripCharges;
  const rawNet = gross - recovered + reinstated;
  const net = round2(Math.max(0, rawNet));
  const clipped = rawNet < -0.005;
  const provisional = round2(platformCoverage);

  return {
    gross: round2(gross),
    recovered: round2(recovered),
    reinstated: round2(reinstated),
    net,
    clipped,
    provisional,
  };
}

export function filterTollEventsInDateRange(
  events: TollLedgerLikeEvent[] | undefined | null,
  startYmd: string,
  endYmd: string,
): TollLedgerLikeEvent[] {
  const start = String(startYmd || '').slice(0, 10);
  const end = String(endYmd || '').slice(0, 10);
  return (events || []).filter((e) => {
    if (!isTollFleetLossEvent(e)) return false;
    const d = tollEventDate(e);
    if (!d) return false;
    return d >= start && d <= end;
  });
}

export function computeTollFleetLossForPeriod(
  events: TollLedgerLikeEvent[] | undefined | null,
  startYmd: string,
  endYmd: string,
): TollFleetLossNetting {
  return computeTollFleetLossNetting(filterTollEventsInDateRange(events, startYmd, endYmd));
}

/**
 * Netting for events already scoped to one period (no date filter).
 * Prefer this after pre-bucketing by week so callers avoid O(P×E) re-filters.
 */
export function computeTollFleetLossFromEvents(
  eventsAlreadyInPeriod: TollLedgerLikeEvent[] | undefined | null,
): TollFleetLossNetting {
  const scoped = (eventsAlreadyInPeriod || []).filter(isTollFleetLossEvent);
  return computeTollFleetLossNetting(scoped);
}

/** Memo amount already removed from the Tolls expense line (not a subset of net). */
export function tollRecoveredWashedMemo(netting: TollFleetLossNetting): number | undefined {
  const memo = round2(netting.recovered - netting.reinstated);
  return memo > 0.005 ? memo : undefined;
}

export const TOLL_RECOVERED_MEMO_LABEL =
  'already removed from Tolls (recovered / cash-washed — not a fleet loss)';
