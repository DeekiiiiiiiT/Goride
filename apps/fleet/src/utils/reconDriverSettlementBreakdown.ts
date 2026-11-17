import {
  MONEY_EPS,
  resolvePostedAdjustments,
  sumCorrectionLines,
  type CorrectionLine,
} from '@roam/finance-core';

export type ReconDriverSettlementBreakdown = {
  thisWeek: number;
  correctionCount: number;
  correctionTotal: number;
  lines: CorrectionLine[];
};

export function reconDriverSettlementBreakdown(row: {
  settlementAmount?: number | null;
  metadata?: Record<string, unknown> | null;
}): ReconDriverSettlementBreakdown | null {
  const fc = (row.metadata?.financeCore || {}) as Record<string, unknown>;
  const lines = Array.isArray(fc.correctionLines) ? (fc.correctionLines as CorrectionLine[]) : [];
  const correctionTotal = resolvePostedAdjustments(fc);
  if (lines.length === 0 && Math.abs(correctionTotal) <= MONEY_EPS) return null;
  const settlement = Number(row.settlementAmount) || 0;
  const summed = sumCorrectionLines(lines);
  const adjustments = Math.abs(summed - correctionTotal) > MONEY_EPS ? correctionTotal : summed;
  return {
    thisWeek: Math.round((settlement - adjustments) * 100) / 100,
    correctionCount: lines.length,
    correctionTotal: adjustments,
    lines,
  };
}