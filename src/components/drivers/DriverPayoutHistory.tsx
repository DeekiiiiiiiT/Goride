import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Download, ChevronDown, DollarSign, TrendingDown, Clock, Loader2, CheckCircle } from "lucide-react";
import { FinancialTransaction, TierConfig, Trip } from "../../types/data";
import {
  startOfWeek, endOfWeek, format,
  eachWeekOfInterval, eachDayOfInterval, eachMonthOfInterval,
  startOfDay, endOfDay, startOfMonth, endOfMonth,
  differenceInCalendarDays
} from "date-fns";
import { TierCalculations } from "../../utils/tierCalculations";
import { tierService } from "../../services/tierService";
import { getEffectiveTripEarnings } from "../../utils/tripEarnings";
import { api } from "../../services/api";
import { exportToCSV } from "../../utils/csvHelpers";
import { toast } from "sonner@2.0.3";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type PeriodType = 'daily' | 'weekly' | 'monthly';

interface PayoutPeriodRow {
  periodStart: Date;
  periodEnd: Date;
  grossRevenue: number;        // Total trip earnings in this period
  driverSharePercent: number;  // Tier % applied
  driverShare: number;         // grossRevenue * tier%
  tollExpenses: number;        // Keyword-matched toll transactions
  fuelDeduction: number;       // driverShare from finalized report (0 if unfinalized)
  totalDeductions: number;     // tollExpenses + fuelDeduction
  netPayout: number;           // driverShare - totalDeductions
  isFinalized: boolean;        // true if a finalized fuel report covers this period
  tripCount: number;
  tierName: string;            // Display name, e.g. "Gold", "Silver"
}

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface DriverPayoutHistoryProps {
  driverId: string;
  transactions: FinancialTransaction[];
  trips?: Trip[];
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function DriverPayoutHistory({ driverId, transactions = [], trips = [] }: DriverPayoutHistoryProps) {

  // ── Phase 3: Tier data (same pattern as DriverEarningsHistory) ──
  const [tiers, setTiers] = useState<TierConfig[]>([]);

  useEffect(() => {
    tierService.getTiers().then(setTiers);
  }, []);

  // ── Phase 3: Finalized reports (same pattern as DriverExpensesHistory) ──
  const [finalizedReports, setFinalizedReports] = useState<any[]>([]);
  const [driverVehicleIds, setDriverVehicleIds] = useState<Set<string>>(new Set());
  const [fuelDataLoading, setFuelDataLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadFinalizedData = async () => {
      setFuelDataLoading(true);
      try {
        const [drivers, vehicles, allReports] = await Promise.all([
          api.getDrivers().catch(() => []),
          api.getVehicles().catch(() => []),
          api.getFinalizedReports().catch(() => []),
        ]);
        if (cancelled) return;

        const driverRecord = (drivers || []).find((d: any) => d.id === driverId);

        // Build ID set using ONLY native Roam IDs (no Uber/InDrive IDs per core rules)
        const driverIdSet = new Set<string>([driverId]);
        if (driverRecord?.driverId) driverIdSet.add(driverRecord.driverId);

        const myVehicles = (vehicles || []).filter(
          (v: any) => v.currentDriverId && driverIdSet.has(v.currentDriverId)
        );
        const vehicleIdSet = new Set<string>(myVehicles.map((v: any) => v.id));
        setDriverVehicleIds(vehicleIdSet);

        const myReports = (allReports || []).filter(
          (r: any) => r.status === 'Finalized' && vehicleIdSet.has(r.vehicleId)
        );
        setFinalizedReports(myReports);
      } catch (e) {
        console.error('[DriverPayoutHistory] Failed to load finalized reports:', e);
      } finally {
        if (!cancelled) setFuelDataLoading(false);
      }
    };
    loadFinalizedData();
    return () => { cancelled = true; };
  }, [driverId]);

  // ── Phase 3: Combined loading gate ──
  const isReady = tiers.length > 0 && !fuelDataLoading;

  // ── Phase 4: Period type state + pagination ──
  const [periodType, setPeriodType] = useState<PeriodType>('weekly');
  const [visibleCount, setVisibleCount] = useState(12);

  const defaultPageSize = (pt: PeriodType) => pt === 'daily' ? 14 : pt === 'monthly' ? 6 : 12;

  const handlePeriodChange = (pt: PeriodType) => {
    setPeriodType(pt);
    setVisibleCount(defaultPageSize(pt));
  };

  // ── Phase 4: Time buckets (same pattern as DriverExpensesHistory) ──
  const timeBuckets: { start: Date; end: Date }[] = useMemo(() => {
    const allDates: number[] = [];
    trips.forEach(t => { if (t.date) allDates.push(new Date(t.date).getTime()); });
    transactions.forEach(t => { if (t.date) allDates.push(new Date(t.date).getTime()); });
    if (allDates.length === 0) return [];

    const minDate = new Date(Math.min(...allDates));
    const maxDate = new Date(Math.min(Math.max(...allDates), Date.now()));

    if (periodType === 'daily') {
      const days = eachDayOfInterval({ start: startOfDay(minDate), end: endOfDay(maxDate) });
      return days.map(d => ({ start: startOfDay(d), end: endOfDay(d) }));
    } else if (periodType === 'monthly') {
      const months = eachMonthOfInterval({ start: startOfMonth(minDate), end: endOfMonth(maxDate) });
      return months.map(m => ({ start: startOfMonth(m), end: endOfMonth(m) }));
    } else {
      const weeks = eachWeekOfInterval(
        { start: startOfWeek(minDate, { weekStartsOn: 1 }), end: endOfWeek(maxDate, { weekStartsOn: 1 }) },
        { weekStartsOn: 1 }
      );
      return weeks.map(w => ({ start: w, end: endOfWeek(w, { weekStartsOn: 1 }) }));
    }
  }, [trips, transactions, periodType]);

  // ────────────────────────────────────────────────────────────
  // Phase 4: Core Period Aggregation Engine
  //   Joins: trip earnings (+ tier %) + toll expenses + finalized fuel deductions
  //   → PayoutPeriodRow[]
  // ────────────────────────────────────────────────────────────
  const periodData: PayoutPeriodRow[] = useMemo(() => {
    if (tiers.length === 0 || timeBuckets.length === 0) return [];

    // ── Pre-filter completed trips ──
    const completedTrips = trips.filter(t => t.status === 'Completed');

    // ── Pre-sort trips by date for cumulative tier calculation ──
    const sortedTrips = [...completedTrips].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // ── Pre-filter expense transactions (for tolls) ──
    const expenseTx = transactions.filter(
      t => t.type === 'Expense' || (t.type === 'Adjustment' && t.amount < 0)
    );

    // ── Helper: finalized fuel deduction lookup (from DriverExpensesHistory) ──
    const getDeductionForPeriod = (periodStart: Date, periodEnd: Date): { deduction: number; finalized: boolean } => {
      let totalDeduction = 0;
      let hasFinalized = false;

      for (const report of finalizedReports) {
        const rStartRaw = report.weekStart ?? report.periodStart ?? '';
        const rEndRaw = report.weekEnd ?? report.periodEnd ?? '';
        const rStart = new Date(String(rStartRaw).split('T')[0] + 'T00:00:00');
        const rEnd = new Date(String(rEndRaw).split('T')[0] + 'T23:59:59');

        // Check overlap: report range intersects period range
        if (rStart <= periodEnd && rEnd >= periodStart) {
          if (periodType === 'daily') {
            // Daily apportionment: spread the week's deduction evenly across its days
            const weekDays = Math.max(1, differenceInCalendarDays(rEnd, rStart) + 1);
            const dailyShare = (report.driverShare ?? 0) / weekDays;
            totalDeduction += dailyShare;
          } else {
            totalDeduction += (report.driverShare ?? 0);
          }
          hasFinalized = true;
        }
      }

      return { deduction: totalDeduction, finalized: hasFinalized };
    };

    // ── Aggregate each bucket ──
    const rows: PayoutPeriodRow[] = timeBuckets.map(({ start: periodStart, end: periodEnd }) => {
      const pStartTime = periodStart.getTime();
      const pEndTime = periodEnd.getTime();

      // ── A. Earnings side ──

      // A1. Filter completed trips to this period
      const periodTrips = completedTrips.filter(t => {
        const d = new Date(t.date).getTime();
        return d >= pStartTime && d <= pEndTime;
      });

      // A2. Gross revenue from trips
      const grossRevenue = periodTrips.reduce(
        (sum, t) => sum + getEffectiveTripEarnings(t), 0
      );
      const tripCount = periodTrips.length;

      // A3. Monthly-reset cumulative earnings for tier lookup
      //     Tier resets on the 1st of each month. Only trips within the
      //     same calendar month (up to period end) count toward the tier.
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

      // A4. Tier lookup
      const tier = TierCalculations.getTierForEarnings(cumulativeEarnings, tiers);

      // A5. Driver share
      const driverSharePercent = tier.sharePercentage;
      const driverShare = grossRevenue * (driverSharePercent / 100);

      // ── B. Expenses side ──

      // B1. Toll expenses via keyword matching
      const periodExpTx = expenseTx.filter(t => {
        const d = new Date(t.date).getTime();
        return d >= pStartTime && d <= pEndTime;
      });

      let tollExpenses = 0;
      periodExpTx.forEach(tx => {
        const amt = Math.abs(tx.amount);
        const desc = ((tx as any).description || (tx as any).category || '').toLowerCase();
        if (desc.includes('toll') || desc.includes('e-toll') || desc.includes('highway')) {
          tollExpenses += amt;
        }
      });

      // B2. Fuel deduction from finalized reports (0 if unfinalized)
      const { deduction: fuelDeduction, finalized: isFinalized } = getDeductionForPeriod(periodStart, periodEnd);

      // ── C. Payout computation ──
      const totalDeductions = tollExpenses + fuelDeduction;
      const netPayout = driverShare - totalDeductions;

      return {
        periodStart,
        periodEnd,
        grossRevenue,
        driverSharePercent,
        driverShare,
        tollExpenses,
        fuelDeduction,
        totalDeductions,
        netPayout,
        isFinalized,
        tripCount,
        tierName: tier.name || 'Default',
      };
    });

    // Only return rows with activity, newest first
    const filtered = rows
      .filter(r => r.tripCount > 0 || r.tollExpenses > 0 || r.fuelDeduction > 0)
      .reverse();

    return filtered;
  }, [trips, transactions, tiers, timeBuckets, finalizedReports, periodType]);

  // ────────────────────────────────────────────────────────────
  // Phase 4: Summary totals (needed by Phase 5 cards, computed here)
  // ────────────────────────────────────────────────────────────
  const summaryTotals = useMemo(() => {
    const finalized = periodData.filter(r => r.isFinalized);
    const unfinalized = periodData.filter(r => !r.isFinalized);

    return {
      totalNetPayout: finalized.reduce((s, r) => s + r.netPayout, 0),
      totalDriverShare: periodData.reduce((s, r) => s + r.driverShare, 0),
      totalDeductions: finalized.reduce((s, r) => s + r.totalDeductions, 0),
      finalizedCount: finalized.length,
      unfinalizedCount: unfinalized.length,
      totalPeriods: periodData.length,
    };
  }, [periodData]);

  // ────────────────────────────────────────────────────────────
  // Period label formatting
  // ────────────────────────────────────────────────────────────
  const formatPeriodLabel = (row: PayoutPeriodRow): string => {
    if (periodType === 'daily') {
      return format(row.periodStart, 'EEE, dd/MM/yyyy');
    }
    if (periodType === 'monthly') {
      return format(row.periodStart, 'MMMM yyyy');
    }
    // weekly
    return `${format(row.periodStart, 'MMM d')} – ${format(row.periodEnd, 'MMM d, yyyy')}`;
  };

  // ────────────────────────────────────────────────────────────
  // Phase 7: CSV Export handler
  // ────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (periodData.length === 0) {
      toast.error('No payout data to export');
      return;
    }

    const periodColumnLabel = periodType === 'daily' ? 'Date'
      : periodType === 'monthly' ? 'Month' : 'Week';

    const csvData = periodData.map(row => {
      const periodLabel = periodType === 'daily'
        ? format(row.periodStart, 'yyyy-MM-dd')
        : periodType === 'monthly'
          ? format(row.periodStart, 'MMMM yyyy')
          : `${format(row.periodStart, 'MMM d')} – ${format(row.periodEnd, 'MMM d, yyyy')}`;

      return {
        [periodColumnLabel]: periodLabel,
        'Trips': row.tripCount,
        'Gross Revenue': row.grossRevenue.toFixed(2),
        'Tier': row.tierName,
        'Driver Share %': row.driverSharePercent + '%',
        'Driver Share': row.driverShare.toFixed(2),
        'Deductions': row.isFinalized ? row.totalDeductions.toFixed(2) : 'Pending',
        'Net Payout': row.isFinalized ? row.netPayout.toFixed(2) : 'Pending',
        'Finalized': row.isFinalized ? 'Yes' : 'No',
      };
    });

    exportToCSV(csvData, `payout-history-${driverId}`);
    toast.success('Payout history exported');
  };

  // ── Loading state ──
  if (!isReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payout Summary</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Driver take-home after all deductions — only fully computed for finalized periods
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <span className="ml-2 text-sm text-slate-500">Loading payout data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Phase 4 verification render — shows computed data counts ──
  const visibleRows = periodData.slice(0, visibleCount);
  const hasMore = periodData.length > visibleCount;

  return (
    <div className="space-y-6">
      {/* ── Phase 5: Summary Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1 — Net Payout (green) */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-500">Net Payout</p>
                <p className="text-2xl font-bold text-emerald-700">
                  ${summaryTotals.totalNetPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-400">
                  {summaryTotals.finalizedCount > 0
                    ? `From ${summaryTotals.finalizedCount} of ${summaryTotals.totalPeriods} ${periodType === 'daily' ? 'days' : periodType === 'monthly' ? 'months' : 'weeks'} finalized`
                    : 'No finalized periods yet'}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2.5">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2 — Total Deductions (red) */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-500">Total Deductions</p>
                <p className="text-2xl font-bold text-rose-700">
                  ${summaryTotals.totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-400">
                  Tolls + Fuel across finalized periods
                </p>
              </div>
              <div className="rounded-lg bg-rose-50 p-2.5">
                <TrendingDown className="h-5 w-5 text-rose-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3 — Pending Reconciliation (amber / green if all done) */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-500">Pending Reconciliation</p>
                {summaryTotals.unfinalizedCount > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-amber-700">
                      {summaryTotals.unfinalizedCount} {periodType === 'daily' ? 'day' : periodType === 'monthly' ? 'month' : 'week'}{summaryTotals.unfinalizedCount !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-slate-400">
                      Awaiting fuel report finalization
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-emerald-700">All clear</p>
                    <p className="text-xs text-slate-400">
                      All {summaryTotals.totalPeriods} periods finalized
                    </p>
                  </>
                )}
              </div>
              <div className={`rounded-lg p-2.5 ${summaryTotals.unfinalizedCount > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                {summaryTotals.unfinalizedCount > 0
                  ? <Clock className="h-5 w-5 text-amber-600" />
                  : <CheckCircle className="h-5 w-5 text-emerald-600" />}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Period table card ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payout Summary</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Driver take-home after all deductions — only fully computed for finalized periods
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
            >
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Period toggle */}
          <div className="flex items-center gap-2">
            {(['weekly', 'daily', 'monthly'] as PeriodType[]).map(pt => (
              <Button
                key={pt}
                variant={periodType === pt ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePeriodChange(pt)}
              >
                {pt.charAt(0).toUpperCase() + pt.slice(1)}
              </Button>
            ))}
          </div>

          {/* Table */}
          {visibleRows.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-xs">Period</TableHead>
                    <TableHead className="text-xs text-right">Trips</TableHead>
                    <TableHead className="text-xs text-right">Gross Revenue</TableHead>
                    <TableHead className="text-xs text-center">Tier</TableHead>
                    <TableHead className="text-xs text-right">Driver Share</TableHead>
                    <TableHead className="text-xs text-right">Deductions</TableHead>
                    <TableHead className="text-xs text-right">Net Payout</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row, idx) => (
                    <TableRow key={idx} className={!row.isFinalized ? 'bg-amber-50/30' : 'hover:bg-slate-50/60'}>
                      <TableCell className="text-xs font-medium whitespace-nowrap">{formatPeriodLabel(row)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums text-slate-600">{row.tripCount}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums text-emerald-700 font-medium">
                        ${row.grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                          {row.tierName} <span className="ml-0.5 text-slate-400">({row.driverSharePercent}%)</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums font-medium">
                        ${row.driverShare.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {row.isFinalized
                          ? (row.totalDeductions > 0
                              ? <span className="text-rose-600">-${row.totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              : <span className="text-slate-400">$0.00</span>)
                          : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums font-semibold">
                        {row.isFinalized
                          ? <span className={row.netPayout >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                              ${row.netPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          : <span className="text-amber-600 font-normal italic">Pending</span>}
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        {row.isFinalized ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            <CheckCircle className="h-3 w-3" /> Finalized
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            <Clock className="h-3 w-3" /> Pending
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Show more button */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVisibleCount(prev => prev + defaultPageSize(periodType))}
              >
                <ChevronDown className="h-4 w-4 mr-1" />
                Show more ({periodData.length - visibleCount} remaining)
              </Button>
            </div>
          )}

          {periodData.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">
              No trip or expense data found for this driver.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}