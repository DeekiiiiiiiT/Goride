import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Download, ChevronDown, DollarSign, TrendingDown, Clock, Loader2, CheckCircle, Wallet, Info } from "lucide-react";
import { FinancialTransaction, Trip, DriverMetrics } from "../../types/data";
import { format } from "date-fns";
import { exportToCSV } from "../../utils/csvHelpers";
import { toast } from "sonner@2.0.3";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";
import { SettlementPeriodDetail } from './SettlementPeriodDetail';
import { payoutToSettlementRow } from './SettlementSummaryView';
import type { PayoutPeriodRow } from '../../types/driverPayoutPeriod';
import { useDriverPayoutPeriodRows, type PeriodType } from '../../hooks/useDriverPayoutPeriodRows';
import { getPeriodSettlementComponents } from '../../utils/driverSettlementMath';
import type { DriverFinancialBundle, DriverLike } from '../../hooks/useDriverFinancialBundle';

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface DriverPayoutHistoryProps {
  driverId: string;
  driver?: DriverLike | null;
  transactions: FinancialTransaction[];
  trips?: Trip[];
  csvMetrics?: DriverMetrics[];
  financialBundle?: DriverFinancialBundle;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function DriverPayoutHistory({
  driverId,
  driver = null,
  transactions = [],
  trips = [],
  csvMetrics = [],
  financialBundle,
}: DriverPayoutHistoryProps) {

  const [periodType, setPeriodType] = useState<PeriodType>('weekly');
  const [visibleCount, setVisibleCount] = useState(12);

  const { periodData, isReady, fuelDataLoading } = useDriverPayoutPeriodRows({
    driverId,
    driver,
    trips,
    transactions,
    csvMetrics,
    periodType,
    financialBundle,
  });

  const defaultPageSize = (pt: PeriodType) => pt === 'daily' ? 14 : pt === 'monthly' ? 6 : 12;

  const handlePeriodChange = (pt: PeriodType) => {
    setPeriodType(pt);
    setVisibleCount(defaultPageSize(pt));
  };

  // ────────────────────────────────────────────────────────────
  // Phase 6: Summary totals (3-state counts)
  // ────────────────────────────────────────────────────────────
  const summaryTotals = useMemo(() => {
    const finalizedRows = periodData.filter(r => r.status === 'Finalized');
    const awaitingCashRows = periodData.filter(r => r.status === 'Awaiting Cash');
    const pendingRows = periodData.filter(r => r.status === 'Pending');

    return {
      totalNetPayout: finalizedRows.reduce((s, r) => s + r.netPayout, 0),
      totalDriverShare: periodData.reduce((s, r) => s + r.driverShare, 0),
      totalDeductions: finalizedRows.reduce((s, r) => s + r.totalDeductions, 0),
      finalizedCount: finalizedRows.length,
      awaitingCashCount: awaitingCashRows.length,
      pendingCount: pendingRows.length,
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
        'Ledger Gross Revenue': row.grossRevenue.toFixed(2),
        'Tier': row.tierName,
        'Driver Share %': row.driverSharePercent + '%',
        'Driver Share': row.driverShare.toFixed(2),
        'Fuel Deduction': row.isFinalized
          ? (Math.round((row.driverShare - row.netPayout) * 100) / 100).toFixed(2)
          : 'Pending',
        'Net Payout': row.isFinalized ? row.netPayout.toFixed(2) : 'Pending',
        'Passenger Cash': row.cashOwed.toFixed(2),
        'Bank Settled': (row.bankSettled ?? 0).toFixed(2),
        'Cash Returned': row.cashPaid.toFixed(2),
        'Cash Still Held': row.isFinalized
          ? getPeriodSettlementComponents(row).adjCashBalance.toFixed(2)
          : 'Pending',
        'Settlement': row.isFinalized
          ? getPeriodSettlementComponents(row).settlement.toFixed(2)
          : 'Pending',
        'Status': row.status,
      };
    });

    exportToCSV(csvData, `payout-history-${driverId}`);
    toast.success('Payout history exported');
  };

  // ── Period detail overlay state ──
  const [selectedRow, setSelectedRow] = useState<PayoutPeriodRow | null>(null);

  // ── Loading state — paint when ledger is ready; fuel columns fill progressively
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
      {fuelDataLoading && (
        <p className="text-xs text-slate-400 inline-flex items-center gap-1.5 px-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Updating fuel deductions…
        </p>
      )}
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
                    ? `From ${summaryTotals.finalizedCount} of ${summaryTotals.totalPeriods} ${periodType === 'daily' ? 'days' : periodType === 'monthly' ? 'months' : 'weeks'} fully settled`
                    : 'No fully settled periods yet'}
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
                <p className="text-sm font-medium text-slate-500">Fuel Deductions</p>
                <p className="text-2xl font-bold text-rose-700">
                  ${summaryTotals.totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-400">
                  Driver fuel share across finalized periods
                </p>
              </div>
              <div className="rounded-lg bg-rose-50 p-2.5">
                <TrendingDown className="h-5 w-5 text-rose-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3 — Reconciliation status (3-state aware) */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-500">Pending Reconciliation</p>
                {(summaryTotals.pendingCount > 0 && summaryTotals.awaitingCashCount > 0) ? (
                  <>
                    <p className="text-2xl font-bold text-amber-700">
                      {summaryTotals.pendingCount + summaryTotals.awaitingCashCount} {periodType === 'daily' ? 'day' : periodType === 'monthly' ? 'month' : 'week'}{(summaryTotals.pendingCount + summaryTotals.awaitingCashCount) !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-slate-400">
                      {summaryTotals.pendingCount} pending, {summaryTotals.awaitingCashCount} awaiting cash
                    </p>
                  </>
                ) : summaryTotals.pendingCount > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-amber-700">
                      {summaryTotals.pendingCount} {periodType === 'daily' ? 'day' : periodType === 'monthly' ? 'month' : 'week'}{summaryTotals.pendingCount !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-slate-400">
                      Awaiting fuel report finalization
                    </p>
                  </>
                ) : summaryTotals.awaitingCashCount > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-blue-700">
                      {summaryTotals.awaitingCashCount} {periodType === 'daily' ? 'day' : periodType === 'monthly' ? 'month' : 'week'}{summaryTotals.awaitingCashCount !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-slate-400">
                      Awaiting cash return from driver
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-emerald-700">All clear</p>
                    <p className="text-xs text-slate-400">
                      All {summaryTotals.totalPeriods} periods fully settled
                    </p>
                  </>
                )}
              </div>
              <div className={`rounded-lg p-2.5 ${
                summaryTotals.pendingCount > 0 ? 'bg-amber-50' :
                summaryTotals.awaitingCashCount > 0 ? 'bg-blue-50' :
                'bg-emerald-50'
              }`}>
                {summaryTotals.pendingCount > 0
                  ? <Clock className="h-5 w-5 text-amber-600" />
                  : summaryTotals.awaitingCashCount > 0
                    ? <Wallet className="h-5 w-5 text-blue-600" />
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
                    <TableHead className="text-xs">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              Period
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[280px] text-xs">
                            The time period for this payout row. When in weekly mode, this is Monday–Sunday.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end">
                              Ledger Gross
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[280px] text-xs">
                            Week ledger revenue before split — not the same as Overview Period Earnings.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end">
                              Driver Share
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[280px] text-xs">
                            The driver's portion of gross revenue based on their tier commission split.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end">
                              Fuel Deduction
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Driver fuel share subtracted from Driver Share to get Net Payout. Shows '—' until the fuel report is finalized.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end">
                              Net Payout
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Driver Share minus Fuel Deduction — the driver’s cut before cash. Shows 'Pending' if fuel isn’t finalized.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end">
                              Settlement
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Net Payout minus Cash Still Held. Positive = fleet owes driver; negative = driver owes fleet.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              Status
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[340px] text-xs">
                            The completion status of this period's payout. 'Pending' = the fuel report hasn't been finalized yet, so deductions can't be fully computed. 'Awaiting Cash' = all expenses are confirmed, but the driver still has unreturned cash for this period. 'Finalized' = expenses are confirmed AND all cash has been returned — this week is fully closed out.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row, idx) => (
                    <TableRow key={idx} className={`cursor-pointer transition-colors hover:bg-slate-100/60 ${
                      row.status === 'Pending' ? 'bg-amber-50/30' :
                      row.status === 'Awaiting Cash' ? 'bg-blue-50/30' :
                      ''
                    }`}
                      onClick={() => setSelectedRow(row)}
                    >
                      <TableCell className="text-xs font-medium whitespace-nowrap">{formatPeriodLabel(row)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums text-emerald-700 font-medium">
                        ${row.grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums font-medium">
                        ${row.driverShare.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {row.isFinalized
                          ? (() => {
                              const fuelDed = Math.round((row.driverShare - row.netPayout) * 100) / 100;
                              return fuelDed > 0.005
                                ? <span className="text-rose-600">-${fuelDed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                : <span className="text-slate-400">$0.00</span>;
                            })()
                          : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums font-semibold">
                        {row.isFinalized
                          ? <span className={row.netPayout >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                              ${row.netPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          : <span className="text-amber-600 font-normal italic">Pending</span>}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums font-semibold">
                        {row.isFinalized
                          ? (() => {
                              const s = getPeriodSettlementComponents(row).settlement;
                              return (
                                <span className={s < -0.005 ? 'text-rose-700' : s > 0.005 ? 'text-blue-700' : 'text-emerald-700'}>
                                  {s < -0.005 ? '−' : s > 0.005 ? '+' : ''}
                                  ${Math.abs(s).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              );
                            })()
                          : <span className="text-amber-600 font-normal italic">Pending</span>}
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        {row.status === 'Finalized' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            <CheckCircle className="h-3 w-3" /> Finalized
                          </span>
                        ) : row.status === 'Awaiting Cash' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                            <Wallet className="h-3 w-3" /> Awaiting Cash
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

      {/* ── Same week detail sheet as Settlement / Cash Wallet ── */}
      <SettlementPeriodDetail
        row={selectedRow ? payoutToSettlementRow(selectedRow) : null}
        open={!!selectedRow}
        onOpenChange={(open) => { if (!open) setSelectedRow(null); }}
      />
    </div>
  );
}