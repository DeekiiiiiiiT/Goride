import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { DriverPerformanceSummary } from '../types/performance';
import { toast } from 'sonner@2.0.3';
import { subDays, format } from 'date-fns';

export interface UsePerformanceReportOptions {
  dailyRideTarget?: number;
  dailyEarningsTarget?: number;
  summaryOnly?: boolean;
  limit?: number;
}

export function usePerformanceReport(options?: UsePerformanceReportOptions) {
  const [data, setData] = useState<DriverPerformanceSummary[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  
  // Default range: Last 30 days
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date()
  });

  const limit = options?.limit || 50;

  const fetchReport = useCallback(async (isLoadMore = false) => {
    if (!dateRange.from || !dateRange.to) return;
    
    if (isLoadMore) {
        setLoadingMore(true);
    } else {
        setLoading(true);
    }
    setError(null);

    try {
      const currentOffset = isLoadMore ? offset : 0;
      
      const result = await api.getPerformanceReport(
        format(dateRange.from, 'yyyy-MM-dd'),
        format(dateRange.to, 'yyyy-MM-dd'),
        {
            ...options,
            offset: currentOffset,
            limit
        }
      );

      if (isLoadMore) {
          setData(prev => [...prev, ...result.data]);
          setOffset(prev => prev + limit);
      } else {
          setData(result.data);
          setTotal(result.total);
          setOffset(limit); // Next offset
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      toast.error("Failed to load performance report");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [dateRange, options?.dailyRideTarget, options?.dailyEarningsTarget, options?.summaryOnly, limit, offset]);

  // Reset offset when date range or options change (except offset itself which is handled in fetch)
  useEffect(() => {
    // We don't call fetchReport here directly because we want to reset state first
    // Actually, we should just call fetchReport(false) which is "fresh load"
    fetchReport(false);
    // Note: We intentionally exclude 'offset' from dependency array to prevent loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.from, dateRange.to, options?.summaryOnly, options?.dailyRideTarget, options?.dailyEarningsTarget]);

  const loadMore = useCallback(() => {
    if (data.length < total && !loading && !loadingMore) {
        fetchReport(true);
    }
  }, [data.length, total, loading, loadingMore, fetchReport]);

  return {
    data,
    total,
    loading,
    loadingMore,
    error,
    dateRange,
    setDateRange,
    refresh: () => fetchReport(false),
    loadMore,
    hasMore: data.length < total
  };
}
