import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { formatJMD } from '../../../utils/formatJMD';
import type { CostByVehicleRow, VehicleProfitRow } from '../../../hooks/useVehicleAnalytics';

type Props = {
  costByVehicle: CostByVehicleRow[];
  profitScatter: VehicleProfitRow[];
  fleetDistanceKm: number;
};

/**
 * Lifetime-style cost-per-km from already-attributed ledger costs + period distance.
 * Assembles existing analytics pieces — no new cost sources.
 */
export function VehicleTcoPanel({ costByVehicle, profitScatter, fleetDistanceKm }: Props) {
  const rows = useMemo(() => {
    const profitMap = new Map(profitScatter.map((p) => [p.vehicleId, p]));
    return costByVehicle
      .map((row) => {
        const profit = profitMap.get(row.vehicleId);
        const distance = profit?.distanceKm ?? 0;
        const totalCost = row.costs.total;
        const costPerKm = distance > 0 ? totalCost / distance : null;
        return {
          vehicleId: row.vehicleId,
          label: row.label,
          totalCost,
          distance,
          costPerKm,
          revenue: profit?.revenue ?? 0,
        };
      })
      .filter((r) => r.totalCost > 0)
      .sort((a, b) => (b.costPerKm ?? 0) - (a.costPerKm ?? 0))
      .slice(0, 12);
  }, [costByVehicle, profitScatter]);

  const fleetCost = costByVehicle.reduce((s, r) => s + r.costs.total, 0);
  const fleetCpk = fleetDistanceKm > 0 ? fleetCost / fleetDistanceKm : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Cost per km (period)</CardTitle>
        <CardDescription>
          Attributed ledger costs ÷ trip distance in the selected period. Top vehicles by cost intensity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm flex justify-between gap-2">
          <span className="text-slate-500">Fleet average</span>
          <span className="font-semibold">
            {fleetCpk != null ? `${formatJMD(fleetCpk, 2)} / km` : '—'}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            No attributed vehicle costs in this period yet.
          </p>
        ) : (
          <ul className="space-y-2 max-h-[320px] overflow-y-auto">
            {rows.map((r) => (
              <li
                key={r.vehicleId}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-semibold truncate">{r.label}</p>
                  <p className="text-[11px] text-slate-400">
                    {formatJMD(r.totalCost)} · {r.distance.toFixed(0)} km
                  </p>
                </div>
                <span className="font-bold shrink-0">
                  {r.costPerKm != null ? `${formatJMD(r.costPerKm, 2)}/km` : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
