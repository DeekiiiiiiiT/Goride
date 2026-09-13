import React, { useMemo } from 'react';
import { TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
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
    const usageLogs = logs.filter((l) => l.isUsage);
    const topupLogs = logs.filter((l) => !l.isUsage);

    const totalSpend = usageLogs.reduce((sum, l) => sum + l.absAmount, 0);
    const totalTopups = topupLogs.reduce((sum, l) => sum + l.absAmount, 0);
    const disputedCount = logs.filter(
      (l) =>
        l.status === 'Flagged' || l.status === 'Rejected' || l._raw?.metadata?.disputed,
    ).length;

    return { totalSpend, totalTopups, disputedCount };
  }, [logs]);

  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg text-sm">
        <TrendingDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
        <span className="text-rose-700 dark:text-rose-300 font-medium">
          Spend: {fmtJMD(stats.totalSpend)}
        </span>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm">
        <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="text-emerald-700 dark:text-emerald-300 font-medium">
          Top-ups: {fmtJMD(stats.totalTopups)}
        </span>
      </div>

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
