import { useQuery } from '@tanstack/react-query';
import { deliveryFetch } from '../lib/partner-api';
import { MerchantReview, TopSellingItem } from '../types/analytics';

export interface MerchantAnalyticsData {
  from: string;
  to: string;
  granularity: 'hour' | 'day';
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  avgPrepTime: number;
  revenueByBucket: { key: string; label: string; revenue: number }[];
  orderVolumeByBucket: { key: string; label: string; count: number }[];
  topItems: TopSellingItem[];
  categoryBreakdown: { name: string; percent: number; color: string }[];
  operational: {
    acceptanceRate: number;
    cancellationRate: number;
    avgPrepTime: number;
  };
  reviews: MerchantReview[];
  avgRating: number;
  ratingDistribution: { star: number; count: number; percent: number }[];
}

export function useMerchantAnalytics(
  from: string,
  to: string,
  granularity: 'hour' | 'day' = 'hour',
) {
  return useQuery({
    queryKey: ['merchant-analytics', from, to, granularity],
    queryFn: async () => {
      const params = new URLSearchParams({
        from,
        to,
        granularity,
      });
      return deliveryFetch(`/merchant/analytics?${params}`) as Promise<MerchantAnalyticsData>;
    },
    enabled: Boolean(from && to),
  });
}
