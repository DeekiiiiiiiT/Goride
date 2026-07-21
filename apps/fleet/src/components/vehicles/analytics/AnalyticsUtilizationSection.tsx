import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CarFront } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import type { IdleRow, StatusBoardVehicle, HeatmapData } from '../../../hooks/useVehicleAnalytics';
import type { Trip } from '../../../types/data';
import type { Vehicle } from '../../../types/vehicle';
import { formatJMD } from './AnalyticsKpiGrid';
import { HEAT_DAYS, HEAT_ROWS } from '../../../utils/vehicleAnalyticsAggregates';
import { getTripGrossRevenue } from '../../../utils/tripEarnings';

const STATUS_DOT: Record<string, string> = {
  Active: 'bg-emerald-500',
  Maintenance: 'bg-rose-500',
  Inactive: 'bg-amber-500',
  Decommissioned: 'bg-slate-400',
};

function StatusCard({
  v,
  onSelect,
}: {
  v: StatusBoardVehicle;
  onSelect?: (id: string) => void;
}) {
  const serviceTone =
    v.serviceStatus === 'Overdue'
      ? 'text-rose-600'
      : v.serviceStatus === 'Due Soon'
        ? 'text-amber-600'
        : 'text-emerald-600';

  return (
    <button
      type="button"
      onClick={() => onSelect?.(v.id)}
      className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 flex flex-col gap-2 bg-white dark:bg-slate-900 text-left min-h-[44px] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors w-full"
    >
      <div className="flex justify-between items-center gap-2">
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{v.plate}</span>
        <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[v.status] || 'bg-slate-400'}`} />
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <CarFront className="h-4 w-4 text-slate-400 shrink-0" />
        <span className="text-xs text-slate-500 truncate">
          {v.status}
          {v.driverName ? ` · ${v.driverName}` : v.modelLabel ? ` · ${v.modelLabel}` : ''}
        </span>
      </div>
      <div className="flex justify-between items-center text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2 gap-2">
        <span className="truncate">
          {v.lastTripEnd
            ? `Last trip: ${format(new Date(v.lastTripEnd), 'MMM d, HH:mm')}`
            : 'No trip in period'}
        </span>
        <span className={`font-bold shrink-0 ${serviceTone}`}>
          {v.serviceStatus === 'OK' ? 'Good' : v.serviceStatus}
        </span>
      </div>
      {v.utilizationPct != null && (
        <Badge variant="secondary" className="text-[10px] w-fit">
          Util {v.utilizationPct.toFixed(0)}%
        </Badge>
      )}
    </button>
  );
}

type Props = {
  heatmap: HeatmapData;
  getHeatCellTrips: (rowIdx: number, dayIdx: number) => Trip[];
  idleRows: IdleRow[];
  statusBoard: StatusBoardVehicle[];
  vehicles: Vehicle[];
  onSelectVehicle?: (id: string) => void;
};

export function AnalyticsUtilizationSection({
  heatmap,
  getHeatCellTrips,
  idleRows,
  statusBoard,
  vehicles,
  onSelectVehicle,
}: Props) {
  const [drill, setDrill] = useState<{ rowIdx: number; dayIdx: number } | null>(null);
  const plateById = useMemo(() => {
    const m = new Map<string, string>();
    vehicles.forEach((v) => m.set(v.id, v.licensePlate || v.id));
    return m;
  }, [vehicles]);
  const drillTrips = useMemo(
    () => (drill ? getHeatCellTrips(drill.rowIdx, drill.dayIdx) : []),
    [drill, getHeatCellTrips],
  );
  const drillVehicles = useMemo(() => {
    const map = new Map<string, { id: string; label: string; count: number; revenue: number }>();
    drillTrips.forEach((t) => {
      const id = t.vehicleId || 'unknown';
      if (!map.has(id)) map.set(id, { id, label: plateById.get(id) || id, count: 0, revenue: 0 });
      const row = map.get(id)!;
      row.count += 1;
      row.revenue += getTripGrossRevenue(t);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [drillTrips, plateById]);

  const activeCount = statusBoard.filter((v) => v.status === 'Active').length;
  const idleCount = statusBoard.filter((v) => v.status === 'Inactive').length;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-lg">Utilization Heatmap</CardTitle>
              <CardDescription>Trip volume by weekday and time. Tap a cell for vehicles.</CardDescription>
            </div>
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Low</span>
              {[0.2, 0.4, 0.6, 0.8, 1].map((o) => (
                <div key={o} className="w-3 h-3 rounded-sm bg-indigo-500" style={{ opacity: o }} />
              ))}
              <span className="text-[11px] text-slate-400">High</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-8 gap-1.5 md:gap-2">
              <div />
              {heatmap.days.map((d) => (
                <div key={d} className="text-[10px] md:text-[11px] text-center font-bold text-slate-500">
                  {d}
                </div>
              ))}
              {heatmap.rows.map((rowLabel, r) => (
                <React.Fragment key={rowLabel}>
                  <div className="text-[10px] md:text-[11px] flex items-center text-slate-500 whitespace-nowrap">
                    {rowLabel}
                  </div>
                  {heatmap.cells[r].map((cell, c) => (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      className="min-h-11 aspect-square rounded-md bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      style={{ opacity: cell.count === 0 ? 0.06 : 0.15 + cell.intensity * 0.85 }}
                      aria-label={`${HEAT_DAYS[c]} ${HEAT_ROWS[r].label}: ${cell.count} trips`}
                      onClick={() => setDrill({ rowIdx: r, dayIdx: c })}
                    />
                  ))}
                </React.Fragment>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
            <div>
              <CardTitle className="text-lg">Recorded Vehicle Status</CardTitle>
              <CardDescription>From trips and service records — not live GPS.</CardDescription>
            </div>
            <div className="flex gap-1.5 flex-wrap justify-end">
              <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] font-bold">
                ACTIVE: {activeCount}
              </Badge>
              <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] font-bold">
                IDLE: {idleCount}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {statusBoard.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-sm text-slate-400">
                No vehicles registered yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1">
                {statusBoard.map((v) => (
                  <StatusCard key={v.id} v={v} onSelect={onSelectVehicle} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Idle / Open Time</CardTitle>
          <CardDescription>
            Shown only when imported vehicle metrics include online / on-trip / open hours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {idleRows.length === 0 ? (
            <div className="flex items-center justify-center h-[160px] text-sm text-slate-400 text-center px-4">
              No imported online/on-trip hours available. Import vehicle performance CSV to unlock idle rankings.
            </div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {idleRows.map((row) => (
                <button
                  key={row.vehicleId}
                  type="button"
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-3 min-h-11 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => onSelectVehicle?.(row.vehicleId)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{row.label}</p>
                    <p className="text-[11px] text-slate-400">
                      {row.onlineHours != null && `Online ${row.onlineHours.toFixed(1)}h`}
                      {row.onTripHours != null && ` · On trip ${row.onTripHours.toFixed(1)}h`}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {row.idleHours.toFixed(1)}h idle
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!drill} onOpenChange={(open: boolean) => !open && setDrill(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {drill
                ? `${HEAT_DAYS[drill.dayIdx]} ${HEAT_ROWS[drill.rowIdx].label}`
                : 'Heatmap cell'}
            </DialogTitle>
            <DialogDescription>
              {drillTrips.length} trip{drillTrips.length !== 1 ? 's' : ''} in this window
            </DialogDescription>
          </DialogHeader>
          {drillTrips.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No trips in this cell.</p>
          ) : (
            <div className="space-y-2">
              {drillVehicles.map((v) => (
                <Button
                  key={v.id}
                  type="button"
                  variant="outline"
                  className="w-full min-h-11 justify-between"
                  onClick={() => {
                    onSelectVehicle?.(v.id);
                    setDrill(null);
                  }}
                >
                  <span className="font-semibold truncate">{v.label}</span>
                  <span className="text-xs text-slate-500">
                    {v.count} trips · {formatJMD(v.revenue)}
                  </span>
                </Button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
