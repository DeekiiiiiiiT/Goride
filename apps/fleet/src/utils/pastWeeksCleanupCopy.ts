import { format, parseISO } from 'date-fns';
import {
  CORRECTION_HISTORY_TOTAL,
  CORRECTIONS_LAND_ON,
  PAST_WEEKS_CLOSE,
  WRITE_OFF_REASON_MIN,
  fuelCorrectionBuckets,
  legacyChoiceTotals,
  openWeekMove,
  type CorrectionBucketLine,
} from '@roam/finance-core';
import { formatMoney } from '../components/business-finance/money';

export { CORRECTIONS_LAND_ON, WRITE_OFF_REASON_MIN, CORRECTION_HISTORY_TOTAL };

const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export function weekLabel(iso: string): string {
  const day = parseISO(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(day.getTime())) return String(iso).slice(0, 10);
  return day.getFullYear() === 2026 ? format(day, 'MMM d') : format(day, 'MMM d, yyyy');
}

export function owesPhrase(amount: number, driverName: string): string {
  const name = driverName.trim() || 'Driver';
  const shown = formatMoney(Math.abs(Number(amount) || 0));
  if (Math.abs(Number(amount) || 0) < 0.005) return formatMoney(0);
  if (amount < 0) return `${name} owes ${shown}`;
  return `You owe ${name} ${shown}`;
}

export function correctionLineReason(amount: number, driverName: string): string {
  const name = driverName.trim() || 'Driver';
  if (amount < -0.005) return `Credited gas-card fuel ${name} didn't pay`;
  if (amount > 0.005) return 'Fuel charged twice';
  return 'Fuel share already matches';
}

export function plainCorrectionBlock(reason: string, driverName: string): string {
  const name = driverName.trim() || 'the driver';
  const text = String(reason || '').trim();
  if (!text) return 'These amounts do not match the checked totals, so nothing can be posted.';
  if (/not on the open week/i.test(text)) {
    return `The Oct 12 amount ${name} owes is not on the open week yet, so corrections cannot be posted.`;
  }
  if (/must total|do not match|does not match/i.test(text)) {
    return 'These amounts do not match the checked totals, so nothing can be posted.';
  }
  return text
    .replace(/\b[Hh]is\b/g, `${name}'s`)
    .replace(/\b[Hh]e owes\b/g, `${name} owes`)
    .replace(/\b[Hh]e\b/g, name);
}

export function landingWeekBlock(landingWeek: string | null | undefined): string | null {
  const week = String(landingWeek || '').slice(0, 10);
  if (!week || week === CORRECTIONS_LAND_ON) return null;
  return `Corrections have to land on the week of ${weekLabel(CORRECTIONS_LAND_ON)}, while that week is still open. They would land on the week of ${weekLabel(week)} instead, so they cannot be posted.`;
}

export function correctionHistoryNote(): string {
  return `The payment history will total ${formatMoney(CORRECTION_HISTORY_TOTAL)}. The Oct 12 amount is its own history row. It replaces cash already held, so it is not part of that total.`;
}

export function countWord(count: number): string {
  return COUNT_WORDS[count] || String(count);
}

function moveClause(move: number, driverName: string): string {
  const name = driverName.trim() || 'Driver';
  const money = formatMoney(Math.abs(move));
  if (Math.abs(move) < 0.005) return 'The open week stays even';
  if (move > 0) return `The open week moves by about ${money} that you owe ${name}`;
  return `The open week moves by about ${money} that ${name} owes you`;
}

export function parseWriteOffAmount(raw: string | undefined): number | undefined {
  const text = String(raw ?? '').replace(/[$,\s]/g, '');
  if (!text) return undefined;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : undefined;
}

/** Blank means the whole balance. A typed amount must be above zero and no bigger than the week. */
export function writeOffAmountOk(balance: number, raw: string | undefined): boolean {
  if (raw == null || String(raw).trim() === '') return true;
  const amount = parseWriteOffAmount(raw);
  if (amount == null || amount <= 0.005) return false;
  return amount <= Math.abs(balance) + 0.01;
}

/** Positive size that will be written off. Blank uses the whole balance. */
export function chosenWriteOffSize(balance: number, raw: string | undefined): number {
  const full = Math.round(Math.abs(Number(balance) || 0) * 100) / 100;
  if (raw == null || String(raw).trim() === '') return full;
  const amount = parseWriteOffAmount(raw);
  if (amount == null) return full;
  return amount;
}

export function outlookSentence(input: {
  weeks: Array<{ week: string; amount: number }>;
  actions: Array<'carry' | 'write_off' | undefined>;
  writeOffAmounts?: Array<number | null | undefined>;
  correctionHistoryNet: number;
  driverName: string;
}): string {
  const totals = legacyChoiceTotals(input.weeks, input.actions, input.writeOffAmounts);
  const move = openWeekMove(input.correctionHistoryNet, totals.keep);
  const clause = moveClause(move, input.driverName);
  if (totals.allKept) {
    return `If you keep all ${countWord(input.weeks.length)} older weeks, they roughly cancel the fuel corrections. ${clause}.`;
  }
  return `With these choices, ${clause.charAt(0).toLowerCase()}${clause.slice(1)}.`;
}

export function legacyFooter(input: {
  weeks: Array<{ amount: number }>;
  actions: Array<'carry' | 'write_off' | undefined>;
  writeOffAmounts?: Array<number | null | undefined>;
  driverName: string;
}): string {
  const totals = legacyChoiceTotals(input.weeks, input.actions, input.writeOffAmounts);
  const keeping = Math.abs(totals.keep) < 0.005
    ? formatMoney(0)
    : owesPhrase(totals.keep, input.driverName);
  return `Keeping: ${keeping} → added to this week. Writing off: ${formatMoney(Math.abs(totals.writeOff))}.`;
}

export function fuelSummaryRows(
  lines: CorrectionBucketLine[],
  oct12Amount: number | null,
  driverName: string,
) {
  const buckets = fuelCorrectionBuckets(lines, oct12Amount);
  const name = driverName.trim() || 'Driver';
  return {
    buckets,
    rows: [
      {
        label: `Jan 19 – Jul 27 (${buckets.earlyCount} weeks): fuel charged twice`,
        phrase: owesPhrase(buckets.early, name),
        emphasis: false,
      },
      {
        label: `Aug 3 – Aug 31 (${buckets.augustCount} weeks): gas-card fuel ${name} didn't pay`,
        phrase: owesPhrase(buckets.august, name),
        emphasis: false,
      },
      {
        label: 'Oct 12: same issue',
        phrase: buckets.oct12 == null ? 'Not on the open week' : owesPhrase(buckets.oct12, name),
        emphasis: false,
      },
      {
        label: 'Net',
        phrase: owesPhrase(buckets.net, name),
        emphasis: true,
      },
    ],
  };
}

export function payoutSummary(count: number, total: number, driverName: string): string {
  const name = driverName.trim() || 'Driver';
  const payments = count === 1 ? 'payment' : 'payments';
  return `${count} ${payments} to ${name} (${formatMoney(Math.abs(total))}) were made but never written into the payment history. Balances don't change.`;
}

export function postWeeksLabel(count: number): string {
  return `Post ${count} ${count === 1 ? 'week' : 'weeks'}`;
}

export const PAST_WEEK_STEP_TITLES = {
  1: 'Older weeks',
  2: 'Close weeks',
  3: 'Fuel corrections',
  4: 'Missing payments',
} as const;

/** Stepper lock. Done is 5 so every numbered step can show a tick. */
export function cleanupProgress(
  step: 1 | 2 | 3 | 4 | 'done' | undefined,
  complete: boolean,
): 1 | 2 | 3 | 4 | 5 {
  if (complete || step === 'done') return 5;
  if (step === 2 || step === 3 || step === 4) return step;
  return 1;
}

/**
 * Close-week chips follow the server list. An older server only sends the next
 * week, so the remaining weeks in order stay open until that list arrives.
 */
export function openCloseWeeksFromStatus(status: {
  openCloseWeeks?: string[] | null;
  nextCloseWeek?: string | null;
} | null | undefined): string[] {
  if (Array.isArray(status?.openCloseWeeks)) {
    return status.openCloseWeeks.map((week) => String(week).slice(0, 10));
  }
  const next = String(status?.nextCloseWeek || '').slice(0, 10);
  const index = (PAST_WEEKS_CLOSE as readonly string[]).indexOf(next);
  if (index < 0) return [];
  return PAST_WEEKS_CLOSE.slice(index);
}

export const PAST_WEEKS_NOT_LIVE = "This update isn't live yet. Nothing was posted.";

export function keptRepairCopy(
  driverName: string,
  weeks: Array<{ week: string; keep: number }>,
  net: number,
): string {
  const name = driverName.trim() || 'Driver';
  const lines = weeks.map((week) => (
    `${weekLabel(week.week)} was written off in full. Half should have stayed: ${owesPhrase(week.keep, name)}.`
  ));
  return `${lines.join(' ')} Together, ${owesPhrase(net, name)} on the open week.`;
}

export function bannerLabel(driverName: string, step: 1 | 2 | 3 | 4): string {
  const name = driverName.trim() || 'Driver';
  return `Past-week clean-up for ${name} · Step ${step} of 4: ${PAST_WEEK_STEP_TITLES[step]}`;
}

export function writeOffReasonOk(reason: string | undefined): boolean {
  return String(reason || '').trim().length >= WRITE_OFF_REASON_MIN;
}
