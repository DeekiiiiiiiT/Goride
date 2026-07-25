import React from 'react';
import { Badge } from '../../ui/badge';
import { Card, CardContent } from '../../ui/card';
import { Sparkline, formatJMD } from '../../vehicles/analytics/AnalyticsKpiGrid';
import type { FuelAnalyticsKpis } from '../../../hooks/useFuelAnalytics';

/** Cost-up / efficiency-down = bad (rose). Pass invertGood when higher is better. */
function TrendBadge({
  delta,
  invertGood = false,
  absolute,
}: {
  delta: number | null;
  invertGood?: boolean;
  absolute?: number | null;
}) {
  if (delta === null && (absolute == null)) return null;
  if (absolute != null && delta === null) {
    const up = absolute >= 0;
    return (
      <Badge
        className={`text-[10px] font-bold border-0 ${
          up
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
        }`}
      >
        {up ? '+' : ''}
        {absolute}
      </Badge>
    );
  }
  if (delta === null) return null;
  const good = invertGood ? delta >= 0 : delta <= 0;
  return (
    <Badge
      className={`text-[10px] font-bold border-0 ${
        Math.abs(delta) < 0.05
          ? 'bg-slate-100 text-slate-600'
          : good
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
      }`}
    >
      {delta >= 0 ? '+' : ''}
      {delta.toFixed(1)}%
    </Badge>
  );
}

export function FuelAnalyticsKpiGrid({ kpis }: { kpis: FuelAnalyticsKpis }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
      <Card>
        <CardContent className="p-4 flex flex-col justify-between min-h-[120px] gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Total Fuel Cost
            </p>
            <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {formatJMD(kpis.totalCost, 2)}
            </h3>
          </div>
          <div className="flex items-end justify-between gap-2">
            <TrendBadge delta={kpis.costDeltaPct} />
            <Sparkline values={kpis.costSpark} stroke="#ef4444" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between min-h-[120px] gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Fuel Volume
            </p>
            <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {kpis.totalLiters.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
            </h3>
          </div>
          <div className="flex items-end justify-between gap-2">
            <TrendBadge delta={kpis.litersDeltaPct} />
            <Sparkline values={kpis.litersSpark} stroke="#10b981" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between min-h-[120px] gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Avg Efficiency
            </p>
            <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {kpis.avgEfficiencyKmL != null ? `${kpis.avgEfficiencyKmL.toFixed(1)} km/L` : '—'}
            </h3>
          </div>
          <div className="flex items-end justify-between gap-2">
            <TrendBadge delta={kpis.efficiencyDeltaPct} invertGood />
            <Sparkline values={kpis.efficiencySpark} stroke="#10b981" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between min-h-[120px] gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Cost per KM
            </p>
            <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {kpis.costPerKm != null ? formatJMD(kpis.costPerKm, 2) : '—'}
            </h3>
          </div>
          <div className="flex items-end justify-between gap-2">
            <TrendBadge delta={kpis.costPerKmDeltaPct} />
            <Sparkline values={kpis.costPerKmSpark} stroke="#64748b" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between min-h-[120px] gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Refueling Events
            </p>
            <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {kpis.refuelCount.toLocaleString()}
            </h3>
          </div>
          <div className="flex items-end justify-between gap-2">
            <TrendBadge delta={null} absolute={kpis.refuelDelta} />
            <Sparkline values={kpis.refuelSpark} stroke="#10b981" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between min-h-[120px] gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Potential Loss
            </p>
            <h3 className="text-xl md:text-2xl font-bold text-rose-600">
              {formatJMD(kpis.potentialLoss, 2)}
            </h3>
          </div>
          <div className="flex items-end justify-between gap-2">
            {kpis.potentialLoss > 0 ? (
              <Badge className="text-[10px] font-bold border-0 bg-rose-100 text-rose-700">High</Badge>
            ) : (
              <Badge className="text-[10px] font-bold border-0 bg-emerald-100 text-emerald-700">
                Clear
              </Badge>
            )}
            <Sparkline values={kpis.lossSpark} stroke="#ef4444" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
