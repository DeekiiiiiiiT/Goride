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
  fuelDeduction: number;
  fuelCredits: number;
  totalDeductions: number;
  netPayout: number;
  isFinalized: boolean;
  tripCount: number;
  tierName: string;
  cashOwed: number;
  cashPaid: number;
  cashBalance: number;
  status: PayoutStatus;
  /** From weekly cash settlement — drives Cash Paid drill-down */
  cashPaidBreakdown?: CashPaidBreakdown;
}
