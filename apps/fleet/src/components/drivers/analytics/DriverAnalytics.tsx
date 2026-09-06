import React, { useEffect, useRef, useState } from 'react';
import { Users, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import { useDriverAnalytics } from '../../../hooks/useDriverAnalytics';
import { DriverAnalyticsToolbar } from './DriverAnalyticsToolbar';
import { DriverAnalyticsKpiGrid } from './DriverAnalyticsKpiGrid';
import { DriverAnalyticsLeaderboard } from './DriverAnalyticsLeaderboard';
import { DriverAnalyticsPanels } from './DriverAnalyticsPanels';
import { toast } from 'sonner';
import { usePermissions } from '../../../hooks/usePermissions';
import { api } from '../../../services/api';

export function DriverAnalytics({
  onNavigate,
  onSelectDriver,
}: {
  onNavigate?: (page: string) => void;
  onSelectDriver?: (driverId: string) => void;
}) {
  const analytics = useDriverAnalytics();
  const { canAny } = usePermissions();
  const canRebuildOps = canAny('data.backfill', 'transactions.edit');
  const [rebuildingOps, setRebuildingOps] = useState(false);
  const emptyToastShown = useRef(false);
  const {
    loading,
    hasData,
    period,
    setPreset,
    setCustomStart,
    setCustomEnd,
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
    opsRollupEmpty,
  } = analytics;

  const rebuildOps = async () => {
    setRebuildingOps(true);
    try {
      const res = await api.rebuildOrgOperationalPeriods(period.startYmd, period.endYmd);
      toast.success(
        `Operational periods rebuilt (${res.weeksUpserted} weeks · ${res.driversTouched} drivers)`,
      );
      emptyToastShown.current = false;
      refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Rebuild failed');
    } finally {
      setRebuildingOps(false);
    }
  };

  useEffect(() => {
    if (loading || !opsRollupEmpty || emptyToastShown.current) return;
    emptyToastShown.current = true;
    if (canRebuildOps) {
      toast.message('Operational periods not rebuilt yet', {
        description: 'Trip/rate Analytics KPIs stay empty until weekly ops periods are rebuilt.',
        action: {
          label: 'Rebuild now',
          onClick: () => {
            void rebuildOps();
          },
        },
        duration: 12_000,
      });
    } else {
      toast.message('Operational periods not rebuilt yet', {
        description: 'Ask an admin with backfill permission to rebuild org operational periods.',
        duration: 10_000,
      });
    }
    // One toast per empty rollup load; rebuildOps is stable enough via refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, opsRollupEmpty, canRebuildOps]);

  const openDriver = (driverId: string) => {
    if (onSelectDriver) {
      onSelectDriver(driverId);
      return;
    }
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
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {opsRollupEmpty && canRebuildOps ? (
            <Button
              variant="secondary"
              className="min-h-11 w-full sm:w-auto"
              disabled={rebuildingOps}
              onClick={() => void rebuildOps()}
            >
              {rebuildingOps ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Rebuild ops periods
            </Button>
          ) : null}
          <Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <DriverAnalyticsToolbar
        period={period}
        onPreset={setPreset}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
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
