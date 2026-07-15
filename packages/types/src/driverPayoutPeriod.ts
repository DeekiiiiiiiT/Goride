/** Shared types for Payout tab, Cash Wallet settlement, and period detail overlay. */

export type PayoutStatus = 'Finalized' | 'Awaiting Cash' | 'Pending';

/** Matches `CashWeekData.breakdown` + FIFO/surplus — components that sum to Cash Paid (amountPaid). */
export interface CashPaidBreakdown {
  allocatedPayments: number;
  tollCredits: number;
  fuelCreditsInCashPaid: number;
  fifoPayments: number;
  surplusPayments: number;
}

export interface PayoutPeriodRow {
  periodStart: Date;
  periodEnd: Date;
  grossRevenue: number;
  driverSharePercent: number;
  driverShare: number;
  tollExpenses: number;
  tollReconciled: number;
  tollUnreconciled: number;
  /** Uber support-case adjustments already linked to a real toll for this period. */
  disputeRefundMatched?: number;
  /** Uber support-case adjustments still needing a manual match for this period. */
  disputeRefundUnmatched?: number;
  fuelDeduction: number;
  fuelCredits: number;
  totalDeductions: number;
  /**
   * Driver take-home deductions for Settlement: fuel deduction + Charged to Driver.
   * Excludes gross plaza toll spend (cash wash / fleet after reconcile).
   */
  expenseDeductions?: number;
  netPayout: number;
  /** True when a finalized fuel reconciliation report overlaps this period. */
  isFinalized: boolean;
  /**
   * Payout-only: fuel not locked — fuelDeduction/netPayout may be draft (or share-only).
   * Settlement must still treat Amount Due as locked until isFinalized.
   */
  isEstimate?: boolean;
  tripCount: number;
  tierName: string;
  cashOwed: number;
  cashPaid: number;
  cashBalance: number;
  /**
   * Physical passenger cash only (Uber payout_cash + InDrive/Roam trip cash).
   * Does not include float or personal tag charges.
   */
  passengerCash?: number;
  /**
   * Cash plaza tolls for the week (full amount) — credits Cash Still Held.
   * Independent of disposition personal/business flags.
   */
  cashTollWash?: number;
  /**
   * Personal tag tolls billed to the driver (reconciliation disposition).
   * Increases Cash Still Held; never pads Cash Returned.
   */
  personalTollCharge?: number;
  /** Uber bank settled for the period — informational; never part of cash risk. */
  bankSettled?: number;
  status: PayoutStatus;
  /** From weekly cash settlement — drives Cash Paid drill-down */
  cashPaidBreakdown?: CashPaidBreakdown;
}
