/**
 * Driver Overview tab — integrity banner, metrics grid, distance gauges.
 */
import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Stethoscope } from 'lucide-react';
import { OverviewMetricsGrid } from '../OverviewMetricsGrid';
import { DistanceByPlatform } from '../DistanceByPlatform';
import type { LedgerDriverOverview } from '../../../types/data';

export type DriverOverviewTabProps = {
  driverStatus?: string;
  ledgerOverview: LedgerDriverOverview | null;
  ledgerOverviewLoaded: boolean;
  serverTripsLoaded: boolean;
  repairInProgress: boolean;
  repairResult: any;
  tripGapDiagLoading: boolean;
  onTripLedgerGapDiagnostic: () => void;
  /** Gate Repair Now — transactions.edit or data.backfill */
  canRepairLedger?: boolean;
  onRepairLedger: () => void;
  resolvedFinancials: any;
  metrics: any;
  isToday: boolean;
  driverId: string;
  walletRange: { startDate: string; endDate: string } | null;
  platformFilterAllPlatforms: boolean;
};

export function DriverOverviewTab({
  driverStatus,
  ledgerOverview,
  ledgerOverviewLoaded,
  serverTripsLoaded,
  repairInProgress,
  repairResult,
  tripGapDiagLoading,
  onTripLedgerGapDiagnostic,
  canRepairLedger = false,
  onRepairLedger,
  resolvedFinancials,
  metrics,
  isToday,
  driverId,
  walletRange,
  platformFilterAllPlatforms,
}: DriverOverviewTabProps) {
  return (
    <div className="space-y-6">
      {driverStatus === 'Inactive' && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-start gap-4 animate-pulse">
          <div className="p-2 bg-rose-100 rounded-full">
            <AlertTriangle className="h-6 w-6 text-rose-600" />
          </div>
          <div>
            <h3 className="text-sm font-black text-rose-900 uppercase tracking-widest">Driver Terminated</h3>
            <p className="text-xs text-rose-700 mt-1 font-medium leading-relaxed">
              This driver account is inactive. Ensure all fuel cards are collected and deactivated.
              Manual ledger operations are restricted for terminated assets to prevent data drift.
            </p>
          </div>
        </div>
      )}

      {ledgerOverview?.completeness && !ledgerOverview.completeness.isComplete && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-xl flex items-start gap-4">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-full shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">Ledger Integrity Gap Detected</h3>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              {ledgerOverview.completeness.totalTrips} completed trips found but only{' '}
              {ledgerOverview.completeness.ledgerTrips} have ledger entries (
              {ledgerOverview.completeness.missingCount} missing).
              {ledgerOverview.completeness.byPlatform &&
                Object.entries(
                  ledgerOverview.completeness.byPlatform as Record<string, { trips: number; ledger: number }>,
                )
                  .filter(([_, v]) => v.trips !== v.ledger)
                  .map(([p, v]) => ` ${p}: ${v.trips} trips / ${v.ledger} ledger`)
                  .join(';')}
            </p>
            {repairResult?.success && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Repair complete — {repairResult.stats?.ledgerRowsWritten || 0} ledger rows written from{' '}
                {repairResult.stats?.tripsLoaded || 0} trips ({repairResult.durationMs}ms)
              </p>
            )}
            {repairResult?.success === false && (
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
                Repair failed: {repairResult.error}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <button
              type="button"
              onClick={onTripLedgerGapDiagnostic}
              disabled={tripGapDiagLoading}
              className="px-3 py-1.5 text-xs font-semibold border border-amber-700/40 bg-white dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 rounded-lg hover:bg-amber-100/80 dark:hover:bg-amber-900/50 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
            >
              {tripGapDiagLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Diagnosing…
                </>
              ) : (
                <>
                  <Stethoscope className="h-3.5 w-3.5" /> Diagnose
                </>
              )}
            </button>
            {canRepairLedger && (
              <button
                type="button"
                onClick={onRepairLedger}
                disabled={repairInProgress}
                className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
              >
                {repairInProgress ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Repairing...
                  </>
                ) : (
                  'Repair Now'
                )}
              </button>
            )}
          </div>
        </div>
      )}

      <OverviewMetricsGrid
        resolvedFinancials={resolvedFinancials}
        metrics={metrics}
        uberPaymentCsvRollup={metrics.uberPaymentCsvRollup}
        earningsLoading={!ledgerOverviewLoaded}
        tripsLoading={!serverTripsLoaded}
        tollsLoading={!ledgerOverviewLoaded}
        isToday={!!isToday}
        driverId={driverId}
        walletRange={walletRange}
        platformFilterAllPlatforms={platformFilterAllPlatforms}
      />

      <DistanceByPlatform
        perPlatformDistance={metrics.perPlatformDistance}
        loading={!serverTripsLoaded}
      />
    </div>
  );
}
