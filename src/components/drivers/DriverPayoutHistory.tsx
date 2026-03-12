import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Download, ChevronDown, DollarSign, TrendingDown, Clock, Loader2, CheckCircle, Wallet, Info } from "lucide-react";
import { FinancialTransaction, TierConfig, Trip, DriverMetrics } from "../../types/data";
import {
  format,
  differenceInCalendarDays,
  startOfMonth,
  endOfMonth
} from "date-fns";
// Phase 8.5: TierCalculations import removed — was only used by trip-based fallback
import { tierService } from "../../services/tierService";
import { api } from "../../services/api";
import { exportToCSV } from "../../utils/csvHelpers";
import { toast } from "sonner@2.0.3";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";
import { computeWeeklyCashSettlement, CashWeekData } from "../../utils/cashSettlementCalc";
import { PayoutPeriodDetail } from './PayoutPeriodDetail';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type PeriodType = 'daily' | 'weekly' | 'monthly';
type PayoutStatus = 'Finalized' | 'Awaiting Cash' | 'Pending';

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
  cashOwed: number;            // Cash driver collected for this period
  cashPaid: number;            // Cash driver returned for this period
  cashBalance: number;         // cashOwed - cashPaid (positive = driver still holds cash)
  status: PayoutStatus;        // Finalized, Awaiting Cash, Pending
}

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface DriverPayoutHistoryProps {
  driverId: string;
  transactions: FinancialTransaction[];
  trips?: Trip[];
  csvMetrics?: DriverMetrics[];
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function DriverPayoutHistory({ driverId, transactions = [], trips = [], csvMetrics = [] }: DriverPayoutHistoryProps) {

  // ── Phase 3: Tier data (same pattern as DriverEarningsHistory) ──
  const [tiers, setTiers] = useState<TierConfig[]>([]);

  useEffect(() => {
    tierService.getTiers().then(setTiers);
  }, []);

  // ── Phase 3: Finalized reports (same pattern as DriverExpensesHistory) ──
  const [finalizedReports, setFinalizedReports] = useState<any[]>([]);
  const [driverVehicleIds, setDriverVehicleIds] = useState<Set<string>>(new Set());
  const [fuelDataLoading, setFuelDataLoading] = useState(true);

  // ── Phase 8 Step 8.1: Ledger earnings state ──
  // State declared here (with other useState calls); useEffect is below, after periodType.
  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [ledgerLoaded, setLedgerLoaded] = useState(false);
  const [ledgerError, setLedgerError] = useState(false);

  // ── Phase 4: Period type state + pagination ──
  const [periodType, setPeriodType] = useState<PeriodType>('weekly');
  const [visibleCount, setVisibleCount] = useState(12);

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

  const defaultPageSize = (pt: PeriodType) => pt === 'daily' ? 14 : pt === 'monthly' ? 6 : 12;

  const handlePeriodChange = (pt: PeriodType) => {
    setPeriodType(pt);
    setVisibleCount(defaultPageSize(pt));
  };

  // ── Phase 8 Step 8.1: Fetch ledger earnings data ──
  // Reuses the existing GET /ledger/driver-earnings-history endpoint.
  // Data is fetched here but NOT yet consumed — Step 8.2 will wire it into periodData.
  useEffect(() => {
    let cancelled = false;
    setLedgerLoaded(false);
    setLedgerError(false);

    api.getLedgerEarningsHistory({ driverId, periodType })
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          setLedgerRows(result.data);
          console.log(`[DriverPayoutHistory] Ledger loaded: ${result.data.length} ${periodType} rows (${result.durationMs}ms)`);
        } else {
          setLedgerRows([]);
          console.log('[DriverPayoutHistory] Ledger returned no data');
        }
        setLedgerLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[DriverPayoutHistory] Ledger fetch failed:', err);
        setLedgerError(true);
        setLedgerLoaded(true);
      });

    return () => { cancelled = true; };
  }, [driverId, periodType]);

  // Phase 8.5: timeBuckets removed — was only needed by trip-based fallback.
  // The primary ledger path receives pre-bucketed rows from the server.

  // ────────────────────────────────────────────────────────────
  // Cash settlement: compute weekly cash data once (same utility as Settlement tab)
  // ────────────────────────────────────────────────────────────
  const cashWeeks: CashWeekData[] = useMemo(() => {
    return computeWeeklyCashSettlement({ trips, transactions, csvMetrics });
  }, [trips, transactions, csvMetrics]);

  // ────────────────────────────────────────────────────────────
  // Phase 8 Step 8.2: Ledger-Based Period Aggregation (primary)
  //   Earnings: from server ledger (grossRevenue, driverShare, tier, tripCount)
  //   Expenses: client-side toll keyword matching + finalized fuel deductions
  //   Fallback: trip-based computation if ledger unavailable (Step 8.3 safety net)
  // ────────────────────────────────────────────────────────────
  const periodData: PayoutPeriodRow[] = useMemo(() => {

    // ── Shared helper: finalized fuel deduction lookup ──
    const getDeductionForPeriod = (periodStart: Date, periodEnd: Date): { deduction: number; finalized: boolean } => {
      let totalDeduction = 0;
      let hasFinalized = false;

      for (const report of finalizedReports) {
        const rStartRaw = report.weekStart ?? report.periodStart ?? '';
        const rEndRaw = report.weekEnd ?? report.periodEnd ?? '';
        const rStart = new Date(String(rStartRaw).split('T')[0] + 'T00:00:00');
        const rEnd = new Date(String(rEndRaw).split('T')[0] + 'T23:59:59');

        if (rStart <= periodEnd && rEnd >= periodStart) {
          if (periodType === 'daily') {
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

    // ── Shared: Pre-filter expense transactions (for toll keyword matching) ──
    const expenseTx = transactions.filter(
      t => t.type === 'Expense' || (t.type === 'Adjustment' && t.amount < 0)
    );

    // ── Shared: Toll expense calculator for a date range ──
    const getTollsForPeriod = (pStartTime: number, pEndTime: number): number => {
      let tollExpenses = 0;
      expenseTx.forEach(tx => {
        const d = new Date(tx.date).getTime();
        if (d >= pStartTime && d <= pEndTime) {
          const amt = Math.abs(tx.amount);
          const desc = ((tx as any).description || (tx as any).category || '').toLowerCase();
          if (desc.includes('toll') || desc.includes('e-toll') || desc.includes('highway')) {
            tollExpenses += amt;
          }
        }
      });
      return tollExpenses;
    };

    // ══════════════════════════════════════════════════════════
    // PRIMARY PATH: Ledger-based earnings + client-side expenses
    // ══════════════════════════════════════════════════════════
    if (ledgerLoaded && !ledgerError && ledgerRows.length > 0) {

      // ── Cash map: key by Monday date string for fast lookup ──
      const cashMap = new Map<string, CashWeekData>();
      for (const cw of cashWeeks) {
        const key = format(cw.start, 'yyyy-MM-dd');
        cashMap.set(key, cw);
      }

      // ── Helper: look up cash for a period (weekly exact match, fuzzy ±2 days, monthly sum) ──
      const getCashForPeriod = (periodStart: Date, periodEnd: Date): { cashOwed: number; cashPaid: number; cashBalance: number } => {
        if (periodType === 'daily') {
          // Cash is tracked weekly — daily rows show 0 (per plan Step 4.5)
          return { cashOwed: 0, cashPaid: 0, cashBalance: 0 };
        }

        if (periodType === 'monthly') {
          // Sum all cash weeks whose start falls within this month
          const mStart = startOfMonth(periodStart);
          const mEnd = endOfMonth(periodStart);
          let owed = 0, paid = 0, bal = 0;
          for (const cw of cashWeeks) {
            if (cw.start >= mStart && cw.start <= mEnd) {
              owed += cw.amountOwed;
              paid += cw.amountPaid;
              bal += cw.balance;
            }
          }
          return { cashOwed: owed, cashPaid: paid, cashBalance: bal };
        }

        // Weekly: exact match first, then fuzzy ±2 days (same as Settlement tab)
        const key = format(periodStart, 'yyyy-MM-dd');
        let cw = cashMap.get(key);
        if (!cw) {
          const keyDate = periodStart;
          for (const [ck, cv] of cashMap.entries()) {
            const ckDate = new Date(ck + 'T00:00:00');
            if (Math.abs(differenceInCalendarDays(keyDate, ckDate)) <= 2) {
              cw = cv;
              break;
            }
          }
        }
        if (cw) {
          return { cashOwed: cw.amountOwed, cashPaid: cw.amountPaid, cashBalance: cw.balance };
        }
        return { cashOwed: 0, cashPaid: 0, cashBalance: 0 };
      };

      let matchedCashCount = 0;

      const rows: PayoutPeriodRow[] = ledgerRows.map((lr: any) => {
        const periodStart = new Date(lr.periodStart + 'T00:00:00');
        const periodEnd = new Date(lr.periodEnd + 'T23:59:59');
        const pStartTime = periodStart.getTime();
        const pEndTime = periodEnd.getTime();

        // Earnings from ledger (server already computed tier, share, gross)
        const grossRevenue = lr.grossRevenue || 0;
        const tripCount = lr.tripCount || 0;
        const driverSharePercent = lr.tier?.sharePercentage || 0;
        const driverShare = lr.driverShare || 0;
        const tierName = lr.tier?.name || 'Default';

        // Toll expenses via keyword matching (client-side, unchanged)
        const tollExpenses = getTollsForPeriod(pStartTime, pEndTime);

        // Fuel deduction from finalized reports (client-side, unchanged)
        const { deduction: fuelDeduction, finalized: isFinalized } = getDeductionForPeriod(periodStart, periodEnd);

        const totalDeductions = tollExpenses + fuelDeduction;
        const netPayout = driverShare - totalDeductions;

        // Cash data from precomputed cashWeeks
        const { cashOwed, cashPaid, cashBalance } = getCashForPeriod(periodStart, periodEnd);
        if (cashOwed > 0 || cashPaid > 0) matchedCashCount++;

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
          tierName,
          cashOwed,
          cashPaid,
          cashBalance,
          status: (!isFinalized ? 'Pending' : cashBalance > 0.005 ? 'Awaiting Cash' : 'Finalized') as PayoutStatus,
        };
      });

      // Diagnostic logging (Phase 4 Step 4.8)
      console.log(`[DriverPayoutHistory] Cash weeks computed: ${cashWeeks.length}, matched to payout rows: ${matchedCashCount}`);
      // Ledger rows arrive newest-first and already filtered for activity by server
      console.log(`[DriverPayoutHistory] Built ${rows.length} payout rows from LEDGER data`);
      return rows;
    }

    // ══════════════════════════════════════════════════════════
    // FALLBACK PATH (Phase 8.5): Trip-based computation removed.
    // The trips prop has been eliminated. If the ledger is unavailable,
    // we log an error and return [] — the Payout tab will show "no data"
    // rather than silently computing from stale/absent trip data.
    // ══════════════════════════════════════════════════════════
    if (ledgerLoaded && (ledgerError || ledgerRows.length === 0)) {
      console.error('[DriverPayoutHistory] Ledger unavailable — no trip fallback (removed in Phase 8.5). Payout tab will be empty.');
    }

    return [];
  }, [ledgerLoaded, ledgerError, ledgerRows, transactions, finalizedReports, periodType, cashWeeks]);

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
        'Gross Revenue': row.grossRevenue.toFixed(2),
        'Tier': row.tierName,
        'Driver Share %': row.driverSharePercent + '%',
        'Driver Share': row.driverShare.toFixed(2),
        'Deductions': row.isFinalized ? row.totalDeductions.toFixed(2) : 'Pending',
        'Net Payout': row.isFinalized ? row.netPayout.toFixed(2) : 'Pending',
        'Cash Owed': row.cashOwed.toFixed(2),
        'Cash Paid': row.cashPaid.toFixed(2),
        'Cash Balance': row.cashBalance.toFixed(2),
        'Status': row.status,
      };
    });

    exportToCSV(csvData, `payout-history-${driverId}`);
    toast.success('Payout history exported');
  };

  // ── Period detail overlay state ──
  const [selectedRow, setSelectedRow] = useState<PayoutPeriodRow | null>(null);

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
                              Gross Revenue
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[280px] text-xs">
                            Total trip earnings before any commission split or deductions.
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
                              Deductions
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Total deductions subtracted from Driver Share (tolls + fuel). Shows '—' if the fuel report isn't finalized yet.
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
                            Driver Share minus Deductions. This is what the company owes the driver before accounting for cash. Shows 'Pending' if expenses aren't finalized.
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

      {/* ── Period detail overlay (Sheet) ── */}
      <PayoutPeriodDetail
        row={selectedRow}
        open={!!selectedRow}
        onOpenChange={(open) => { if (!open) setSelectedRow(null); }}
      />
    </div>
  );
}