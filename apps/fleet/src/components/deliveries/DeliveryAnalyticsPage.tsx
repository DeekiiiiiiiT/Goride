import React from 'react';
import { LineChart, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export function DeliveryAnalyticsPage() {
  const [loading, setLoading] = React.useState(false);

  const refresh = () => {
    setLoading(true);
    window.setTimeout(() => setLoading(false), 600);
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Delivery Analytics
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Zone demand, peak hours, and delivery volume from Roam Rush.
          </p>
        </div>
        <Button variant="outline" className="min-h-11" onClick={refresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Deliveries today', value: '—' },
          { label: 'Revenue (7d)', value: '—' },
          { label: 'Avg. distance', value: '—' },
          { label: 'Cancellation rate', value: '—' },
        ].map((kpi) => (
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
            Delivery trend charts will populate when Rush trips are synced to your fleet ledger.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
