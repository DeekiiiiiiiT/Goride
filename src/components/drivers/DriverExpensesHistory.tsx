import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Download, ChevronDown, TrendingDown, Fuel, Navigation, Loader2 } from "lucide-react";
import { FinancialTransaction, Trip } from "../../types/data";
import { api } from "../../services/api";
import {
  startOfWeek, endOfWeek, format,
  eachWeekOfInterval, eachDayOfInterval, eachMonthOfInterval,
  startOfDay, endOfDay, startOfMonth, endOfMonth,
  differenceInCalendarDays
} from "date-fns";
import { exportToCSV } from "../../utils/csvHelpers";
import { toast } from "sonner@2.0.3";

type PeriodType = 'daily' | 'weekly' | 'monthly';

interface ExpensePeriodRow {
  periodStart: Date;
  periodEnd: Date;
  tollExpenses: number;
  fuelDeduction: number;       // Deduction (driverShare) from finalized reports only
  isFinalized: boolean;        // true if this period has finalized fuel data
  totalExpenses: number;
  transactionCount: number;
}

interface DriverExpensesHistoryProps {
  driverId: string;
  transactions: FinancialTransaction[];
  trips?: Trip[];
}

export function DriverExpensesHistory({ driverId, transactions = [], trips = [] }: DriverExpensesHistoryProps) {
  const [periodType, setPeriodType] = React.useState<PeriodType>('weekly');
  const [visibleCount, setVisibleCount] = React.useState(12);

  // ── Fuel data loading flag ──
  const [fuelDataLoading, setFuelDataLoading] = useState(false);

  // ── Phase 2: Finalized reports data source ──────────────────
  const [finalizedReports, setFinalizedReports] = useState<any[]>([]);
  const [driverVehicleIds, setDriverVehicleIds] = useState<Set<string>>(new Set());

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

        // Step 2.2a: Find the driver record by native Roam ID
        const driverRecord = (drivers || []).find((d: any) => d.id === driverId);

        // Step 2.2b: Build ID set using ONLY native Roam IDs (no Uber/InDrive IDs per core rules)
        const driverIdSet = new Set<string>([driverId]);
        if (driverRecord?.driverId) driverIdSet.add(driverRecord.driverId);

        // Step 2.2c: Find vehicles belonging to this driver
        const myVehicles = (vehicles || []).filter(
          (v: any) => v.currentDriverId && driverIdSet.has(v.currentDriverId)
        );
        const vehicleIdSet = new Set<string>(myVehicles.map((v: any) => v.id));
        setDriverVehicleIds(vehicleIdSet);

        // Step 2.2d: Filter finalized reports to this driver's vehicles
        const myReports = (allReports || []).filter(
          (r: any) => r.status === 'Finalized' && vehicleIdSet.has(r.vehicleId)
        );
        setFinalizedReports(myReports);

        // Step 2.3: Diagnostic logging
        console.log(
          `[DriverExpensesHistory] Fetched ${(allReports || []).length} total finalized reports, ` +
          `${myReports.length} matched this driver's ${vehicleIdSet.size} vehicle(s)`,
          { driverId, driverIdSet: Array.from(driverIdSet), vehicleIds: Array.from(vehicleIdSet) }
        );
        if (myReports.length > 0) {
          const weekRanges = myReports.map((r: any) => `${r.weekStart?.split('T')[0]} → ${r.weekEnd?.split('T')[0]}`);
          console.log(`[DriverExpensesHistory] Finalized week ranges:`, weekRanges);
        }
      } catch (e) {
        console.error('[DriverExpensesHistory] Failed to load finalized reports:', e);
      } finally {
        if (!cancelled) setFuelDataLoading(false);
      }
    };
    loadFinalizedData();
    return () => { cancelled = true; };
  }, [driverId]);

  // ── Compute time buckets ──
  const timeBuckets: { start: Date; end: Date }[] = useMemo(() => {
    const allDates: number[] = [];
    trips.forEach(t => { if (t.date) allDates.push(new Date(t.date).getTime()); });
    transactions.forEach(t => { if (t.date) allDates.push(new Date(t.date).getTime()); });
    if (allDates.length === 0) return [];

    const minDate = new Date(Math.min(...allDates));
    const maxDate = new Date(Math.max(...allDates));

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

  const defaultPageSize = (pt: PeriodType) => pt === 'daily' ? 14 : pt === 'monthly' ? 6 : 12;

  const handlePeriodChange = (pt: PeriodType) => {
    setPeriodType(pt);
    setVisibleCount(defaultPageSize(pt));
  };

  // ────────────────────────────────────────────────────────────
  // Aggregate expense transactions into period buckets
  // ────────────────────────────────────────────────────────────
  const periodData: ExpensePeriodRow[] = useMemo(() => {
    if (timeBuckets.length === 0) return [];

    // Only look at expense-type transactions (for Tolls — NOT fuel)
    const expenseTx = transactions.filter(
      t => t.type === 'Expense' || (t.type === 'Adjustment' && t.amount < 0)
    );

    // ── Phase 3: Helper to look up finalized deduction for a period ──
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

    const rows: ExpensePeriodRow[] = timeBuckets.map(({ start: periodStart, end: periodEnd }) => {
      const pStartTime = periodStart.getTime();
      const pEndTime = periodEnd.getTime();

      const periodTx = expenseTx.filter(t => {
        const d = new Date(t.date).getTime();
        return d >= pStartTime && d <= pEndTime;
      });

      // ── Tolls: keyword-based from transactions ──
      let tollExpenses = 0;

      periodTx.forEach(tx => {
        const amt = Math.abs(tx.amount);
        const desc = ((tx as any).description || (tx as any).category || '').toLowerCase();
        if (desc.includes('toll') || desc.includes('e-toll') || desc.includes('highway')) {
          tollExpenses += amt;
        }
      });

      // ── Fuel: from finalized reports ONLY ──
      const { deduction, finalized } = getDeductionForPeriod(periodStart, periodEnd);
      const fuelDeduction = deduction;
      const isFinalized = finalized;

      const totalExpenses = tollExpenses + fuelDeduction;

      return {
        periodStart,
        periodEnd,
        tollExpenses,
        fuelDeduction,
        isFinalized,
        totalExpenses,
        transactionCount: periodTx.length,
      };
    });

    return rows
      .filter(r => r.transactionCount > 0 || r.fuelDeduction > 0)
      .reverse();
  }, [transactions, trips, timeBuckets, finalizedReports]);

  // ────────────────────────────────────────────────────────────
  // Summary totals
  // ────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const base = periodData.reduce(
      (acc, r) => ({
        toll: acc.toll + r.tollExpenses,
        fuel: acc.fuel + r.fuelDeduction,
        total: acc.total + r.totalExpenses,
        txCount: acc.txCount + r.transactionCount,
      }),
      { toll: 0, fuel: 0, total: 0, txCount: 0 }
    );

    const finalizedPeriods = periodData.filter(r => r.isFinalized).length;
    const unfinalizedPeriods = periodData.length - finalizedPeriods;

    return { ...base, totalPeriods: periodData.length, finalizedPeriods, unfinalizedPeriods };
  }, [periodData]);

  // ────────────────────────────────────────────────────────────
  // Period label
  // ────────────────────────────────────────────────────────────
  const formatPeriodLabel = (row: ExpensePeriodRow): string => {
    if (periodType === 'daily') return format(row.periodStart, 'EEE, dd/MM/yyyy');
    if (periodType === 'monthly') return format(row.periodStart, 'MMMM yyyy');
    return `${format(row.periodStart, 'MMM d')} – ${format(row.periodEnd, 'MMM d, yyyy')}`;
  };

  const periodColumnLabel = periodType === 'daily' ? 'Day' : periodType === 'monthly' ? 'Month' : 'Week';
  const periodLabel = periodType === 'daily' ? 'day' : periodType === 'weekly' ? 'week' : 'month';

  // ────────────────────────────────────────────────────────────
  // CSV Export
  // ────────────────────────────────────────────────────────────
  const handleExport = () => {
    const data = periodData.map(row => {
      return {
        [periodColumnLabel]: periodType === 'weekly'
          ? `${format(row.periodStart, 'dd/MM/yyyy')} to ${format(row.periodEnd, 'dd/MM/yyyy')}`
          : periodType === 'daily'
            ? format(row.periodStart, 'dd/MM/yyyy')
            : format(row.periodStart, 'MMMM yyyy'),
        'Transactions': row.transactionCount,
        'Toll Expenses': row.tollExpenses.toFixed(2),
        'Fuel Deduction': row.fuelDeduction.toFixed(2),
        'Finalized': row.isFinalized ? 'Yes' : 'No',
        'Total Expenses': row.totalExpenses.toFixed(2),
      };
    });

    exportToCSV(data, `driver_expenses_history_${periodType}_${driverId}`);
    toast.success("Expenses Exported");
  };

  // ────────────────────────────────────────────────────────────
  // Pagination
  // ────────────────────────────────────────────────────────────
  const visibleRows = periodData.slice(0, visibleCount);
  const hasMore = periodData.length > visibleCount;
  const remainingCount = periodData.length - visibleCount;

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Expenses</p>
                <p className="text-xl font-bold text-rose-600 mt-0.5">
                  ${totals.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="h-9 w-9 rounded-full bg-rose-50 flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-rose-500" />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{totals.txCount} transaction{totals.txCount !== 1 ? 's' : ''}</p>
            {!fuelDataLoading && totals.unfinalizedPeriods > 0 && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                {totals.finalizedPeriods} of {totals.totalPeriods} {periodLabel}{totals.totalPeriods !== 1 ? 's' : ''} finalized
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Toll Expenses</p>
                <p className="text-xl font-bold text-amber-600 mt-0.5">
                  ${totals.toll.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="h-9 w-9 rounded-full bg-amber-50 flex items-center justify-center">
                <Navigation className="h-4 w-4 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Fuel (Deduction)</p>
                {fuelDataLoading ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                    <span className="text-xs text-slate-400">Loading...</span>
                  </div>
                ) : (
                  <p className={`text-xl font-bold mt-0.5 ${totals.fuel > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                    {totals.fuel > 0
                      ? `$${totals.fuel.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      : '-'}
                  </p>
                )}
              </div>
              <div className="h-9 w-9 rounded-full bg-red-50 flex items-center justify-center">
                <Fuel className="h-4 w-4 text-red-500" />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {fuelDataLoading
                ? 'Loading finalized data...'
                : totals.fuel > 0
                  ? `From ${totals.finalizedPeriods} finalized ${periodLabel}${totals.finalizedPeriods !== 1 ? 's' : ''}`
                  : 'No finalized fuel deductions'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* History table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Expense History</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Period-by-period breakdown of all driver-related expenses
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export Expenses
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Period selector */}
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
              {periodData.length} {periodLabel}{periodData.length !== 1 ? 's' : ''} with expenses
            </span>
          </div>

          {periodData.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No expense transactions found.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{periodColumnLabel}</TableHead>
                    <TableHead className="text-right">Tolls</TableHead>
                    <TableHead className="text-right">Fuel (Deduction)</TableHead>
                    <TableHead className="text-right">Total Expenses</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium text-xs whitespace-nowrap">
                        {formatPeriodLabel(row)}
                        {row.transactionCount > 0 && (
                          <span className="ml-1.5 text-slate-400 text-[10px]">
                            {row.transactionCount} txn{row.transactionCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-amber-600">
                        {row.tollExpenses > 0
                          ? `$${row.tollExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : '-'}
                      </TableCell>
                      <TableCell className={`text-right ${row.isFinalized ? 'text-red-600' : 'text-slate-300'}`}>
                        {row.isFinalized && row.fuelDeduction > 0
                          ? `$${row.fuelDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold text-rose-600">
                        ${row.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {hasMore && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-500 hover:text-slate-700"
                    onClick={() => setVisibleCount(prev => prev + defaultPageSize(periodType))}
                  >
                    <ChevronDown className="h-4 w-4 mr-1.5" />
                    Show more ({remainingCount} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}