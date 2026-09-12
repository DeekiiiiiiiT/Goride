import React from 'react';
import { Trip } from '../../../types/data';
import { DollarSign, MapPin, Clock, CheckCircle2, TrendingUp } from 'lucide-react';
import { getTripNetIncome } from '../../../utils/tripNetIncome';
import { usePlatformConfig } from '../../auth/PlatformConfigContext';

function getNetIncome(t: Trip): number | null {
  return getTripNetIncome(t);
}

function fmtNum(v: number, decimals = 1): string {
  return v.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  iconClasses: string;
}

function StatCard({ label, value, sub, icon, iconClasses }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
      <div className={`shrink-0 p-2 rounded-lg ${iconClasses}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</p>
        <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

interface TripLedgerStatsProps {
  trips: Trip[];
  total: number;
  loading: boolean;
  /** Filtered-set totals from /trips/stats (F-12) — prefer these over page math. */
  filterSumAmount?: number;
  filterSumNet?: number;
  filterNetKnownCount?: number;
  filterNetUnknownCount?: number;
  filterAvgAmount?: number;
  filterAvgDistance?: number;
  filterCompletionRate?: number;
  filterCompleted?: number;
  filterDistanceCount?: number;
}

export function TripLedgerStats({
  trips,
  total,
  loading,
  filterSumAmount,
  filterSumNet,
  filterNetKnownCount,
  filterNetUnknownCount,
  filterAvgAmount,
  filterAvgDistance,
  filterCompletionRate,
  filterCompleted,
  filterDistanceCount,
}: TripLedgerStatsProps) {
  // F-34: org currency from platform config; fall back to first trip payload currency, then USD
  const { formatCurrency, defaultCurrency } = usePlatformConfig();
  const tripCurrency = (trips[0] as Trip & { currency?: string } | undefined)?.currency;
  const currencyCode = tripCurrency || defaultCurrency || 'USD';
  const fmt$ = (v: number) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(v);
    } catch {
      return formatCurrency(v);
    }
  };

  const useFilterKpis = filterSumAmount != null;
  const completed = trips.filter(t => t.status === 'Completed');
  const pageCompletionRate = trips.length > 0 ? (completed.length / trips.length) * 100 : 0;

  const pageRevenue = trips.reduce((sum, t) => sum + (t.amount || 0), 0);
  const pageNet = trips.reduce((sum, t) => sum + (getNetIncome(t) || 0), 0);
  const totalRevenue = filterSumAmount != null ? filterSumAmount : pageRevenue;
  const totalNet = filterSumNet != null ? filterSumNet : pageNet;

  const avgBasis = completed.length > 0 ? completed : trips.filter(t => (t.amount || 0) > 0);
  const pageAvgAmount = avgBasis.length > 0
    ? avgBasis.reduce((sum, t) => sum + (t.amount || 0), 0) / avgBasis.length
    : 0;
  const tripsWithDist = trips.filter(t => t.distance != null && t.distance > 0);
  const pageAvgDistance = tripsWithDist.length > 0
    ? tripsWithDist.reduce((sum, t) => sum + (t.distance || 0), 0) / tripsWithDist.length
    : 0;

  const avgAmount = filterAvgAmount != null ? filterAvgAmount : pageAvgAmount;
  const avgDistance = filterAvgDistance != null ? filterAvgDistance : pageAvgDistance;
  const completionRate = filterCompletionRate != null ? filterCompletionRate : pageCompletionRate;

  let netSub: string;
  if (filterSumAmount != null && filterNetKnownCount != null) {
    const denom = filterNetKnownCount + (filterNetUnknownCount ?? 0);
    netSub = denom > 0
      ? `Net: ${fmt$(totalNet)} over ${filterNetKnownCount.toLocaleString()} of ${denom.toLocaleString()} trips`
      : `Net: ${fmt$(totalNet)} (filter)`;
  } else if (filterSumAmount != null) {
    netSub = `Net: ${fmt$(totalNet)} (filter)`;
  } else {
    netSub = `Net: ${fmt$(totalNet)}`;
  }

  if (loading && trips.length === 0) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-slate-200 dark:bg-slate-700" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatCard
        label="Total Trips"
        value={total.toLocaleString()}
        sub={`${trips.length} loaded on page`}
        icon={<CheckCircle2 className="h-4 w-4" />}
        iconClasses="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
      />
      <StatCard
        label={useFilterKpis ? "Filter Revenue" : "Page Revenue"}
        value={fmt$(totalRevenue)}
        sub={netSub}
        icon={<DollarSign className="h-4 w-4" />}
        iconClasses="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
      />
      <StatCard
        label="Avg Trip Amount"
        value={(useFilterKpis ? (filterAvgAmount != null && filterAvgAmount > 0) : avgBasis.length > 0) ? fmt$(avgAmount) : '—'}
        sub={useFilterKpis
          ? `completed in filter${filterCompleted != null ? ` (${filterCompleted.toLocaleString()})` : ''}`
          : (completed.length > 0 ? 'completed on page (excl. cancelled)' : 'per trip on page')}
        icon={<TrendingUp className="h-4 w-4" />}
        iconClasses="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
      />
      <StatCard
        label="Avg Distance"
        value={(useFilterKpis ? (filterDistanceCount ?? 0) > 0 : tripsWithDist.length > 0) ? `${fmtNum(avgDistance)} km` : '—'}
        sub={useFilterKpis
          ? `${(filterDistanceCount ?? 0).toLocaleString()} trips with data`
          : (tripsWithDist.length > 0 ? `${tripsWithDist.length} trips with data` : 'no distance data')}
        icon={<MapPin className="h-4 w-4" />}
        iconClasses="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
      />
      <StatCard
        label="Completion Rate"
        value={(useFilterKpis ? total > 0 : trips.length > 0) ? `${fmtNum(completionRate, 0)}%` : '—'}
        sub={useFilterKpis
          ? `${(filterCompleted ?? 0).toLocaleString()}/${total.toLocaleString()} in filter`
          : (trips.length > 0 ? `${completed.length}/${trips.length} on page` : '')}
        icon={<Clock className="h-4 w-4" />}
        iconClasses="bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400"
      />
    </div>
  );
}
