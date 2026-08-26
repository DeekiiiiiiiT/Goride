import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import { petrojamPricesService } from '../../../services/petrojamPricesService';
import { retailMarkupService } from '../../../services/retailMarkupService';
import { fuelService } from '../../../services/fuelService';
import {
  resolveRetailEstimate,
  isPriceOutlier,
  type FuelGrade,
} from '@roam/fuel-core';

function paidPerLiter(amount?: number, liters?: number): number | null {
  if (!(Number(liters) > 0) || !(Number(amount) > 0)) return null;
  return Number(amount) / Number(liters);
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `J$${n.toFixed(2)}`;
}

export function FuelCostAnalyticsPage() {
  const [grade, setGrade] = useState<FuelGrade>('gasolene90');

  const pricesQ = useQuery({
    queryKey: ['petrojam-prices-cost-analytics'],
    queryFn: () => petrojamPricesService.listPrices({ limit: 120 }),
    staleTime: 5 * 60 * 1000,
  });

  const markupQ = useQuery({
    queryKey: ['retail-markup-versions'],
    queryFn: () => retailMarkupService.listVersions(),
    staleTime: 5 * 60 * 1000,
  });

  const entriesQ = useQuery({
    queryKey: ['fuel-cost-analytics-entries'],
    queryFn: () =>
      fuelService.getFuelEntries({ limit: 1500 }).catch(() => [] as any[]),
    staleTime: 2 * 60 * 1000,
  });

  const loading = pricesQ.isLoading || markupQ.isLoading || entriesQ.isLoading;

  const latestWholesale = pricesQ.data?.[0];
  const estimate = useMemo(() => {
    if (!latestWholesale || !markupQ.data?.length) return null;
    return resolveRetailEstimate({
      wholesale: {
        priceDate: latestWholesale.priceDate,
        gasolene87: latestWholesale.gasolene87,
        gasolene90: latestWholesale.gasolene90,
        autoDiesel: latestWholesale.autoDiesel,
        ulsd: latestWholesale.ulsd,
      },
      markupVersions: markupQ.data,
      grade,
    });
  }, [latestWholesale, markupQ.data, grade]);

  const fleetPaid = useMemo(() => {
    const rows = Array.isArray(entriesQ.data) ? entriesQ.data : [];
    let cost = 0;
    let liters = 0;
    const outliers: { id: string; vendor?: string; paid: number; date?: string }[] = [];
    for (const e of rows) {
      const p = paidPerLiter(e.amount, e.liters);
      if (p == null) continue;
      cost += Number(e.amount) || 0;
      liters += Number(e.liters) || 0;
      if (estimate && isPriceOutlier(p, estimate.retailEstimateJmd)) {
        outliers.push({
          id: e.id,
          vendor: e.vendor || e.location,
          paid: p,
          date: e.date,
        });
      }
    }
    return {
      avgPaid: liters > 0 ? cost / liters : null,
      liters,
      outlierCount: outliers.length,
      outliers: outliers.slice(0, 25),
    };
  }, [entriesQ.data, estimate]);

  const gap =
    fleetPaid.avgPaid != null && estimate
      ? fleetPaid.avgPaid - estimate.retailEstimateJmd
      : null;

  const exportCsv = () => {
    const lines = [
      'date,vendor,paid_jmd_per_l,estimate_jmd_per_l,gap',
      ...fleetPaid.outliers.map(
        (o) =>
          `${o.date || ''},"${(o.vendor || '').replace(/"/g, '""')}",${o.paid.toFixed(2)},${estimate?.retailEstimateJmd?.toFixed(2) || ''},${estimate ? (o.paid - estimate.retailEstimateJmd).toFixed(2) : ''}`,
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fuel-cost-outliers.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        <p className="text-sm text-slate-500">Loading fuel cost analytics…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <BarChart3 className="h-5 w-5" />
            <h1 className="text-xl font-semibold tracking-tight">Fuel Cost Analytics</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">
            National wholesale (Petrojam) plus published retail markup versus fleet paid $/L.
            Wholesale alone is not pump price.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={grade}
            onChange={(e) => setGrade(e.target.value as FuelGrade)}
          >
            <option value="gasolene90">Gasolene 90</option>
            <option value="gasolene87">Gasolene 87</option>
            <option value="autoDiesel">Auto diesel</option>
            <option value="ulsd">ULSD</option>
          </select>
          <Button
            variant="outline"
            className="min-h-10"
            onClick={() => {
              void pricesQ.refetch();
              void markupQ.refetch();
              void entriesQ.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" className="min-h-10" onClick={exportCsv} disabled={!fleetPaid.outliers.length}>
            <Download className="h-4 w-4 mr-2" />
            Export outliers
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Retail estimate</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{fmt(estimate?.retailEstimateJmd)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Wholesale {fmt(estimate?.wholesaleJmd)} + markup {fmt(estimate?.markupJmd)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Fleet paid avg</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{fmt(fleetPaid.avgPaid)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {fleetPaid.liters.toFixed(0)} L in sample window
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Gap (paid − estimate)</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{fmt(gap)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {fleetPaid.outlierCount} fills ≥18% above estimate
          </p>
        </div>
      </div>

      {!markupQ.data?.length && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          No published retail markup versions yet. Publish one under Prices / markup admin to unlock estimates.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-medium">
          Price outliers
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Vendor</th>
                <th className="px-4 py-2 font-medium">Paid / L</th>
                <th className="px-4 py-2 font-medium">Estimate / L</th>
              </tr>
            </thead>
            <tbody>
              {fleetPaid.outliers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No outliers in the current sample.
                  </td>
                </tr>
              ) : (
                fleetPaid.outliers.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 tabular-nums">{String(o.date || '').split('T')[0]}</td>
                    <td className="px-4 py-2">{o.vendor || '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{fmt(o.paid)}</td>
                    <td className="px-4 py-2 tabular-nums">{fmt(estimate?.retailEstimateJmd)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
