import React, { useMemo, useState, useEffect, startTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Download, ChevronDown, ChevronLeft, ChevronRight, TrendingDown, Fuel, Navigation, Loader2, CheckCircle, Clock, Info, LinkIcon, Unlink } from "lucide-react";
import { FinancialTransaction, Trip, DisputeRefund } from "../../types/data";
import type { FuelEntry, MileageAdjustment, FuelScenario } from "../../types/fuel";
import { api } from "../../services/api";
import { fuelService } from "../../services/fuelService";
import { FuelCalculationService } from "../../services/fuelCalculationService";
import {
  format,
  startOfDay, endOfDay, startOfMonth, endOfMonth,
} from "date-fns";
import { exportToCSV } from "../../utils/csvHelpers";
import { toast } from "sonner@2.0.3";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";
import { isTollCategory } from '../../utils/tollCategoryHelper';
import { isCashPaidToll } from '../../utils/tollDisposition';
import { deriveTollTxIsReconciled } from '../../utils/tollHandledDisplay';
import { computeDisputeRefundCounts, getDisputeRefundWeekDate, weekBucketForDate } from '../../utils/tollWeekPeriod';
import { isDriverTollChargeRow, netDriverTollCharges } from '../../utils/netDriverTollCharges';
import { fleetTzDateKey, useFleetTimezone, ymdToLocalDate } from '../../utils/timezoneDisplay';
import { getFuelDeductionForPeriod } from '../../utils/fuelDeductionForPeriod';
import type { DriverFinancialBundle, DriverLike } from '../../hooks/useDriverFinancialBundle';
import { useDriverFinancialBundle } from '../../hooks/useDriverFinancialBundle';
import { useDriverFinancialPeriods } from '../../hooks/useDriverFinancialPeriods';

type PeriodType = 'daily' | 'weekly' | 'monthly';

interface ExpensePeriodRow {
  periodStart: Date;
  periodEnd: Date;
  tollExpenses: number;
  tollCharged: number;         // personal-use tolls billed to this driver (Charge Driver)
  fuelDeduction: number;       // Deduction (driverShare) from finalized reports only
  fuelFleetShare: number;      // companyShare — credits cash still held when finalized
  fuelDriverSpend: number;     // Cash the driver paid out-of-pocket for fuel (finalized)
  fuelGasCardSpend: number;    // Company gas-card charges for fills (finalized)
  fuelNetPay: number;          // fuelDriverSpend - fuelDeduction; positive = company owes the driver
  fuelDraftEstimate: number;   // Live/unfinalized estimate for periods with no finalized report yet
  isFinalized: boolean;        // true if this period has finalized fuel data
  totalExpenses: number;
  transactionCount: number;
  tollReconciled: number;      // Phase 6: count of reconciled toll txns in this period
  tollUnreconciled: number;    // Phase 6: count of unreconciled toll txns in this period
  tollInProgress?: boolean;    // rows handled but open claims/disputes remain (wizard not Completed)
  tollCashSpent: number;       // $ paid at plaza (cash / receipt) — ignores personal vs wash
  tollTagSpent: number;        // $ charged via tag / fleet account (not cash)
  disputeRefundMatched: number;   // Uber support-case adjustments already linked to a toll
  disputeRefundUnmatched: number; // Uber support-case adjustments still needing a manual match
}

interface DriverExpensesHistoryProps {
  driverId: string;
  driver?: DriverLike | null;
  transactions: FinancialTransaction[];
  trips?: Trip[];
  /** Prefetched Financials core bundle — skip fleet re-fetch when provided. */
  financialBundle?: DriverFinancialBundle;
}

type ExpenseView = 'toll' | 'fuel';

export function DriverExpensesHistory({
  driverId,
  driver = null,
  transactions = [],
  trips = [],
  financialBundle: bundleProp,
}: DriverExpensesHistoryProps) {
  const [periodType, setPeriodType] = React.useState<PeriodType>('weekly');
  const [visibleCount, setVisibleCount] = React.useState(12);
  const [expenseView, setExpenseView] = React.useState<ExpenseView>('toll');
  const fleetTz = useFleetTimezone();

  const localBundle = useDriverFinancialBundle(driverId, driver);
  const financialBundle = bundleProp ?? localBundle;

  const fuelCoreLoading = financialBundle.isCoreLoading;
  const finalizedReports = financialBundle.finalizedReports;
  const driverVehicleList = financialBundle.vehicles;
  const disputeRefunds = financialBundle.disputeRefunds;
  const vehicleIdSet = useMemo(
    () => new Set(financialBundle.vehicleIds),
    [financialBundle.vehicleIds]
  );

  // Shared weekly financial projection (SQL) — same SSOT as Settlement/Payout/Toll Recon.
  const sharedPeriodsQuery = useDriverFinancialPeriods(driverId);
  const sharedPeriods = sharedPeriodsQuery.isError ? null : (sharedPeriodsQuery.data ?? null);

  // Draft estimates — only when Fuel view selected (not on toll-first paint).
  const [fuelDraftLoading, setFuelDraftLoading] = useState(false);
  const [draftFuelEntries, setDraftFuelEntries] = useState<FuelEntry[]>([]);
  const [draftAdjustments, setDraftAdjustments] = useState<MileageAdjustment[]>([]);
  const [draftScenarios, setDraftScenarios] = useState<FuelScenario[]>([]);

  useEffect(() => {
    if (expenseView !== 'fuel') return;
    if (fuelCoreLoading) return;

    let cancelled = false;
    const loadDraft = async () => {
      setFuelDraftLoading(true);
      try {
        const vehicleIds = Array.from(vehicleIdSet);
        const [entryLists, adjustments, scenarios] = await Promise.all([
          Promise.all(
            vehicleIds.map((vid) => api.getFuelEntriesByVehicle(vid).catch(() => [] as FuelEntry[]))
          ),
          fuelService.getMileageAdjustments().catch(() => []),
          fuelService.getFuelScenarios().catch(() => []),
        ]);
        if (cancelled) return;

        const entries = (entryLists as FuelEntry[][]).flat();
        const byId = new Map<string, FuelEntry>();
        for (const e of entries) {
          if (e?.id) byId.set(e.id, e);
        }
        startTransition(() => {
          setDraftFuelEntries(Array.from(byId.values()));
          setDraftAdjustments(
            (adjustments || []).filter((a: MileageAdjustment) => vehicleIdSet.has(a.vehicleId))
          );
          setDraftScenarios(scenarios || []);
          if (!cancelled) setFuelDraftLoading(false);
        });
      } catch (e) {
        console.error('[DriverExpensesHistory] Failed to load draft fuel estimates:', e);
        if (!cancelled) setFuelDraftLoading(false);
      }
    };
    loadDraft();
    return () => { cancelled = true; };
  }, [expenseView, fuelCoreLoading, vehicleIdSet, driverId]);

  // ── Compute time buckets (fleet timezone — same Monday keys as Reconciliation) ──
  const timeBuckets: { start: Date; end: Date }[] = useMemo(() => {
    const dateObjs: Date[] = [];
    trips.forEach(t => { if (t.date) dateObjs.push(new Date(t.date)); });
    transactions.forEach(t => { if (t.date) dateObjs.push(new Date(t.date)); });
    // A period whose ONLY activity is a dispute refund must still get a bucket.
    disputeRefunds.forEach(r => { dateObjs.push(getDisputeRefundWeekDate(r)); });
    if (dateObjs.length === 0) return [];

    if (periodType === 'daily') {
      const byDay = new Map<string, { start: Date; end: Date }>();
      for (const d of dateObjs) {
        const ymd = fleetTzDateKey(d, fleetTz);
        if (!ymd || byDay.has(ymd)) continue;
        const day = ymdToLocalDate(ymd);
        byDay.set(ymd, { start: startOfDay(day), end: endOfDay(day) });
      }
      return Array.from(byDay.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    if (periodType === 'monthly') {
      const byMonth = new Map<string, { start: Date; end: Date }>();
      for (const d of dateObjs) {
        const ymd = fleetTzDateKey(d, fleetTz);
        if (!ymd) continue;
        const day = ymdToLocalDate(ymd);
        const key = format(startOfMonth(day), 'yyyy-MM');
        if (byMonth.has(key)) continue;
        byMonth.set(key, { start: startOfMonth(day), end: endOfMonth(day) });
      }
      return Array.from(byMonth.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    const byWeek = new Map<string, { start: Date; end: Date }>();
    for (const d of dateObjs) {
      const { key, weekStart, weekEnd } = weekBucketForDate(d, fleetTz);
      if (!byWeek.has(key)) byWeek.set(key, { start: weekStart, end: weekEnd });
    }
    return Array.from(byWeek.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [trips, transactions, disputeRefunds, periodType, fleetTz]);

  const defaultPageSize = (pt: PeriodType) => pt === 'daily' ? 14 : pt === 'monthly' ? 6 : 12;

  const handlePeriodChange = (pt: PeriodType) => {
    setPeriodType(pt);
    setVisibleCount(defaultPageSize(pt));
  };

  // ────────────────────────────────────────────────────────────
  // Aggregate expense transactions into period buckets
  // Prefer shared SQL projection when available (enterprise SSOT).
  // ────────────────────────────────────────────────────────────
  const periodData: ExpensePeriodRow[] = useMemo(() => {
    if (periodType === 'weekly' && sharedPeriods && sharedPeriods.length > 0) {
      return sharedPeriods.map((p: any) => {
        const start = ymdToLocalDate(String(p.periodAnchor).slice(0, 10));
        const end = ymdToLocalDate(String(p.periodEnd).slice(0, 10));
        const unmatched = Number(p.tollUnmatchedCount) || 0;
        const reconciled = Number(p.tollReconciledCount) || 0;
        return {
          periodStart: start,
          periodEnd: end,
          tollExpenses: Number(p.tollSpend) || 0,
          tollCharged: Number(p.tollChargedToDriver) || 0,
          fuelDeduction: Number(p.fuelDeduction) || 0,
          fuelFleetShare: Number(p.fuelFleetShare) || 0,
          fuelDriverSpend: Number(p.fuelDriverSpend) || 0,
          fuelGasCardSpend: Number(p.fuelGasCardSpend) || 0,
          fuelNetPay: Number(p.fuelNetPay) || 0,
          fuelDraftEstimate: 0,
          isFinalized: !!p.fuelFinalized,
          totalExpenses:
            (Number(p.tollSpend) || 0) +
            (Number(p.fuelDeduction) || 0) +
            (Number(p.tollChargedToDriver) || 0),
          transactionCount: reconciled + unmatched,
          tollReconciled: reconciled,
          tollUnreconciled: unmatched,
          tollInProgress: String(p.tollStatus || '') === 'in_progress',
          tollCashSpent: Number(p.tollCashSpend) || 0,
          tollTagSpent: Number(p.tollTagSpend) || 0,
          disputeRefundMatched: Number(p.disputeRefundMatched) || 0,
          disputeRefundUnmatched: Number(p.disputeRefundUnmatched) || 0,
        } as ExpensePeriodRow;
      });
    }

    if (timeBuckets.length === 0) return [];

    // Only look at expense-type transactions (for Tolls — NOT fuel). Explicitly
    // exclude fuel settlement rows ('Fuel Deduction' / 'Fuel Reimbursement',
    // created by settlementService.commitWeeklyStatement on Finalize) — they
    // carry type:'Expense' too, which used to silently inflate transactionCount
    // even though the fuel $ figure below comes from the finalized-report
    // snapshot, not from these ledger rows.
    // Include toll-category rows regardless of `type` — toll_ledger-sourced
    // rows (merged in from GET /toll-logs) carry type:'Usage', which the plain
    // Expense/Adjustment gate below silently drops, making post-migration
    // tolls invisible even though they're present in `transactions`.
    // Exclude tag top-ups/refunds — they belong in the Tag section, not Expenses.
    const expenseTx = transactions.filter(
      t =>
        (t.category !== 'Fuel Deduction' && t.category !== 'Fuel Reimbursement') &&
        (t.type === 'Expense' || (t.type === 'Adjustment' && t.amount < 0) || isTollCategory(t.category)) &&
        String(t.category || '').toLowerCase() !== 'toll top-up' &&
        String(t.category || '').toLowerCase() !== 'toll refund' &&
        String(t.type || '').toLowerCase() !== 'top-up' &&
        String(t.type || '').toLowerCase() !== 'top_up'
    );

    // Draft estimates for every unfinalized period with expense activity (no date cutoff).
    const rows: ExpensePeriodRow[] = timeBuckets.map(({ start: periodStart, end: periodEnd }) => {
      const periodWeekKey = format(periodStart, 'yyyy-MM-dd');
      const periodMonthKey = format(periodStart, 'yyyy-MM');

      const inThisPeriod = (dateStr: string | undefined | null): boolean => {
        if (!dateStr) return false;
        if (periodType === 'daily') {
          return fleetTzDateKey(dateStr, fleetTz) === periodWeekKey;
        }
        if (periodType === 'monthly') {
          const ymd = fleetTzDateKey(dateStr, fleetTz);
          return !!ymd && ymd.slice(0, 7) === periodMonthKey;
        }
        // Weekly — same Monday key as Toll Reconciliation
        return weekBucketForDate(dateStr, fleetTz).key === periodWeekKey;
      };

      const periodTx = expenseTx.filter((t) => inThisPeriod(t.date));

      // ── Tolls: from transaction category (Phase 6) ──
      let tollExpenses = 0;
      let tollReconciled = 0;
      let tollUnreconciled = 0;
      let tollCashSpent = 0;
      let tollTagSpent = 0;

      periodTx.forEach(tx => {
        const amt = Math.abs(tx.amount);
        if (isTollCategory(tx.category)) {
          tollExpenses += amt;
          if (deriveTollTxIsReconciled(tx as any)) tollReconciled++;
          else tollUnreconciled++;
          // Payment source only — personal cash must not show as Tag.
          if (isCashPaidToll(tx as any)) tollCashSpent += amt;
          else tollTagSpent += amt;
        }
      });

      // Net wallet Toll Charge projections (include reversals — they are positive
      // Adjustments excluded from expenseTx above).
      const periodChargeTx = transactions.filter(
        (t) => t?.date && isDriverTollChargeRow(t) && inThisPeriod(t.date),
      );
      const tollCharged = netDriverTollCharges(periodChargeTx);

      // ── Fuel: from finalized reports (canonical shared aggregator — same
      // logic used by SettlementSummaryView/PayoutPeriodDetail so all three
      // surfaces agree) ──
      const { deduction, fleetShare, driverSpend, gasCardSpend, netPay, finalized } =
        getFuelDeductionForPeriod(finalizedReports, periodStart, periodEnd, periodType);
      const fuelDeduction = deduction;
      const isFinalized = finalized;

      // ── Draft estimate: for periods with no finalized report yet, compute a
      // live reconciliation so unresolved weeks are never silently shown as $0.
      // Never counted into totalExpenses — unconfirmed estimate only. ──
      let fuelDraftEstimate = 0;
      if (!isFinalized) {
        fuelDraftEstimate = driverVehicleList.reduce((sum, vehicle) => {
          const report = FuelCalculationService.calculateReconciliation(
            vehicle, periodStart, periodEnd, trips, draftFuelEntries, draftAdjustments, draftScenarios
          );
          return sum + (report.driverShare || 0);
        }, 0);
      }

      const totalExpenses = tollExpenses + fuelDeduction + tollCharged;

      const { matched: disputeRefundMatched, unmatched: disputeRefundUnmatched } =
        computeDisputeRefundCounts(disputeRefunds, periodStart, periodEnd);

      return {
        periodStart,
        periodEnd,
        tollExpenses,
        tollCharged,
        fuelDeduction,
        fuelFleetShare: fleetShare,
        fuelDriverSpend: driverSpend,
        fuelGasCardSpend: gasCardSpend,
        fuelNetPay: netPay,
        fuelDraftEstimate,
        isFinalized,
        totalExpenses,
        transactionCount: periodTx.length,
        tollReconciled,
        tollUnreconciled,
        tollCashSpent,
        tollTagSpent,
        disputeRefundMatched,
        disputeRefundUnmatched,
      };
    });

    return rows
      .filter(r =>
        r.transactionCount > 0 ||
        r.fuelDeduction > 0 ||
        r.fuelDraftEstimate > 0 ||
        r.disputeRefundMatched + r.disputeRefundUnmatched > 0
      )
      .reverse();
  }, [
    transactions, trips, timeBuckets, finalizedReports, disputeRefunds, periodType, fleetTz,
    driverVehicleList, draftFuelEntries, draftAdjustments, draftScenarios, sharedPeriods,
  ]);

  // ────────────────────────────────────────────────────────────
  // Summary totals
  // ────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const base = periodData.reduce(
      (acc, r) => ({
        toll: acc.toll + r.tollExpenses,
        tollCharged: acc.tollCharged + r.tollCharged,
        fuel: acc.fuel + r.fuelDeduction,
        fuelDraftPending: acc.fuelDraftPending + r.fuelDraftEstimate,
        total: acc.total + r.totalExpenses,
        txCount: acc.txCount + r.transactionCount,
        tollReconciled: acc.tollReconciled + r.tollReconciled,
        tollUnreconciled: acc.tollUnreconciled + r.tollUnreconciled,
        disputeRefundMatched: acc.disputeRefundMatched + r.disputeRefundMatched,
        disputeRefundUnmatched: acc.disputeRefundUnmatched + r.disputeRefundUnmatched,
      }),
      { toll: 0, tollCharged: 0, fuel: 0, fuelDraftPending: 0, total: 0, txCount: 0, tollReconciled: 0, tollUnreconciled: 0, disputeRefundMatched: 0, disputeRefundUnmatched: 0 }
    );

    const finalizedPeriods = periodData.filter(r => r.isFinalized).length;
    const unfinalizedPeriods = periodData.length - finalizedPeriods;
    const tollTotal = base.tollReconciled + base.tollUnreconciled;
    const disputeRefundTotal = base.disputeRefundMatched + base.disputeRefundUnmatched;

    return { ...base, totalPeriods: periodData.length, finalizedPeriods, unfinalizedPeriods, tollTotal, disputeRefundTotal };
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
        'Cash Tolls': row.tollCashSpent.toFixed(2),
        'Tag Tolls': row.tollTagSpent.toFixed(2),
        'Toll Status': (row.tollReconciled + row.tollUnreconciled) === 0
          ? 'N/A'
          : row.tollUnreconciled > 0
            ? `${row.tollUnreconciled} Unmatched`
            : row.tollInProgress
              ? 'In Progress'
              : `Reconciled (${row.tollReconciled})`,
        'Charged to driver': row.tollCharged.toFixed(2),
        'Fuel Deduction': row.fuelDeduction.toFixed(2),
        'Fleet Fuel Share': row.fuelFleetShare.toFixed(2),
        'Gas Card (Company)': row.fuelGasCardSpend.toFixed(2),
        'Paid by Driver (Cash)': row.fuelDriverSpend.toFixed(2),
        'Driver Fuel Net': row.fuelNetPay.toFixed(2),
        'Fuel Draft Estimate (not yet finalized)': row.fuelDraftEstimate.toFixed(2),
        'Fuel Status': row.isFinalized ? 'Finalized' : 'Pending',
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
            {!fuelCoreLoading && totals.unfinalizedPeriods > 0 && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                {totals.finalizedPeriods} of {totals.totalPeriods} {periodLabel}{totals.totalPeriods !== 1 ? 's' : ''} finalized
              </p>
            )}
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-shadow hover:shadow-md ${expenseView === 'toll' ? 'ring-1 ring-amber-200' : ''}`}
          onClick={() => setExpenseView('toll')}
        >
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
            {totals.tollTotal > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5">
                {totals.tollReconciled > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                    <LinkIcon className="h-2.5 w-2.5" />
                    {totals.tollReconciled} matched
                  </span>
                )}
                {totals.tollUnreconciled > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                    <Unlink className="h-2.5 w-2.5" />
                    {totals.tollUnreconciled} unmatched
                  </span>
                )}
              </div>
            )}
            {totals.tollCharged > 0 && (
              <p className="text-[10px] text-rose-600 mt-1 font-medium">
                Charged to driver: ${totals.tollCharged.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            )}
            {totals.disputeRefundTotal > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-slate-100">
                {totals.disputeRefundMatched > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                    <LinkIcon className="h-2.5 w-2.5" />
                    {totals.disputeRefundMatched} dispute{totals.disputeRefundMatched !== 1 ? 's' : ''} matched
                  </span>
                )}
                {totals.disputeRefundUnmatched > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                    <Unlink className="h-2.5 w-2.5" />
                    {totals.disputeRefundUnmatched} dispute{totals.disputeRefundUnmatched !== 1 ? 's' : ''} unmatched
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-shadow hover:shadow-md ${expenseView === 'fuel' ? 'ring-1 ring-red-200' : ''}`}
          onClick={() => setExpenseView('fuel')}
        >
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Fuel (Deduction)</p>
                {fuelCoreLoading ? (
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
              {fuelCoreLoading
                ? 'Loading finalized data...'
                : totals.fuel > 0
                  ? `From ${totals.finalizedPeriods} finalized ${periodLabel}${totals.finalizedPeriods !== 1 ? 's' : ''}`
                  : 'No finalized fuel deductions'}
            </p>
            {!fuelCoreLoading && fuelDraftLoading && (
              <p className="text-[10px] text-slate-400 mt-0.5 inline-flex items-center gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Estimating pending weeks…
              </p>
            )}
            {!fuelCoreLoading && !fuelDraftLoading && totals.fuelDraftPending > 0.005 && (
              <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                +${totals.fuelDraftPending.toLocaleString(undefined, { minimumFractionDigits: 2 })} pending reconciliation (not yet finalized)
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* History table — Toll / Fuel slide panels */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">
              {expenseView === 'toll' ? 'Toll Expenses' : 'Fuel Expenses'}
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {expenseView === 'toll'
                ? 'Period-by-period toll charges, payment source, and reconciliation status'
                : 'Period-by-period fuel deductions and finalization status'}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export Expenses
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Period selector + view switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3">
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

            {/* Toll ↔ Fuel slide control */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Show toll expenses"
                disabled={expenseView === 'toll'}
                onClick={() => setExpenseView('toll')}
                className={`h-8 w-8 inline-flex items-center justify-center rounded-full border transition-all ${
                  expenseView === 'toll'
                    ? 'border-slate-200 text-slate-300 cursor-default'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setExpenseView('toll')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                    expenseView === 'toll'
                      ? 'bg-white text-amber-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Navigation className="h-3 w-3" />
                  Tolls
                </button>
                <button
                  type="button"
                  onClick={() => setExpenseView('fuel')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                    expenseView === 'fuel'
                      ? 'bg-white text-red-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Fuel className="h-3 w-3" />
                  Fuel
                </button>
              </div>
              <button
                type="button"
                aria-label="Show fuel expenses"
                disabled={expenseView === 'fuel'}
                onClick={() => setExpenseView('fuel')}
                className={`h-8 w-8 inline-flex items-center justify-center rounded-full border transition-all ${
                  expenseView === 'fuel'
                    ? 'border-slate-200 text-slate-300 cursor-default'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {periodData.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No expense transactions found.
            </div>
          ) : (
            <>
              <div className="overflow-hidden">
                <div
                  className="flex transition-transform duration-300 ease-out"
                  style={{ transform: expenseView === 'toll' ? 'translateX(0%)' : 'translateX(-100%)' }}
                >
                  {/* ── Toll panel ── */}
                  <div className="w-full shrink-0 min-w-full">
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[22%] px-3">{periodColumnLabel}</TableHead>
                          <TableHead className="w-[15%] px-3 text-right">Total Tolls</TableHead>
                          <TableHead className="w-[15%] px-3 text-right">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 cursor-help">
                                    Cash Tolls
                                    <Info className="h-3 w-3 text-slate-400" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[240px] text-xs">
                                  Tolls the driver paid in cash at the plaza.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableHead>
                          <TableHead className="w-[15%] px-3 text-right">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 cursor-help">
                                    Tag Tolls
                                    <Info className="h-3 w-3 text-slate-400" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[240px] text-xs">
                                  Tolls charged to the fleet tag / account (not paid in cash).
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableHead>
                          <TableHead className="w-[18%] px-3 text-center">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 cursor-help">
                                    Toll Status
                                    <Info className="h-3 w-3 text-slate-400" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[250px] text-xs">
                                  Whether toll expenses for this period have been matched to a trip in the Toll Reconciliation system. "Reconciled" = all work done; "In Progress" = tolls matched but a claim or dispute is still open; "X Unmatched" = some tolls still need matching.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableHead>
                          <TableHead className="w-[15%] px-3 text-right">Charged to Driver</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleRows.map((row, idx) => (
                          <TableRow key={`toll-${idx}`} className="hover:bg-slate-50/60">
                            <TableCell className="px-3 font-medium text-xs whitespace-nowrap">
                              {formatPeriodLabel(row)}
                            </TableCell>
                            <TableCell className="px-3 text-right tabular-nums text-amber-600">
                              {row.tollExpenses > 0
                                ? `$${row.tollExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                : <span className="text-slate-300">-</span>}
                            </TableCell>
                            <TableCell className="px-3 text-right tabular-nums text-sky-700">
                              {row.tollCashSpent > 0
                                ? `$${row.tollCashSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                : <span className="text-slate-300">-</span>}
                            </TableCell>
                            <TableCell className="px-3 text-right tabular-nums text-slate-700">
                              {row.tollTagSpent > 0
                                ? `$${row.tollTagSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                : <span className="text-slate-300">-</span>}
                            </TableCell>
                            <TableCell className="px-3 text-xs text-center">
                              {(row.tollReconciled + row.tollUnreconciled) === 0 ? (
                                <span className="text-slate-300">-</span>
                              ) : row.tollUnreconciled > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                  <Unlink className="h-3 w-3" /> {row.tollUnreconciled} Unmatched
                                </span>
                              ) : row.tollInProgress ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                                  <Clock className="h-3 w-3" /> In Progress
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                  <CheckCircle className="h-3 w-3" /> Reconciled
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="px-3 text-right tabular-nums text-rose-600">
                              {row.tollCharged > 0
                                ? `$${row.tollCharged.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                : <span className="text-slate-300">-</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* ── Fuel panel ── */}
                  <div className="w-full shrink-0 min-w-full">
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[14%] px-3">{periodColumnLabel}</TableHead>
                          <TableHead className="w-[14%] px-3 text-right">Fuel Deduction</TableHead>
                          <TableHead className="w-[14%] px-3 text-right">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 cursor-help">
                                    Fleet Fuel Share
                                    <Info className="h-3 w-3 text-slate-400" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[280px] text-xs">
                                  Company share of fuel spend this week. Credits cash still held on Settlement (not a payout deduction).
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableHead>
                          <TableHead className="w-[14%] px-3 text-right">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 cursor-help">
                                    Gas Card
                                    <Info className="h-3 w-3 text-slate-400" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[280px] text-xs">
                                  Company / fleet gas-card charges for this period — money the company put on the card. Finalized reports only.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableHead>
                          <TableHead className="w-[14%] px-3 text-right">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 cursor-help">
                                    Paid by Driver
                                    <Info className="h-3 w-3 text-slate-400" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[280px] text-xs">
                                  Cash the driver spent out-of-pocket for fuel this period (not gas card). Finalized reports only.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableHead>
                          <TableHead className="w-[14%] px-3 text-right">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 cursor-help">
                                    Driver Fuel Net
                                    <Info className="h-3 w-3 text-slate-400" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[280px] text-xs">
                                  Paid by Driver (cash) − Fuel Deduction. Positive means the company owes the driver; negative means shortfall is deducted from earnings.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableHead>
                          <TableHead className="w-[16%] px-3 text-center">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 cursor-help">
                                    Fuel Status
                                    <Info className="h-3 w-3 text-slate-400" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[300px] text-xs">
                                  Fuel report lock only — not toll reconciliation. &quot;Finalized&quot; means the fuel report for this period is reviewed and locked (fuel deduction is final). &quot;Pending&quot; means fuel may still change.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleRows.map((row, idx) => (
                          <TableRow key={`fuel-${idx}`} className={!row.isFinalized ? 'bg-amber-50/30' : 'hover:bg-slate-50/60'}>
                            <TableCell className="px-3 font-medium text-xs whitespace-nowrap">
                              {formatPeriodLabel(row)}
                            </TableCell>
                            <TableCell className={`px-3 text-right tabular-nums ${row.isFinalized ? 'text-red-600' : 'text-slate-300'}`}>
                              {row.isFinalized && row.fuelDeduction > 0 ? (
                                `$${row.fuelDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                              ) : !row.isFinalized && row.fuelDraftEstimate > 0.005 ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-amber-600 font-medium cursor-help">
                                        ~${row.fuelDraftEstimate.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[260px] text-xs">
                                      Pending reconciliation — this fuel report has not been finalized yet. Estimate based on current data; the posted amount may change until an admin finalizes this week.
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : !row.isFinalized && fuelDraftLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300 ml-auto" />
                              ) : <span className="text-slate-300">-</span>}
                            </TableCell>
                            <TableCell className="px-3 text-right tabular-nums text-slate-700">
                              {row.isFinalized && row.fuelFleetShare > 0.005
                                ? `$${row.fuelFleetShare.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                : <span className="text-slate-300">-</span>}
                            </TableCell>
                            <TableCell className="px-3 text-right tabular-nums text-slate-600">
                              {row.isFinalized && row.fuelGasCardSpend > 0.005
                                ? `$${row.fuelGasCardSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                : <span className="text-slate-300">-</span>}
                            </TableCell>
                            <TableCell className="px-3 text-right tabular-nums text-slate-600">
                              {row.isFinalized && row.fuelDriverSpend > 0.005
                                ? `$${row.fuelDriverSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                : <span className="text-slate-300">-</span>}
                            </TableCell>
                            <TableCell className="px-3 text-right tabular-nums">
                              {row.isFinalized && (row.fuelDeduction > 0 || row.fuelDriverSpend > 0.005) ? (
                                <span className={`font-medium ${row.fuelNetPay >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {row.fuelNetPay >= 0 ? '+' : '-'}${Math.abs(row.fuelNetPay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              ) : <span className="text-slate-300">-</span>}
                            </TableCell>
                            <TableCell className="px-3 text-xs text-center">
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
                </div>
              </div>

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