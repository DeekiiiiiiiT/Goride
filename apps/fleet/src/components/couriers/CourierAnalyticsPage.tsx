import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export function CourierAnalyticsPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['courier-analytics', 'rush'],
    queryFn: async () => {
      const [tripsRes, drivers, summary] = await Promise.all([
        api.getTripsFiltered({ platform: 'Roam Rush', limit: 500 }),
        api.getDrivers(),
        api.getRushDeliverySettlementSummary().catch(() => null),
      ]);
      const trips = tripsRes?.trips ?? tripsRes?.data ?? [];
      const courierDrivers = (Array.isArray(drivers) ? drivers : []).filter((d) => {
        const lines = (d as { serviceLines?: string[] }).serviceLines;
        return !lines?.length || lines.includes('rush_delivery');
      });
      const completed = trips.filter(
        (t: { status?: string }) => String(t.status).toLowerCase() === 'completed',
      );
      const gross = completed.reduce(
        (sum: number, t: { amount?: number }) => sum + (Number(t.amount) || 0),
        0,
      );
      return {
        activeCouriers: courierDrivers.length,
        deliveries7d: completed.length,
        avgEarning: completed.length ? gross / completed.length : 0,
        onTimePct: summary?.onTimePct ?? null,
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
      { label: 'Active couriers', value: String(data?.activeCouriers ?? 0) },
      { label: 'Deliveries (recent)', value: String(data?.deliveries7d ?? 0) },
      {
        label: 'On-time %',
        value: data?.onTimePct != null ? `${Math.round(data.onTimePct)}%` : '—',
      },
      {
        label: 'Avg. earnings / delivery',
        value: data?.avgEarning
          ? `J$${data.avgEarning.toFixed(0)}`
          : '—',
      },
    ],
    [data],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Courier Analytics
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Completion rate and courier performance from live delivery data.
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
          <BarChart3 className="h-10 w-10 text-slate-300" />
          <p className="max-w-md text-sm text-slate-500">
            Trend charts will appear as more delivery history accumulates.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
