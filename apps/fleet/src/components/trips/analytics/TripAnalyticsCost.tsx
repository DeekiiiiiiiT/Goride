import { useQuery } from '@tanstack/react-query';
import { formatJMD } from '../../../utils/formatJMD';
import { fuelService } from '../../../services/fuelService';
import { filterFuelOpsLogEntries, fuelOpsSpendAmount } from '../../../utils/fuelOpsEligibility';
import { buildVehicleFuelStats } from '../../../utils/fuelAnalyticsAggregates';
import type { Vehicle } from '../../../types/vehicle';

export function TripAnalyticsCost({
  from,
  to,
  km,
  fee,
  vehicles,
}: {
  from: string;
  to: string;
  km: number | null;
  fee: number | null;
  vehicles: Vehicle[];
}) {
  const fuel = useQuery({
    queryKey: ['trip-analytics-fuel-cost', from, to, vehicles.length],
    queryFn: async () => {
      const entries = await fuelService.getAllFuelEntriesInRange({ startDate: from, endDate: to });
      const ops = filterFuelOpsLogEntries(entries);
      const stats = buildVehicleFuelStats(ops, vehicles);
      const totalCost = ops.reduce((sum, entry) => sum + fuelOpsSpendAmount(entry), 0);
      const totalDist = stats.reduce((sum, row) => sum + row.distanceKm, 0);
      if (!(totalDist > 0)) return null;
      return totalCost / totalDist;
    },
  });
  const costPerKm = fuel.data;
  const estimate = costPerKm != null && km != null ? costPerKm * km + (fee || 0) : null;
  const missing = fuel.isError || fuel.isSuccess && costPerKm == null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-semibold text-slate-900">Cost per trip</h3>
      <p className="mt-1 text-sm text-slate-500">Fuel cost per kilometre from the fuel log, times this period’s trip kilometres, plus the platform fee. This is a reading, not a new cost model.</p>
      <p className="mt-3 text-2xl font-bold">{missing || estimate == null ? '—' : formatJMD(estimate, 2)}</p>
      <p className="text-sm text-slate-500">
        {fuel.isLoading ? 'Reading the fuel log…' : costPerKm == null ? 'Fuel cost per km is not available for this period.' : `${formatJMD(costPerKm, 2)} per km · ${km == null ? '—' : `${km.toFixed(0)} km`}`}
      </p>
    </section>
  );
}
