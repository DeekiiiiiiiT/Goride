import { round2 } from './money.ts';
import { FUEL_CORRECTION_NET, OCT12_CORRECTION } from './fuelShareCorrection.ts';

/** Dec 8–Jan 12 is the older-week clean-up. These five must close before corrections. */
export const PAST_WEEKS_CLOSE = [
  '2026-09-07',
  '2026-09-14',
  '2026-09-21',
  '2026-09-28',
  '2026-10-05',
] as const;

/** Corrections convert the Oct 12 cash held only when they land on this open week. */
export const CORRECTIONS_LAND_ON = '2026-10-19';

/** August bucket starts here. Earlier correction lines are the double-charged fuel. */
export const AUGUST_BUCKET_START = '2026-08-03';

/** Payment history total. The Oct 12 line is its own movement and is not included here. */
export const CORRECTION_HISTORY_TOTAL = FUEL_CORRECTION_NET;

export const OCT12_CORRECTION_AMOUNT = OCT12_CORRECTION;

/** Matches the server write-off reason check. */
export const WRITE_OFF_REASON_MIN = 4;

/**
 * Dec 29 and Jan 12 were written off in full. Half of each stored balance stays.
 * The leftover cent on an odd balance stays written off.
 */
export const LEGACY_KEPT_REPAIR_WEEKS = [
  { week: '2025-12-29', balance: -23429.49 },
  { week: '2026-01-12', balance: 5203.22 },
] as const;

/** Half-week note. Uses the driver's name. Never "he". */
export function legacyBalanceSentence(
  week: string,
  keep: number,
  driverName?: string | null,
): string {
  const name = String(driverName || '').trim() || 'the driver';
  const money = Math.abs(Number(keep) || 0).toFixed(2);
  if ((Number(keep) || 0) >= 0) {
    return `Week of ${week}: older balance the company still owes ${name} $${money}.`;
  }
  return `Week of ${week}: older balance ${name} still owes $${money}.`;
}

/** Kept half of a stored week balance, same sign. Rounded to the cent. */
export function legacyKeptHalf(balance: number): number {
  const signed = round2(Number(balance) || 0);
  const keepAbs = round2(Math.abs(signed) / 2);
  if (keepAbs <= 0.005) return 0;
  return round2((signed < 0 ? -1 : 1) * keepAbs);
}

export type PastWeeksStep = 1 | 2 | 3 | 4 | 'done';

export function resolvePastWeeksStep(input: {
  legacyRemaining: number;
  closeWeeksOpen: number;
  correctionsPending: boolean;
  payoutsPosted: boolean;
}): PastWeeksStep {
  if (input.legacyRemaining > 0) return 1;
  if (input.closeWeeksOpen > 0) return 2;
  if (input.correctionsPending) return 3;
  if (!input.payoutsPosted) return 4;
  return 'done';
}

export type CorrectionBucketLine = { sourceWeek: string; amount: number };

export type FuelCorrectionBuckets = {
  early: number;
  earlyCount: number;
  august: number;
  augustCount: number;
  oct12: number | null;
  net: number;
  historyTotal: number;
};

/** Split preview lines into the Jan–Jul, August, and Oct 12 buckets. */
export function fuelCorrectionBuckets(
  lines: CorrectionBucketLine[],
  oct12Amount: number | null,
): FuelCorrectionBuckets {
  let early = 0;
  let earlyCount = 0;
  let august = 0;
  let augustCount = 0;
  for (const line of lines) {
    const week = String(line.sourceWeek || '').slice(0, 10);
    const amount = Number(line.amount) || 0;
    if (week >= AUGUST_BUCKET_START) {
      august = round2(august + amount);
      augustCount += 1;
    } else {
      early = round2(early + amount);
      earlyCount += 1;
    }
  }
  const oct12 = oct12Amount == null ? null : round2(Number(oct12Amount) || 0);
  const historyTotal = round2(early + august);
  const net = round2(historyTotal + (oct12 || 0));
  return { early, earlyCount, august, augustCount, oct12, net, historyTotal };
}

/** Open-week move from kept older balances plus Jan–Aug corrections. Oct 12 is not added. */
export function openWeekMove(correctionHistoryNet: number, keptLegacySum: number): number {
  return round2((Number(correctionHistoryNet) || 0) + (Number(keptLegacySum) || 0));
}

/**
 * How much of one older-week balance is dropped, and how much keeps its sign and moves.
 * `requested` is a positive size. Omit it to write off the whole balance.
 */
export function splitLegacyWriteOff(
  balance: number,
  requested?: number | null,
): { writeOff: number; keep: number } {
  const signed = round2(Number(balance) || 0);
  const full = round2(Math.abs(signed));
  const sign = signed < 0 ? -1 : 1;
  const raw = requested == null || !Number.isFinite(Number(requested))
    ? full
    : round2(Math.abs(Number(requested)));
  const writeOff = round2(Math.min(Math.max(raw, 0), full));
  const keepAbs = round2(full - writeOff);
  return {
    writeOff: writeOff <= 0.005 ? 0 : writeOff,
    keep: keepAbs <= 0.005 ? 0 : round2(sign * keepAbs),
  };
}

export function legacyChoiceTotals(
  weeks: Array<{ amount: number }>,
  actions: Array<'carry' | 'write_off' | undefined>,
  writeOffAmounts?: Array<number | null | undefined>,
): { keep: number; writeOff: number; allKept: boolean } {
  let keep = 0;
  let writeOff = 0;
  let allKept = weeks.length > 0;
  weeks.forEach((week, index) => {
    const action = actions[index] || 'carry';
    if (action === 'write_off') {
      allKept = false;
      const split = splitLegacyWriteOff(week.amount, writeOffAmounts?.[index]);
      writeOff = round2(writeOff + split.writeOff);
      keep = round2(keep + split.keep);
    } else {
      keep = round2(keep + (Number(week.amount) || 0));
    }
  });
  return { keep, writeOff, allKept };
}
