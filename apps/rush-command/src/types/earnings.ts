export interface WeeklyEarningsBar {
  day: string;
  heightPercent: number;
  isToday?: boolean;
}

export interface EarningsTransaction {
  id: string;
  title: string;
  date: string;
  amount: number;
  type: 'payout' | 'refund';
  payoutId?: string;
}

export interface PayoutDetail {
  id: string;
  totalAmount: number;
  status: 'completed' | 'pending' | 'failed';
  payoutDate: string;
  bankAccountMasked: string;
  orderEarnings: number;
  tips: number;
  adjustments: number;
  platformFeePercent: number;
  platformFee: number;
  netAmount: number;
}

export interface WeeklyEarningsSummary {
  grossSales: number;
  platformFeePercent: number;
  platformFee: number;
  netEarnings: number;
}
