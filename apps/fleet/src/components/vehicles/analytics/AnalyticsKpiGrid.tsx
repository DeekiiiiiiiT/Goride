import React from 'react';
import { Badge } from '../../ui/badge';
import { Card, CardContent } from '../../ui/card';
import { CarFront, Gauge, Route } from 'lucide-react';
import type { AnalyticsKpis } from '../../../hooks/useVehicleAnalytics';
import { formatJMD } from '../../../utils/formatJMD';
import { Sparkline } from '../../ui/Sparkline';

export { formatJMD, Sparkline };

export function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const up = delta >= 0;
  return (
    <Badge
      className={`text-[10px] font-bold border-0 ${
        up
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
      }`}
    >
      {up ? '+' : ''}
      {delta.toFixed(0)}%
    </Badge>
  );
}

export function AnalyticsKpiGrid({ kpis }: { kpis: AnalyticsKpis }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 md:p-6 flex flex-col gap-3 min-h-[120px]">
            <div className="flex justify-between items-start gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Gross Revenue</span>
              <DeltaBadge delta={kpis.revenueDeltaPct} />
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
                  {formatJMD(kpis.grossRevenue)}
                </h2>
                <p className="text-[11px] text-slate-400">vs previous period</p>
              </div>
              <Sparkline values={kpis.revenueSpark} stroke="#6366f1" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 md:p-6 flex flex-col gap-3 min-h-[120px]">
            <div className="flex justify-between items-start gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Net Profit / Vehicle
              </span>
              <DeltaBadge delta={kpis.netProfitDeltaPct} />
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                {kpis.netProfitPerVehicle != null ? (
                  <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
                    {formatJMD(kpis.netProfitPerVehicle)}{' '}
                    <span className="text-sm font-medium text-slate-400">avg</span>
                  </h2>
                ) : (
                  <h2 className="text-lg font-semibold text-slate-400">Not enough attributed costs</h2>
                )}
                <p className="text-[11px] text-slate-400">
                  {kpis.costCoveragePct != null
                    ? `${kpis.costCoveragePct.toFixed(0)}% of costs attributed to vehicles`
                    : 'Only vehicles with assigned ledger costs'}
                </p>
              </div>
              <Sparkline values={kpis.profitSpark} stroke="#10b981" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 md:p-6 flex flex-col gap-3 min-h-[120px]">
            <div className="flex justify-between items-start gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Drove this period</span>
              <Badge variant="secondary" className="text-[10px] font-bold">
                {kpis.activeRatePct.toFixed(0)}%
              </Badge>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {kpis.activeVehicles}/{kpis.totalVehicles}
                </h2>
                <p className="text-[11px] text-slate-400">
                  {kpis.avgUtilizationPct != null
                    ? `Avg utilization ${kpis.avgUtilizationPct.toFixed(0)}% (imported hours)`
                    : 'Completed ≥1 trip in selected period'}
                </p>
              </div>
              <CarFront className="w-5 h-5 text-slate-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 md:p-6 flex flex-col gap-3 min-h-[120px]">
            <div className="flex justify-between items-start gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Trips & Cancels</span>
              <DeltaBadge delta={kpis.tripsDeltaPct} />
            </div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {kpis.completedTrips.toLocaleString()}
                </h2>
                <p className="text-[11px] text-slate-400">
                  {kpis.cancellationRatePct != null
                    ? `${kpis.cancelledTrips} cancelled · ${kpis.cancellationRatePct.toFixed(1)}% rate`
                    : 'No trip activity'}
                </p>
              </div>
              <Sparkline values={kpis.tripsSpark} stroke="#f59e0b" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 md:p-6 flex flex-col gap-3 min-h-[120px]">
            <div className="flex justify-between items-start gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fleet Mileage</span>
              <DeltaBadge delta={kpis.distanceDeltaPct} />
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
                  {Math.round(kpis.fleetDistanceKm).toLocaleString()} km
                </h2>
                <p className="text-[11px] text-slate-400">Trip distance in period</p>
              </div>
              <Sparkline values={kpis.distanceSpark} stroke="#10b981" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 md:p-6 flex flex-col gap-3 min-h-[120px]">
            <div className="flex justify-between items-start gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Efficiency</span>
              <Gauge className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-slate-400">Rev / trip</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {kpis.revenuePerTrip != null ? formatJMD(kpis.revenuePerTrip) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Rev / km</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {kpis.revenuePerKm != null ? formatJMD(kpis.revenuePerKm, 2) : '—'}
                </p>
              </div>
            </div>
            {kpis.fleetOperatingProfit != null && (
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <Route className="w-3 h-3" />
                Fleet operating profit {formatJMD(kpis.fleetOperatingProfit)}
                {kpis.unattributedCostTotal > 0.005 && (
                  <span className="text-amber-600">
                    · {formatJMD(kpis.unattributedCostTotal)} unassigned
                  </span>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
