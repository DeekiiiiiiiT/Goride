/**
 * Single fleet-loss netting for Business Finance P&L Fuel line.
 * Same formula everywhere — books from canonical ledger events.
 *
 * fuel_reimbursement is deliberately NOT netted here (wallet path).
 */

export type FuelLedgerLikeEvent = Record<string, unknown>;

export type FuelFleetLossNetting = {
  gross: number;
  recovered: number;
  reinstated: number;
  /** Unrecovered fleet fuel cost (floored at $0). */
  net: number;
  clipped: boolean;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function fuelEventDate(e: FuelLedgerLikeEvent): string {
  return String(e.date || e.postingAt || e.createdAt || '').slice(0, 10);
}

export function fuelEventAmount(e: FuelLedgerLikeEvent): number {
  const net = num(e.netAmount);
  if (net !== 0) return Math.abs(net);
  return Math.abs(num(e.grossAmount));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** True when the event participates in fleet Fuel netting. */
export function isFuelFleetLossEvent(e: FuelLedgerLikeEvent): boolean {
  const t = String(e.eventType || '');
  return t === 'fuel_expense' || t === 'fuel_charge_offset';
}

/**
 * Net fuel figures from raw canonical events.
 * - `fuel_expense` — gross fill spend
 * - `fuel_charge_offset` (inflow) — driver-share / Personal washed on Finalize
 * - `fuel_charge_offset` (outflow) — prior offset reinstated on reset
 */
export function computeFuelFleetLossNetting(scoped: FuelLedgerLikeEvent[]): FuelFleetLossNetting {
  let gross = 0;
  let recovered = 0;
  let reinstated = 0;

  for (const e of scoped) {
    const t = String(e.eventType || '');
    const amt = fuelEventAmount(e);
    if (t === 'fuel_expense') {
      gross += amt;
    } else if (t === 'fuel_charge_offset') {
      const dir = String(e.direction || '');
      if (dir === 'inflow') recovered += amt;
      else if (dir === 'outflow') reinstated += amt;
    }
  }

  const rawNet = gross - recovered + reinstated;
  const net = round2(Math.max(0, rawNet));
  const clipped = rawNet < -0.005;

  return {
    gross: round2(gross),
    recovered: round2(recovered),
    reinstated: round2(reinstated),
    net,
    clipped,
  };
}

export function filterFuelEventsInDateRange(
  events: FuelLedgerLikeEvent[] | undefined | null,
  startYmd: string,
  endYmd: string,
): FuelLedgerLikeEvent[] {
  const start = String(startYmd || '').slice(0, 10);
  const end = String(endYmd || '').slice(0, 10);
  return (events || []).filter((e) => {
    if (!isFuelFleetLossEvent(e)) return false;
    const d = fuelEventDate(e);
    if (!d) return false;
    return d >= start && d <= end;
  });
}

export function computeFuelFleetLossForPeriod(
  events: FuelLedgerLikeEvent[] | undefined | null,
  startYmd: string,
  endYmd: string,
): FuelFleetLossNetting {
  return computeFuelFleetLossNetting(filterFuelEventsInDateRange(events, startYmd, endYmd));
}

/** Memo amount already removed from the Fuel expense line. */
export function fuelRecoveredWashedMemo(netting: FuelFleetLossNetting): number | undefined {
  const memo = round2(netting.recovered - netting.reinstated);
  return memo > 0.005 ? memo : undefined;
}

export const FUEL_RECOVERED_MEMO_LABEL =
  'already removed from Fuel (charged to drivers — not a fleet loss)';
