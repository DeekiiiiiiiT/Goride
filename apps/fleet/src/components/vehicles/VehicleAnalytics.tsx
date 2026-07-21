import React from 'react';
import { BarChart3, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { useVehicleAnalytics } from '../../hooks/useVehicleAnalytics';
import { AnalyticsPeriodToolbar } from './analytics/AnalyticsPeriodToolbar';
import { AnalyticsKpiGrid } from './analytics/AnalyticsKpiGrid';
import { AnalyticsFinancialSection } from './analytics/AnalyticsFinancialSection';
import { AnalyticsUtilizationSection } from './analytics/AnalyticsUtilizationSection';
import { AnalyticsVehicleHealthPanel } from './analytics/AnalyticsVehicleHealthPanel';
import { AnalyticsMaintenanceSection } from './analytics/AnalyticsMaintenanceSection';

export function VehicleAnalytics({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const analytics = useVehicleAnalytics();
  const {
    loading,
    hasTrips,
    hasVehicles,
    period,
    preset,
    setPreset,
    customStart,
    customEnd,
    setCustomStart,
    setCustomEnd,
    clearPeriod,
    kpis,
    leaderboard,
    leaderboardSort,
    setLeaderboardSort,
    costByVehicle,
    dailyCostBreakdown,
    commissionRows,
    profitScatter,
    heatmap,
    getHeatCellTrips,
    idleRows,
    statusBoard,
    maintenanceAlerts,
    periodMaintenanceLogs,
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    selectedVehicle,
    selectedDailyMileage,
    selectedFuelSummary,
    selectedServiceWarning,
    odoLoading,
    fuelLoading,
    refresh,
  } = analytics;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm text-slate-500">Loading vehicle analytics…</p>
      </div>
    );
  }

  if (!hasVehicles && !hasTrips) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center px-4">
        <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
          <BarChart3 className="h-10 w-10 text-slate-400" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">No fleet data yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
            Add vehicles and import trips to see fleet performance analytics here.
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
            <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Vehicle Analytics</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Fleet performance hub — revenue, costs, utilization, and health
            </p>
          </div>
        </div>
        <Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <AnalyticsPeriodToolbar
        period={period}
        preset={preset}
        onPreset={setPreset}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
        onClear={clearPeriod}
      />

      <AnalyticsKpiGrid kpis={kpis} />

      <AnalyticsFinancialSection
        leaderboard={leaderboard}
        leaderboardSort={leaderboardSort}
        onSort={setLeaderboardSort}
        costByVehicle={costByVehicle}
        profitScatter={profitScatter}
        dailyCostBreakdown={dailyCostBreakdown}
        commissionRows={commissionRows}
        onSelectVehicle={setSelectedVehicleId}
      />

      <AnalyticsUtilizationSection
        heatmap={heatmap}
        getHeatCellTrips={getHeatCellTrips}
        idleRows={idleRows}
        statusBoard={statusBoard}
        vehicles={vehicles}
        onSelectVehicle={setSelectedVehicleId}
      />

      <AnalyticsVehicleHealthPanel
        vehicles={vehicles}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={setSelectedVehicleId}
        selectedVehicle={selectedVehicle}
        selectedDailyMileage={selectedDailyMileage}
        selectedFuelSummary={selectedFuelSummary}
        selectedServiceWarning={selectedServiceWarning}
        odoLoading={odoLoading}
        fuelLoading={fuelLoading}
      />

      <AnalyticsMaintenanceSection
        alerts={maintenanceAlerts}
        logs={periodMaintenanceLogs}
        vehicles={vehicles}
        onNavigate={onNavigate}
        onSelectVehicle={setSelectedVehicleId}
      />
    </div>
  );
}
