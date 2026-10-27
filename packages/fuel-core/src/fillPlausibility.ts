/**
 * Per-fill plausibility. Hard failures cannot be saved.
 * Soft failures can be saved only with an explicit confirm, and they
 * block week close until accepted.
 */

import { countsInFuelLogSpend } from './fuelOpsEligibility.ts';
import type { FuelEntry } from './fuelTypes.ts';

export const PRICE_BAND_PCT = 15;
/** Same jump the driver and fleet scanners already flag. */
export const ODOMETER_JUMP_KM = 1500;

export type FillPlausibilityInput = {
  id?: string;
  amount: number;
  liters: number;
  odometer?: number | null;
  /** Latest odometer already on the vehicle, if known. */
  previousOdometer?: number | null;
  tankCapacityLiters?: number | null;
  /** Other fills' prices (amount/liters) used as the week median. */
  peerPrices?: number[];
  /** Another fill already uses this odometer. */
  duplicateOdometer?: boolean;
  confirmed?: boolean;
};

export type FillPlausibilityIssue = {
  code:
    | 'zero_liters_with_amount'
    | 'odometer_backwards'
    | 'odometer_jump'
    | 'over_tank'
    | 'price_off_median'
    | 'duplicate_odometer'
    | 'tank_unknown';
  severity: 'block' | 'confirm' | 'warn';
  message: string;
};

function median(values: number[]): number | null {
  const xs = values.filter((n) => n > 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function assessFillPlausibility(input: FillPlausibilityInput): FillPlausibilityIssue[] {
  const issues: FillPlausibilityIssue[] = [];
  const amount = Number(input.amount) || 0;
  const liters = Number(input.liters) || 0;
  const odo = Number(input.odometer) || 0;
  const prev = Number(input.previousOdometer) || 0;
  const tank = Number(input.tankCapacityLiters) || 0;

  if (amount > 0 && !(liters > 0)) {
    issues.push({
      code: 'zero_liters_with_amount',
      severity: 'block',
      message: 'This fill has money but no litres.',
    });
  }
  if (odo > 0 && prev > 0 && odo < prev) {
    issues.push({
      code: 'odometer_backwards',
      severity: 'block',
      message: 'Odometer is lower than the previous reading.',
    });
  } else if (odo > 0 && prev > 0 && odo - prev > ODOMETER_JUMP_KM) {
    issues.push({
      code: 'odometer_jump',
      severity: 'confirm',
      message: `Odometer jumped more than ${ODOMETER_JUMP_KM} km since the last reading.`,
    });
  }
  if (tank > 0 && liters > tank) {
    issues.push({
      code: 'over_tank',
      severity: 'block',
      message: `Litres are above the ${tank} L tank.`,
    });
  } else if (!(tank > 0) && liters > 0) {
    issues.push({
      code: 'tank_unknown',
      severity: 'warn',
      message: 'Tank size is not set, so litres were not checked against the tank.',
    });
  }
  if (liters > 0 && amount > 0) {
    const price = amount / liters;
    const mid = median(input.peerPrices || []);
    if (mid && mid > 0 && Math.abs(price - mid) / mid > PRICE_BAND_PCT / 100) {
      issues.push({
        code: 'price_off_median',
        severity: 'confirm',
        message: `Price is more than ${PRICE_BAND_PCT}% off the week’s typical price.`,
      });
    }
  }
  if (input.duplicateOdometer) {
    issues.push({
      code: 'duplicate_odometer',
      severity: 'confirm',
      message: 'Another fill already uses this odometer.',
    });
  }
  if (input.confirmed) {
    return issues.filter((i) => i.severity === 'block' || i.severity === 'warn');
  }
  return issues;
}

export function fillPlausibilityBlocksSave(issues: FillPlausibilityIssue[]): boolean {
  return issues.some((i) => i.severity === 'block' || i.severity === 'confirm');
}

type WeekFill = {
  id?: string;
  vehicleId?: string;
  date?: string | null;
  amount?: number;
  liters?: number;
  odometer?: number | null;
  type?: FuelEntry['type'];
  entryMode?: FuelEntry['entryMode'];
  paymentSource?: FuelEntry['paymentSource'];
  metadata?: {
    plausibilityAccepted?: boolean;
    jaaRowKind?: string;
    awaitingCardStatement?: boolean;
    awaitingCashStatement?: boolean;
    countsInFuelSpend?: boolean;
    fillGroupId?: string;
    jaaReceiptNumber?: string;
    splitPumpTotal?: number | string;
    splitPumpLiters?: number | string;
    [key: string]: unknown;
  } | null;
};

export type UnreviewedImplausibleFill = {
  date: string;
  amount: number;
  liters: number;
  odometer: number | null;
  reasons: string[];
  ids: string[];
};

type FillStop = {
  ids: string[];
  date: string;
  amount: number;
  liters: number;
  odometer: number | null;
  accepted: boolean;
};

function fillDay(entry: WeekFill): string {
  return String(entry.date || '').slice(0, 10);
}

function metaStr(meta: WeekFill['metadata'], key: string): string {
  const v = meta?.[key];
  return typeof v === 'string' && v.length > 0 ? v : '';
}

function weekFillCountsInSpend(entry: WeekFill): boolean {
  return countsInFuelLogSpend({
    id: String(entry.id || ''),
    date: String(entry.date || ''),
    amount: Number(entry.amount) || 0,
    liters: entry.liters,
    vehicleId: entry.vehicleId,
    type: entry.type || 'Card_Transaction',
    entryMode: entry.entryMode || 'Floating',
    paymentSource: entry.paymentSource || 'Gas_Card',
    metadata: entry.metadata ?? undefined,
  });
}

/** Collapse ledger rows into one stop per fillGroupId, else per receipt. */
export function collapseWeekFillsToStops(entries: WeekFill[]): FillStop[] {
  const groups = new Map<string, WeekFill[]>();
  const order: string[] = [];
  for (const entry of entries) {
    const gid = metaStr(entry.metadata, 'fillGroupId');
    const receipt = metaStr(entry.metadata, 'jaaReceiptNumber');
    const key = gid
      ? `g:${gid}`
      : receipt
        ? `r:${receipt}`
        : `id:${String(entry.id || `${fillDay(entry)}:${entry.odometer}:${entry.amount}`)}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(entry);
  }

  return order.map((key) => {
    const members = groups.get(key) || [];
    const accepted = members.some((m) => Boolean(m.metadata?.plausibilityAccepted));
    const days = members.map(fillDay).filter(Boolean).sort();
    const date = days[0] || '';
    let amount = 0;
    let liters = 0;
    let pumpTotal = 0;
    let pumpLiters = 0;
    for (const m of members) {
      const pt = Number(m.metadata?.splitPumpTotal) || 0;
      const pl = Number(m.metadata?.splitPumpLiters) || 0;
      if (pt > pumpTotal) pumpTotal = pt;
      if (pl > pumpLiters) pumpLiters = pl;
    }
    if (pumpTotal > 0) {
      amount = pumpTotal;
      liters = pumpLiters;
    } else {
      // Card + driver-log of the same receipt: use one row, never sum.
      const withBoth = members.find(
        (m) => (Number(m.amount) || 0) > 0 && (Number(m.liters) || 0) > 0,
      );
      const withAmount = members.find((m) => (Number(m.amount) || 0) > 0);
      const pick = withBoth || withAmount || members[0];
      amount = Number(pick?.amount) || 0;
      liters = Number(pick?.liters) || 0;
    }
    let odometer: number | null = null;
    for (const m of members) {
      const odo = Number(m.odometer) || 0;
      if (odo > 0) {
        odometer = odo;
        break;
      }
    }
    return {
      ids: members.map((m) => String(m.id || '')).filter(Boolean),
      date,
      amount,
      liters,
      odometer,
      accepted,
    };
  });
}

/** Flagged stops that still need a week-level accept. */
export function listUnreviewedImplausibleFills(
  entries: WeekFill[],
): UnreviewedImplausibleFill[] {
  const byVehicle = new Map<string, WeekFill[]>();
  for (const entry of entries) {
    const id = String(entry.vehicleId || '');
    const list = byVehicle.get(id) || [];
    list.push(entry);
    byVehicle.set(id, list);
  }
  const out: UnreviewedImplausibleFill[] = [];
  for (const list of byVehicle.values()) {
    const spendList = list.filter(weekFillCountsInSpend);
    const stops = collapseWeekFillsToStops(spendList);
    const prices = stops
      .filter((s) => s.liters > 0 && s.amount > 0)
      .map((s) => s.amount / s.liters);
    const seenDay = new Map<number, string>();
    for (const stop of stops) {
      if (stop.accepted) continue;
      const odo = Number(stop.odometer) || 0;
      const day = stop.date;
      const priorDay = odo > 0 ? seenDay.get(odo) : undefined;
      // Same vehicle, same stop day, same reading is fine. A later stop that
      // still shows that reading is a real repeat and still needs acceptance.
      const duplicate = Boolean(priorDay && priorDay !== day);
      if (odo > 0 && priorDay == null) seenDay.set(odo, day);
      const own = stop.liters > 0 ? stop.amount / stop.liters : 0;
      const peers = prices.filter((p) => p !== own);
      const issues = assessFillPlausibility({
        amount: stop.amount,
        liters: stop.liters,
        odometer: stop.odometer,
        duplicateOdometer: duplicate,
        peerPrices: peers,
      }).filter((i) => i.severity === 'block' || i.severity === 'confirm');
      if (issues.length === 0) continue;
      out.push({
        date: stop.date,
        amount: stop.amount,
        liters: stop.liters,
        odometer: stop.odometer,
        reasons: issues.map((i) => i.message),
        ids: stop.ids,
      });
    }
  }
  return out;
}

/** True when a hard or confirm-level issue has not been explicitly accepted. */
export function weekHasUnreviewedImplausibleFills(entries: WeekFill[]): boolean {
  return listUnreviewedImplausibleFills(entries).length > 0;
}
