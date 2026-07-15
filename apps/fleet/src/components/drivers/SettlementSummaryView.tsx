// Settlement Summary View — uses shared payout pipeline (useDriverPayoutPeriodRows).
import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";
import { Loader2, DollarSign, Wallet, ArrowUpCircle, ArrowDownCircle, ChevronDown, Clock, MinusCircle, Download, Info, CheckCircle } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { Trip, FinancialTransaction, DriverMetrics } from '../../types/data';
import { exportToCSV } from '../../utils/csvHelpers';
import { format } from 'date-fns';
import { SettlementPeriodDetail } from './SettlementPeriodDetail';
import { useDriverPayoutPeriodRows } from '../../hooks/useDriverPayoutPeriodRows';
import type { DriverFinancialBundle, DriverLike } from '../../hooks/useDriverFinancialBundle';
import type { PayoutPeriodRow } from '../../types/driverPayoutPeriod';
import { getPeriodSettlementComponents } from '../../utils/driverSettlementMath';

export type SettlementStatus = 'Settled' | 'Company Owes' | 'Driver Owes' | 'Pending' | 'No Activity';

export interface SettlementRow {
  periodStart: Date;
  periodEnd: Date;
  grossRevenue: number;
  driverShare: number;
  tollExpenses: number;
  fuelDeduction: number;
  /** Fuel deduction + Charged to Driver (excludes gross plaza toll spend). */
  expenseDeductions: number;
  totalDeductions: number;
  netPayout: number;
  isFinalized: boolean;
  tripCount: number;
  cashOwed: number;
  cashPaid: number;
  cashBalance: number;
  bankSettled: number;
  cashStatus: string;
  settlement: number;
  settlementStatus: SettlementStatus;
}

interface SettlementSummaryViewProps {
  driverId: string;
  trips: Trip[];
  transactions: FinancialTransaction[];
  csvMetrics: DriverMetrics[];
  driver?: DriverLike | null;
  financialBundle?: DriverFinancialBundle;
}

function payoutToSettlementRow(row: PayoutPeriodRow): SettlementRow {
  const { settlement } = getPeriodSettlementComponents(row);
  const hasActivity =
    row.tripCount > 0 ||
    row.cashOwed > 0.01 ||
    row.cashPaid > 0.01 ||
    row.driverShare > 0.01 ||
    row.tollExpenses > 0.01 ||
    row.fuelDeduction > 0.01 ||
    Math.abs(row.cashBalance) > 0.01;

  let settlementStatus: SettlementStatus;
  if (!hasActivity) settlementStatus = 'No Activity';
  else if (!row.isFinalized) settlementStatus = 'Pending';
  else if (Math.abs(settlement) < 1) settlementStatus = 'Settled';
  else if (settlement > 0) settlementStatus = 'Company Owes';
  else settlementStatus = 'Driver Owes';

  let cashStatus = 'No Activity';
  if (Math.abs(row.cashBalance) > 0.01 || row.cashOwed > 0.01 || row.cashPaid > 0.01) {
    cashStatus = Math.abs(row.cashBalance) < 0.01 ? 'Settled' : 'Outstanding';
  }

  return {
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    grossRevenue: row.grossRevenue,
    driverShare: row.driverShare,
    tollExpenses: row.tollExpenses,
    fuelDeduction: row.fuelDeduction,
    expenseDeductions: row.expenseDeductions ?? row.totalDeductions ?? 0,
    totalDeductions: row.totalDeductions,
    netPayout: row.netPayout,
    isFinalized: row.isFinalized,
    tripCount: row.tripCount,
    cashOwed: row.cashOwed,
    cashPaid: row.cashPaid,
    cashBalance: row.cashBalance,
    bankSettled: row.bankSettled ?? 0,
    cashStatus,
    settlement,
    settlementStatus,
  };
}

export function SettlementSummaryView({
  driverId,
  trips = [],
  transactions = [],
  csvMetrics = [],
  driver = null,
  financialBundle,
}: SettlementSummaryViewProps) {
  const { periodData, isReady: ledgerReady, fuelDataLoading } = useDriverPayoutPeriodRows({
    driverId,
    driver,
    trips,
    transactions,
    csvMetrics,
    periodType: 'weekly',
    financialBundle,
  });

  const isReady = ledgerReady;

  const settlementRows: SettlementRow[] = useMemo(() => {
    if (!isReady) return [];
    const rows = periodData.map(payoutToSettlementRow);
    const firstActive = rows.findIndex((r) => r.settlementStatus !== 'No Activity');
    const lastActive =
      rows.length - 1 - [...rows].reverse().findIndex((r) => r.settlementStatus !== 'No Activity');
    return firstActive >= 0 ? rows.slice(firstActive, lastActive + 1) : [];
  }, [isReady, periodData]);

  // Note: trueSettlement is a deliberately different aggregate from
  // Σ row.settlement below — it nets payout from finalized weeks only against
  // gross cash balance from ALL weeks (including unfinalized ones, since
  // outstanding cash matters regardless of finalization), and does not net
  // fuel credits. It is not expected to equal summing the per-row Settlement
  // column.
  const summaryTotals = useMemo(() => {
    const finalized = settlementRows.filter(r => r.isFinalized);
    return {
      totalNetPayout: finalized.reduce((s, r) => s + r.netPayout, 0),
      totalCashOutstanding: settlementRows.reduce((s, r) => s + r.cashBalance, 0),
      trueSettlement: finalized.reduce((s, r) => s + r.netPayout, 0) - settlementRows.reduce((s, r) => s + r.cashBalance, 0),
      finalizedCount: finalized.length,
      totalWeeks: settlementRows.length,
      cashActiveWeeks: settlementRows.filter(r => r.cashOwed > 0).length,
    };
  }, [settlementRows]);

  // ── Currency formatter helper ──
  const fmtCurrency = (n: number) =>
    '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Phase 6: Pagination ──
  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleRows = settlementRows.slice(0, visibleCount);
  const hasMore = settlementRows.length > visibleCount;

  // ── Period label formatter (matches Payout tab style) ──
  const formatPeriod = (row: SettlementRow) => {
    const s = row.periodStart;
    const e = row.periodEnd;
    // Same year → "MMM d – MMM d, yyyy"
    return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`;
  };

  // ── Status badge renderer ──
  const renderStatusBadge = (status: SettlementStatus) => {
    switch (status) {
      case 'Settled':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            <CheckCircle className="h-3 w-3" /> Settled
          </span>
        );
      case 'Company Owes':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            <ArrowUpCircle className="h-3 w-3" /> Company Owes
          </span>
        );
      case 'Driver Owes':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
            <ArrowDownCircle className="h-3 w-3" /> Driver Owes
          </span>
        );
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            <Clock className="h-3 w-3" /> Pending
          </span>
        );
      case 'No Activity':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            <MinusCircle className="h-3 w-3" /> No Activity
          </span>
        );
    }
  };

  // ── CSV export handler ──
  const handleExportCSV = () => {
    const data = settlementRows.map(row => ({
      'Period Start': format(row.periodStart, 'yyyy-MM-dd'),
      'Period End': format(row.periodEnd, 'yyyy-MM-dd'),
      'Gross Revenue': row.grossRevenue,
      'Driver Share': row.driverShare,
      'Deductions': row.expenseDeductions,
      'Fuel Deduction': row.fuelDeduction,
      'Toll / Charge Share': row.tollExpenses,
      'Net Payout': row.netPayout,
      'Is Finalized': row.isFinalized,
      'Trip Count': row.tripCount,
      'Cash Owed': row.cashOwed,
      'Bank Settled': row.bankSettled,
      'Cash Paid': row.cashPaid,
      'Cash Balance': row.cashBalance,
      'Cash Status': row.cashStatus,
      'Settlement': row.settlement,
      'Settlement Status': row.settlementStatus,
    }));
    exportToCSV(data, `settlement_summary_${driverId}.csv`);
    toast.success('CSV export completed');
  };

  // ── Period detail overlay state ──
  const [selectedRow, setSelectedRow] = useState<SettlementRow | null>(null);

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Weekly Settlement Summary</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Combined payout and cash settlement view — what actually needs to change hands each week.
            </CardDescription>
          </div>
          {isReady && settlementRows.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
            >
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!isReady ? (
          /* Loading spinner */
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin mb-3" />
            <p className="text-sm font-medium">Loading settlement data…</p>
            <p className="text-xs mt-1">Loading earnings ledger…</p>
          </div>
        ) : settlementRows.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <p className="text-sm font-medium">No settlement data found for this driver.</p>
            <p className="text-xs mt-1">Settlement data appears once trips or cash activity are recorded.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {fuelDataLoading && (
              <p className="text-xs text-slate-400 inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Updating fuel deductions…
              </p>
            )}
            {/* ── Phase 5: Summary Cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Card 1 — Net Payout (what company owes driver) */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-500">Net Payout</p>
                      <p className="text-2xl font-bold text-emerald-700">
                        {fmtCurrency(summaryTotals.totalNetPayout)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {summaryTotals.finalizedCount > 0
                          ? `From ${summaryTotals.finalizedCount} of ${summaryTotals.totalWeeks} weeks finalized`
                          : 'No finalized weeks yet'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-2.5">
                      <DollarSign className="h-5 w-5 text-emerald-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card 2 — Cash Outstanding (what driver owes company) */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-500">Cash Outstanding</p>
                      <p className={`text-2xl font-bold ${summaryTotals.totalCashOutstanding > 0.01 ? 'text-rose-700' : 'text-slate-500'}`}>
                        {fmtCurrency(summaryTotals.totalCashOutstanding)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {summaryTotals.cashActiveWeeks > 0
                          ? `Across ${summaryTotals.cashActiveWeeks} week${summaryTotals.cashActiveWeeks !== 1 ? 's' : ''} with cash activity`
                          : 'No cash activity recorded'}
                      </p>
                    </div>
                    <div className={`rounded-lg p-2.5 ${summaryTotals.totalCashOutstanding > 0.01 ? 'bg-rose-50' : 'bg-slate-100'}`}>
                      <Wallet className={`h-5 w-5 ${summaryTotals.totalCashOutstanding > 0.01 ? 'text-rose-600' : 'text-slate-400'}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card 3 — True Settlement (the bottom line) */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-500">True Settlement</p>
                      <p className={`text-2xl font-bold ${summaryTotals.trueSettlement >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {summaryTotals.trueSettlement < 0 ? '-' : ''}{fmtCurrency(summaryTotals.trueSettlement)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {summaryTotals.trueSettlement >= 0
                          ? 'Company owes driver'
                          : 'Driver owes company'}
                      </p>
                    </div>
                    <div className={`rounded-lg p-2.5 ${summaryTotals.trueSettlement >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                      {summaryTotals.trueSettlement >= 0
                        ? <ArrowUpCircle className="h-5 w-5 text-emerald-600" />
                        : <ArrowDownCircle className="h-5 w-5 text-rose-600" />}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Phase 6: Settlement Table ── */}
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
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            The weekly settlement period (Monday–Sunday). Dates come from the finalized ledger report for that week. If no ledger report exists, dates come from cash wallet activity.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end w-full">
                              Driver Share
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            The driver's earned share of gross revenue for this period, before any deductions (tolls, fuel). This comes from the ledger report and is based on the driver's commission split. It is not the final take-home — deductions and cash adjustments happen in the Settlement column.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end w-full">
                              Deductions
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Money that hits the driver’s settlement: fuel deduction + Charged to Driver
                            (personal tolls). Does not include plaza toll spend after reconcile — that washes
                            through cash / fleet. Fuel only appears after the week is finalized.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end w-full">
                              Net Payout
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            The amount the company owes the driver for this period before accounting for cash. Calculated as: Driver Share minus payout deductions. Shows "Pending" if the fuel report for this week hasn't been finalized yet.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end w-full">
                              Cash Owed
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Physical cash risk for this week — Uber statement cash collected + InDrive/Roam cash
                            trips (+ float / personal toll charges). Does not include money already transferred
                            to the company bank.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end w-full">
                              Bank Settled
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Uber payout already transferred to the company bank for this week. Informational
                            only — not part of Cash Owed.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end w-full">
                              Cash Paid
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Total cash the driver has returned to the company for this period. This is the sum of all logged cash payments (recorded via the "Log Cash Payment" action in the Cash Wallet tab). Shows "—" if no payments have been logged yet.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end w-full">
                              Cash Balance
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            How much cash the driver still holds for this period. Calculated as: Cash Owed minus Cash Paid. A positive number (shown in red) means the driver still has cash to return. Zero means all collected cash has been returned.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end w-full">
                              Settlement
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            The final amount that needs to change hands after combining the digital payout with the cash position. Calculated as: (Driver Share minus Deductions) minus Cash Balance. A positive number means the company owes the driver that amount. A negative number means the driver owes the company (typically because they are holding more cash than their payout covers).
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
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Current state of this week's settlement. "Pending" = the ledger report hasn't been finalized yet so Net Payout can't be computed. "Company Owes" = the company owes the driver money. "Driver Owes" = the driver owes the company (usually due to un-returned cash). "Settled" = both sides are even (settlement is within $1). "No Activity" = no trips or cash activity.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => {
                    const key = format(row.periodStart, 'yyyy-MM-dd');
                    // Row background per spec (Phase 7 preview — subtle tinting)
                    const rowBg =
                      row.settlementStatus === 'Driver Owes' ? 'bg-rose-50/30'
                      : row.settlementStatus === 'Company Owes' ? 'bg-emerald-50/30'
                      : row.settlementStatus === 'Pending' ? 'bg-amber-50/30'
                      : 'hover:bg-slate-50/60';

                    return (
                      <TableRow
                        key={key}
                        className={`${rowBg} cursor-pointer transition-colors hover:bg-slate-100/60`}
                        onClick={() => setSelectedRow(row)}
                      >
                        {/* Period */}
                        <TableCell className="text-xs font-medium whitespace-nowrap">
                          {formatPeriod(row)}
                        </TableCell>

                        {/* Driver Share */}
                        <TableCell className="text-xs text-right tabular-nums">
                          {row.driverShare > 0.005 ? (
                            <span className="text-emerald-700 font-medium">{fmtCurrency(row.driverShare)}</span>
                          ) : (
                            <span className="text-slate-400">$0.00</span>
                          )}
                        </TableCell>

                        {/* Deductions — fuel + Charged to Driver only */}
                        <TableCell className="text-xs text-right tabular-nums">
                          {row.expenseDeductions > 0.005 ? (
                            <span className="text-slate-700 font-medium">{fmtCurrency(row.expenseDeductions)}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </TableCell>

                        {/* Net Payout */}
                        <TableCell className="text-xs text-right tabular-nums">
                          {row.isFinalized ? (
                            <span className="text-emerald-700 font-medium">{fmtCurrency(row.netPayout)}</span>
                          ) : (
                            <span className="text-amber-700 font-medium">Pending</span>
                          )}
                        </TableCell>

                        {/* Cash Owed */}
                        <TableCell className="text-xs text-right tabular-nums text-slate-600">
                          {row.cashOwed > 0.005 ? fmtCurrency(row.cashOwed) : <span className="text-slate-300">—</span>}
                        </TableCell>

                        {/* Bank Settled */}
                        <TableCell className="text-xs text-right tabular-nums text-slate-500">
                          {row.bankSettled > 0.005 ? fmtCurrency(row.bankSettled) : <span className="text-slate-300">—</span>}
                        </TableCell>

                        {/* Cash Paid */}
                        <TableCell className="text-xs text-right tabular-nums">
                          {row.cashPaid > 0.005 ? (
                            <span className="text-emerald-700">{fmtCurrency(row.cashPaid)}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </TableCell>

                        {/* Cash Balance */}
                        <TableCell className="text-xs text-right tabular-nums">
                          <span className={row.cashBalance > 0.005 ? 'text-rose-700' : 'text-slate-400'}>
                            {fmtCurrency(row.cashBalance)}
                          </span>
                        </TableCell>

                        {/* Settlement */}
                        <TableCell className="text-xs text-right tabular-nums font-semibold">
                          <span className={row.settlement >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {row.settlement < 0 ? '-' : ''}{fmtCurrency(row.settlement)}
                          </span>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="text-xs text-center">
                          {renderStatusBadge(row.settlementStatus)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Show more button */}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                >
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Show more ({settlementRows.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* ── Period detail overlay (Sheet) ── */}
      <SettlementPeriodDetail
        row={selectedRow}
        open={!!selectedRow}
        onOpenChange={(open) => { if (!open) setSelectedRow(null); }}
      />
    </Card>
  );
}