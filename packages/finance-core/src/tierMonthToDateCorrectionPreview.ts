import type { LedgerFareLike } from './periodShareCash.ts';
import { getTierForEarningsEH } from './periodShareCash.ts';
import {
  computeTierMonthToDateFares,
  computeTierMonthToDateFaresCalendarLegacy,
} from './tierMonthToDate.ts';
import { DEFAULT_FLEET_TZ } from './periodKey.ts';
import { round2, MONEY_EPS } from './money.ts';

export type TierMonthToDateCorrectionWeekInput = {
  periodAnchor: string;
  periodEnd: string;
  grossRevenue: number;
  paidDriverSharePercent: number;
  paidDriverShare: number;
  fareEntries: LedgerFareLike[];
  closed?: boolean;
};

export type TierMonthToDateCorrectionPreviewRow = {
  periodAnchor: string;
  oldPercent: number;
  newPercent: number;
  grossRevenue: number;
  paidDriverShare: number;
  correctDriverShare: number;
  /** Positive = driver was overpaid vs corrected tier share. */
  overUnderPaid: number;
};

function tierPercentForLegacy(
  fareEntries: LedgerFareLike[],
  periodAnchor: string,
  periodEnd: string,
  tiers: any[],
  timezone: string,
): number {
  const cumulative = computeTierMonthToDateFaresCalendarLegacy({
    fareEntries,
    periodAnchor,
    periodEnd,
    timezone,
  });
  return Number(getTierForEarningsEH(cumulative, tiers).sharePercentage) || 0;
}

function tierPercentForD4(
  fareEntries: LedgerFareLike[],
  periodAnchor: string,
  tiers: any[],
  timezone: string,
): number {
  const cumulative = computeTierMonthToDateFares({
    fareEntries,
    periodAnchor,
    timezone,
  });
  return Number(getTierForEarningsEH(cumulative, tiers).sharePercentage) || 0;
}

/**
 * Preview-only: closed weeks whose tier % or driver share changes under anchor-month MTD.
 * Does not post corrections.
 */
export function previewTierMonthToDateCorrections(
  weeks: TierMonthToDateCorrectionWeekInput[],
  tiers: any[],
  timezone: string = DEFAULT_FLEET_TZ,
): TierMonthToDateCorrectionPreviewRow[] {
  const sorted = [...(weeks || [])].sort((a, b) =>
    String(a.periodAnchor).localeCompare(String(b.periodAnchor)),
  );
  const allFares: LedgerFareLike[] = sorted.flatMap((w) => w.fareEntries || []);

  const rows: TierMonthToDateCorrectionPreviewRow[] = [];

  for (const week of sorted) {
    if (week.closed === false) continue;
    const anchor = String(week.periodAnchor || '').slice(0, 10);
    const periodEnd = String(week.periodEnd || '').slice(0, 10);
    const gross = round2(Number(week.grossRevenue) || 0);
    const paidShare = round2(Number(week.paidDriverShare) || 0);

    const oldPercent = tierPercentForLegacy(allFares, anchor, periodEnd, tiers, timezone);
    const newPercent = tierPercentForD4(allFares, anchor, tiers, timezone);
    const correctDriverShare = round2(gross * (newPercent / 100));

    if (
      Math.abs(oldPercent - newPercent) < MONEY_EPS &&
      Math.abs(paidShare - correctDriverShare) < 0.01
    ) {
      continue;
    }

    rows.push({
      periodAnchor: anchor,
      oldPercent,
      newPercent,
      grossRevenue: gross,
      paidDriverShare: paidShare,
      correctDriverShare,
      overUnderPaid: round2(paidShare - correctDriverShare),
    });
  }

  return rows;
}