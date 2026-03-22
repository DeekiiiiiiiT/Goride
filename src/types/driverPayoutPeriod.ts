/** Shared types for Payout tab, Cash Wallet settlement, and period detail overlay. */

export type PayoutStatus = 'Finalized' | 'Awaiting Cash' | 'Pending';

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
}
