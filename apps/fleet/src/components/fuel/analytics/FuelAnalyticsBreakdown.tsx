import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { cn } from '../../ui/utils';
import type { VehicleFuelStats } from '../../../utils/fuelAnalyticsAggregates';
import { EFFICIENCY_ALERT_KML } from '../../../utils/fuelAnalyticsAggregates';

type HeatmapData = {
  weeks: string[];
  weekLabels: string[];
  rows: Array<{
    vehicleId: string;
    label: string;
    cells: Array<{ efficiencyKmL: number | null; weekLabel: string }>;
  }>;
};

function heatColor(kmL: number | null): string {
  if (kmL == null) return 'bg-slate-100 text-slate-400 dark:bg-slate-800';
  if (kmL >= EFFICIENCY_ALERT_KML + 3) return 'bg-emerald-500 text-white';
  if (kmL >= EFFICIENCY_ALERT_KML + 1) return 'bg-emerald-300 text-emerald-950';
  if (kmL >= EFFICIENCY_ALERT_KML) return 'bg-amber-200 text-amber-950';
  if (kmL >= EFFICIENCY_ALERT_KML - 2) return 'bg-orange-300 text-orange-950';
  return 'bg-rose-500 text-white';
}

type Props = {
  leaderboard: VehicleFuelStats[];
  heatmap: HeatmapData;
};

export function FuelAnalyticsBreakdown({ leaderboard, heatmap }: Props) {
  const maxEff = Math.max(...leaderboard.map((r) => r.efficiencyKmL || 0), 1);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
      <Card className="xl:col-span-1">
        <CardHeader>
          <CardTitle className="text-lg">Efficiency Leaderboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {leaderboard.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">
              No efficiency scores yet — need odometer readings on fills.
            </p>
          ) : (
            leaderboard.slice(0, 8).map((row) => {
              const kmL = row.efficiencyKmL || 0;
              const pct = Math.min(100, (kmL / maxEff) * 100);
              const below = kmL < EFFICIENCY_ALERT_KML;
              return (
                <div key={row.vehicleId} className="space-y-2">
                  <div className="flex justify-between text-sm gap-2">
                    <span className="text-slate-800 dark:text-slate-100 truncate">
                      {row.label}
                      {row.model ? (
                        <span className="text-slate-400 font-normal"> ({row.model})</span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        'font-bold shrink-0',
                        below ? 'text-rose-600' : 'text-emerald-600',
                      )}
                    >
                      {kmL.toFixed(1)} km/L
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', below ? 'bg-rose-500' : 'bg-emerald-500')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card className="xl:col-span-2 overflow-x-auto">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">Weekly Efficiency Heatmap</CardTitle>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span>8 km/L</span>
            <div className="flex h-2 w-24 rounded overflow-hidden">
              <div className="flex-1 bg-rose-500" />
              <div className="flex-1 bg-orange-300" />
              <div className="flex-1 bg-amber-200" />
              <div className="flex-1 bg-emerald-300" />
              <div className="flex-1 bg-emerald-500" />
            </div>
            <span>16 km/L</span>
          </div>
        </CardHeader>
        <CardContent>
          {heatmap.rows.length === 0 ? (
            <p className="text-sm text-slate-400 py-12 text-center">
              Not enough weekly odometer data for a heatmap.
            </p>
          ) : (
            <div className="min-w-[480px]">
              <div
                className="grid gap-1.5 mb-1.5"
                style={{ gridTemplateColumns: `100px repeat(${heatmap.weekLabels.length}, minmax(0, 1fr))` }}
              >
                <div />
                {heatmap.weekLabels.map((w) => (
                  <div key={w} className="text-center text-[10px] font-medium text-slate-500">
                    {w}
                  </div>
                ))}
              </div>
              {heatmap.rows.map((row) => (
                <div
                  key={row.vehicleId}
                  className="grid gap-1.5 mb-1.5"
                  style={{ gridTemplateColumns: `100px repeat(${row.cells.length}, minmax(0, 1fr))` }}
                >
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate self-center">
                    {row.label}
                  </div>
                  {row.cells.map((cell, i) => (
                    <div
                      key={`${row.vehicleId}-${i}`}
                      title={
                        cell.efficiencyKmL != null
                          ? `${row.label}: ${cell.efficiencyKmL.toFixed(1)} km/L`
                          : `${row.label}: no data`
                      }
                      className={cn(
                        'h-9 rounded flex items-center justify-center text-[10px] font-bold',
                        heatColor(cell.efficiencyKmL),
                      )}
                    >
                      {cell.efficiencyKmL != null ? cell.efficiencyKmL.toFixed(1) : '—'}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
