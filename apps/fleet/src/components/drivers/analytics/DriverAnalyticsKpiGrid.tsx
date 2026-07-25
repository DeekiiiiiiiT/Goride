import React from 'react';
import { Star } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Card, CardContent } from '../../ui/card';
import { Sparkline, formatJMD } from '../../vehicles/analytics/AnalyticsKpiGrid';
import type { DriverKpis } from '../../../utils/driverAnalyticsAggregates';

/** Higher-is-better delta (revenue, active, util, accept, rating). */
function GoodUpBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const up = delta >= 0;
  return (
    <Badge
      className={`text-[10px] font-bold border-0 ${
        Math.abs(delta) < 0.05
          ? 'bg-slate-100 text-slate-600'
          : up
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-rose-100 text-rose-700'
      }`}
    >
      {delta >= 0 ? '+' : ''}
      {delta.toFixed(1)}%
    </Badge>
  );
}

export function DriverAnalyticsKpiGrid({ kpis }: { kpis: DriverKpis }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
      <Card>
        <CardContent className="p-4 flex flex-col justify-between min-h-[128px] gap-3">
          <div className="flex justify-between items-start gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Drivers
            </span>
            <GoodUpBadge delta={kpis.activeDeltaPct} />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-indigo-600">
              {kpis.activeDrivers}
              <span className="text-sm font-medium text-slate-400"> / {kpis.totalDrivers}</span>
            </h3>
          </div>
          <div className="h-2 w-full bg-indigo-50 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full"
              style={{ width: `${Math.min(100, kpis.activeRatePct)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between min-h-[128px] gap-3">
          <div className="flex justify-between items-start gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Gross Revenue
            </span>
            <GoodUpBadge delta={kpis.revenueDeltaPct} />
          </div>
          <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
            {formatJMD(kpis.grossRevenue)}
          </h3>
          <Sparkline values={kpis.revenueSpark} stroke="#10b981" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between min-h-[128px] gap-3">
          <div className="flex justify-between items-start gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Avg Earnings
            </span>
            <GoodUpBadge delta={kpis.avgEarningsDeltaPct} />
          </div>
          <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {kpis.avgEarnings != null ? formatJMD(kpis.avgEarnings) : '—'}
          </h3>
          <p className="text-[11px] text-slate-400">Per active driver in period</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between min-h-[128px] gap-3">
          <div className="flex justify-between items-start gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Utilization
            </span>
            <GoodUpBadge delta={kpis.utilizationDeltaPct} />
          </div>
          <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {kpis.utilizationPct != null ? `${kpis.utilizationPct.toFixed(0)}%` : '—'}
          </h3>
          <p className="text-[11px] text-slate-400">On-trip ÷ online hours (imported)</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between min-h-[128px] gap-3">
          <div className="flex justify-between items-start gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Acceptance
            </span>
            <GoodUpBadge delta={kpis.acceptanceDeltaPct} />
          </div>
          <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {kpis.acceptancePct != null ? `${kpis.acceptancePct.toFixed(0)}%` : '—'}
          </h3>
          <Sparkline values={kpis.tripsSpark} stroke="#6366f1" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between min-h-[128px] gap-3">
          <div className="flex justify-between items-start gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Avg Rating
            </span>
            <GoodUpBadge delta={kpis.ratingDeltaPct} />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {kpis.avgRating != null ? kpis.avgRating.toFixed(2) : '—'}
            </h3>
            {kpis.avgRating != null && (
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-3.5 w-3.5 ${
                      i < Math.round(kpis.avgRating!)
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-200'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400">From quality imports</p>
        </CardContent>
      </Card>
    </div>
  );
}
