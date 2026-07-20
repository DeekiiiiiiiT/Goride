/**
 * Single fleet-loss netting for Business Finance P&L and Toll Reconciliation
 * "Net Toll Loss". Same formula everywhere — books definition from canonical
 * ledger events (not tag-spend − reimbursed operational cards).
 */

export type TollLedgerLikeEvent = Record<string, unknown>;

export type TollFleetLossNetting = {
  gross: number;
  recovered: number;
  reinstated: number;
  /** Unrecovered fleet toll cost (floored at $0). */
  net: number;
  clipped: boolean;
  /** Trip-level toll_charge amounts with no matching offset in scope. */
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
  return t === 'toll_charge' || t === 'toll_refund' || t === 'toll_charge_offset';
}

/**
 * Net toll figures from raw canonical events. A `toll_charge` only represents
 * a real, unrecovered business loss once you subtract:
 *  - `toll_refund` — the toll operator literally refunded it
 *  - `toll_charge_offset` (inflow) — cash_wash / phantom / expense_logged /
 *    personal (not a fleet loss)
 * and add back:
 *  - `toll_charge_offset` (outflow) — prior offset reinstated
 * `toll_charged_to_driver` / `toll_charge_reversed` are deliberately NOT
 * netted here (wallet path, not fleet cost).
 */
export function computeTollFleetLossNetting(scoped: TollLedgerLikeEvent[]): TollFleetLossNetting {
  let gross = 0;
  let recovered = 0;
  let reinstated = 0;
  const offsetSourceIds = new Set<string>();
  const tripCharges: Array<{ sourceId: string; amt: number }> = [];

  for (const e of scoped) {
    const t = String(e.eventType || '');
    const amt = tollEventAmount(e);
    if (t === 'toll_charge') {
      gross += amt;
      if (String(e.sourceType || '') === 'trip') {
        tripCharges.push({ sourceId: String(e.sourceId || ''), amt });
      }
    } else if (t === 'toll_refund') {
      recovered += amt;
    } else if (t === 'toll_charge_offset') {
      const dir = String(e.direction || '');
      if (dir === 'inflow') {
        recovered += amt;
        offsetSourceIds.add(String(e.sourceId || ''));
      } else if (dir === 'outflow') {
        reinstated += amt;
      }
    }
  }

  const rawNet = gross - recovered + reinstated;
  const net = round2(Math.max(0, rawNet));
  const clipped = rawNet < -0.005;
  const provisional = round2(
    tripCharges.reduce((s, tc) => (offsetSourceIds.has(tc.sourceId) ? s : s + tc.amt), 0),
  );

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

/** Memo amount already removed from the Tolls expense line (not a subset of net). */
export function tollRecoveredWashedMemo(netting: TollFleetLossNetting): number | undefined {
  const memo = round2(netting.recovered - netting.reinstated);
  return memo > 0.005 ? memo : undefined;
}

export const TOLL_RECOVERED_MEMO_LABEL =
  'already removed from Tolls (recovered / cash-washed — not a fleet loss)';
