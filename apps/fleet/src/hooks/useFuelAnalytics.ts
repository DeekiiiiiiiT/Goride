import { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { fuelService } from '../services/fuelService';
import type { Vehicle } from '../types/vehicle';
import type { PeriodPreset } from '../components/business-finance/types';
import { resolvePeriod, previousPeriod } from '../components/business-finance/periodRange';
import {
  pctDelta,
  filterOpsEntriesInPeriod,
  buildVehicleFuelStats,
  buildDailyConsumption,
  buildWeeklyEfficiencyTrend,
  buildEfficiencyHeatmap,
  buildFuelComposition,
  buildPriceSeries,
  buildFlaggedEvents,
  detectEfficiencyCrashes,
  sparklineFromEntries,
  fleetTargetKmL,
  resolveEntryFuelType,
  fuelOpsSpendAmount,
  fuelOpsLiters,
  type VehicleFuelStats,
  type DailyConsumptionPoint,
  type WeeklyEfficiencyPoint,
  type FuelCompositionSlice,
  type PricePoint,
  type FlaggedEvent,
} from '../utils/fuelAnalyticsAggregates';
import { filterFuelOpsLogEntries } from '../utils/fuelOpsEligibility';

export type FuelAnalyticsKpis = {
  totalCost: number;
  costDeltaPct: number | null;
  totalLiters: number;
  litersDeltaPct: number | null;
  avgEfficiencyKmL: number | null;
  efficiencyDeltaPct: number | null;
  costPerKm: number | null;
  costPerKmDeltaPct: number | null;
  refuelCount: number;
  refuelDelta: number | null;
  potentialLoss: number;
  potentialLossDeltaPct: number | null;
  costSpark: number[];
  litersSpark: number[];
  efficiencySpark: number[];
  costPerKmSpark: number[];
  refuelSpark: number[];
  lossSpark: number[];
};

export function useFuelAnalytics() {
  const [preset, setPreset] = useState<PeriodPreset>('last_90_days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [fuelTypeFilter, setFuelTypeFilter] = useState<string>('all');
  const [bodyTypeFilter, setBodyTypeFilter] = useState<string>('all');
  const [tableSearch, setTableSearch] = useState('');

  const period = useMemo(
    () => resolvePeriod(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );
  const prior = useMemo(() => previousPeriod(period), [period]);

  const clearPeriod = useCallback(() => {
    setCustomStart('');
    setCustomEnd('');
    setPreset('last_90_days');
  }, []);

  // Wider fetch window for weekly trend / heatmap (8 weeks back)
  const fetchStart = useMemo(() => {
    const d = new Date(period.startYmd + 'T12:00:00');
    d.setDate(d.getDate() - 56);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [period.startYmd]);

  // Inclusive end bound for ISO timestamps in KV (YYYY-MM-DDT… must not be cut at midnight)
  const fetchEndInclusive = useMemo(
    () => `${period.endYmd}T23:59:59.999`,
    [period.endYmd],
  );

  const { data: rawEntries = [], isLoading: entriesLoading, refetch: refetchEntries } = useQuery({
    queryKey: ['fuelAnalyticsEntries', fetchStart, fetchEndInclusive],
    queryFn: () =>
      fuelService
        .getFuelEntries({ limit: 5000, startDate: fetchStart, endDate: fetchEndInclusive })
        .catch(() => []),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: vehicles = [], isLoading: vehiclesLoading, refetch: refetchVehicles } = useQuery<Vehicle[]>({
    queryKey: ['vehicles'],
    queryFn: () => api.getVehicles().catch(() => []),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const loading = entriesLoading || vehiclesLoading;

  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  const bodyTypeOptions = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach((v) => {
      if (v.bodyType) set.add(v.bodyType);
    });
    return Array.from(set).sort();
  }, [vehicles]);

  const fuelTypeOptions = useMemo(() => {
    const set = new Set<string>();
    rawEntries.forEach((e) => {
      set.add(resolveEntryFuelType(e, e.vehicleId ? vehicleMap.get(e.vehicleId) : null));
    });
    vehicles.forEach((v) => {
      if (v.fuelSettings?.fuelType) {
        set.add(resolveEntryFuelType({} as any, v));
      }
    });
    return Array.from(set).filter((t) => t !== 'Unknown').sort();
  }, [rawEntries, vehicles, vehicleMap]);

  const applyFilters = useCallback(
    (list: typeof rawEntries) => {
      return filterFuelOpsLogEntries(list).filter((e) => {
        if (fuelTypeFilter !== 'all') {
          const ft = resolveEntryFuelType(e, e.vehicleId ? vehicleMap.get(e.vehicleId) : null);
          if (ft !== fuelTypeFilter) return false;
        }
        if (bodyTypeFilter !== 'all' && e.vehicleId) {
          const v = vehicleMap.get(e.vehicleId);
          if ((v?.bodyType || '') !== bodyTypeFilter) return false;
        }
        return true;
      });
    },
    [fuelTypeFilter, bodyTypeFilter, vehicleMap],
  );

  const periodEntries = useMemo(
    () => applyFilters(filterOpsEntriesInPeriod(rawEntries, period)),
    [rawEntries, period, applyFilters],
  );
  const priorEntries = useMemo(
    () => applyFilters(filterOpsEntriesInPeriod(rawEntries, prior)),
    [rawEntries, prior, applyFilters],
  );

  const vehicleStats = useMemo(
    () => buildVehicleFuelStats(periodEntries, vehicles),
    [periodEntries, vehicles],
  );
  const priorStats = useMemo(
    () => buildVehicleFuelStats(priorEntries, vehicles),
    [priorEntries, vehicles],
  );

  const kpis: FuelAnalyticsKpis = useMemo(() => {
    const totalCost = periodEntries.reduce((s, e) => s + fuelOpsSpendAmount(e), 0);
    const priorCost = priorEntries.reduce((s, e) => s + fuelOpsSpendAmount(e), 0);
    const totalLiters = periodEntries.reduce((s, e) => s + fuelOpsLiters(e), 0);
    const priorLiters = priorEntries.reduce((s, e) => s + fuelOpsLiters(e), 0);

    const totalDist = vehicleStats.reduce((s, r) => s + r.distanceKm, 0);
    const priorDist = priorStats.reduce((s, r) => s + r.distanceKm, 0);
    const avgEfficiencyKmL =
      totalDist > 0 && totalLiters > 0 ? totalDist / totalLiters : null;
    const priorEff =
      priorDist > 0 && priorLiters > 0 ? priorDist / priorLiters : null;

    const costPerKm = totalDist > 0 ? totalCost / totalDist : null;
    const priorCpk = priorDist > 0 ? priorCost / priorDist : null;

    const potentialLoss = vehicleStats.reduce((s, r) => s + r.anomalyCost, 0);
    const priorLoss = priorStats.reduce((s, r) => s + r.anomalyCost, 0);

    const refuelCount = periodEntries.length;
    const priorRefuels = priorEntries.length;

    // Efficiency spark: daily fleet km/L proxy from daily consumption
    const daily = buildDailyConsumption(periodEntries, period);
    const efficiencySpark = daily.map((d) =>
      d.distanceKm > 0 && d.liters > 0 ? d.distanceKm / d.liters : 0,
    );
    const costPerKmSpark = daily.map((d) =>
      d.distanceKm > 0 ? d.cost / d.distanceKm : 0,
    );

    return {
      totalCost,
      costDeltaPct: pctDelta(totalCost, priorCost),
      totalLiters,
      litersDeltaPct: pctDelta(totalLiters, priorLiters),
      avgEfficiencyKmL: avgEfficiencyKmL != null ? Number(avgEfficiencyKmL.toFixed(2)) : null,
      efficiencyDeltaPct:
        avgEfficiencyKmL != null && priorEff != null ? pctDelta(avgEfficiencyKmL, priorEff) : null,
      costPerKm: costPerKm != null ? Number(costPerKm.toFixed(3)) : null,
      costPerKmDeltaPct: costPerKm != null && priorCpk != null ? pctDelta(costPerKm, priorCpk) : null,
      refuelCount,
      refuelDelta: refuelCount - priorRefuels,
      potentialLoss,
      potentialLossDeltaPct: pctDelta(potentialLoss, priorLoss),
      costSpark: sparklineFromEntries(periodEntries, period, fuelOpsSpendAmount),
      litersSpark: sparklineFromEntries(periodEntries, period, fuelOpsLiters),
      efficiencySpark,
      costPerKmSpark,
      refuelSpark: sparklineFromEntries(periodEntries, period, () => 1),
      lossSpark: sparklineFromEntries(
        periodEntries.filter((e) => (e.isFlagged || e.metadata?.integrityStatus === 'critical')),
        period,
        fuelOpsSpendAmount,
      ),
    };
  }, [periodEntries, priorEntries, vehicleStats, priorStats, period]);

  const dailyConsumption: DailyConsumptionPoint[] = useMemo(
    () => buildDailyConsumption(periodEntries, period),
    [periodEntries, period],
  );

  const efficiencyTrend: WeeklyEfficiencyPoint[] = useMemo(
    () => buildWeeklyEfficiencyTrend(applyFilters(rawEntries), vehicles, 8),
    [rawEntries, vehicles, applyFilters],
  );

  const heatmap = useMemo(
    () => buildEfficiencyHeatmap(applyFilters(rawEntries), vehicles, 6, 8),
    [rawEntries, vehicles, applyFilters],
  );

  const composition: FuelCompositionSlice[] = useMemo(
    () => buildFuelComposition(periodEntries, vehicles),
    [periodEntries, vehicles],
  );

  const priceSeries: PricePoint[] = useMemo(
    () => buildPriceSeries(periodEntries, period),
    [periodEntries, period],
  );

  const flaggedEvents: FlaggedEvent[] = useMemo(() => {
    const feed = buildFlaggedEvents(periodEntries, vehicles, 6);
    const crashes = detectEfficiencyCrashes(applyFilters(rawEntries), vehicles);
    const merged = [...crashes, ...feed];
    const seen = new Set<string>();
    return merged.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    }).slice(0, 8);
  }, [periodEntries, vehicles, rawEntries, applyFilters]);

  const leaderboard = useMemo(
    () =>
      [...vehicleStats]
        .filter((r) => r.efficiencyKmL != null)
        .sort((a, b) => (b.efficiencyKmL || 0) - (a.efficiencyKmL || 0)),
    [vehicleStats],
  );

  const tableRows: VehicleFuelStats[] = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    let rows = [...vehicleStats].sort((a, b) => b.totalCost - a.totalCost);
    if (q) {
      rows = rows.filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.model.toLowerCase().includes(q) ||
          r.fuelType.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [vehicleStats, tableSearch]);

  const recentLog = useMemo(() => {
    return [...periodEntries]
      .sort((a, b) => {
        const d = String(b.date).localeCompare(String(a.date));
        if (d !== 0) return d;
        return String(b.time || '').localeCompare(String(a.time || ''));
      })
      .slice(0, 12);
  }, [periodEntries]);

  const targetKmL = useMemo(() => fleetTargetKmL(vehicles), [vehicles]);

  const refresh = useCallback(() => {
    void refetchEntries();
    void refetchVehicles();
  }, [refetchEntries, refetchVehicles]);

  const exportCsv = useCallback(() => {
    const lines: string[] = [
      'Vehicle,Fuel Type,Fuel Cost,Litres,Distance (km),Efficiency (km/L),Cost/km,Status,Refuels',
    ];
    tableRows.forEach((r) => {
      lines.push(
        [
          r.label,
          r.fuelType,
          r.totalCost.toFixed(2),
          r.totalLiters.toFixed(2),
          r.distanceKm.toFixed(1),
          r.efficiencyKmL?.toFixed(2) ?? '',
          r.costPerKm?.toFixed(3) ?? '',
          r.status,
          String(r.refuelCount),
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(','),
      );
    });
    lines.push('');
    lines.push('Recent Refuels');
    lines.push('Date,Vehicle,Fuel Type,Litres,Cost,Odometer,Station');
    recentLog.forEach((e) => {
      const v = e.vehicleId ? vehicleMap.get(e.vehicleId) : null;
      lines.push(
        [
          entryDateTime(e),
          v?.licensePlate || e.vehicleId || '',
          resolveEntryFuelType(e, v),
          fuelOpsLiters(e).toFixed(2),
          fuelOpsSpendAmount(e).toFixed(2),
          e.odometer != null ? String(e.odometer) : '',
          e.location || '',
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(','),
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fuel-analytics-${period.startYmd}-to-${period.endYmd}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [tableRows, recentLog, vehicleMap, period]);

  return {
    loading,
    hasData: rawEntries.length > 0 || vehicles.length > 0,
    period,
    preset,
    setPreset,
    customStart,
    customEnd,
    setCustomStart,
    setCustomEnd,
    clearPeriod,
    fuelTypeFilter,
    setFuelTypeFilter,
    fuelTypeOptions,
    bodyTypeFilter,
    setBodyTypeFilter,
    bodyTypeOptions,
    tableSearch,
    setTableSearch,
    kpis,
    dailyConsumption,
    efficiencyTrend,
    heatmap,
    composition,
    priceSeries,
    flaggedEvents,
    leaderboard,
    tableRows,
    recentLog,
    vehicles,
    vehicleMap,
    targetKmL,
    refresh,
    exportCsv,
  };
}

function entryDateTime(e: { date?: string; time?: string }): string {
  const d = String(e.date || '').slice(0, 10);
  const t = e.time ? String(e.time).slice(0, 5) : '';
  return t ? `${d} ${t}` : d;
}
