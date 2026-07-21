import React, { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { SafeResponsiveContainer as ResponsiveContainer } from '../../ui/SafeResponsiveContainer';
import type { Vehicle } from '../../../types/vehicle';
import { formatJMD } from './AnalyticsKpiGrid';
import { Loader2 } from 'lucide-react';

type DailyMileage = { dateYmd: string; name: string; km: number };

type ServiceWarning = {
  vehicleId: string;
  odometer?: number;
  nextDueOdometer?: number | null;
  maxKmOverdue?: number | null;
  servicesAttention?: Array<{ taskName: string; kind: 'overdue' | 'due_soon' }>;
} | null;

type Props = {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string | null) => void;
  selectedVehicle: Vehicle | null;
  selectedDailyMileage: DailyMileage[];
  selectedFuelSummary: any;
  selectedServiceWarning: ServiceWarning;
  odoLoading: boolean;
  fuelLoading: boolean;
};

export function AnalyticsVehicleHealthPanel({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  selectedVehicle,
  selectedDailyMileage,
  selectedFuelSummary,
  selectedServiceWarning,
  odoLoading,
  fuelLoading,
}: Props) {
  const costPerKm = useMemo(() => {
    const c = Number(selectedFuelSummary?.costPerKm ?? selectedFuelSummary?.summary?.costPerKm);
    return Number.isFinite(c) && c > 0 ? c : null;
  }, [selectedFuelSummary]);

  const avgEfficiency = useMemo(() => {
    const e = Number(
      selectedFuelSummary?.avgEfficiency ??
        selectedFuelSummary?.summary?.avgEfficiency ??
        selectedFuelSummary?.actualKmPerLiter,
    );
    return Number.isFinite(e) && e > 0 ? e : null;
  }, [selectedFuelSummary]);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div>
          <CardTitle className="text-lg">Vehicle Mileage & Fuel</CardTitle>
          <CardDescription>
            Select a vehicle to load odometer history and real fuel efficiency — no fleet-wide N+1 fetch.
          </CardDescription>
        </div>
        <Select
          value={selectedVehicleId || ''}
          onValueChange={(v: string) => onSelectVehicle(v || null)}
        >
          <SelectTrigger className="min-h-11 w-full sm:max-w-sm">
            <SelectValue placeholder="Select a vehicle" />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.licensePlate || v.id} · {[v.make, v.model].filter(Boolean).join(' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {!selectedVehicleId ? (
          <div className="flex items-center justify-center h-[180px] text-sm text-slate-400 text-center px-4">
            Choose a vehicle to inspect mileage and fuel economy.
          </div>
        ) : odoLoading || fuelLoading ? (
          <div className="flex items-center justify-center h-[180px] gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading vehicle health…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{selectedVehicle?.licensePlate || selectedVehicleId}</Badge>
              {avgEfficiency != null && (
                <Badge className="bg-indigo-100 text-indigo-700 border-0">
                  {avgEfficiency.toFixed(1)} km/L
                </Badge>
              )}
              {costPerKm != null && (
                <Badge className="bg-emerald-100 text-emerald-700 border-0">
                  {formatJMD(costPerKm, 2)}/km
                </Badge>
              )}
              {avgEfficiency == null && costPerKm == null && (
                <span className="text-xs text-slate-400">No fuel audit summary for this vehicle yet.</span>
              )}
            </div>

            {selectedServiceWarning?.servicesAttention?.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                {selectedServiceWarning.servicesAttention.map((s) => s.taskName).join(', ')}
                {selectedServiceWarning.nextDueOdometer != null &&
                  ` · next due at ${Math.round(selectedServiceWarning.nextDueOdometer).toLocaleString()} km`}
                {selectedServiceWarning.odometer != null &&
                  ` (now ${Math.round(selectedServiceWarning.odometer).toLocaleString()} km)`}
              </div>
            ) : null}

            {selectedDailyMileage.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-sm text-slate-400 text-center px-4">
                No odometer readings available to chart daily mileage.
              </div>
            ) : (
              <div className="min-h-[240px]">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={selectedDailyMileage}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} unit=" km" />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value) => [`${Number(value).toFixed(1)} km`, 'Daily mileage']}
                    />
                    <Area type="monotone" dataKey="km" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} name="km" />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="text-[11px] text-slate-400 mt-1">
                  Derived from consecutive odometer readings (resets and absurd jumps filtered out).
                </p>
              </div>
            )}

            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => onSelectVehicle(null)}
            >
              Clear selection
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
