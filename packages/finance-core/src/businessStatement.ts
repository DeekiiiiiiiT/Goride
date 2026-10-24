import { round2 } from './money.ts';
import { DEFAULT_FLEET_TZ, periodKeyFor } from './periodKey.ts';

const EPS = 0.01;

export type StatementFootingInput = {
  gross: number;
  platformFees: number;
  driverCommission: number;
  fleetFuelCost: number;
  tolls: number;
  maintenance: number;
  fixedCosts: number;
  otherOperating: number;
  otherIncome: number;
  cashWriteOff: number;
  /** Cash basis only. Accrual leaves this at zero. */
  driverPayouts?: number;
  operatingProfit: number;
};

/** Money in minus money out. Profit must match this to the cent. */
export function statementFooting(input: StatementFootingInput): {
  expectedProfit: number;
  difference: number;
  ok: boolean;
} {
  const expectedProfit = round2(
    input.gross -
      input.platformFees -
      input.driverCommission -
      input.fleetFuelCost -
      input.tolls -
      input.maintenance -
      input.fixedCosts -
      input.otherOperating +
      input.otherIncome -
      input.cashWriteOff -
      (input.driverPayouts || 0),
  );
  const difference = round2(expectedProfit - input.operatingProfit);
  return { expectedProfit, difference, ok: Math.abs(difference) <= EPS };
}

/** Prepaid premium recognised for the days of cover that fall in the period. */
export function amortisedPrepaid(input: {
  premium: number;
  coverStart: string;
  coverEnd: string;
  periodStart: string;
  periodEnd: string;
}): number {
  const coverStart = input.coverStart.slice(0, 10);
  const coverEnd = input.coverEnd.slice(0, 10);
  const periodStart = input.periodStart.slice(0, 10);
  const periodEnd = input.periodEnd.slice(0, 10);
  const start = coverStart > periodStart ? coverStart : periodStart;
  const end = coverEnd < periodEnd ? coverEnd : periodEnd;
  if (end < start) return 0;
  const coverDays = dayCount(coverStart, coverEnd);
  const overlap = dayCount(start, end);
  if (coverDays <= 0 || overlap <= 0) return 0;
  return round2((Number(input.premium) || 0) * (overlap / coverDays));
}

function dayCount(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export type TieOut = { id: string; label: string; difference: number; ok: boolean };

export function tieOut(id: string, label: string, left: number, right: number): TieOut {
  const difference = round2(left - right);
  return { id, label, difference, ok: Math.abs(difference) <= EPS };
}

/** Same card, date, amount, and upload is one fill. */
export function fuelCardUploadKey(input: {
  cardId?: string;
  date: string;
  amount: number;
  uploadId?: string;
}): string {
  const card = String(input.cardId || '').trim();
  const upload = String(input.uploadId || '').trim();
  return `${card}|${input.date.slice(0, 10)}|${(Number(input.amount) || 0).toFixed(2)}|${upload}`;
}

/** Weeks that must not be auto-adjusted until the Uber statement is checked. */
export const HELD_UBER_WEEKS = ['2026-08-03', '2026-08-24'] as const;

export function uberWeekNeedsStatement(weekStart: string): boolean {
  return (HELD_UBER_WEEKS as readonly string[]).includes(weekStart.slice(0, 10));
}

export function uberEarningsTie(input: { ledgerUber: number; uberTotal: number; weekStart: string }): TieOut & {
  held: boolean;
} {
  const row = tieOut('uber', 'Uber earnings', input.ledgerUber, input.uberTotal);
  return { ...row, held: uberWeekNeedsStatement(input.weekStart) };
}

function ymd(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 10) return null;
  const s = raw.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** One week key for a bank payout. A stamped weekKey wins over the import day. */
export function expectedBankWeekKey(
  ev: Record<string, unknown>,
  timezone: string = DEFAULT_FLEET_TZ,
): string | null {
  const meta = ev.metadata;
  const stamped =
    meta && typeof meta === 'object' ? ymd((meta as { weekKey?: unknown }).weekKey) : null;
  const date = stamped || ymd(ev.date) || ymd(ev.periodStart);
  if (!date) return null;
  return periodKeyFor(date, timezone);
}

export type FuelWeekDrift = { week: string; ledger: number; records: number; difference: number };

/** Weeks whose ledger fuel does not match the fuel records. Nothing is written. */
export function fuelLedgerDrift(
  weeks: Array<{ week: string; ledger: number; records: number }>,
): FuelWeekDrift[] {
  return weeks
    .map((w) => ({ ...w, difference: round2(w.ledger - w.records) }))
    .filter((w) => Math.abs(w.difference) > EPS);
}
