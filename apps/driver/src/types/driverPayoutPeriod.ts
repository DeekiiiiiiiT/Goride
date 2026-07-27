/** Shared types for Cash Settlement — aligned with fleet PayoutPeriodRow. */

export type PayoutStatus = 'Finalized' | 'Awaiting Cash' | 'Pending';

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
  disputeRefundMatched: number;
  disputeRefundUnmatched: number;
  fuelDeduction: number;
  fuelCredits: number;
  totalDeductions: number;
  expenseDeductions: number;
  netPayout: number;
  isFinalized: boolean;
  isEstimate?: boolean;
  tripCount: number;
  tierName: string;
  cashOwed: number;
  cashPaid: number;
  cashBalance: number;
  /** Physical passenger cash only — context, never shown as Outstanding. */
  passengerCash?: number;
  cashTollWash?: number;
  personalTollCharge?: number;
  cashWrittenOff?: number;
  bankSettled: number;
  status: PayoutStatus;
  cashPaidBreakdown?: CashPaidBreakdown;
}

/** Server period projection shape from GET /driver-financial-periods. */
export type DriverFinancialPeriodClient = {
  id?: string;
  driverId: string;
  periodAnchor: string;
  periodEnd: string;
  timezone?: string;
  status: 'open' | 'closed' | 'reopened' | string;
  tollSpend: number;
  tollCashSpend: number;
  tollTagSpend: number;
  tollReimbursed: number;
  tollChargedToDriver: number;
  tollUnmatchedCount: number;
  tollReconciledCount: number;
  tollWorkflowActionable: number;
  disputeRefundMatched: number;
  disputeRefundUnmatched: number;
  fuelDriverSpend: number;
  fuelGasCardSpend: number;
  fuelDeduction: number;
  fuelFleetShare: number;
  fuelNetPay: number;
  fuelFinalized: boolean;
  earningsGross: number;
  driverShare: number;
  fleetShare: number;
  driverSharePercent: number;
  tripCount: number;
  tierId?: string | null;
  tierName?: string | null;
  cashCollected: number;
  cashReturned: number;
  cashWrittenOff: number;
  cashStillHeld: number;
  settlementAmount: number;
  payoutNet: number;
  settlementStatus: string;
  payoutStatus: string;
  tollStatus: string;
};
