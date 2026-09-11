import React from 'react';
import { Trip } from '../../../types/data';
import { DollarSign, MapPin, Clock, CheckCircle2, TrendingUp } from 'lucide-react';
import { getTripNetIncome } from '../../../utils/tripNetIncome';

// ── Helpers ─────────────────────────────────────────────────────────────────

function getNetIncome(t: Trip): number | null {
  return getTripNetIncome(t);
}

function fmt$(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtNum(v: number, decimals = 1): string {
  return v.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ── Stat card ───────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  iconClasses: string; // full tailwind classes for icon container
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

// ── Main Component ──────────────────────────────────────────────────────────

interface TripLedgerStatsProps {
  trips: Trip[];       // current page of trips
  total: number;       // total filtered count
  loading: boolean;
  /** Filtered-set money totals from /trips/stats (F-12). */
  filterSumAmount?: number;
  filterSumNet?: number;
}

export function TripLedgerStats({
  trips,
  total,
  loading,
  filterSumAmount,
  filterSumNet,
}: TripLedgerStatsProps) {
  // Compute stats from loaded page
  const completed = trips.filter(t => t.status === 'Completed');
  const completionRate = trips.length > 0
    ? (completed.length / trips.length) * 100
    : 0;

  const pageRevenue = trips.reduce((sum, t) => sum + (t.amount || 0), 0);
  const pageNet = trips.reduce((sum, t) => sum + (getNetIncome(t) || 0), 0);
  const totalRevenue = filterSumAmount != null ? filterSumAmount : pageRevenue;
  const totalNet = filterSumNet != null ? filterSumNet : pageNet;
  // Exclude cancelled / non-completed from monetary averages (F-27)
  const avgBasis = completed.length > 0 ? completed : trips.filter(t => (t.amount || 0) > 0);
  const avgAmount = avgBasis.length > 0
    ? avgBasis.reduce((sum, t) => sum + (t.amount || 0), 0) / avgBasis.length
    : 0;

  const tripsWithDist = trips.filter(t => t.distance != null && t.distance > 0);
  const avgDistance = tripsWithDist.length > 0
    ? tripsWithDist.reduce((sum, t) => sum + (t.distance || 0), 0) / tripsWithDist.length
    : 0;

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
        label={filterSumAmount != null ? "Filter Revenue" : "Page Revenue"}
        value={fmt$(totalRevenue)}
        sub={
          filterSumAmount != null
            ? `Net: ${fmt$(totalNet)} (filter)`
            : `Net: ${fmt$(totalNet)}`
        }
        icon={<DollarSign className="h-4 w-4" />}
        iconClasses="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
      />
      <StatCard
        label="Avg Trip Amount"
        value={avgBasis.length > 0 ? fmt$(avgAmount) : '—'}
        sub={completed.length > 0 ? `completed on page (excl. cancelled)` : 'per trip on page'}
        icon={<TrendingUp className="h-4 w-4" />}
        iconClasses="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
      />
      <StatCard
        label="Avg Distance"
        value={tripsWithDist.length > 0 ? `${fmtNum(avgDistance)} km` : '—'}
        sub={tripsWithDist.length > 0 ? `${tripsWithDist.length} trips with data` : 'no distance data'}
        icon={<MapPin className="h-4 w-4" />}
        iconClasses="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
      />
      <StatCard
        label="Completion Rate"
        value={trips.length > 0 ? `${fmtNum(completionRate, 0)}%` : '—'}
        sub={trips.length > 0 ? `${completed.length}/${trips.length} on page` : ''}
        icon={<Clock className="h-4 w-4" />}
        iconClasses="bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400"
      />
    </div>
  );
}
