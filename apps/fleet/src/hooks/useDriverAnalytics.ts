import { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Trip, DriverMetrics } from '../types/data';
import type { PeriodPreset } from '../components/business-finance/types';
import { resolvePeriod, previousPeriod } from '../components/business-finance/periodRange';
import {
  filterTripsInPeriod,
  latestMetricsByDriver,
  buildDriverRows,
  buildDriverKpis,
  buildUtilizationHeatmap,
  buildPlatformMix,
  buildDriverAlerts,
  buildTenureDistribution,
  type DriverRow,
  type DriverKpis,
} from '../utils/driverAnalyticsAggregates';

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

export function useDriverAnalytics() {
  const [preset, setPreset] = useState<PeriodPreset>('this_week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [search, setSearch] = useState('');
  const [leaderboardMode, setLeaderboardMode] = useState<'top' | 'bottom' | 'all'>('top');
  const [tierFilter, setTierFilter] = useState<string>('all');

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
    queryKey: ['driverAnalyticsTrips', period.startYmd, period.endYmd],
    queryFn: () => fetchAllPeriodTrips(period.startYmd, period.endYmd).catch(() => []),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: priorTrips = [] } = useQuery({
    queryKey: ['driverAnalyticsTripsPrior', prior.startYmd, prior.endYmd],
    queryFn: () => fetchAllPeriodTrips(prior.startYmd, prior.endYmd).catch(() => []),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: drivers = [], isLoading: driversLoading, refetch: refetchDrivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.getDrivers().catch(() => []),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: driverMetrics = [], isLoading: metricsLoading, refetch: refetchMetrics } = useQuery<DriverMetrics[]>({
    queryKey: ['driverMetrics'],
    queryFn: () => api.getDriverMetrics().catch(() => []),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const loading = tripsLoading || driversLoading || metricsLoading;

  const metricsMap = useMemo(() => latestMetricsByDriver(driverMetrics), [driverMetrics]);

  const periodTrips = useMemo(() => filterTripsInPeriod(trips, period), [trips, period]);
  // prior trips already fetched for prior window
  const priorPeriodTrips = priorTrips;

  const periodRows = useMemo(
    () => buildDriverRows(periodTrips, drivers as any[], metricsMap),
    [periodTrips, drivers, metricsMap],
  );
  const priorRows = useMemo(
    () => buildDriverRows(priorPeriodTrips, drivers as any[], metricsMap),
    [priorPeriodTrips, drivers, metricsMap],
  );

  const kpis: DriverKpis = useMemo(
    () =>
      buildDriverKpis(
        periodRows,
        priorRows,
        periodTrips,
        priorPeriodTrips,
        period,
        (drivers as any[]).length,
      ),
    [periodRows, priorRows, periodTrips, priorPeriodTrips, period, drivers],
  );

  const tierOptions = useMemo(() => {
    const set = new Set<string>();
    periodRows.forEach((r) => {
      if (r.tier) set.add(r.tier);
    });
    return Array.from(set).sort();
  }, [periodRows]);

  const leaderboard: DriverRow[] = useMemo(() => {
    let rows = periodRows.filter((r) => r.trips > 0 || r.cancelled > 0 || r.earnings > 0);
    if (tierFilter !== 'all') {
      rows = rows.filter((r) => r.tier === tierFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) => r.name.toLowerCase().includes(q) || r.driverId.toLowerCase().includes(q),
      );
    }
    const sorted = [...rows].sort((a, b) => b.earnings - a.earnings);
    if (leaderboardMode === 'top') return sorted.slice(0, 10);
    if (leaderboardMode === 'bottom') return [...sorted].reverse().slice(0, 10);
    return sorted;
  }, [periodRows, tierFilter, search, leaderboardMode]);

  const heatmap = useMemo(() => buildUtilizationHeatmap(periodTrips), [periodTrips]);
  const platformMix = useMemo(() => buildPlatformMix(periodTrips), [periodTrips]);
  const alerts = useMemo(() => buildDriverAlerts(periodRows, priorRows), [periodRows, priorRows]);
  const tenure = useMemo(() => buildTenureDistribution(drivers as any[]), [drivers]);

  const refresh = useCallback(() => {
    void refetchTrips();
    void refetchDrivers();
    void refetchMetrics();
  }, [refetchTrips, refetchDrivers, refetchMetrics]);

  const exportCsv = useCallback(() => {
    const lines = [
      'Driver,Driver ID,Tier,Trips,Cancelled,Earnings,Online Hours,Utilization %,Acceptance %,Cancellation %,Rating,Status',
    ];
    const all = [...periodRows].sort((a, b) => b.earnings - a.earnings);
    all.forEach((r) => {
      lines.push(
        [
          r.name,
          r.driverId,
          r.tier || '',
          String(r.trips),
          String(r.cancelled),
          r.earnings.toFixed(2),
          r.onlineHours != null ? r.onlineHours.toFixed(1) : '',
          r.utilizationPct != null ? r.utilizationPct.toFixed(1) : '',
          r.acceptanceRate != null ? (r.acceptanceRate * 100).toFixed(1) : '',
          r.cancellationRate != null ? (r.cancellationRate * 100).toFixed(1) : '',
          r.rating != null ? r.rating.toFixed(2) : '',
          r.status,
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(','),
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `driver-analytics-${period.startYmd}-to-${period.endYmd}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [periodRows, period]);

  return {
    loading,
    hasData: (drivers as any[]).length > 0 || trips.length > 0 || driverMetrics.length > 0,
    period,
    preset,
    setPreset,
    customStart,
    customEnd,
    setCustomStart,
    setCustomEnd,
    clearPeriod,
    search,
    setSearch,
    leaderboardMode,
    setLeaderboardMode,
    tierFilter,
    setTierFilter,
    tierOptions,
    kpis,
    leaderboard,
    heatmap,
    platformMix,
    alerts,
    tenure,
    refresh,
    exportCsv,
  };
}
