import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Download, ChevronDown, TrendingDown, Fuel, Navigation, Wrench } from "lucide-react";
import { FinancialTransaction, Trip } from "../../types/data";
import {
  startOfWeek, endOfWeek, format,
  eachWeekOfInterval, eachDayOfInterval, eachMonthOfInterval,
  startOfDay, endOfDay, startOfMonth, endOfMonth
} from "date-fns";
import { exportToCSV } from "../../utils/csvHelpers";
import { toast } from "sonner@2.0.3";

type PeriodType = 'daily' | 'weekly' | 'monthly';

interface ExpensePeriodRow {
  periodStart: Date;
  periodEnd: Date;
  tollExpenses: number;
  fuelExpenses: number;
  otherExpenses: number;
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

  const defaultPageSize = (pt: PeriodType) => pt === 'daily' ? 14 : pt === 'monthly' ? 6 : 12;

  const handlePeriodChange = (pt: PeriodType) => {
    setPeriodType(pt);
    setVisibleCount(defaultPageSize(pt));
  };

  // ────────────────────────────────────────────────────────────
  // Aggregate expense transactions into period buckets
  // ────────────────────────────────────────────────────────────
  const periodData: ExpensePeriodRow[] = useMemo(() => {
    // Use both trips and transactions for date range
    const allDates: number[] = [];
    trips.forEach(t => { if (t.date) allDates.push(new Date(t.date).getTime()); });
    transactions.forEach(t => { if (t.date) allDates.push(new Date(t.date).getTime()); });
    if (allDates.length === 0) return [];

    const minDate = new Date(Math.min(...allDates));
    const maxDate = new Date(Math.max(...allDates));

    let buckets: { start: Date; end: Date }[] = [];

    if (periodType === 'daily') {
      const days = eachDayOfInterval({ start: startOfDay(minDate), end: endOfDay(maxDate) });
      buckets = days.map(d => ({ start: startOfDay(d), end: endOfDay(d) }));
    } else if (periodType === 'monthly') {
      const months = eachMonthOfInterval({ start: startOfMonth(minDate), end: endOfMonth(maxDate) });
      buckets = months.map(m => ({ start: startOfMonth(m), end: endOfMonth(m) }));
    } else {
      const weeks = eachWeekOfInterval(
        { start: startOfWeek(minDate, { weekStartsOn: 1 }), end: endOfWeek(maxDate, { weekStartsOn: 1 }) },
        { weekStartsOn: 1 }
      );
      buckets = weeks.map(w => ({ start: w, end: endOfWeek(w, { weekStartsOn: 1 }) }));
    }

    // Only look at expense-type transactions
    const expenseTx = transactions.filter(
      t => t.type === 'Expense' || (t.type === 'Adjustment' && t.amount < 0)
    );

    const rows: ExpensePeriodRow[] = buckets.map(({ start: periodStart, end: periodEnd }) => {
      const pStartTime = periodStart.getTime();
      const pEndTime = periodEnd.getTime();

      const periodTx = expenseTx.filter(t => {
        const d = new Date(t.date).getTime();
        return d >= pStartTime && d <= pEndTime;
      });

      // Categorise by description/category heuristics
      let tollExpenses = 0;
      let fuelExpenses = 0;
      let otherExpenses = 0;

      periodTx.forEach(tx => {
        const amt = Math.abs(tx.amount);
        const desc = ((tx as any).description || (tx as any).category || '').toLowerCase();
        if (desc.includes('toll') || desc.includes('e-toll') || desc.includes('highway')) {
          tollExpenses += amt;
        } else if (desc.includes('fuel') || desc.includes('gas') || desc.includes('petrol')) {
          fuelExpenses += amt;
        } else {
          otherExpenses += amt;
        }
      });

      const totalExpenses = tollExpenses + fuelExpenses + otherExpenses;

      return {
        periodStart,
        periodEnd,
        tollExpenses,
        fuelExpenses,
        otherExpenses,
        totalExpenses,
        transactionCount: periodTx.length,
      };
    });

    return rows
      .filter(r => r.transactionCount > 0)
      .reverse();
  }, [transactions, trips, periodType]);

  // ────────────────────────────────────────────────────────────
  // Summary totals
  // ────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    return periodData.reduce(
      (acc, r) => ({
        toll: acc.toll + r.tollExpenses,
        fuel: acc.fuel + r.fuelExpenses,
        other: acc.other + r.otherExpenses,
        total: acc.total + r.totalExpenses,
        txCount: acc.txCount + r.transactionCount,
      }),
      { toll: 0, fuel: 0, other: 0, total: 0, txCount: 0 }
    );
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
    const data = periodData.map(row => ({
      [periodColumnLabel]: periodType === 'weekly'
        ? `${format(row.periodStart, 'dd/MM/yyyy')} to ${format(row.periodEnd, 'dd/MM/yyyy')}`
        : periodType === 'daily'
          ? format(row.periodStart, 'dd/MM/yyyy')
          : format(row.periodStart, 'MMMM yyyy'),
      'Transactions': row.transactionCount,
      'Toll Expenses': row.tollExpenses.toFixed(2),
      'Fuel Expenses': row.fuelExpenses.toFixed(2),
      'Other Expenses': row.otherExpenses.toFixed(2),
      'Total Expenses': row.totalExpenses.toFixed(2),
    }));

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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <p className="text-xs text-slate-500 font-medium">Fuel Expenses</p>
                <p className="text-xl font-bold text-blue-600 mt-0.5">
                  ${totals.fuel.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center">
                <Fuel className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Other Expenses</p>
                <p className="text-xl font-bold text-slate-600 mt-0.5">
                  ${totals.other.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center">
                <Wrench className="h-4 w-4 text-slate-500" />
              </div>
            </div>
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
                    <TableHead className="text-right">Fuel</TableHead>
                    <TableHead className="text-right">Other</TableHead>
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
                      <TableCell className="text-right text-blue-600">
                        {row.fuelExpenses > 0
                          ? `$${row.fuelExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right text-slate-500">
                        {row.otherExpenses > 0
                          ? `$${row.otherExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
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
