// Settlement Summary View — uses shared payout pipeline (useDriverPayoutPeriodRows).
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { api } from '../../services/api';
import {
  resolveBankSettledDisplay,
  type BankSettledDisplay,
} from '../../utils/fleetBankReceive';
import { useAuth } from '../auth/AuthContext';

export type SettlementStatus = 'Settled' | 'Company Owes' | 'Driver Owes' | 'Pending' | 'No Activity';

export interface SettlementRow {
  periodStart: Date;
  periodEnd: Date;
  grossRevenue: number;
  driverShare: number;
  tollExpenses: number;
  fuelDeduction: number;
  /** Payout-path deductions only (Driver Share − Net Payout). Not Charged-to-Driver. */
  expenseDeductions: number;
  /** Personal toll charges settled on the cash side (informational). */
  chargedToDriver: number;
  totalDeductions: number;
  netPayout: number;
  isFinalized: boolean;
  tripCount: number;
  /** Step 1 — passenger cash risk for the week (PERIOD Uber + InDrive + float/personal). */
  passengerCash: number;
  /** Step 2 — cash handed back to fleet (excludes fuel/toll credits already in cashPaid). */
  cashHandbacks: number;
  /** Step 3a — fuel credits reducing cash still held. */
  fuelCreditsApplied: number;
  /** Step 3b — cash-toll wash credits. */
  cashTollCredits: number;
  cashPaid: number;
  /** Step 4 — cash still in hand after handbacks + credits (before Net Payout). */
  cashStillHeld: number;
  bankSettled: number;
  cashStatus: string;
  settlement: number;
  settlementStatus: SettlementStatus;
}

export function payoutToSettlementRow(row: PayoutPeriodRow): SettlementRow {
  const { settlement, adjCashBalance } = getPeriodSettlementComponents(row);
  const hasActivity =
    row.tripCount > 0 ||
    row.cashOwed > 0.01 ||
    row.cashPaid > 0.01 ||
    row.driverShare > 0.01 ||
    row.tollExpenses > 0.01 ||
    row.fuelDeduction > 0.01 ||
    Math.abs(row.cashBalance) > 0.01 ||
    Math.abs(adjCashBalance) > 0.01;

  let settlementStatus: SettlementStatus;
  if (!hasActivity) settlementStatus = 'No Activity';
  else if (!row.isFinalized) settlementStatus = 'Pending';
  else if (Math.abs(settlement) < 1) settlementStatus = 'Settled';
  else if (settlement > 0) settlementStatus = 'Company Owes';
  else settlementStatus = 'Driver Owes';

  let cashStatus = 'No Activity';
  if (Math.abs(adjCashBalance) > 0.01 || row.cashPaid > 0.01) {
    cashStatus = Math.abs(adjCashBalance) < 0.01 ? 'Settled' : 'Outstanding';
  }

  const br = row.cashPaidBreakdown;
  const washInPaid = br?.tollCredits ?? 0;
  const cashTollCredits = Math.max(0, row.cashTollWash ?? washInPaid);
  // Cash Returned column = Settlement Week–tagged cash only — fuel/toll credits stay their own lines.
  const cashHandbacks = Math.max(0, row.cashPaid - washInPaid);
  // Full fleet companyShare (not reduced by $2k reimbursement inside Cash Returned).
  const fuelCreditsApplied = Math.max(0, row.fuelCredits || 0);

  // Deductions column must match Share − Net Payout (not Charged-to-Driver on cash side).
  const payoutDeductions = row.isFinalized
    ? Math.round((row.driverShare - row.netPayout) * 100) / 100
    : row.fuelDeduction;
  // Prefer Toll Reconciliation disposition personal; fallback to Toll Charge rows.
  const chargedToDriver = Math.max(
    0,
    Math.round(
      (row.personalTollCharge != null
        ? row.personalTollCharge
        : (row.expenseDeductions ?? 0) - row.fuelDeduction) * 100,
    ) / 100,
  );

  return {
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    grossRevenue: row.grossRevenue,
    driverShare: row.driverShare,
    tollExpenses: row.tollExpenses,
    fuelDeduction: row.fuelDeduction,
    expenseDeductions: payoutDeductions,
    chargedToDriver,
    totalDeductions: row.totalDeductions,
    netPayout: row.netPayout,
    isFinalized: row.isFinalized,
    tripCount: row.tripCount,
    passengerCash: row.passengerCash != null && row.passengerCash > 0.005 ? row.passengerCash : row.cashOwed,
    cashHandbacks,
    fuelCreditsApplied,
    cashTollCredits,
    cashPaid: row.cashPaid,
    cashStillHeld: adjCashBalance,
    bankSettled: row.bankSettled ?? 0,
    cashStatus,
    settlement,
    settlementStatus,
  };
}

interface SettlementSummaryViewProps {
  driverId: string;
  trips: Trip[];
  transactions: FinancialTransaction[];
  csvMetrics: DriverMetrics[];
  driver?: DriverLike | null;
  financialBundle?: DriverFinancialBundle;
  /** Shared weekly pipeline from DriverDetail — avoids a second compute. */
  weeklyPeriodData?: PayoutPeriodRow[];
  weeklyCashWeeks?: import('../../utils/cashSettlementCalc').CashWeekData[];
}

export function SettlementSummaryView({
  driverId,
  trips = [],
  transactions = [],
  csvMetrics = [],
  driver = null,
  financialBundle,
  weeklyPeriodData,
  weeklyCashWeeks,
}: SettlementSummaryViewProps) {
  const { organizationId } = useAuth();
  const {
    periodData,
    isReady: ledgerReady,
    fuelDataLoading,
    financialBundle: payoutBundle,
  } = useDriverPayoutPeriodRows({
    driverId,
    driver,
    trips,
    transactions,
    csvMetrics,
    periodType: 'weekly',
    financialBundle,
    sharedWeekly: weeklyPeriodData
      ? { periodData: weeklyPeriodData, cashWeeks: weeklyCashWeeks }
      : undefined,
  });

  // Org-week confirms from Fleet Financials — display-only for Bank Settled.
  const confirmsQuery = useQuery({
    queryKey: ['fleet-bank-confirms'],
    queryFn: () => api.getFleetBankConfirms(),
  });

  const isReady = ledgerReady;
  const resolvedBundle = financialBundle ?? payoutBundle;
  const bankDriverIds = useMemo(() => {
    const ids = resolvedBundle?.expandedIds?.length
      ? resolvedBundle.expandedIds
      : [driverId];
    return ids;
  }, [resolvedBundle?.expandedIds, driverId]);

  const settlementRows: SettlementRow[] = useMemo(() => {
    if (!isReady) return [];
    const rows = periodData.map(payoutToSettlementRow);
    const firstActive = rows.findIndex((r) => r.settlementStatus !== 'No Activity');
    const lastActive =
      rows.length - 1 - [...rows].reverse().findIndex((r) => r.settlementStatus !== 'No Activity');
    return firstActive >= 0 ? rows.slice(firstActive, lastActive + 1) : [];
  }, [isReady, periodData]);

  const bankSettledForRow = (row: SettlementRow): BankSettledDisplay =>
    resolveBankSettledDisplay({
      driverId,
      driverIds: bankDriverIds,
      weekStartYmd: format(row.periodStart, 'yyyy-MM-dd'),
      ledgerBankSettled: row.bankSettled,
      organizationId,
      confirms: confirmsQuery.data?.data,
    });

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
      totalCashOutstanding: settlementRows.reduce((s, r) => s + Math.max(0, r.cashStillHeld), 0),
      // Sum of the same Settlement column (not a competing formula).
      trueSettlement: finalized.reduce((s, r) => s + r.settlement, 0),
      finalizedCount: finalized.length,
      totalWeeks: settlementRows.length,
      cashActiveWeeks: settlementRows.filter(r => r.cashStillHeld > 0.01 || r.cashPaid > 0.01).length,
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
    const data = settlementRows.map(row => {
      const bank = bankSettledForRow(row);
      return {
        'Period Start': format(row.periodStart, 'yyyy-MM-dd'),
        'Period End': format(row.periodEnd, 'yyyy-MM-dd'),
        'Ledger Gross Revenue': row.grossRevenue,
        'Driver Share': row.driverShare,
        'Fuel Deduction': row.expenseDeductions,
        'Toll / Charge Share': row.tollExpenses,
        'Net Payout': row.netPayout,
        'Is Finalized': row.isFinalized,
        'Trip Count': row.tripCount,
        'Passenger Cash': row.passengerCash,
        'Cash Handbacks': row.cashHandbacks,
        'Fuel Credits': row.fuelCreditsApplied,
        'Bank Settled':
          bank.kind === 'confirmed' ? bank.amount : bank.kind === 'pending' ? 'Pending' : '',
        'Cash Returned': row.cashPaid,
        'Fleet Fuel Credit': row.fuelCreditsApplied,
        'Cash Toll Credit': row.cashTollCredits,
        'Cash Still Held': row.cashStillHeld,
        'Settlement': row.settlement,
        'Settlement Status': row.settlementStatus,
      };
    });
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
              Who owes whom after fuel and tolls. Cash collection is on Cash Wallet; Uber bank received is on Fleet Operations → Fleet Financials.
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
                      <p className="text-sm font-medium text-slate-500">Cash Still Held</p>
                      <p className={`text-2xl font-bold ${summaryTotals.totalCashOutstanding > 0.01 ? 'text-rose-700' : 'text-slate-500'}`}>
                        {fmtCurrency(summaryTotals.totalCashOutstanding)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {summaryTotals.cashActiveWeeks > 0
                          ? `Across ${summaryTotals.cashActiveWeeks} week${summaryTotals.cashActiveWeeks !== 1 ? 's' : ''} with cash activity`
                          : 'No cash still held'}
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
                              Fuel Deduction
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Amount subtracted from Driver Share to get Net Payout (driver fuel share). Share −
                            Fuel Deduction = Net Payout when finalized. Personal tolls stay on the cash side.
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
                            Driver Share minus Fuel Deduction. The driver’s cut for the week — what they keep
                            in the cash waterfall. Shows Pending until fuel is finalized.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end w-full">
                              Passenger Cash
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Physical cash collected this week (Uber statement cash + InDrive/Roam cash). Bank
                            transfers are listed separately and are not included here.
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
                            Driver’s Uber bank allocation for this week. Shows Pending until the fleet org
                            week is confirmed in Fleet Financials (wire goes to the fleet account, not the
                            driver). Informational only — not part of cash still held.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end w-full">
                              Cash Returned
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Actual cash logged from the driver for this week (work-period or payment date). Not
                            reduced by fleet fuel credit, cash tolls, or payment reallocation.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end w-full">
                              Fleet Fuel Credit
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Company share of finalized fuel spend — credits Cash Still Held. Not cash collected
                            from the driver.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end w-full">
                              Cash Toll Credit
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Cash plaza tolls for the week — credits Cash Still Held. Shown separately so Cash
                            Returned stays the true cash collected figure.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help justify-end w-full">
                              Cash Still Held
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Passenger cash − Cash Returned − Fleet Fuel Credit − Cash Toll Credit (before Net
                            Payout). Open the row for the full waterfall.
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
                            Who owes whom: Net Payout minus Cash Still Held. Positive = company owes driver.
                            Negative = driver owes company.
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

                        {/* Fuel Deduction — payout path only (matches Share − Net) */}
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

                        {/* Passenger Cash */}
                        <TableCell className="text-xs text-right tabular-nums text-slate-700">
                          {row.passengerCash > 0.005 ? fmtCurrency(row.passengerCash) : <span className="text-slate-300">—</span>}
                        </TableCell>

                        {/* Bank Settled — Pending until Fleet Financials confirm */}
                        <TableCell className="text-xs text-right tabular-nums text-slate-500">
                          {(() => {
                            const bank = bankSettledForRow(row);
                            if (bank.kind === 'confirmed') {
                              return bank.amount > 0.005
                                ? fmtCurrency(bank.amount)
                                : <span className="text-slate-300">—</span>;
                            }
                            if (bank.kind === 'pending') {
                              return <span className="text-amber-700 font-medium">Pending</span>;
                            }
                            return <span className="text-slate-300">—</span>;
                          })()}
                        </TableCell>

                        {/* Cash Returned — actual cash logged */}
                        <TableCell className="text-xs text-right tabular-nums">
                          {row.cashPaid > 0.005 ? (
                            <span className="text-emerald-700 font-medium">{fmtCurrency(row.cashPaid)}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </TableCell>

                        {/* Fleet Fuel Credit */}
                        <TableCell className="text-xs text-right tabular-nums text-slate-600">
                          {row.fuelCreditsApplied > 0.005 ? (
                            fmtCurrency(row.fuelCreditsApplied)
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </TableCell>

                        {/* Cash Toll Credit */}
                        <TableCell className="text-xs text-right tabular-nums text-slate-600">
                          {row.cashTollCredits > 0.005 ? (
                            fmtCurrency(row.cashTollCredits)
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </TableCell>

                        {/* Cash Still Held */}
                        <TableCell className="text-xs text-right tabular-nums">
                          <span className={row.cashStillHeld > 0.005 ? 'text-rose-700' : 'text-slate-400'}>
                            {fmtCurrency(row.cashStillHeld)}
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
        bankSettledDisplay={selectedRow ? bankSettledForRow(selectedRow) : undefined}
        open={!!selectedRow}
        onOpenChange={(open) => { if (!open) setSelectedRow(null); }}
      />
    </Card>
  );
}