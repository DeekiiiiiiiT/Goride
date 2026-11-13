import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../utils/supabase/client';

export type TollV2MetricBucket = {
  count?: number;
  amountMinor?: number;
  oldestAt?: string;
};

export type TollV2MetricsPayload = {
  pendingCharges?: TollV2MetricBucket;
  unverifiedReceipts?: TollV2MetricBucket;
  unallocatedPaybacks?: TollV2MetricBucket;
  afterSeal?: TollV2MetricBucket;
  reviewPairsOpen?: number;
  lastNightly?: { at?: string; failed?: number };
};

export async function fetchTollV2Metrics(): Promise<TollV2MetricsPayload> {
  const { data, error } = await supabase.rpc('toll_v2_metrics');
  if (error) throw error;
  return data as TollV2MetricsPayload;
}

export function useTollV2Metrics(enabled = true) {
  return useQuery({
    queryKey: ['toll-v2-metrics'],
    queryFn: fetchTollV2Metrics,
    enabled,
    staleTime: 30_000,
  });
}

export function metricAgeDays(oldestAt: string | undefined): number | null {
  if (!oldestAt) return null;
  const t = Date.parse(oldestAt);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

export function metricAgeLabel(days: number | null): string {
  if (days == null) return '—';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}
