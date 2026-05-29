/**
 * Cash payment calculation utilities.
 * Calculates exact amounts for cash transactions between rider and driver.
 */

export interface CashPaymentSplit {
  riderPaysMinor: number;
  driverReceivesMinor: number;
  platformFeeMinor: number;
  tipMinor: number;
  totalFareMinor: number;
  currency: string;
}

export interface CashPaymentDisplayParams {
  fareMinor: number;
  waitTimeFeeMinor?: number;
  actualTollsMinor?: number;
  platformFeeMinor?: number;
  tipMinor?: number;
  currency?: string;
}

/**
 * Calculate the cash payment split for a completed ride.
 */
export function calculateCashPaymentSplit(params: CashPaymentDisplayParams): CashPaymentSplit {
  const {
    fareMinor,
    waitTimeFeeMinor = 0,
    actualTollsMinor = 0,
    platformFeeMinor = 0,
    tipMinor = 0,
    currency = "JMD",
  } = params;

  const totalFareMinor = fareMinor + waitTimeFeeMinor + actualTollsMinor + tipMinor;
  const driverReceivesMinor = totalFareMinor - platformFeeMinor;

  return {
    riderPaysMinor: totalFareMinor,
    driverReceivesMinor,
    platformFeeMinor,
    tipMinor,
    totalFareMinor,
    currency,
  };
}

/**
 * Format cash amount for display with bills and coins suggestion.
 */
export function formatCashAmount(minor: number, currency = "JMD"): string {
  if (minor <= 0) return "";
  return new Intl.NumberFormat("en-JM", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/**
 * Calculate change needed for a given payment amount.
 */
export function calculateChange(
  paidMinor: number,
  owedMinor: number,
): { changeMinor: number; changeFormatted: string } {
  const changeMinor = Math.max(0, paidMinor - owedMinor);
  return {
    changeMinor,
    changeFormatted: formatCashAmount(changeMinor),
  };
}

/**
 * Get a breakdown of the fare components for display.
 */
export function getFareBreakdownDisplay(ride: Record<string, unknown>): {
  baseFare: string;
  waitTimeFee: string | null;
  tolls: string | null;
  tip: string | null;
  platformFee: string | null;
  total: string;
} {
  const currency = String(ride.currency ?? "JMD");
  const baseFareMinor = Number(ride.fare_estimate_minor ?? 0);
  const waitTimeFeeMinor = Number(ride.wait_time_fee_minor ?? 0);
  const actualTollsMinor = Number(ride.actual_tolls_minor ?? 0);
  const tipMinor = Number(ride.tip_minor ?? 0);
  const platformFeeMinor = Number(ride.platform_fee_minor ?? 0);
  const totalMinor = Number(ride.fare_final_minor ?? baseFareMinor);

  return {
    baseFare: formatCashAmount(baseFareMinor, currency),
    waitTimeFee: waitTimeFeeMinor > 0 ? formatCashAmount(waitTimeFeeMinor, currency) : null,
    tolls: actualTollsMinor > 0 ? formatCashAmount(actualTollsMinor, currency) : null,
    tip: tipMinor > 0 ? formatCashAmount(tipMinor, currency) : null,
    platformFee: platformFeeMinor > 0 ? formatCashAmount(platformFeeMinor, currency) : null,
    total: formatCashAmount(totalMinor, currency),
  };
}
