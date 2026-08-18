/**
 * Pure arithmetic checks for finalized weekly fuel reports (no KV).
 */
import { blendedDriverShareRatioFromReport } from "./fuel_blended_ratio.ts";

export function roundCentsEqual(a: number, b: number): boolean {
  return Math.round((Number(a) || 0) * 100) === Math.round((Number(b) || 0) * 100);
}

export type FinalizeValidationResult =
  | { ok: true }
  | { ok: false; error: string };

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Client-computed totals must be internally consistent before they hit the ledger. */
export function validateFinalizedReportArithmetic(report: Record<string, unknown>): FinalizeValidationResult {
  const total = num(report.totalGasCardCost);
  const ride = num(report.rideShareCost);
  const companyOps = num(report.companyUsageCost ?? report.companyOpsCost);
  const deadhead = num(report.deadheadCost);
  const personal = num(report.personalUsageCost ?? report.personalCost);
  const misc = num(report.miscellaneousCost ?? report.miscCost);
  const driverShare = num(report.driverShare);
  const companyShare = num(report.companyShare);
  const gasCardSpend = num(report.gasCardSpend);

  if (![total, ride, companyOps, deadhead, personal, misc, driverShare, companyShare].every(Number.isFinite)) {
    return { ok: false, error: "Report contains non-numeric cost fields" };
  }
  if (total < 0 || driverShare < 0 || companyShare < 0) {
    return { ok: false, error: "Report shares or total spend cannot be negative" };
  }

  const bucketSum = ride + companyOps + deadhead + personal + misc;
  if (!roundCentsEqual(bucketSum, total)) {
    return {
      ok: false,
      error: `Bucket sum ${bucketSum.toFixed(2)} does not match total spend ${total.toFixed(2)}`,
    };
  }

  if (!roundCentsEqual(driverShare + companyShare, total)) {
    return {
      ok: false,
      error: `driverShare + companyShare does not match total spend`,
    };
  }

  if (Number.isFinite(gasCardSpend) && gasCardSpend > 0 && gasCardSpend > total + 0.02) {
    return { ok: false, error: "gasCardSpend exceeds totalGasCardCost" };
  }

  const ratio = blendedDriverShareRatioFromReport({
    driverShare,
    totalGasCardCost: total,
    gasCardSpend,
  });
  if (ratio < 0 || ratio > 1.0001) {
    return { ok: false, error: "Blended driver-share ratio is out of range" };
  }

  return { ok: true };
}
