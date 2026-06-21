import { useQuery } from '@tanstack/react-query';
import { deliveryFetch } from '../lib/partner-api';
import {
  EarningsTransaction,
  PayoutDetail,
  WeeklyEarningsBar,
  WeeklyEarningsSummary,
} from '../types/earnings';

export interface MerchantEarningsData {
  currentBalance: number;
  nextPayoutDate: string;
  weeklySummary: WeeklyEarningsSummary;
  weeklyBars: WeeklyEarningsBar[];
  transactions: EarningsTransaction[];
}

export function useMerchantEarnings() {
  return useQuery({
    queryKey: ['merchant-earnings'],
    queryFn: () => deliveryFetch('/merchant/earnings') as Promise<MerchantEarningsData>,
  });
}

export function useMerchantPayoutDetail(payoutId: string | null) {
  return useQuery({
    queryKey: ['merchant-payout', payoutId],
    queryFn: () =>
      deliveryFetch(`/merchant/earnings/payouts/${payoutId}`) as Promise<PayoutDetail>,
    enabled: Boolean(payoutId),
  });
}
