import React from 'react';
import { FuelEntry } from '../../../types/fuel';
import { DollarSign, Droplets, Gauge, Anchor, Flag } from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Main Component ──────────────────────────────────────────────────────────

interface FuelLedgerStatsProps {
  entries: FuelEntry[];   // filtered set (all pages)
  loading: boolean;
}

export function FuelLedgerStats({ entries, loading }: FuelLedgerStatsProps) {
  // ── Compute stats across the entire filtered set ──
  const totalCost = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalLiters = entries.reduce((sum, e) => sum + (e.liters || 0), 0);

  const withLiters = entries.filter(e => e.liters != null && e.liters > 0);
  const avgPricePerLiter = withLiters.length > 0
    ? withLiters.reduce((sum, e) => sum + (e.pricePerLiter || (e.amount / (e.liters || 1))), 0) / withLiters.length
    : 0;

  const anchorCount = entries.filter(e => e.entryMode === 'Anchor').length;
  const anchorPct = entries.length > 0 ? (anchorCount / entries.length) * 100 : 0;

  const flaggedCount = entries.filter(e => e.isFlagged || e.auditStatus === 'Flagged').length;

  // ── Skeleton state ──
  if (loading && entries.length === 0) {
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
        label="Total Entries"
        value={entries.length.toLocaleString()}
        sub={`${anchorCount} anchor · ${entries.length - anchorCount} floating`}
        icon={<Droplets className="h-4 w-4" />}
        iconClasses="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
      />
      <StatCard
        label="Total Fuel Cost"
        value={fmt$(totalCost)}
        sub={entries.length > 0 ? `Avg ${fmt$(totalCost / entries.length)} / entry` : undefined}
        icon={<DollarSign className="h-4 w-4" />}
        iconClasses="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
      />
      <StatCard
        label="Total Volume"
        value={totalLiters > 0 ? `${fmtNum(totalLiters)} L` : '—'}
        sub={withLiters.length > 0 ? `${withLiters.length} entries with volume data` : 'no volume data'}
        icon={<Gauge className="h-4 w-4" />}
        iconClasses="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
      />
      <StatCard
        label="Avg $/Liter"
        value={avgPricePerLiter > 0 ? `$${fmtNum(avgPricePerLiter, 2)}` : '—'}
        sub={withLiters.length > 0 ? `across ${withLiters.length} fill-ups` : 'no data'}
        icon={<Anchor className="h-4 w-4" />}
        iconClasses="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
      />
      <StatCard
        label="Flagged"
        value={flaggedCount.toLocaleString()}
        sub={entries.length > 0
          ? flaggedCount > 0
            ? `${fmtNum(anchorPct, 0)}% anchor rate`
            : `${fmtNum(anchorPct, 0)}% anchor rate · all clear`
          : ''}
        icon={<Flag className="h-4 w-4" />}
        iconClasses={flaggedCount > 0
          ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}
      />
    </div>
  );
}
