import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export function DeliveryAnalyticsPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['delivery-analytics', 'rush'],
    queryFn: async () => {
      const res = await api.getTripsFiltered({ platform: 'Roam Rush', limit: 500 });
      const trips = res?.trips ?? res?.data ?? [];
      const today = new Date().toISOString().slice(0, 10);
      const completed = trips.filter(
        (t: { status?: string }) => String(t.status).toLowerCase() === 'completed',
      );
      const cancelled = trips.filter((t: { status?: string }) =>
        String(t.status).toLowerCase().includes('cancel'),
      );
      const todayCount = completed.filter(
        (t: { date?: string; completed_at?: string }) =>
          String(t.completed_at ?? t.date ?? '').slice(0, 10) === today,
      ).length;
      const revenue = completed.reduce(
        (sum: number, t: { amount?: number }) => sum + (Number(t.amount) || 0),
        0,
      );
      const total = completed.length + cancelled.length;
      return {
        todayCount,
        revenue7d: revenue,
        cancelRate: total ? (cancelled.length / total) * 100 : 0,
        tripCount: completed.length,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const kpis = useMemo(
    () => [
      { label: 'Deliveries today', value: String(data?.todayCount ?? 0) },
      {
        label: 'Courier revenue (recent)',
        value: data?.revenue7d ? `J$${data.revenue7d.toFixed(0)}` : '—',
      },
      { label: 'Completed trips', value: String(data?.tripCount ?? 0) },
      {
        label: 'Cancellation rate',
        value: data?.cancelRate != null ? `${data.cancelRate.toFixed(1)}%` : '—',
      },
    ],
    [data],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Delivery Analytics
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Delivery volume and revenue from synced Roam Rush trips.
          </p>
        </div>
        <Button variant="outline" className="min-h-11" disabled={isFetching} onClick={() => refetch()}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                {kpi.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <LineChart className="h-10 w-10 text-slate-300" />
          <p className="max-w-md text-sm text-slate-500">
            Zone and peak-hour charts will populate as delivery history grows.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
