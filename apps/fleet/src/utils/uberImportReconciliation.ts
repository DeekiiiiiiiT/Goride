import type { Trip, OrganizationMetrics, DisputeRefund } from '../types/data';
import type { UberSsotTotals } from './uberSsot';

/**
 * Single source of truth for Uber money shown on the import preview and written as
 * `statement_line` canonical events (`NET_FARE`, `TOTAL_EARNINGS`, etc.).
 */
export interface UberImportReconciliation {
  hasSsot: boolean;
  netFare: number;
  promotions: number;
  tipsStatement: number;
  tipsPeriod: number;
  priorSum: number;
  tolls: number;
  tollSupport: number;
  refundsTotal: number;
  periodTotal: number;
  totalEarnings: number;
  statementRollup: number;
  roamTotalVsUber: number;
  payoutCash: number;
  payoutBank: number;
  grandTotal: number;
}

export interface ComputeUberImportReconciliationParams {
  /** Single org row from `payments_organization` / merged metrics (same as import preview). */
  organizationMetrics: OrganizationMetrics | null | undefined;
  uberStatementsByDriverId: Record<string, UberSsotTotals> | null | undefined;
  trips: Trip[];
  disputeRefunds: DisputeRefund[];
}

/**
 * Same rules as the import preview Roam column — must stay aligned with
 * `buildCanonicalImportEvents` statement lines.
 */
export function computeUberImportReconciliation(
  params: ComputeUberImportReconciliationParams,
): UberImportReconciliation {
  const { organizationMetrics, uberStatementsByDriverId, trips, disputeRefunds } = params;
  const org = organizationMetrics ?? null;
  const ssotMap = uberStatementsByDriverId;
  const hasSsot = ssotMap != null && Object.keys(ssotMap).length > 0;

  const ssotAgg = hasSsot
    ? Object.values(ssotMap!).reduce(
        (a, s) => ({
          promotions: a.promotions + s.promotions,
          tips: a.tips + s.tips,
          refundsAndExpenses: a.refundsAndExpenses + s.refundsAndExpenses,
          statementNetFare: a.statementNetFare + s.statementNetFare,
          periodEarningsGross: a.periodEarningsGross + s.periodEarningsGross,
        }),
        {
          promotions: 0,
          tips: 0,
          refundsAndExpenses: 0,
          statementNetFare: 0,
          periodEarningsGross: 0,
        },
      )
    : null;

  const tollSupport = disputeRefunds.reduce((s, r) => s + Math.abs(r.amount || 0), 0);

  const tripNetFare = trips.reduce((sum, t) => sum + (t.uberFareComponents || 0), 0);
  const tripPromos = trips.reduce((sum, t) => sum + (t.uberPromotionsAmount || 0), 0);
  const tripTips = trips.reduce((sum, t) => sum + (t.uberTips || 0), 0);
  const priorSum = trips.reduce((s, t) => s + (t.uberPriorPeriodAdjustment || 0), 0);
  const tripRefundsTolls = trips.reduce(
    (sum, t) => sum + (t.uberRefundExpenseAmount || 0) + (t.tollCharges || 0),
    0,
  );

  const orgNetFare = org ? Number(org.netFare) || 0 : 0;
  const netFare =
    hasSsot && ssotAgg
      ? orgNetFare > 0.005
        ? orgNetFare
        : ssotAgg.statementNetFare
      : tripNetFare;

  const promotions = hasSsot && ssotAgg ? ssotAgg.promotions : tripPromos;
  const tipsStatement = hasSsot && ssotAgg ? ssotAgg.tips : tripTips + priorSum;
  const tipsPeriod = hasSsot && ssotAgg ? tipsStatement - priorSum : tripTips;

  const refundsTotal =
    hasSsot && ssotAgg && ssotAgg.refundsAndExpenses > 0.005
      ? ssotAgg.refundsAndExpenses
      : tripRefundsTolls;

  const refundsTollFromOrg =
    org?.refundsToll != null &&
    !Number.isNaN(Number(org.refundsToll)) &&
    Number(org.refundsToll) > 0.005
      ? Number(org.refundsToll)
      : undefined;
  const tollsAfterSupport = Math.max(0, refundsTotal - tollSupport);
  let tolls: number;
  if (refundsTollFromOrg !== undefined) {
    const tollColumnMatchesTotalRefunds =
      Math.abs(refundsTollFromOrg - refundsTotal) <= 0.05;
    if (tollSupport > 0.005 && tollColumnMatchesTotalRefunds) {
      /** `Refunds:Toll` often repeats full Refunds & Expenses — split tolls vs support ($1,395 → $1,385 + $10). */
      tolls = tollsAfterSupport;
    } else {
      tolls = refundsTollFromOrg;
    }
  } else {
    tolls = tollsAfterSupport;
  }

  const totalEarnings =
    org != null && Number(org.totalEarnings) > 0.005
      ? org.totalEarnings
      : hasSsot && ssotAgg
        ? ssotAgg.periodEarningsGross
        : netFare + promotions + tipsStatement;

  const periodTotal = netFare + promotions + tipsPeriod;
  const statementRollup = netFare + promotions + tipsStatement;
  const roamTotalVsUber = statementRollup - totalEarnings;

  const payoutCash = org != null ? Number(org.totalCashExposure) || 0 : 0;
  const payoutBank = org != null ? Number(org.bankTransfer) || 0 : 0;
  const grandTotal = periodTotal + refundsTotal + priorSum;

  return {
    hasSsot,
    netFare,
    promotions,
    tipsStatement,
    tipsPeriod,
    priorSum,
    tolls,
    tollSupport,
    refundsTotal,
    periodTotal,
    totalEarnings,
    statementRollup,
    roamTotalVsUber,
    payoutCash,
    payoutBank,
    grandTotal,
  };
}

/** Sum of per-driver `statementNetFare` from SSOT (same sign as CSV). */
export function sumStatementNetFare(ssot: Record<string, UberSsotTotals>): number {
  let s = 0;
  for (const v of Object.values(ssot)) {
    s += v.statementNetFare || 0;
  }
  return s;
}

/** Sum of per-driver `periodEarningsGross` from SSOT. */
export function sumPeriodEarningsGross(ssot: Record<string, UberSsotTotals>): number {
  let s = 0;
  for (const v of Object.values(ssot)) {
    s += v.periodEarningsGross || 0;
  }
  return s;
}
