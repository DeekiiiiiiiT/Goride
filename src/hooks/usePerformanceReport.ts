import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { DriverPerformanceSummary } from '../types/performance';
import { toast } from 'sonner@2.0.3';
import { subDays, format } from 'date-fns';

export function usePerformanceReport(options?: { dailyRideTarget?: number, dailyEarningsTarget?: number }) {
  const [data, setData] = useState<DriverPerformanceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Default range: Last 30 days
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date()
  });

  const fetchReport = useCallback(async () => {
    if (!dateRange.from || !dateRange.to) return;
    
    setLoading(true);
    setError(null);
    try {
      const result = await api.getPerformanceReport(
        format(dateRange.from, 'yyyy-MM-dd'),
        format(dateRange.to, 'yyyy-MM-dd'),
        options
      );
      setData(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      toast.error("Failed to load performance report");
    } finally {
      setLoading(false);
    }
  }, [dateRange, options?.dailyRideTarget, options?.dailyEarningsTarget]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return {
    data,
    loading,
    error,
    dateRange,
    setDateRange,
    refresh: fetchReport
  };
}
