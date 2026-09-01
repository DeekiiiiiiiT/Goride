import React from 'react';
import { Activity, ShieldCheck, Users, Wifi } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';

/** Read-only courier supply / compliance panel for Rush ops. */
export function SupplyHealthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Supply Health
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Courier online status, compliance, and capacity — read-only Rush supply view.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Online now', value: '—', icon: Wifi },
          { label: 'Compliance OK', value: '—', icon: ShieldCheck },
          { label: 'Active roster', value: '—', icon: Users },
          { label: 'Supply score', value: '—', icon: Activity },
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
          <CardTitle className="text-base">Courier supply snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-700">
            <span className="text-sm text-slate-600 dark:text-slate-300">Live supply feed</span>
            <Badge variant="secondary">Awaiting Rush sync</Badge>
          </div>
          <p className="text-sm text-slate-500">
            Online courier counts and compliance flags will update in real time once Rush supply
            health is connected for your organization.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
