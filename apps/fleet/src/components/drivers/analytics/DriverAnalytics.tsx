import React from 'react';
import { Users, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import { useDriverAnalytics } from '../../../hooks/useDriverAnalytics';
import { DriverAnalyticsToolbar } from './DriverAnalyticsToolbar';
import { DriverAnalyticsKpiGrid } from './DriverAnalyticsKpiGrid';
import { DriverAnalyticsLeaderboard } from './DriverAnalyticsLeaderboard';
import { DriverAnalyticsPanels } from './DriverAnalyticsPanels';
import { toast } from 'sonner@2.0.3';

export function DriverAnalytics({
  onNavigate,
  onSelectDriver,
}: {
  onNavigate?: (page: string) => void;
  onSelectDriver?: (driverId: string) => void;
}) {
  const analytics = useDriverAnalytics();
  const {
    loading,
    hasData,
    period,
    preset,
    setPreset,
    customStart,
    customEnd,
    setCustomStart,
    setCustomEnd,
    clearPeriod,
    search,
    setSearch,
    leaderboardMode,
    setLeaderboardMode,
    tierFilter,
    setTierFilter,
    tierOptions,
    kpis,
    leaderboard,
    heatmap,
    platformMix,
    alerts,
    tenure,
    refresh,
    exportCsv,
  } = analytics;

  const openDriver = (driverId: string) => {
    if (onSelectDriver) {
      onSelectDriver(driverId);
      return;
    }
    // Soft handoff: Drivers page can read selection from session
    try {
      sessionStorage.setItem('driver_analytics_focus_id', driverId);
    } catch {
      /* ignore */
    }
    onNavigate?.('drivers');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm text-slate-500">Loading driver analytics…</p>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center px-4">
        <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
          <Users className="h-10 w-10 text-slate-400" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">No driver data yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
            Add drivers and import trips or quality reports to unlock the Workforce Performance Hub.
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
            <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Driver Analytics</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Workforce Performance Hub — earnings, quality, and activity
            </p>
          </div>
        </div>
        <Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <DriverAnalyticsToolbar
        period={period}
        preset={preset}
        onPreset={setPreset}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
        onClear={clearPeriod}
        tierFilter={tierFilter}
        onTierFilter={setTierFilter}
        tierOptions={tierOptions}
        onExport={() => {
          exportCsv();
          toast.success('Driver analytics CSV exported');
        }}
      />

      <DriverAnalyticsKpiGrid kpis={kpis} />

      <DriverAnalyticsLeaderboard
        rows={leaderboard}
        mode={leaderboardMode}
        onMode={setLeaderboardMode}
        search={search}
        onSearch={setSearch}
        onSelectDriver={openDriver}
      />

      <DriverAnalyticsPanels
        alerts={alerts}
        platformMix={platformMix}
        heatmap={heatmap}
        tenure={tenure}
        onSelectDriver={openDriver}
      />
    </div>
  );
}
