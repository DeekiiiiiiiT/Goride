import React from 'react';
import { Fuel, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import { useFuelAnalytics } from '../../../hooks/useFuelAnalytics';
import { FuelAnalyticsToolbar } from './FuelAnalyticsToolbar';
import { FuelAnalyticsKpiGrid } from './FuelAnalyticsKpiGrid';
import { FuelAnalyticsTrends } from './FuelAnalyticsTrends';
import { FuelAnalyticsBreakdown } from './FuelAnalyticsBreakdown';
import { FuelAnalyticsAnomalies } from './FuelAnalyticsAnomalies';
import { FuelAnalyticsTables } from './FuelAnalyticsTables';
import { toast } from 'sonner';

export function FuelAnalytics({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const analytics = useFuelAnalytics();
  const {
    loading,
    loadError,
    hasData,
    entriesTruncated,
    entriesTotalCount,
    entriesReturned,
    period,
    setPreset,
    setCustomStart,
    setCustomEnd,
    fuelTypeFilter,
    setFuelTypeFilter,
    fuelTypeOptions,
    bodyTypeFilter,
    setBodyTypeFilter,
    bodyTypeOptions,
    tableSearch,
    setTableSearch,
    kpis,
    dailyConsumption,
    efficiencyTrend,
    heatmap,
    composition,
    priceSeries,
    flaggedEvents,
    leaderboard,
    tableRows,
    recentLog,
    vehicleMap,
    targetKmL,
    refresh,
    exportCsv,
  } = analytics;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm text-slate-500">Loading fuel analytics…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center px-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Could not load fuel data</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
            The fuel API failed — this is not the same as zero spend. Retry or check your connection.
          </p>
        </div>
        <Button variant="outline" className="min-h-11" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center px-4">
        <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
          <Fuel className="h-10 w-10 text-slate-400" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">No fuel data yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
            Log refuels or sync gas-card transactions to unlock the Precision Operations Hub.
          </p>
        </div>
        <Button variant="outline" className="min-h-11" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {entriesTruncated && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          Showing {entriesReturned.toLocaleString()} of {entriesTotalCount.toLocaleString()} entries — narrow the period for complete KPIs.
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
            <Fuel className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Fuel Analytics</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Precision Operations Hub — cost, efficiency, anomalies, and refuel activity
            </p>
          </div>
        </div>
        <Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <FuelAnalyticsToolbar
        period={period}
        onPreset={setPreset}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
        fuelTypeFilter={fuelTypeFilter}
        onFuelType={setFuelTypeFilter}
        fuelTypeOptions={fuelTypeOptions}
        bodyTypeFilter={bodyTypeFilter}
        onBodyType={setBodyTypeFilter}
        bodyTypeOptions={bodyTypeOptions}
        onExport={() => {
          exportCsv();
          toast.success('Fuel analytics CSV exported');
        }}
      />

      <FuelAnalyticsKpiGrid kpis={kpis} />

      <FuelAnalyticsTrends
        daily={dailyConsumption}
        efficiencyTrend={efficiencyTrend}
        targetKmL={targetKmL}
      />

      <FuelAnalyticsBreakdown leaderboard={leaderboard} heatmap={heatmap} />

      <FuelAnalyticsAnomalies
        flagged={flaggedEvents}
        composition={composition}
        priceSeries={priceSeries}
      />

      <FuelAnalyticsTables
        tableRows={tableRows}
        recentLog={recentLog}
        vehicleMap={vehicleMap}
        tableSearch={tableSearch}
        onSearch={setTableSearch}
        onViewAllLogs={() => onNavigate?.('fuel-logs')}
      />
    </div>
  );
}
