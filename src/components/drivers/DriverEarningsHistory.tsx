import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Download, Target } from "lucide-react";
import { FinancialTransaction, TierConfig, Trip, QuotaConfig } from "../../types/data";
import {
  startOfWeek, endOfWeek, format,
  eachWeekOfInterval, eachDayOfInterval, eachMonthOfInterval,
  startOfDay, endOfDay, startOfMonth, endOfMonth
} from "date-fns";
import { TierCalculations } from "../../utils/tierCalculations";
import { tierService } from "../../services/tierService";
import { getEffectiveTripEarnings } from "../../utils/tripEarnings";
import { exportToCSV } from "../../utils/csvHelpers";
import { toast } from "sonner@2.0.3";
import { ScrollArea } from "../ui/scroll-area";

interface DriverEarningsHistoryProps {
  driverId: string;
  transactions: FinancialTransaction[];
  trips?: Trip[];              // Source of Gross Revenue (Phase 2)
  quotaConfig?: QuotaConfig;   // For Quota % column (Phase 5)
}

export type PeriodType = 'daily' | 'weekly' | 'monthly';

interface PeriodRow {
  periodStart: Date;
  periodEnd: Date;
  grossRevenue: number;
  driverShare: number;
  fleetShare: number;
  expenses: number;
  tier: TierConfig;
  netEarnings: number;
  payouts: number;
  tripCount: number;
  transactionCount: number;
  quotaTarget: number | null;
  quotaPercent: number | null;
}

// ────────────────────────────────────────────────────────────
// Derive the quota target for a given period type from quotaConfig.
//   Daily  → weekly target / working days (derived from weekly config)
//   Weekly → weekly target directly
//   Monthly → monthly target if enabled, else weekly * 4.33
// Returns null if the relevant quota is not enabled.
// ────────────────────────────────────────────────────────────
function getQuotaTarget(periodType: PeriodType, quotaConfig?: QuotaConfig): number | null {
  if (!quotaConfig) return null;

  if (periodType === 'daily') {
    if (!quotaConfig.weekly?.enabled) return null;
    const workingDays = quotaConfig.weekly.workingDays?.length || 6;
    return quotaConfig.weekly.amount / workingDays;
  }

  if (periodType === 'weekly') {
    if (!quotaConfig.weekly?.enabled) return null;
    return quotaConfig.weekly.amount;
  }

  // monthly
  if (quotaConfig.monthly?.enabled) return quotaConfig.monthly.amount;
  if (quotaConfig.weekly?.enabled) return quotaConfig.weekly.amount * 4.33;
  return null;
}

function getQuotaBadgeStyle(percent: number): string {
  if (percent >= 100) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (percent >= 70) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

export function DriverEarningsHistory({ driverId, transactions = [], trips = [], quotaConfig }: DriverEarningsHistoryProps) {
  const [tiers, setTiers] = React.useState<TierConfig[]>([]);
  const [periodType, setPeriodType] = React.useState<PeriodType>('weekly');
  const [selectedRowIdx, setSelectedRowIdx] = React.useState<number | null>(null);

  React.useEffect(() => {
    tierService.getTiers().then(setTiers);
  }, []);

  // Reset visible rows when switching period type
  const handlePeriodChange = (pt: PeriodType) => {
    setPeriodType(pt);
    setSelectedRowIdx(null);
  };

  // ────────────────────────────────────────────────────────────
  // Quota target for the current period type (null = not enabled)
  // ────────────────────────────────────────────────────────────
  const quotaTarget = useMemo(() => getQuotaTarget(periodType, quotaConfig), [periodType, quotaConfig]);
  const quotaEnabled = quotaTarget !== null;

  // ────────────────────────────────────────────────────────────
  // Core aggregation engine — computes rows for the selected period type.
  //   • Gross Revenue comes from TRIPS (via getEffectiveTripEarnings)
  //   • Expenses / Payouts come from TRANSACTIONS
  //   • Tier is looked up from cumulative trip earnings
  // ────────────────────────────────────────────────────────────
  const periodData: PeriodRow[] = useMemo(() => {
    if (tiers.length === 0) return [];
    if (trips.length === 0 && transactions.length === 0) return [];

    // 1. Collect all dates from trips + transactions to find the overall range
    const allDates: number[] = [];
    trips.forEach(t => { if (t.date) allDates.push(new Date(t.date).getTime()); });
    transactions.forEach(t => { if (t.date) allDates.push(new Date(t.date).getTime()); });
    if (allDates.length === 0) return [];

    const minDate = new Date(Math.min(...allDates));
    const maxDate = new Date(Math.min(Math.max(...allDates), Date.now()));

    // 2. Generate period buckets based on periodType
    let buckets: { start: Date; end: Date }[] = [];

    if (periodType === 'daily') {
      const days = eachDayOfInterval({ start: startOfDay(minDate), end: endOfDay(maxDate) });
      buckets = days.map(d => ({ start: startOfDay(d), end: endOfDay(d) }));
    } else if (periodType === 'monthly') {
      const months = eachMonthOfInterval({ start: startOfMonth(minDate), end: endOfMonth(maxDate) });
      buckets = months.map(m => ({ start: startOfMonth(m), end: endOfMonth(m) }));
    } else {
      // weekly (default)
      const weeks = eachWeekOfInterval(
        { start: startOfWeek(minDate, { weekStartsOn: 1 }), end: endOfWeek(maxDate, { weekStartsOn: 1 }) },
        { weekStartsOn: 1 }
      );
      buckets = weeks.map(w => ({ start: w, end: endOfWeek(w, { weekStartsOn: 1 }) }));
    }

    // 3. Pre-filter completed trips for revenue calculations
    const completedTrips = trips.filter(t => t.status === 'Completed');

    // 4. Pre-sort completed trips by date for efficient cumulative calculation
    const sortedTrips = [...completedTrips].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // 5. Aggregate each bucket
    const rows: PeriodRow[] = buckets.map(({ start: periodStart, end: periodEnd }) => {
      const pStartTime = periodStart.getTime();
      const pEndTime = periodEnd.getTime();

      // --- Trips in this period ---
      const periodTrips = completedTrips.filter(t => {
        const d = new Date(t.date).getTime();
        return d >= pStartTime && d <= pEndTime;
      });

      const grossRevenue = periodTrips.reduce(
        (sum, t) => sum + getEffectiveTripEarnings(t), 0
      );

      const tripCount = periodTrips.length;

      // --- Monthly-reset cumulative earnings for tier lookup ---
      // Tier resets on the 1st of each month. The "reference month" is
      // determined by the period's start date. Only trips dated within
      // that calendar month (up to the period end, capped at month-end)
      // count toward the cumulative that determines the tier.
      const refMonthStart = startOfMonth(periodStart).getTime();
      const refMonthEnd = endOfMonth(periodStart).getTime();
      const cumulativeCap = Math.min(pEndTime, refMonthEnd);

      const cumulativeEarnings = sortedTrips.reduce((sum, t) => {
        const d = new Date(t.date).getTime();
        if (d >= refMonthStart && d <= cumulativeCap) {
          return sum + getEffectiveTripEarnings(t);
        }
        return sum;
      }, 0);

      const tier = TierCalculations.getTierForEarnings(cumulativeEarnings, tiers);

      // --- Driver / Fleet share ---
      const driverShare = grossRevenue * (tier.sharePercentage / 100);
      const fleetShare = grossRevenue - driverShare;

      // --- Transactions in this period ---
      const periodTx = transactions.filter(t => {
        const d = new Date(t.date).getTime();
        return d >= pStartTime && d <= pEndTime;
      });

      const expenses = periodTx
        .filter(t => t.type === 'Expense' || (t.type === 'Adjustment' && t.amount < 0))
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      const payouts = periodTx
        .filter(t => t.type === 'Payout')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      // --- Net Earnings = Driver Share minus Expenses ---
      const netEarnings = driverShare - expenses;

      // --- Quota ---
      const qTarget = quotaTarget;
      const qPercent = qTarget !== null && qTarget > 0 ? (grossRevenue / qTarget) * 100 : null;

      return {
        periodStart,
        periodEnd,
        grossRevenue,
        driverShare,
        fleetShare,
        expenses,
        tier,
        netEarnings,
        payouts,
        tripCount,
        transactionCount: periodTx.length,
        quotaTarget: qTarget,
        quotaPercent: qPercent,
      };
    });

    // 6. Only show rows that had trip earnings, sorted newest-first
    return rows
      .filter(r => r.tripCount > 0)
      .reverse();

  }, [trips, transactions, tiers, periodType, quotaTarget]);

  // ────────────────────────────────────────────────────────────
  // Period label formatting
  // ────────────────────────────────────────────────────────────
  const formatPeriodLabel = (row: PeriodRow): string => {
    if (periodType === 'daily') {
      return format(row.periodStart, 'EEE, dd/MM/yyyy');
    }
    if (periodType === 'monthly') {
      return format(row.periodStart, 'MMMM yyyy');
    }
    // weekly
    return `${format(row.periodStart, 'MMM d')} – ${format(row.periodEnd, 'MMM d, yyyy')}`;
  };

  const periodColumnLabel = periodType === 'daily' ? 'Day' : periodType === 'monthly' ? 'Month' : 'Week';
  const periodLabel = periodType === 'daily' ? 'day' : periodType === 'weekly' ? 'week' : 'month';

  // ────────────────────────────────────────────────────────────
  // Latest period row (for summary card)
  // ────────────────────────────────────────────────────────────
  const latestRow = periodData.length > 0 ? periodData[0] : null;

  // ────────────────────────────────────────────────────────────
  // Display row for the progress bar — selected row or latest
  // ────────────────────────────────────────────────────────────
  const displayRow = (selectedRowIdx !== null && periodData[selectedRowIdx]) ? periodData[selectedRowIdx] : latestRow;
  const isViewingSelected = selectedRowIdx !== null && periodData[selectedRowIdx] !== undefined;

  // ────────────────────────────────────────────────────────────
  // CSV Export
  // ────────────────────────────────────────────────────────────
  const handleExport = () => {
    const data = periodData.map(row => {
      const base: Record<string, string | number> = {
        [periodColumnLabel]: periodType === 'weekly'
          ? `${format(row.periodStart, 'dd/MM/yyyy')} to ${format(row.periodEnd, 'dd/MM/yyyy')}`
          : periodType === 'daily'
            ? format(row.periodStart, 'dd/MM/yyyy')
            : format(row.periodStart, 'MMMM yyyy'),
        'Trip Count': row.tripCount,
        'Gross Revenue': row.grossRevenue.toFixed(2),
        'Tier Name': row.tier.name,
        'Tier Share %': row.tier.sharePercentage + '%',
        'Driver Share': row.driverShare.toFixed(2),
        'Payouts': row.payouts.toFixed(2),
      };

      if (quotaEnabled) {
        base['Quota Target'] = row.quotaTarget !== null ? row.quotaTarget.toFixed(2) : '-';
        base['Quota %'] = row.quotaPercent !== null ? row.quotaPercent.toFixed(1) + '%' : '-';
      }

      return base;
    });

    exportToCSV(data, `driver_earnings_history_${periodType}_${driverId}`);
    toast.success("History Exported");
  };

  // ────────────────────────────────────────────────────────────
  // Empty state
  // ───────────────────────────────────────────────────────────
  if (periodData.length === 0) {
    return (
      <div className="text-center p-8 border border-dashed rounded-lg text-slate-500">
        No earnings history available.
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Earnings History</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export History
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Period selector tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          {(['daily', 'weekly', 'monthly'] as PeriodType[]).map(pt => (
            <button
              key={pt}
              onClick={() => handlePeriodChange(pt)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                periodType === pt
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {pt === 'daily' ? 'Daily' : pt === 'weekly' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
          <span className="ml-2 text-[10px] text-slate-400">
            {periodData.length} {periodLabel}{periodData.length !== 1 ? 's' : ''} with activity
          </span>
        </div>

        {/* Quota summary card — only when quota is enabled and we have a display row */}
        {quotaEnabled && displayRow && displayRow.quotaTarget !== null && (() => {
          const barLabel = isViewingSelected
            ? formatPeriodLabel(displayRow)
            : `This ${periodLabel}`;
          return (
          <div className={`rounded-lg border p-3 transition-all duration-300 ${isViewingSelected ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className={`h-4 w-4 ${isViewingSelected ? 'text-indigo-500' : 'text-slate-500'}`} />
                <span className="text-sm font-medium text-slate-700">
                  {barLabel}: ${displayRow.grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  {' / '}
                  ${displayRow.quotaTarget.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  {displayRow.quotaPercent !== null && (
                    <span className={`ml-1.5 font-semibold ${displayRow.quotaPercent >= 100 ? 'text-emerald-600' : displayRow.quotaPercent >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                      ({displayRow.quotaPercent.toFixed(0)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                {isViewingSelected && (
                  <button
                    onClick={() => setSelectedRowIdx(null)}
                    className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium underline underline-offset-2"
                  >
                    Reset to current
                  </button>
                )}
                <Badge
                  variant="outline"
                  className="text-[10px]"
                  style={{ backgroundColor: displayRow.tier.color ? `${displayRow.tier.color}15` : undefined, borderColor: displayRow.tier.color || undefined, color: displayRow.tier.color || undefined }}
                >
                  {displayRow.tier.name} ({displayRow.tier.sharePercentage}%)
                </Badge>
                {displayRow.tripCount > 0 && (
                  <span>{displayRow.tripCount} trip{displayRow.tripCount !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  (displayRow.quotaPercent ?? 0) >= 100
                    ? 'bg-emerald-500'
                    : (displayRow.quotaPercent ?? 0) >= 70
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, displayRow.quotaPercent ?? 0)}%` }}
              />
            </div>
          </div>
          );
        })()}

        <ScrollArea className="h-80">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{periodColumnLabel}</TableHead>
                <TableHead className="text-right">Gross Revenue</TableHead>
                <TableHead className="text-right">Driver Share</TableHead>
                <TableHead className="text-center">Tier Applied</TableHead>
                <TableHead className="text-right">Payouts</TableHead>
                {quotaEnabled && <TableHead className="text-right">Quota %</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {periodData.map((row, idx) => (
                <TableRow
                  key={idx}
                  onClick={() => setSelectedRowIdx(selectedRowIdx === idx ? null : idx)}
                  className={`cursor-pointer transition-colors ${
                    selectedRowIdx === idx
                      ? 'bg-indigo-50 hover:bg-indigo-100'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Period label */}
                  <TableCell className="font-medium text-xs whitespace-nowrap">
                    {selectedRowIdx === idx && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 mr-1.5 align-middle" />
                    )}
                    {formatPeriodLabel(row)}
                    {row.tripCount > 0 && (
                      <span className="ml-1.5 text-slate-400 text-[10px]">
                        {row.tripCount} trip{row.tripCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </TableCell>

                  {/* Gross Revenue */}
                  <TableCell className="text-right text-slate-600">
                    ${row.grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </TableCell>

                  {/* Driver Share with tier % badge */}
                  <TableCell className="text-right text-emerald-600">
                    <span className="font-medium">
                      ${row.driverShare.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 bg-emerald-50 text-emerald-600 border-emerald-200">
                      {row.tier.sharePercentage}%
                    </Badge>
                  </TableCell>

                  {/* Tier Applied */}
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{ backgroundColor: row.tier.color ? `${row.tier.color}15` : undefined, borderColor: row.tier.color || undefined, color: row.tier.color || undefined }}
                    >
                      {row.tier.name}
                    </Badge>
                  </TableCell>

                  {/* Payouts */}
                  <TableCell className="text-right text-slate-500">
                    {row.payouts > 0
                      ? `$${row.payouts.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      : '-'}
                  </TableCell>

                  {/* Quota % — only rendered when quota is enabled */}
                  {quotaEnabled && (
                    <TableCell className="text-right">
                      {row.quotaPercent !== null ? (
                        <Badge variant="outline" className={`text-xs font-medium ${getQuotaBadgeStyle(row.quotaPercent)}`}>
                          {row.quotaPercent.toFixed(0)}%
                        </Badge>
                      ) : '-'}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}