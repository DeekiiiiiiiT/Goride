// ════════════════════════════════════════════════════════════════════════════
// Settlement Summary View — Phase 7 (Polish, Export, Hardening)
// ════════════════════════════════════════════════════════════════════════════
// Shows the combined Payout + Cash picture per weekly period.
// Phase 4: fetches ledger + finalized reports, computes cash via shared
//          utility, merges into unified SettlementRow[].
// Phase 5: summary cards added.
// Phase 6: period-by-period settlement table with pagination.
// Phase 7: CSV export, info tooltip, fuzzy week matching, NaN guards.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";
import { Loader2, CheckCircle, DollarSign, Wallet, ArrowUpCircle, ArrowDownCircle, ChevronDown, Clock, MinusCircle, Download, Info } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { Trip, FinancialTransaction, DriverMetrics } from '../../types/data';
import { api } from '../../services/api';
import { computeWeeklyCashSettlement, CashWeekData } from '../../utils/cashSettlementCalc';
import { exportToCSV } from '../../utils/csvHelpers';
import { differenceInCalendarDays, format } from 'date-fns';
import { SettlementPeriodDetail } from './SettlementPeriodDetail';
import { isTollCategory } from '../../utils/tollCategoryHelper';
import { isLedgerEarningsReadModelEnabled } from '../../utils/featureFlags';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type SettlementStatus = 'Settled' | 'Company Owes' | 'Driver Owes' | 'Pending' | 'No Activity';

export interface SettlementRow {
  periodStart: Date;
  periodEnd: Date;
  // Payout side
  grossRevenue: number;
  driverShare: number;
  tollExpenses: number;
  tollReconciled: number;      // Phase 7: count of reconciled toll txns
  tollUnreconciled: number;    // Phase 7: count of unreconciled toll txns
  fuelDeduction: number;
  totalDeductions: number;   // tolls + fuel
  netPayout: number;         // driverShare - totalDeductions
  isFinalized: boolean;
  tripCount: number;
  // Cash side
  cashOwed: number;          // from cashWeeks.amountOwed
  cashPaid: number;          // from cashWeeks.amountPaid
  cashBalance: number;       // from cashWeeks.balance (amountOwed - amountPaid)
  cashStatus: string;        // from cashWeeks.status
  // Combined
  settlement: number;        // netPayout - cashBalance
  settlementStatus: SettlementStatus;
}

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface SettlementSummaryViewProps {
  driverId: string;
  trips: Trip[];
  transactions: FinancialTransaction[];
  csvMetrics: DriverMetrics[];
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function SettlementSummaryView({
  driverId,
  trips = [],
  transactions = [],
  csvMetrics = [],
}: SettlementSummaryViewProps) {

  // ── Step 4.1: Ledger payout data ──
  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [ledgerLoaded, setLedgerLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLedgerLoaded(false);

    api.getLedgerEarningsHistory({
      driverId,
      periodType: 'weekly',
      readModel: isLedgerEarningsReadModelEnabled() ? 'canonical' : 'legacy',
    })
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          setLedgerRows(result.data);
          console.log(`[SettlementSummaryView] Ledger loaded: ${result.data.length} weekly rows (${result.durationMs}ms)`);
        } else {
          setLedgerRows([]);
          console.log('[SettlementSummaryView] Ledger returned no data');
        }
        setLedgerLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[SettlementSummaryView] Ledger fetch failed:', err);
        setLedgerRows([]);
        setLedgerLoaded(true);
      });

    return () => { cancelled = true; };
  }, [driverId]);

  // ── Step 4.3: Finalized fuel reports ──
  const [finalizedReports, setFinalizedReports] = useState<any[]>([]);
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

        // Build ID set using ONLY native Roam IDs
        const driverIdSet = new Set<string>([driverId]);
        if (driverRecord?.driverId) driverIdSet.add(driverRecord.driverId);

        const myVehicles = (vehicles || []).filter(
          (v: any) => v.currentDriverId && driverIdSet.has(v.currentDriverId)
        );
        const vehicleIdSet = new Set<string>(myVehicles.map((v: any) => v.id));

        const myReports = (allReports || []).filter(
          (r: any) => r.status === 'Finalized' && vehicleIdSet.has(r.vehicleId)
        );
        setFinalizedReports(myReports);
      } catch (e) {
        console.error('[SettlementSummaryView] Failed to load finalized reports:', e);
      } finally {
        if (!cancelled) setFuelDataLoading(false);
      }
    };
    loadFinalizedData();
    return () => { cancelled = true; };
  }, [driverId]);

  // ── Step 4.2: Cash data from shared utility ──
  const cashWeeks: CashWeekData[] = useMemo(() => {
    return computeWeeklyCashSettlement({ trips, transactions, csvMetrics });
  }, [trips, transactions, csvMetrics]);

  // ── Loading gate ──
  const isReady = ledgerLoaded && !fuelDataLoading;

  // ── Step 4.4: Merge into unified SettlementRow[] ──
  const settlementRows: SettlementRow[] = useMemo(() => {
    if (!isReady) return [];

    // Pre-filter expense transactions for toll keyword matching
    const expenseTx = transactions.filter(
      t => t.type === 'Expense' || (t.type === 'Adjustment' && t.amount < 0)
    );

    // Helper: toll expenses for a date range
    const getTollsForPeriod = (pStartTime: number, pEndTime: number): { amount: number; reconciled: number; unreconciled: number } => {
      let tollTotal = 0;
      let reconciled = 0;
      let unreconciled = 0;
      expenseTx.forEach(tx => {
        const d = new Date(tx.date).getTime();
        if (d >= pStartTime && d <= pEndTime) {
          if (isTollCategory(tx.category)) {
            tollTotal += Math.abs(tx.amount);
            if (tx.isReconciled) reconciled++;
            else unreconciled++;
          }
        }
      });
      return { amount: tollTotal, reconciled, unreconciled };
    };

    // Helper: finalized fuel deduction for a date range (weekly-only, no daily proration)
    const getDeductionForPeriod = (periodStart: Date, periodEnd: Date): { deduction: number; finalized: boolean } => {
      let totalDeduction = 0;
      let hasFinalized = false;

      for (const report of finalizedReports) {
        const rStartRaw = report.weekStart ?? report.periodStart ?? '';
        const rEndRaw = report.weekEnd ?? report.periodEnd ?? '';
        const rStart = new Date(String(rStartRaw).split('T')[0] + 'T00:00:00');
        const rEnd = new Date(String(rEndRaw).split('T')[0] + 'T23:59:59');

        if (rStart <= periodEnd && rEnd >= periodStart) {
          totalDeduction += (report.driverShare ?? 0);
          hasFinalized = true;
        }
      }

      return { deduction: totalDeduction, finalized: hasFinalized };
    };

    // Build a Map from Monday date string → ledger row for fast lookup
    const ledgerMap = new Map<string, any>();
    for (const lr of ledgerRows) {
      // Key by periodStart (YYYY-MM-DD)
      const key = lr.periodStart; // already "YYYY-MM-DD" from server
      ledgerMap.set(key, lr);
    }

    // Build a Map from Monday date string → cash week for fast lookup
    const cashMap = new Map<string, CashWeekData>();
    for (const cw of cashWeeks) {
      const key = format(cw.start, 'yyyy-MM-dd');
      cashMap.set(key, cw);
    }

    // Collect all unique Monday keys from both sides
    const allKeys = new Set<string>();
    ledgerMap.forEach((_, k) => allKeys.add(k));
    cashMap.forEach((_, k) => allKeys.add(k));

    // Merge
    const rows: SettlementRow[] = [];
    for (const key of allKeys) {
      const lr = ledgerMap.get(key);
      // Phase 7 (Step 7.3): Fuzzy match — if no exact cash key, look for a
      // cash week within ±2 days (handles timezone-shifted Monday boundaries).
      let cw = cashMap.get(key);
      if (!cw) {
        const keyDate = new Date(key + 'T00:00:00');
        for (const [ck, cv] of cashMap.entries()) {
          const ckDate = new Date(ck + 'T00:00:00');
          if (Math.abs(differenceInCalendarDays(keyDate, ckDate)) <= 2) {
            cw = cv;
            break;
          }
        }
      }

      // Determine period boundaries
      let periodStart: Date;
      let periodEnd: Date;
      if (lr) {
        periodStart = new Date(lr.periodStart + 'T00:00:00');
        periodEnd = new Date(lr.periodEnd + 'T23:59:59');
      } else if (cw) {
        periodStart = cw.start;
        periodEnd = cw.end;
      } else {
        continue; // shouldn't happen
      }

      const pStartTime = periodStart.getTime();
      const pEndTime = periodEnd.getTime();

      // ── Payout side ──
      const grossRevenue = lr?.grossRevenue || 0;
      const driverShare = lr?.driverShare || 0;
      const tripCount = lr?.tripCount || 0;
      const tollExpenses = getTollsForPeriod(pStartTime, pEndTime);
      const { deduction: fuelDeduction, finalized: isFinalized } = getDeductionForPeriod(periodStart, periodEnd);
      const totalDeductions = tollExpenses.amount + fuelDeduction;
      const netPayout = driverShare - totalDeductions;

      // ── Cash side ──
      const cashOwed = cw?.amountOwed || 0;
      const cashPaid = cw?.amountPaid || 0;
      const cashBalance = cw?.balance || 0;
      const cashStatus = cw?.status || 'No Activity';

      // ── Combined ──
      const settlement = netPayout - cashBalance;

      // ── Status logic ──
      let settlementStatus: SettlementStatus;
      const bothSidesZero = grossRevenue === 0 && driverShare === 0 && cashOwed === 0;
      if (bothSidesZero) {
        settlementStatus = 'No Activity';
      } else if (!isFinalized && grossRevenue > 0) {
        settlementStatus = 'Pending';
      } else if (Math.abs(settlement) < 1) {
        settlementStatus = 'Settled';
      } else if (settlement > 1) {
        settlementStatus = 'Company Owes';
      } else {
        settlementStatus = 'Driver Owes';
      }

      rows.push({
        periodStart,
        periodEnd,
        grossRevenue,
        driverShare,
        tollExpenses: tollExpenses.amount,
        tollReconciled: tollExpenses.reconciled,
        tollUnreconciled: tollExpenses.unreconciled,
        fuelDeduction,
        totalDeductions,
        netPayout,
        isFinalized,
        tripCount,
        cashOwed,
        cashPaid,
        cashBalance,
        cashStatus,
        settlement,
        settlementStatus,
      });
    }

    // Sort newest first
    rows.sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());

    // Filter out "No Activity" rows at the tail (keep only rows with some data)
    // But keep no-activity rows that are sandwiched between active rows
    const firstActive = rows.findIndex(r => r.settlementStatus !== 'No Activity');
    const lastActive = rows.length - 1 - [...rows].reverse().findIndex(r => r.settlementStatus !== 'No Activity');
    const trimmedRows = firstActive >= 0
      ? rows.slice(firstActive, lastActive + 1)
      : [];

    console.log(`[SettlementSummaryView] Merged ${trimmedRows.length} settlement rows (${ledgerRows.length} ledger, ${cashWeeks.length} cash weeks)`);

    return trimmedRows;
  }, [isReady, ledgerRows, cashWeeks, transactions, finalizedReports]);

  // ── Step 5.4: Summary totals ──
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
      'Toll Expenses': row.tollExpenses,
      'Fuel Deduction': row.fuelDeduction,
      'Total Deductions': row.totalDeductions,
      'Net Payout': row.netPayout,
      'Is Finalized': row.isFinalized,
      'Trip Count': row.tripCount,
      'Cash Owed': row.cashOwed,
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
            <p className="text-xs mt-1">Combining payout and cash records</p>
          </div>
        ) : settlementRows.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <p className="text-sm font-medium">No settlement data found for this driver.</p>
            <p className="text-xs mt-1">Settlement data appears once trips or cash activity are recorded.</p>
          </div>
        ) : (
          <div className="space-y-6">
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
                              Net Payout
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            The amount the company owes the driver for this period before accounting for cash. Calculated as: Driver Share minus Total Deductions (toll expenses + fuel deductions). Shows "Pending" if the fuel report for this week hasn't been finalized yet, since deductions can't be fully computed.
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
                            Total cash the driver collected on behalf of the company during this period. This is the sum of all cash trip payments from passengers that the driver received but needs to return to the company. Sourced from the cash wallet system.
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