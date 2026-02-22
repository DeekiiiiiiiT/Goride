import React, { useMemo } from 'react';
import {
  Receipt,
  TrendingDown,
  TrendingUp,
  Calculator,
  MapPin,
  AlertTriangle,
} from 'lucide-react';
import { TollLogEntry } from '../../types/tollLog';

interface TollLogStatsProps {
  logs: TollLogEntry[];
}

/**
 * Format a number as JMD currency (no cents if whole number, 2 decimals otherwise).
 */
function fmtJMD(value: number): string {
  if (value === 0) return '$0';
  return value.toLocaleString('en-JM', {
    style: 'currency',
    currency: 'JMD',
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function TollLogStats({ logs }: TollLogStatsProps) {
  const stats = useMemo(() => {
    const usageLogs = logs.filter(l => l.isUsage);
    const topupLogs = logs.filter(l => !l.isUsage);

    // 1. Total transactions
    const totalCount = logs.length;

    // 2. Total toll spend (usage — these are debits)
    const totalSpend = usageLogs.reduce((sum, l) => sum + l.absAmount, 0);

    // 3. Total top-ups (credits)
    const totalTopups = topupLogs.reduce((sum, l) => sum + l.absAmount, 0);

    // 4. Average cost per passage
    const avgCost = usageLogs.length > 0 ? totalSpend / usageLogs.length : 0;

    // 5. Most frequented plaza
    const plazaCounts = new Map<string, number>();
    for (const l of usageLogs) {
      const name = l.plazaName || l.locationRaw || 'Unknown';
      plazaCounts.set(name, (plazaCounts.get(name) || 0) + 1);
    }
    let topPlazaName = '—';
    let topPlazaCount = 0;
    for (const [name, count] of plazaCounts) {
      if (count > topPlazaCount) {
        topPlazaName = name;
        topPlazaCount = count;
      }
    }

    // 6. Disputed / claimable
    const disputedCount = logs.filter(
      l => l.status === 'Flagged' || l.status === 'Rejected' || l._raw?.metadata?.disputed
    ).length;

    return {
      totalCount,
      totalSpend,
      totalTopups,
      avgCost,
      topPlazaName,
      topPlazaCount,
      disputedCount,
    };
  }, [logs]);

  return (
    <div className="flex flex-wrap gap-3">
      {/* Total Transactions */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm">
        <Receipt className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
        <span className="text-slate-500 dark:text-slate-400">Total:</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {stats.totalCount.toLocaleString()}
        </span>
      </div>

      {/* Total Toll Spend */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg text-sm">
        <TrendingDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
        <span className="text-rose-700 dark:text-rose-300 font-medium">
          Spend: {fmtJMD(stats.totalSpend)}
        </span>
      </div>

      {/* Total Top-ups */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm">
        <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="text-emerald-700 dark:text-emerald-300 font-medium">
          Top-ups: {fmtJMD(stats.totalTopups)}
        </span>
      </div>

      {/* Avg Cost Per Passage */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
        <Calculator className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        <span className="text-blue-700 dark:text-blue-300 font-medium">
          Avg: {fmtJMD(stats.avgCost)}
        </span>
      </div>

      {/* Most Frequented Plaza */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg text-sm max-w-xs">
        <MapPin className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span className="text-indigo-700 dark:text-indigo-300 font-medium truncate">
          Top: {stats.topPlazaName}
          {stats.topPlazaCount > 0 && (
            <span className="text-indigo-500 dark:text-indigo-400 font-normal ml-1">
              ({stats.topPlazaCount})
            </span>
          )}
        </span>
      </div>

      {/* Disputed / Claimable (only show if > 0) */}
      {stats.disputedCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span className="text-amber-700 dark:text-amber-300 font-medium">
            Disputed: {stats.disputedCount}
          </span>
        </div>
      )}
    </div>
  );
}
