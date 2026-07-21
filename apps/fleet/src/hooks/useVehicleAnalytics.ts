import { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '../services/api';
import type { Trip, VehicleMetrics } from '../types/data';
import type { Vehicle } from '../types/vehicle';
import type { MaintenanceLog } from '../types/maintenance';
import type { BusinessFinancePeriod, PeriodPreset } from '../components/business-finance/types';
import { resolvePeriod, previousPeriod } from '../components/business-finance/periodRange';
import { fetchAllCanonicalEvents } from '../components/business-finance/expensesSnapshot';
import {
  pctDelta,
  filterTripsInPeriod,
  tripDateYmd,
  revenuePerTrip,
  revenuePerKm,
  cancellationRate,
  idleHoursFromMetrics,
  utilizationFromMetrics,
  aggregateLedgerCosts,
  buildDailyCostBreakdown,
  commissionByVehicle,
  profitByVehicle,
  buildUtilizationHeatmap,
  tripsInHeatCell,
  sparklineBuckets,
  getTripGrossRevenue,
  type CostBuckets,
  type DailyCostPoint,
  type CommissionRow,
  type VehicleProfitRow,
  type HeatmapData,
} from '../utils/vehicleAnalyticsAggregates';

export type AnalyticsKpis = {
  grossRevenue: number;
  revenueDeltaPct: number | null;
  netProfitPerVehicle: number | null;
  netProfitDeltaPct: number | null;
  activeVehicles: number;
  totalVehicles: number;
  activeRatePct: number;
  avgUtilizationPct: number | null;
  completedTrips: number;
  cancelledTrips: number;
  cancellationRatePct: number | null;
  tripsDeltaPct: number | null;
  fleetDistanceKm: number;
  distanceDeltaPct: number | null;
  revenuePerTrip: number | null;
  revenuePerKm: number | null;
  fleetOperatingProfit: number | null;
  costCoveragePct: number | null;
  unattributedCostTotal: number;
  revenueSpark: number[];
  profitSpark: number[];
  tripsSpark: number[];
  distanceSpark: number[];
};

export type LeaderboardRow = {
  vehicleId: string;
  label: string;
  driverName: string;
  revenue: number;
  utilizationPct: number | null;
  attributedCosts: number;
  profit: number | null;
};

export type IdleRow = {
  vehicleId: string;
  label: string;
  idleHours: number;
  onlineHours: number | null;
  onTripHours: number | null;
  openTime: number | null;
};

export type StatusBoardVehicle = {
  id: string;
  plate: string;
  modelLabel: string;
  status: Vehicle['status'];
  driverName?: string;
  nextServiceDate?: string;
  serviceStatus: Vehicle['serviceStatus'];
  lastTripEnd?: string;
  utilizationPct: number | null;
};

export type MaintenanceAlert = {
  vehicleId: string;
  plate: string;
  severity: 'high' | 'medium';
  title: string;
  detail: string;
};

export type CostByVehicleRow = {
  vehicleId: string;
  label: string;
  costs: CostBuckets;
};

async function fetchAllPeriodTrips(startDate: string, endDate: string): Promise<Trip[]> {
  const all: Trip[] = [];
  let offset = 0;
  const limit = 500;
  for (let i = 0; i < 40; i++) {
    const page = await api.getTripsFiltered({ startDate, endDate, limit, offset });
    const chunk = page.data || [];
    all.push(...chunk);
    if (chunk.length < limit || all.length >= (page.total || Infinity)) break;
    offset += limit;
  }
  return all;
}

export function useVehicleAnalytics() {
  const [preset, setPreset] = useState<PeriodPreset>('this_week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [leaderboardSort, setLeaderboardSort] = useState<'revenue' | 'profit' | 'utilization'>('revenue');

  const period = useMemo(
    () => resolvePeriod(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );
  const prior = useMemo(() => previousPeriod(period), [period]);

  const clearPeriod = useCallback(() => {
    setCustomStart('');
    setCustomEnd('');
    setPreset('this_week');
  }, []);

  const { data: trips = [], isLoading: tripsLoading, refetch: refetchTrips } = useQuery({
    queryKey: ['vehicleAnalyticsTrips', period.startYmd, period.endYmd],
    queryFn: () => fetchAllPeriodTrips(period.startYmd, period.endYmd).catch(() => []),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: priorTrips = [] } = useQuery({
    queryKey: ['vehicleAnalyticsTripsPrior', prior.startYmd, prior.endYmd],
    queryFn: () => fetchAllPeriodTrips(prior.startYmd, prior.endYmd).catch(() => []),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: tripStats } = useQuery({
    queryKey: ['vehicleAnalyticsTripStats', period.startYmd, period.endYmd],
    queryFn: () =>
      api
        .getTripStats({ startDate: period.startYmd, endDate: period.endYmd })
        .catch(() => null),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: priorTripStats } = useQuery({
    queryKey: ['vehicleAnalyticsTripStatsPrior', prior.startYmd, prior.endYmd],
    queryFn: () =>
      api
        .getTripStats({ startDate: prior.startYmd, endDate: prior.endYmd })
        .catch(() => null),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: rawVehicles = [], isLoading: vehiclesLoading, refetch: refetchVehicles } = useQuery<Vehicle[]>({
    queryKey: ['vehicles'],
    queryFn: () => api.getVehicles().catch(() => []),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: vehicleMetrics = [] } = useQuery<VehicleMetrics[]>({
    queryKey: ['vehicleMetrics'],
    queryFn: () => api.getVehicleMetrics().catch(() => []),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: maintenanceSummary } = useQuery({
    queryKey: ['maintenanceFleetSummary'],
    queryFn: () => api.getMaintenanceFleetSummary().catch(() => ({ items: [] })),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: ledgerEvents = [], isLoading: ledgerLoading, refetch: refetchLedger } = useQuery({
    queryKey: ['vehicleAnalyticsLedger', period.startYmd, period.endYmd],
    queryFn: () => fetchAllCanonicalEvents(period.startYmd, period.endYmd).catch(() => []),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: priorLedgerEvents = [] } = useQuery({
    queryKey: ['vehicleAnalyticsLedgerPrior', prior.startYmd, prior.endYmd],
    queryFn: () => fetchAllCanonicalEvents(prior.startYmd, prior.endYmd).catch(() => []),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: maintenanceLogs = [] } = useQuery<MaintenanceLog[]>({
    queryKey: ['allMaintenanceLogs'],
    queryFn: () => api.getAllMaintenanceLogs().catch(() => []),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Selected-vehicle health (lazy)
  const { data: selectedOdo = [], isLoading: odoLoading } = useQuery({
    queryKey: ['vehicleAnalyticsOdo', selectedVehicleId],
    queryFn: async () => {
      if (!selectedVehicleId) return [];
      const { odometerService } = await import('../services/odometerService');
      return odometerService.getUnifiedHistory(selectedVehicleId).catch(() => []);
    },
    enabled: !!selectedVehicleId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: selectedFuelSummary, isLoading: fuelLoading } = useQuery({
    queryKey: ['vehicleAnalyticsFuel', selectedVehicleId],
    queryFn: () =>
      selectedVehicleId
        ? api.getFuelAuditSummary(selectedVehicleId).catch(() => null)
        : Promise.resolve(null),
    enabled: !!selectedVehicleId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const loading = tripsLoading || vehiclesLoading || ledgerLoading;

  const metricsMap = useMemo(() => {
    const map = new Map<string, VehicleMetrics>();
    vehicleMetrics.forEach((m) => {
      if (m.vehicleId) map.set(m.vehicleId, m);
      if (m.plateNumber) map.set(m.plateNumber, m);
    });
    return map;
  }, [vehicleMetrics]);

  const periodTrips = useMemo(() => filterTripsInPeriod(trips, period), [trips, period]);

  const tripsByVehicle = useMemo(() => {
    const map = new Map<string, Trip[]>();
    periodTrips.forEach((t) => {
      if (!t.vehicleId || t.vehicleId === 'unknown') return;
      if (!map.has(t.vehicleId)) map.set(t.vehicleId, []);
      map.get(t.vehicleId)!.push(t);
    });
    return map;
  }, [periodTrips]);

  // Active = completed ≥1 trip in selected period
  const statusById = useMemo(() => {
    const map = new Map<string, Vehicle['status']>();
    rawVehicles.forEach((v) => {
      if (v.status === 'Maintenance' || v.status === 'Decommissioned') {
        map.set(v.id, v.status);
        return;
      }
      const vTrips = tripsByVehicle.get(v.id) || [];
      const hasCompleted = vTrips.some((t) => t.status === 'Completed' || !t.status);
      map.set(v.id, hasCompleted ? 'Active' : 'Inactive');
    });
    return map;
  }, [rawVehicles, tripsByVehicle]);

  const ledgerAgg = useMemo(
    () => aggregateLedgerCosts(ledgerEvents, period),
    [ledgerEvents, period],
  );
  const priorLedgerAgg = useMemo(
    () => aggregateLedgerCosts(priorLedgerEvents, prior),
    [priorLedgerEvents, prior],
  );

  const vehicleProfits = useMemo(
    () => profitByVehicle(periodTrips, ledgerAgg.byVehicle, rawVehicles, period),
    [periodTrips, ledgerAgg.byVehicle, rawVehicles, period],
  );

  const kpis: AnalyticsKpis = useMemo(() => {
    const grossRevenue = periodTrips.reduce((s, t) => s + getTripGrossRevenue(t), 0);
    const priorRevenue = priorTrips.reduce((s, t) => s + getTripGrossRevenue(t), 0);
    const fleetDistanceKm = periodTrips.reduce((s, t) => s + (t.distance || 0), 0);
    const priorDistance = priorTrips.reduce((s, t) => s + (t.distance || 0), 0);

    const completedFromStats = Number(tripStats?.completed ?? tripStats?.completedTrips);
    const cancelledFromStats = Number(tripStats?.cancelled ?? tripStats?.cancelledTrips);
    const completedTrips = Number.isFinite(completedFromStats)
      ? completedFromStats
      : periodTrips.filter((t) => t.status === 'Completed' || !t.status).length;
    const cancelledTrips = Number.isFinite(cancelledFromStats)
      ? cancelledFromStats
      : periodTrips.filter((t) => t.status === 'Cancelled').length;

    const priorCompleted = Number(
      priorTripStats?.completed ?? priorTripStats?.completedTrips ?? priorTrips.filter((t) => t.status === 'Completed' || !t.status).length,
    );

    const activeVehicles = rawVehicles.filter((v) => statusById.get(v.id) === 'Active').length;
    const totalVehicles = rawVehicles.length;

    const utilValues = rawVehicles
      .map((v) => utilizationFromMetrics(metricsMap.get(v.id) || (v.licensePlate ? metricsMap.get(v.licensePlate) : undefined)))
      .filter((u): u is number => u != null);
    const avgUtilizationPct =
      utilValues.length > 0 ? utilValues.reduce((a, b) => a + b, 0) / utilValues.length : null;

    const attributedProfits = vehicleProfits.filter((r) => r.hasAttributedCosts);
    const netProfitPerVehicle =
      attributedProfits.length > 0
        ? attributedProfits.reduce((s, r) => s + r.profit, 0) / attributedProfits.length
        : null;

    const priorProfits = profitByVehicle(
      priorTrips,
      priorLedgerAgg.byVehicle,
      rawVehicles,
      prior,
    ).filter((r) => r.hasAttributedCosts);
    const priorNetPerVehicle =
      priorProfits.length > 0
        ? priorProfits.reduce((s, r) => s + r.profit, 0) / priorProfits.length
        : null;

    return {
      grossRevenue,
      revenueDeltaPct: pctDelta(grossRevenue, priorRevenue),
      netProfitPerVehicle,
      netProfitDeltaPct:
        netProfitPerVehicle != null && priorNetPerVehicle != null
          ? pctDelta(netProfitPerVehicle, priorNetPerVehicle)
          : null,
      activeVehicles,
      totalVehicles,
      activeRatePct: totalVehicles > 0 ? (activeVehicles / totalVehicles) * 100 : 0,
      avgUtilizationPct,
      completedTrips,
      cancelledTrips,
      cancellationRatePct: cancellationRate(completedTrips, cancelledTrips),
      tripsDeltaPct: pctDelta(completedTrips, priorCompleted),
      fleetDistanceKm,
      distanceDeltaPct: pctDelta(fleetDistanceKm, priorDistance),
      revenuePerTrip: revenuePerTrip(grossRevenue, completedTrips),
      revenuePerKm: revenuePerKm(grossRevenue, fleetDistanceKm),
      fleetOperatingProfit: ledgerEvents.length > 0 ? ledgerAgg.fleetOperatingProfit : null,
      costCoveragePct: ledgerAgg.coveragePct,
      unattributedCostTotal: ledgerAgg.unattributedTotal,
      revenueSpark: sparklineBuckets(periodTrips, period, getTripGrossRevenue),
      profitSpark: sparklineBuckets(periodTrips, period, getTripGrossRevenue),
      tripsSpark: sparklineBuckets(periodTrips, period, () => 1),
      distanceSpark: sparklineBuckets(periodTrips, period, (t) => t.distance || 0),
    };
  }, [
    periodTrips,
    priorTrips,
    tripStats,
    priorTripStats,
    rawVehicles,
    statusById,
    metricsMap,
    vehicleProfits,
    priorLedgerAgg,
    prior,
    ledgerAgg,
    ledgerEvents.length,
    period,
  ]);

  const leaderboard: LeaderboardRow[] = useMemo(() => {
    const profitMap = new Map(vehicleProfits.map((p) => [p.vehicleId, p]));
    const rows = rawVehicles
      .map((v) => {
        const vTrips = tripsByVehicle.get(v.id) || [];
        const revenue = vTrips.reduce((s, t) => s + getTripGrossRevenue(t), 0);
        const metric = metricsMap.get(v.id) || (v.licensePlate ? metricsMap.get(v.licensePlate) : undefined);
        const profitRow = profitMap.get(v.id);
        const lastTrip = vTrips.reduce<Trip | null>(
          (latest, t) => (!latest || tripDateYmd(t) > tripDateYmd(latest) ? t : latest),
          null,
        );
        return {
          vehicleId: v.id,
          label: v.licensePlate || `${v.make} ${v.model}`.trim() || v.id,
          driverName: v.currentDriverName || lastTrip?.driverName || 'Unassigned',
          revenue,
          utilizationPct: utilizationFromMetrics(metric),
          attributedCosts: profitRow?.attributedCosts ?? 0,
          profit: profitRow?.hasAttributedCosts ? profitRow.profit : null,
        };
      })
      .filter((r) => r.revenue > 0 || r.attributedCosts > 0);

    rows.sort((a, b) => {
      if (leaderboardSort === 'profit') return (b.profit ?? -Infinity) - (a.profit ?? -Infinity);
      if (leaderboardSort === 'utilization') return (b.utilizationPct ?? -1) - (a.utilizationPct ?? -1);
      return b.revenue - a.revenue;
    });
    return rows;
  }, [rawVehicles, tripsByVehicle, metricsMap, vehicleProfits, leaderboardSort]);

  const costByVehicle: CostByVehicleRow[] = useMemo(() => {
    return Array.from(ledgerAgg.byVehicle.entries())
      .map(([vehicleId, costs]) => {
        const v = rawVehicles.find((x) => x.id === vehicleId);
        return {
          vehicleId,
          label: v?.licensePlate || vehicleId,
          costs,
        };
      })
      .filter((r) => r.costs.total > 0)
      .sort((a, b) => b.costs.total - a.costs.total);
  }, [ledgerAgg.byVehicle, rawVehicles]);

  const dailyCostBreakdown: DailyCostPoint[] = useMemo(
    () => buildDailyCostBreakdown(periodTrips, ledgerEvents, period),
    [periodTrips, ledgerEvents, period],
  );

  const commissionRows: CommissionRow[] = useMemo(
    () => commissionByVehicle(ledgerEvents, period, rawVehicles),
    [ledgerEvents, period, rawVehicles],
  );

  const profitScatter: VehicleProfitRow[] = useMemo(
    () => vehicleProfits.filter((r) => r.hasAttributedCosts && r.revenue > 0),
    [vehicleProfits],
  );

  const heatmap: HeatmapData = useMemo(
    () => buildUtilizationHeatmap(periodTrips),
    [periodTrips],
  );

  const getHeatCellTrips = useCallback(
    (rowIdx: number, dayIdx: number) => tripsInHeatCell(periodTrips, rowIdx, dayIdx),
    [periodTrips],
  );

  const idleRows: IdleRow[] = useMemo(() => {
    return rawVehicles
      .map((v) => {
        const metric = metricsMap.get(v.id) || (v.licensePlate ? metricsMap.get(v.licensePlate) : undefined);
        const idle = idleHoursFromMetrics(metric);
        if (idle == null) return null;
        return {
          vehicleId: v.id,
          label: v.licensePlate || v.id,
          idleHours: idle,
          onlineHours: metric?.onlineHours ?? null,
          onTripHours: metric?.onTripHours ?? null,
          openTime: metric?.openTime ?? null,
        };
      })
      .filter((r): r is IdleRow => r != null)
      .sort((a, b) => b.idleHours - a.idleHours);
  }, [rawVehicles, metricsMap]);

  const statusBoard: StatusBoardVehicle[] = useMemo(() => {
    const order: Record<string, number> = { Active: 0, Maintenance: 1, Inactive: 2, Decommissioned: 3 };
    return rawVehicles
      .map((v) => {
        const vTrips = tripsByVehicle.get(v.id) || [];
        const lastTrip = vTrips.reduce<Trip | null>((latest, t) => {
          const end = t.dropoffTime || t.requestTime || t.date;
          if (!latest) return t;
          const latestEnd = latest.dropoffTime || latest.requestTime || latest.date;
          return new Date(end) > new Date(latestEnd) ? t : latest;
        }, null);
        const metric = metricsMap.get(v.id) || (v.licensePlate ? metricsMap.get(v.licensePlate) : undefined);
        return {
          id: v.id,
          plate: v.licensePlate || v.id,
          modelLabel: [v.make, v.model].filter(Boolean).join(' '),
          status: statusById.get(v.id) || v.status,
          driverName: v.currentDriverName || lastTrip?.driverName,
          nextServiceDate: v.nextServiceDate,
          serviceStatus: v.serviceStatus,
          lastTripEnd: lastTrip
            ? lastTrip.dropoffTime || lastTrip.requestTime || lastTrip.date
            : undefined,
          utilizationPct: utilizationFromMetrics(metric),
        };
      })
      .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  }, [rawVehicles, tripsByVehicle, statusById, metricsMap]);

  const maintenanceAlerts: MaintenanceAlert[] = useMemo(() => {
    const items = maintenanceSummary?.items ?? [];
    const alerts: MaintenanceAlert[] = [];
    items.forEach((item) => {
      if (!item.servicesAttention?.length) return;
      const overdue = item.servicesAttention.filter((s) => s.kind === 'overdue');
      const dueSoon = item.servicesAttention.filter((s) => s.kind === 'due_soon');
      const plate = item.licensePlate || item.vehicleId;
      if (overdue.length > 0) {
        const kmNote = item.maxKmOverdue
          ? ` ${Math.round(item.maxKmOverdue).toLocaleString()} km overdue.`
          : '';
        alerts.push({
          vehicleId: item.vehicleId,
          plate,
          severity: 'high',
          title: overdue.map((s) => s.taskName).join(', '),
          detail: `Overdue service on this vehicle.${kmNote}`,
        });
      }
      if (dueSoon.length > 0) {
        alerts.push({
          vehicleId: item.vehicleId,
          plate,
          severity: 'medium',
          title: dueSoon.map((s) => s.taskName).join(', '),
          detail: item.nextDueOdometer
            ? `Due soon — next service at ${Math.round(item.nextDueOdometer).toLocaleString()} km (currently ${Math.round(item.odometer).toLocaleString()} km).`
            : 'Due soon per the maintenance schedule.',
        });
      }
    });
    return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
  }, [maintenanceSummary]);

  const periodMaintenanceLogs = useMemo(() => {
    return (maintenanceLogs || []).filter((log) => {
      const d = String(log.date || '').slice(0, 10);
      return d >= period.startYmd && d <= period.endYmd;
    });
  }, [maintenanceLogs, period]);

  const selectedVehicle = useMemo(
    () => rawVehicles.find((v) => v.id === selectedVehicleId) || null,
    [rawVehicles, selectedVehicleId],
  );

  const selectedDailyMileage = useMemo(() => {
    if (!selectedOdo.length) return [];
    const sorted = [...selectedOdo].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const byDay = new Map<string, number>();
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const delta = Number(cur.value) - Number(prev.value);
      if (delta <= 0 || delta > 2000) continue; // skip resets / absurd jumps
      const key = String(cur.date).slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + delta);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateYmd, km]) => ({
        dateYmd,
        name: format(new Date(dateYmd), 'MMM d'),
        km: Number(km.toFixed(1)),
      }));
  }, [selectedOdo]);

  const selectedServiceWarning = useMemo(() => {
    const item = (maintenanceSummary?.items ?? []).find((i) => i.vehicleId === selectedVehicleId);
    if (!item) return null;
    return item;
  }, [maintenanceSummary, selectedVehicleId]);

  const refresh = () => {
    refetchTrips();
    refetchVehicles();
    refetchLedger();
  };

  return {
    loading,
    hasTrips: periodTrips.length > 0,
    hasVehicles: rawVehicles.length > 0,
    period,
    preset,
    setPreset,
    customStart,
    customEnd,
    setCustomStart,
    setCustomEnd,
    clearPeriod,
    kpis,
    leaderboard,
    leaderboardSort,
    setLeaderboardSort,
    costByVehicle,
    dailyCostBreakdown,
    commissionRows,
    profitScatter,
    fleetCosts: ledgerAgg.fleetCosts,
    heatmap,
    getHeatCellTrips,
    idleRows,
    statusBoard,
    maintenanceAlerts,
    periodMaintenanceLogs,
    maintenanceLogs,
    vehicles: rawVehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    selectedVehicle,
    selectedOdo,
    selectedDailyMileage,
    selectedFuelSummary,
    selectedServiceWarning,
    odoLoading,
    fuelLoading,
    refresh,
  };
}

export type { CostBuckets, DailyCostPoint, CommissionRow, VehicleProfitRow, HeatmapData, BusinessFinancePeriod };
