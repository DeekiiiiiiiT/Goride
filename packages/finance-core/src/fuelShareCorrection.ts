import { round2 } from './money.ts';
import { computePeriodSettlement } from './driverPeriodSettlement.ts';
import { driverPaidFuelCredit } from './driverFuelCredit.ts';

/** One-off window. Closed weeks before this are the legacy clean-up, not this tool. */
export const FUEL_CORRECTION_FROM = '2026-01-19';
export const FUEL_CORRECTION_THROUGH = '2026-08-31';

/** Jan 19 through Aug 31, company owes the driver this much more. */
export const FUEL_CORRECTION_NET = 67015.15;

/** August was frozen on the old settlement after the driver fuel charge changed. */
export const AUGUST_FUEL_CORRECTIONS: Record<string, number> = {
  '2026-08-03': -7040.65,
  '2026-08-10': -19810.51,
  '2026-08-17': -12116.67,
  '2026-08-24': -28731.46,
};

/** Oct 12 company-fuel credit, posted as a correction on the open week. */
export const OCT12_CORRECTION = -13191.88;

export type WeekSettlementRebuildInput = {
  driverShare: number;
  /** Driver fuel charge stored on the week. Not the later sealed-statement restatement. */
  fuelDeduction: number;
  cashCollected: number;
  cashReturned: number;
  tollChargedToDriver: number;
  tollCashSpend: number;
  driverPaidFuel: number;
  cashWrittenOff?: number;
  settlementPaid: number;
  tipsPaidToDriver?: number;
  storedSettlement: number;
};

/**
 * What the week would owe if fuel credit is only cash the driver paid.
 * Earnings, cash, tolls, the week's own fuel charge, and what was already paid stay as stored.
 */
export function rebuildWeekSettlement(input: WeekSettlementRebuildInput): number {
  return computePeriodSettlement({
    driverShare: Number(input.driverShare) || 0,
    fuelDeduction: Number(input.fuelDeduction) || 0,
    baseCashOwed: Number(input.cashCollected) || 0,
    baseCashPaid: Number(input.cashReturned) || 0,
    tollCashWash: Number(input.tollCashSpend) || 0,
    tollPersonal: Number(input.tollChargedToDriver) || 0,
    fuelCredits: driverPaidFuelCredit(input.driverPaidFuel),
    cashWrittenOff: Number(input.cashWrittenOff) || 0,
    settlementPaid: Number(input.settlementPaid) || 0,
    tipsPaidToDriver: Number(input.tipsPaidToDriver) || 0,
  }).settlement;
}

/** Correction posted on the open week. Positive means the company owes the driver more. */
export function fuelShareCorrectionDelta(input: WeekSettlementRebuildInput): number {
  return round2(rebuildWeekSettlement(input) - (Number(input.storedSettlement) || 0));
}

export function fuelShareCorrectionSentence(input: {
  week: string;
  delta: number;
  gasCard: number;
}): string {
  const money = Math.abs(input.delta).toFixed(2);
  if (input.gasCard <= 0.005 && input.delta > 0.005) {
    return `Week of ${input.week}: his fuel share was taken twice. Company owes $${money}.`;
  }
  if (input.delta < -0.005) {
    return `Week of ${input.week}: he was credited gas-card fuel he did not pay. He owes $${money}.`;
  }
  if (input.delta > 0.005) {
    return `Week of ${input.week}: fuel share was applied once. Company owes $${money}.`;
  }
  return `Week of ${input.week}: fuel share already matches.`;
}

export type CorrectionLine = {
  sourceWeek: string;
  amount: number;
  sentence: string;
  kind: 'fuel_share' | 'legacy_balance';
};

export function sumCorrectionLines(lines: CorrectionLine[] | null | undefined): number {
  return round2((lines || []).reduce((sum, line) => sum + (Number(line.amount) || 0), 0));
}

/** Refuse to post unless the preview is the audited August lines, the net, and the Oct 12 line. */
export function correctionPreviewAccepted(input: {
  lines: Array<{ sourceWeek: string; amount: number }>;
  oct12Amount: number | null;
}): { ok: boolean; net: number; reason: string } {
  const net = round2(input.lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0));
  if (Math.abs(net - FUEL_CORRECTION_NET) > 0.01) {
    return {
      ok: false,
      net,
      reason: `Corrections would total $${net.toFixed(2)}. They must total $${FUEL_CORRECTION_NET.toFixed(2)} before anything is posted.`,
    };
  }
  for (const [week, amount] of Object.entries(AUGUST_FUEL_CORRECTIONS)) {
    const line = input.lines.find((row) => String(row.sourceWeek).slice(0, 10) === week);
    if (!line || Math.abs((Number(line.amount) || 0) - amount) > 0.01) {
      return {
        ok: false,
        net,
        reason: `Week of ${week} does not match the audited correction.`,
      };
    }
  }
  if (input.oct12Amount == null || Math.abs(input.oct12Amount - OCT12_CORRECTION) > 0.01) {
    return {
      ok: false,
      net,
      reason: 'The Oct 12 amount he owes is not on the open week yet.',
    };
  }
  return { ok: true, net, reason: '' };
}
