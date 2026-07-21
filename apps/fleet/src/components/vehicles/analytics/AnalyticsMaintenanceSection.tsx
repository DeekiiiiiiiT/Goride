import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CalendarClock, CircleCheck, Wrench } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import type { MaintenanceAlert } from '../../../hooks/useVehicleAnalytics';
import type { MaintenanceLog } from '../../../types/maintenance';
import type { Vehicle } from '../../../types/vehicle';
import { formatJMD } from './AnalyticsKpiGrid';

type Props = {
  alerts: MaintenanceAlert[];
  logs: MaintenanceLog[];
  vehicles: Vehicle[];
  onNavigate?: (page: string) => void;
  onSelectVehicle?: (id: string) => void;
};

function itemCostsTotal(log: MaintenanceLog): number {
  if (!log.itemCosts) return 0;
  return Object.values(log.itemCosts).reduce(
    (s, row) => s + (Number(row.material) || 0) + (Number(row.labor) || 0),
    0,
  );
}

export function AnalyticsMaintenanceSection({
  alerts,
  logs,
  vehicles,
  onNavigate,
  onSelectVehicle,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [inMaintenanceOnly, setInMaintenanceOnly] = useState(false);

  const plateById = useMemo(() => {
    const m = new Map<string, string>();
    vehicles.forEach((v) => m.set(v.id, v.licensePlate || v.id));
    return m;
  }, [vehicles]);

  const maintenanceVehicleIds = useMemo(
    () => new Set(vehicles.filter((v) => v.status === 'Maintenance').map((v) => v.id)),
    [vehicles],
  );

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (inMaintenanceOnly && !maintenanceVehicleIds.has(log.vehicleId)) return false;
      if (statusFilter !== 'all' && (log.status || 'Completed') !== statusFilter) return false;
      if (search) {
        const plate = plateById.get(log.vehicleId) || '';
        const hay = `${plate} ${log.type} ${log.provider}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [logs, inMaintenanceOnly, maintenanceVehicleIds, statusFilter, search, plateById]);

  const totalCost = useMemo(
    () => filteredLogs.reduce((s, l) => s + (Number(l.cost) || 0) + itemCostsTotal(l), 0),
    [filteredLogs],
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">Maintenance Alerts</CardTitle>
            <CardDescription>Overdue and upcoming service from fleet schedules.</CardDescription>
          </div>
          {onNavigate && (
            <Button
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              onClick={() => onNavigate('maintenance-hub')}
            >
              <Wrench className="h-4 w-4 mr-2" />
              Open Maintenance Hub
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {alerts.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <CircleCheck className="h-4 w-4 text-emerald-500" />
              No maintenance alerts — schedules look clear.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {alerts.map((alert, i) => (
                <button
                  key={`${alert.vehicleId}-${alert.severity}-${i}`}
                  type="button"
                  className="w-full px-4 md:px-6 py-4 flex items-start gap-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 min-h-11"
                  onClick={() => onSelectVehicle?.(alert.vehicleId)}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      alert.severity === 'high'
                        ? 'bg-rose-100 text-rose-600'
                        : 'bg-amber-100 text-amber-600'
                    }`}
                  >
                    {alert.severity === 'high' ? (
                      <AlertTriangle className="h-5 w-5" />
                    ) : (
                      <CalendarClock className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{alert.title}</h4>
                      <Badge
                        className={`text-[10px] uppercase font-black border-0 ${
                          alert.severity === 'high' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                        }`}
                      >
                        {alert.severity === 'high' ? 'Overdue' : 'Due Soon'}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{alert.plate}</span> —{' '}
                      {alert.detail}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-lg">Maintenance Log</CardTitle>
              <CardDescription>
                Completed and scheduled repairs in the selected period · Total {formatJMD(totalCost)}
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
            <Input
              className="min-h-11 sm:max-w-xs"
              placeholder="Search plate, type, provider…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="min-h-11 w-full sm:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Scheduled">Scheduled</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={inMaintenanceOnly ? 'default' : 'outline'}
              className="min-h-11"
              onClick={() => setInMaintenanceOnly((v) => !v)}
            >
              Vehicles in maintenance
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-slate-400">
              No maintenance logs match these filters.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[400px] overflow-y-auto">
              {filteredLogs.map((log) => {
                const parts = itemCostsTotal(log);
                return (
                  <button
                    key={log.id}
                    type="button"
                    className="w-full px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 min-h-11"
                    onClick={() => onSelectVehicle?.(log.vehicleId)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold">
                          {plateById.get(log.vehicleId) || log.vehicleId}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {log.type}
                        </Badge>
                        {log.status && (
                          <Badge className="text-[10px] border-0 bg-slate-200 text-slate-700">
                            {log.status}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {log.date ? format(new Date(log.date), 'MMM d, yyyy') : '—'}
                        {log.provider ? ` · ${log.provider}` : ''}
                        {log.odo ? ` · ${log.odo.toLocaleString()} km` : ''}
                      </p>
                      {log.itemCosts && Object.keys(log.itemCosts).length > 0 && (
                        <p className="text-[11px] text-slate-400 mt-1 truncate">
                          Parts: {Object.keys(log.itemCosts).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="text-sm font-semibold tabular-nums shrink-0">
                      {formatJMD((Number(log.cost) || 0) + parts)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
