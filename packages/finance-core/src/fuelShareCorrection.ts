import { round2 } from './money.ts';

/**
 * Closed weeks credited the company fuel share instead of the cash the driver paid.
 * The correction is that difference. Positive means the company owes the driver more.
 * Each week keeps its own driver share; this only applies that share once.
 */
export function fuelShareCorrectionDelta(input: {
  driverPaidFuel: number;
  companyFuelShare: number;
}): number {
  return round2((Number(input.driverPaidFuel) || 0) - (Number(input.companyFuelShare) || 0));
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
