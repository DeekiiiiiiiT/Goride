import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ShieldCheck, Users, Wifi, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';

/** Read-only courier supply / compliance panel for delivery ops. */
export function SupplyHealthPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['supply-health'],
    queryFn: async () => {
      const [drivers, cash, summary] = await Promise.all([
        api.getDrivers(),
        api.getRushCourierCashBalances().catch(() => ({ balances: [] })),
        api.getRushDeliverySettlementSummary().catch(() => null),
      ]);
      const roster = (Array.isArray(drivers) ? drivers : []).filter((d) => {
        const lines = (d as { serviceLines?: string[] }).serviceLines;
        return !lines?.length || lines.includes('rush_delivery');
      });
      const active = roster.filter(
        (d) => String((d as { status?: string }).status).toLowerCase() === 'active',
      );
      const paused = (cash?.balances ?? []).filter(
        (b: { isPaused?: boolean }) => b.isPaused,
      ).length;
      const blockers = roster.filter(
        (d) =>
          Array.isArray((d as { complianceBlockers?: unknown[] }).complianceBlockers) &&
          ((d as { complianceBlockers: unknown[] }).complianceBlockers.length > 0),
      ).length;
      return {
        onlineEstimate: active.length,
        rosterSize: roster.length,
        complianceOk: roster.length - blockers,
        pausedCouriers: paused,
        deliveriesRecent: summary?.totalDeliveries ?? summary?.courierCount ?? null,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Supply Health
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Courier roster, compliance, and COD pause status — read-only.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Active roster', value: String(data?.rosterSize ?? '—'), icon: Users },
          { label: 'Compliance clear', value: String(data?.complianceOk ?? '—'), icon: ShieldCheck },
          { label: 'COD paused', value: String(data?.pausedCouriers ?? 0), icon: Wifi },
          { label: 'Recent deliveries', value: String(data?.deliveriesRecent ?? '—'), icon: Activity },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{kpi.label}</CardTitle>
              <kpi.icon className="h-4 w-4 text-slate-400" />
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
        <CardHeader>
          <CardTitle className="text-base">Supply notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-700">
            <span className="text-sm text-slate-600 dark:text-slate-300">Dispatch</span>
            <Badge variant="secondary">Platform-managed</Badge>
          </div>
          <p className="text-sm text-slate-500">
            Roam dispatches offers to your couriers. Fleet owners do not control dispatch in v1.
            Couriers with COD balances above the pause threshold stop receiving offers until Roam
            collects cash.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
