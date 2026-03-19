import React, { useMemo } from 'react';
import { TollLedgerEntry } from '../../../types/toll-ledger';
import { Receipt, CheckCircle2, AlertCircle, TrendingDown, Calculator } from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt$(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtPct(v: number): string {
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + '%';
}

// ── Stat card ───────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  iconClasses: string;
  valueClasses?: string;
}

function StatCard({ label, value, sub, icon, iconClasses, valueClasses }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
      <div className={`shrink-0 p-2 rounded-lg ${iconClasses}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</p>
        <p className={`text-lg font-bold leading-tight tabular-nums ${valueClasses || 'text-slate-800 dark:text-slate-100'}`}>
          {value}
        </p>
        {sub && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Reconciliation breakdown bar ────────────────────────────────────────────

const RECON_SEGMENTS: { key: string; label: string; barColor: string; textColor: string }[] = [
  { key: 'Matched', label: 'Matched', barColor: 'bg-green-500 dark:bg-green-600', textColor: 'text-green-700 dark:text-green-300' },
  { key: 'Unmatched', label: 'Unmatched', barColor: 'bg-red-500 dark:bg-red-600', textColor: 'text-red-700 dark:text-red-300' },
  { key: 'Dismissed', label: 'Dismissed', barColor: 'bg-slate-400 dark:bg-slate-500', textColor: 'text-slate-600 dark:text-slate-400' },
  { key: 'Approved', label: 'Approved', barColor: 'bg-blue-500 dark:bg-blue-600', textColor: 'text-blue-700 dark:text-blue-300' },
];

interface ReconBarProps {
  counts: Record<string, number>;
  total: number;
  loading: boolean;
  activeStatus?: string;
  onFilterByStatus?: (status: string) => void;
}

function ReconBreakdownBar({ counts, total, loading, activeStatus, onFilterByStatus }: ReconBarProps) {
  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 w-full" />
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="space-y-2">
        <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 w-full" />
        <p className="text-xs text-slate-400 dark:text-slate-500">No data</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Segmented bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
        {RECON_SEGMENTS.map((seg) => {
          const count = counts[seg.key] || 0;
          if (count === 0) return null;
          const pct = (count / total) * 100;
          const isActive = activeStatus === seg.key;
          return (
            <div
              key={seg.key}
              className={`${seg.barColor} transition-all duration-200 ${
                onFilterByStatus ? 'cursor-pointer hover:opacity-80' : ''
              } ${isActive ? 'ring-2 ring-offset-1 ring-rose-500 dark:ring-rose-400' : ''}`}
              style={{ width: `${pct}%`, minWidth: count > 0 ? '4px' : 0 }}
              onClick={() => onFilterByStatus?.(seg.key)}
              title={`${seg.label}: ${count.toLocaleString()} (${fmtPct(pct)})`}
            />
          );
        })}
      </div>

      {/* Labels */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {RECON_SEGMENTS.map((seg) => {
          const count = counts[seg.key] || 0;
          const isActive = activeStatus === seg.key;
          return (
            <button
              key={seg.key}
              onClick={() => onFilterByStatus?.(seg.key)}
              className={`text-xs tabular-nums transition-colors ${
                onFilterByStatus ? 'cursor-pointer hover:underline' : 'cursor-default'
              } ${isActive ? 'font-bold underline' : ''} ${seg.textColor}`}
            >
              {seg.label}: {count.toLocaleString()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

interface TollLedgerStatsProps {
  entries: TollLedgerEntry[];
  loading: boolean;
  activeReconStatus?: string;
  onFilterByStatus?: (status: string) => void;
}

export function TollLedgerStats({ entries, loading, activeReconStatus, onFilterByStatus }: TollLedgerStatsProps) {
  const stats = useMemo(() => {
    const total = entries.length;

    // Card 1: Total Charges — sum of absAmount for all entries
    const totalCharges = entries.reduce((sum, e) => sum + (typeof e.absAmount === 'number' ? e.absAmount : 0), 0);

    // Card 2: Matched Rate
    const matchedCount = entries.filter(e => e.reconciliationStatus === 'Matched').length;
    const matchedRate = total > 0 ? (matchedCount / total) * 100 : 0;

    // Card 3: Unmatched Count
    const unmatchedCount = entries.filter(e => e.reconciliationStatus === 'Unmatched').length;

    // Card 4: Total Loss
    const totalLoss = entries.reduce((sum, e) => {
      const v = typeof e.lossAmount === 'number' ? e.lossAmount : 0;
      return sum + (v > 0 ? v : 0);
    }, 0);

    // Card 5: Avg Charge
    const avgCharge = total > 0 ? totalCharges / total : 0;

    // Recon breakdown counts
    const reconCounts: Record<string, number> = {};
    for (const e of entries) {
      const s = e.reconciliationStatus || 'Unknown';
      reconCounts[s] = (reconCounts[s] || 0) + 1;
    }

    return { totalCharges, matchedRate, matchedCount, unmatchedCount, totalLoss, avgCharge, total, reconCounts };
  }, [entries]);

  // ── Skeleton state ──
  if (loading && entries.length === 0) {
    return (
      <div className="space-y-3">
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
        <ReconBreakdownBar counts={{}} total={0} loading={true} />
      </div>
    );
  }

  // Matched Rate color thresholds
  const matchedRateIconClasses =
    stats.matchedRate > 70
      ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'
      : stats.matchedRate >= 40
        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
        : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400';

  const matchedRateValueClasses =
    stats.matchedRate > 70
      ? 'text-green-700 dark:text-green-300'
      : stats.matchedRate >= 40
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-red-700 dark:text-red-300';

  // Unmatched Count color
  const unmatchedIconClasses = stats.unmatchedCount > 0
    ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
    : 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400';

  const unmatchedValueClasses = stats.unmatchedCount > 0
    ? 'text-red-700 dark:text-red-300'
    : 'text-green-700 dark:text-green-300';

  // Total Loss color
  const lossIconClasses = stats.totalLoss > 0
    ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400';

  const lossValueClasses = stats.totalLoss > 0
    ? 'text-red-700 dark:text-red-300'
    : undefined;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: Total Charges */}
        <StatCard
          label="Total Charges"
          value={fmt$(stats.totalCharges)}
          sub={`${stats.total.toLocaleString()} transaction${stats.total === 1 ? '' : 's'}`}
          icon={<Receipt className="h-4 w-4" />}
          iconClasses="bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400"
        />

        {/* Card 2: Matched Rate */}
        <StatCard
          label="Matched Rate"
          value={stats.total > 0 ? fmtPct(stats.matchedRate) : '\u2014'}
          sub={stats.total > 0 ? `${stats.matchedCount.toLocaleString()} of ${stats.total.toLocaleString()} matched` : undefined}
          icon={<CheckCircle2 className="h-4 w-4" />}
          iconClasses={matchedRateIconClasses}
          valueClasses={stats.total > 0 ? matchedRateValueClasses : undefined}
        />

        {/* Card 3: Unmatched Count */}
        <StatCard
          label="Unmatched"
          value={stats.unmatchedCount.toLocaleString()}
          sub={stats.unmatchedCount > 0 ? 'need reconciliation' : 'all reconciled'}
          icon={<AlertCircle className="h-4 w-4" />}
          iconClasses={unmatchedIconClasses}
          valueClasses={unmatchedValueClasses}
        />

        {/* Card 4: Total Loss */}
        <StatCard
          label="Total Loss"
          value={fmt$(stats.totalLoss)}
          sub={stats.totalLoss > 0 ? 'unrecovered charges' : 'no losses'}
          icon={<TrendingDown className="h-4 w-4" />}
          iconClasses={lossIconClasses}
          valueClasses={lossValueClasses}
        />

        {/* Card 5: Avg Charge */}
        <StatCard
          label="Avg Charge"
          value={stats.total > 0 ? fmt$(stats.avgCharge) : '\u2014'}
          sub={stats.total > 0 ? 'per transaction' : undefined}
          icon={<Calculator className="h-4 w-4" />}
          iconClasses="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
        />
      </div>

      {/* Reconciliation status breakdown bar */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Reconciliation Breakdown</p>
        <ReconBreakdownBar
          counts={stats.reconCounts}
          total={stats.total}
          loading={false}
          activeStatus={activeReconStatus}
          onFilterByStatus={onFilterByStatus}
        />
      </div>
    </div>
  );
}
