import { EarningsTransaction, PayoutDetail, WeeklyEarningsBar, WeeklyEarningsSummary } from '../types/earnings';

export const EARNINGS_BALANCE = 24500;

export const NEXT_PAYOUT_LABEL = 'June 21';

export const WEEKLY_SUMMARY: WeeklyEarningsSummary = {
  grossSales: 48500,
  platformFeePercent: 15,
  platformFee: 7275,
  netEarnings: 41225,
};

export const WEEKLY_BARS: WeeklyEarningsBar[] = [
  { day: 'Mon', heightPercent: 40 },
  { day: 'Tue', heightPercent: 60 },
  { day: 'Wed', heightPercent: 85, isToday: true },
  { day: 'Thu', heightPercent: 30 },
  { day: 'Fri', heightPercent: 70 },
  { day: 'Sat', heightPercent: 90 },
  { day: 'Sun', heightPercent: 50 },
];

export const EARNINGS_TRANSACTIONS: EarningsTransaction[] = [
  {
    id: '1',
    title: 'June 14 Payout',
    date: 'Jun 14, 2024',
    amount: 38450,
    type: 'payout',
    payoutId: 'payout-june-14',
  },
  {
    id: '2',
    title: 'Refund - #RD-1039',
    date: 'Jun 12, 2024',
    amount: -1250,
    type: 'refund',
  },
  {
    id: '3',
    title: 'June 07 Payout',
    date: 'Jun 07, 2024',
    amount: 42100,
    type: 'payout',
    payoutId: 'payout-june-07',
  },
];

export const PAYOUT_DETAILS: Record<string, PayoutDetail> = {
  'payout-june-14': {
    id: 'payout-june-14',
    totalAmount: 38450,
    status: 'completed',
    payoutDate: 'June 14, 2024',
    bankAccountMasked: '****4521',
    orderEarnings: 41500,
    tips: 4225,
    adjustments: -1250,
    platformFeePercent: 15,
    platformFee: 6025,
    netAmount: 38450,
  },
  'payout-june-07': {
    id: 'payout-june-07',
    totalAmount: 42100,
    status: 'completed',
    payoutDate: 'June 07, 2024',
    bankAccountMasked: '****4521',
    orderEarnings: 45200,
    tips: 5100,
    adjustments: 0,
    platformFeePercent: 15,
    platformFee: 8200,
    netAmount: 42100,
  },
};

export function getPayoutDetail(payoutId: string) {
  return PAYOUT_DETAILS[payoutId];
}
