import React from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { formatJMD } from '../../vehicles/analytics/AnalyticsKpiGrid';
import { cn } from '../../ui/utils';
import type { VehicleFuelStats } from '../../../utils/fuelAnalyticsAggregates';
import { resolveEntryFuelType, isAnomalyEntry } from '../../../utils/fuelAnalyticsAggregates';
import type { FuelEntry } from '../../../types/fuel';
import type { Vehicle } from '../../../types/vehicle';
import { EFFICIENCY_ALERT_KML } from '../../../utils/fuelAnalyticsAggregates';

type Props = {
  tableRows: VehicleFuelStats[];
  recentLog: FuelEntry[];
  vehicleMap: Map<string, Vehicle>;
  tableSearch: string;
  onSearch: (v: string) => void;
  onViewAllLogs?: () => void;
};

function statusBadge(status: VehicleFuelStats['status']) {
  if (status === 'optimal') {
    return <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] font-bold">OPTIMAL</Badge>;
  }
  if (status === 'attention') {
    return <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] font-bold">ATTENTION</Badge>;
  }
  return <Badge className="bg-slate-100 text-slate-600 border-0 text-[10px] font-bold">STANDARD</Badge>;
}

export function FuelAnalyticsTables({
  tableRows,
  recentLog,
  vehicleMap,
  tableSearch,
  onSearch,
  onViewAllLogs,
}: Props) {
  return (
    <div className="space-y-4 md:space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">Vehicle Cost &amp; Efficiency Breakdown</CardTitle>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              className="min-h-11 pl-9"
              placeholder="Search vehicles…"
              value={tableSearch}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {tableRows.length === 0 ? (
            <p className="text-sm text-slate-400 py-12 text-center">No vehicle fuel spend in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead className="text-right">Fuel Cost</TableHead>
                  <TableHead className="text-right">Litres</TableHead>
                  <TableHead className="text-right">Distance</TableHead>
                  <TableHead>Efficiency (km/L)</TableHead>
                  <TableHead className="text-right">Cost/KM</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.map((r) => {
                  const kmL = r.efficiencyKmL;
                  const barPct =
                    kmL != null ? Math.min(100, Math.max(8, (kmL / (EFFICIENCY_ALERT_KML + 6)) * 100)) : 0;
                  return (
                    <TableRow key={r.vehicleId}>
                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{r.label}</div>
                        {r.model ? <div className="text-[11px] text-slate-400">{r.model}</div> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatJMD(r.totalCost, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.totalLiters.toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.distanceKm > 0 ? `${Math.round(r.distanceKm).toLocaleString()} km` : '—'}
                      </TableCell>
                      <TableCell>
                        {kmL != null ? (
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  kmL < EFFICIENCY_ALERT_KML ? 'bg-rose-500' : 'bg-indigo-500',
                                )}
                                style={{ width: `${barPct}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold tabular-nums w-10 text-right">{kmL.toFixed(1)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.costPerKm != null ? formatJMD(r.costPerKm, 2) : '—'}
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Recent Refueling Activity Log</CardTitle>
          {onViewAllLogs && (
            <Button type="button" variant="ghost" className="min-h-11 text-indigo-600" onClick={onViewAllLogs}>
              View All
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {recentLog.length === 0 ? (
            <p className="text-sm text-slate-400 py-12 text-center">No refuels in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Plate</TableHead>
                  <TableHead>Fuel Type</TableHead>
                  <TableHead className="text-right">Litres</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">Odometer</TableHead>
                  <TableHead>Station</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLog.map((e) => {
                  const v = e.vehicleId ? vehicleMap.get(e.vehicleId) : null;
                  const flagged = isAnomalyEntry(e);
                  return (
                    <TableRow key={e.id} className={flagged ? 'bg-rose-50/40 dark:bg-rose-950/10' : undefined}>
                      <TableCell className="tabular-nums text-sm">
                        {String(e.date).slice(0, 10)}
                        {e.time ? ` ${String(e.time).slice(0, 5)}` : ''}
                      </TableCell>
                      <TableCell className="font-semibold">{v?.licensePlate || e.vehicleId?.slice(0, 8) || '—'}</TableCell>
                      <TableCell>{resolveEntryFuelType(e, v)}</TableCell>
                      <TableCell className="text-right tabular-nums">{(Number(e.liters) || 0).toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatJMD(Number(e.amount) || 0, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.odometer != null && Number(e.odometer) > 0
                          ? Number(e.odometer).toLocaleString()
                          : '—'}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-slate-600">
                        {e.location || '—'}
                        {flagged ? (
                          <Badge className="ml-2 bg-rose-100 text-rose-700 border-0 text-[9px]">FLAG</Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
