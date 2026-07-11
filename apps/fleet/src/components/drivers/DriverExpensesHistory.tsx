import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Download, ChevronDown, TrendingDown, Fuel, Navigation, Loader2, CheckCircle, Clock, Info, LinkIcon, Unlink } from "lucide-react";
import { FinancialTransaction, Trip, DisputeRefund } from "../../types/data";
import type { FuelEntry, MileageAdjustment, FuelScenario } from "../../types/fuel";
import { api } from "../../services/api";
import { fuelService } from "../../services/fuelService";
import { FuelCalculationService } from "../../services/fuelCalculationService";
import {
  format,
  startOfDay, endOfDay, startOfMonth, endOfMonth,
  subDays
} from "date-fns";
import { exportToCSV } from "../../utils/csvHelpers";
import { toast } from "sonner@2.0.3";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";
import { isTollCategory } from '../../utils/tollCategoryHelper';
import { isCashPaidToll } from '../../utils/tollDisposition';
import { deriveTollTxIsReconciled } from '../../utils/tollHandledDisplay';
import { computeDisputeRefundCounts, getDisputeRefundWeekDate, weekBucketForDate } from '../../utils/tollWeekPeriod';
import { expandDriverTransactionIds } from '../../utils/expandDriverTransactionIds';
import { isDriverTollChargeRow, netDriverTollCharges } from '../../utils/netDriverTollCharges';
import { fleetTzDateKey, useFleetTimezone, ymdToLocalDate } from '../../utils/timezoneDisplay';
import { getFuelDeductionForPeriod } from '../../utils/fuelDeductionForPeriod';

type PeriodType = 'daily' | 'weekly' | 'monthly';

interface ExpensePeriodRow {
  periodStart: Date;
  periodEnd: Date;
  tollExpenses: number;
  tollCharged: number;         // personal-use tolls billed to this driver (Charge Driver)
  fuelDeduction: number;       // Deduction (driverShare) from finalized reports only
  fuelDriverSpend: number;     // What the driver already paid out-of-pocket for fuel, for finalized periods
  fuelNetPay: number;          // fuelDriverSpend - fuelDeduction; positive = company owes the driver
  fuelDraftEstimate: number;   // Live/unfinalized estimate for periods with no finalized report yet
  isFinalized: boolean;        // true if this period has finalized fuel data
  totalExpenses: number;
  transactionCount: number;
  tollReconciled: number;      // Phase 6: count of reconciled toll txns in this period
  tollUnreconciled: number;    // Phase 6: count of unreconciled toll txns in this period
  tollCashSpent: number;       // $ paid at plaza (cash / receipt) — ignores personal vs wash
  tollTagSpent: number;        // $ charged via tag / fleet account (not cash)
  disputeRefundMatched: number;   // Uber support-case adjustments already linked to a toll
  disputeRefundUnmatched: number; // Uber support-case adjustments still needing a manual match
}

interface DriverExpensesHistoryProps {
  driverId: string;
  transactions: FinancialTransaction[];
  trips?: Trip[];
}

export function DriverExpensesHistory({ driverId, transactions = [], trips = [] }: DriverExpensesHistoryProps) {
  const [periodType, setPeriodType] = React.useState<PeriodType>('weekly');
  const [visibleCount, setVisibleCount] = React.useState(12);
  const fleetTz = useFleetTimezone();

  // ── Fuel data loading flag ──
  const [fuelDataLoading, setFuelDataLoading] = useState(false);

  // ── Phase 2: Finalized reports data source ──────────────────
  const [finalizedReports, setFinalizedReports] = useState<any[]>([]);
  const [driverVehicleIds, setDriverVehicleIds] = useState<Set<string>>(new Set());
  const [driverVehicleList, setDriverVehicleList] = useState<any[]>([]);
  const [disputeRefunds, setDisputeRefunds] = useState<DisputeRefund[]>([]);

  // ── Live/draft reconciliation inputs — used to estimate fuel deduction for
  // periods that haven't been finalized yet, so a large unresolved draft (like
  // an Amber/Pending week) is never silently invisible here. ──
  const [draftFuelEntries, setDraftFuelEntries] = useState<FuelEntry[]>([]);
  const [draftAdjustments, setDraftAdjustments] = useState<MileageAdjustment[]>([]);
  const [draftScenarios, setDraftScenarios] = useState<FuelScenario[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadFinalizedData = async () => {
      setFuelDataLoading(true);
      try {
        const [drivers, vehicles, allReports, disputeRefundsRes, fuelEntries, adjustments, scenarios] = await Promise.all([
          api.getDrivers().catch(() => []),
          api.getVehicles().catch(() => []),
          api.getFinalizedReports().catch(() => []),
          // Unscoped fetch — DisputeRefund.driverId comes from the raw Uber CSV
          // "Driver UUID" column with no server-side normalization, so it may
          // not match this driver's native id. Filter client-side below by the
          // same expanded ID set used elsewhere, rather than trusting a
          // single-ID server-side match.
          api.getDisputeRefunds().catch(() => ({ data: [] as DisputeRefund[], total: 0 })),
          fuelService.getFuelEntries().catch(() => []),
          fuelService.getMileageAdjustments().catch(() => []),
          fuelService.getFuelScenarios().catch(() => []),
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
        setDriverVehicleList(myVehicles);

        // Step 2.2d: Filter finalized reports to this driver's vehicles
        const myReports = (allReports || []).filter(
          (r: any) => r.status === 'Finalized' && vehicleIdSet.has(r.vehicleId)
        );
        setFinalizedReports(myReports);

        // Scope draft reconciliation inputs to this driver's vehicles only.
        setDraftFuelEntries((fuelEntries || []).filter((e: FuelEntry) => vehicleIdSet.has(e.vehicleId || '')));
        setDraftAdjustments((adjustments || []).filter((a: MileageAdjustment) => vehicleIdSet.has(a.vehicleId)));
        setDraftScenarios(scenarios || []);

        // Dispute refunds carry the platform-side driver id, so match against
        // the full expanded set (native + Uber + InDrive), not driverIdSet above.
        const expandedIdSet = new Set(
          expandDriverTransactionIds([driverId, driverRecord?.driverId, driverRecord?.uberDriverId, driverRecord?.inDriveDriverId])
        );
        setDisputeRefunds((disputeRefundsRes.data || []).filter((r) => expandedIdSet.has(r.driverId)));

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
  // ────────────────────────────────────────────────────────────
  const periodData: ExpensePeriodRow[] = useMemo(() => {
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
    const expenseTx = transactions.filter(
      t =>
        (t.category !== 'Fuel Deduction' && t.category !== 'Fuel Reimbursement') &&
        (t.type === 'Expense' || (t.type === 'Adjustment' && t.amount < 0) || isTollCategory(t.category))
    );

    // Draft estimates are only computed for periods within this window — bounds
    // the cost of recomputing live reconciliation (odometer buckets etc.) to the
    // realistic backlog of recently-unresolved weeks, not a driver's entire
    // unfinalized history.
    const draftCutoff = subDays(new Date(), 45);

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
      const { deduction, driverSpend, netPay, finalized } =
        getFuelDeductionForPeriod(finalizedReports, periodStart, periodEnd, periodType);
      const fuelDeduction = deduction;
      const isFinalized = finalized;

      // ── Draft estimate: for recent periods with no finalized report yet,
      // compute a live reconciliation so an unresolved week is never silently
      // shown as $0. Never counted into totalExpenses below — it's an
      // unconfirmed estimate, not a posted expense. ──
      let fuelDraftEstimate = 0;
      if (!isFinalized && periodEnd >= draftCutoff) {
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
        fuelDriverSpend: driverSpend,
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
    driverVehicleList, draftFuelEntries, draftAdjustments, draftScenarios,
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
          : row.tollUnreconciled === 0
            ? `Reconciled (${row.tollReconciled})`
            : `${row.tollUnreconciled} Unmatched`,
        'Charged to driver': row.tollCharged.toFixed(2),
        'Fuel Deduction': row.fuelDeduction.toFixed(2),
        'Fuel Paid by Driver': row.fuelDriverSpend.toFixed(2),
        'Fuel Net Pay': row.fuelNetPay.toFixed(2),
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
            {!fuelDataLoading && totals.fuelDraftPending > 0.005 && (
              <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                +${totals.fuelDraftPending.toLocaleString(undefined, { minimumFractionDigits: 2 })} pending reconciliation (not yet finalized)
              </p>
            )}
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
                    <TableHead className="w-28 text-right whitespace-nowrap">Tolls</TableHead>
                    <TableHead className="text-right text-xs">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              Cash / Tag
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[260px] text-xs">
                            How the toll was paid at the plaza: Cash = driver paid cash; Tag = fleet tag / account charge. Personal charges do not change this split.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-xs text-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              Toll Status
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[250px] text-xs">
                            Whether toll expenses for this period have been matched to a trip in the Toll Reconciliation system. "Reconciled" = all tolls linked; "X Unmatched" = some tolls still need matching.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-right">Charged to driver</TableHead>
                    <TableHead className="text-right">Fuel (Deduction)</TableHead>
                    <TableHead className="text-right">Total Expenses</TableHead>
                    <TableHead className="text-xs text-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              Fuel Status
                              <Info className="h-3 w-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-xs">
                            Fuel report lock only — not toll reconciliation. &quot;Finalized&quot; means the fuel report for this period is reviewed and locked (fuel deduction is final). &quot;Pending&quot; means fuel may still change. Toll matching uses Toll Status.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row, idx) => (
                    <TableRow key={idx} className={!row.isFinalized ? 'bg-amber-50/30' : 'hover:bg-slate-50/60'}>
                      <TableCell className="font-medium text-xs whitespace-nowrap">
                        {formatPeriodLabel(row)}
                      </TableCell>
                      <TableCell className="w-28 text-right tabular-nums text-amber-600 whitespace-nowrap">
                        {row.tollExpenses > 0
                          ? `$${row.tollExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right text-[11px] leading-tight">
                        {row.tollExpenses > 0 ? (
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <span className="text-sky-700">
                              Cash ${row.tollCashSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-slate-600">
                              Tag ${row.tollTagSpent.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        {(row.tollReconciled + row.tollUnreconciled) === 0 ? (
                          <span className="text-slate-300">-</span>
                        ) : row.tollUnreconciled === 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            <CheckCircle className="h-3 w-3" /> Reconciled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            <Unlink className="h-3 w-3" /> {row.tollUnreconciled} Unmatched
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-rose-600">
                        {row.tollCharged > 0
                          ? `$${row.tollCharged.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : '-'}
                      </TableCell>
                      <TableCell className={`text-right ${row.isFinalized ? 'text-red-600' : 'text-slate-300'}`}>
                        {row.isFinalized && row.fuelDeduction > 0 ? (
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <span>${row.fuelDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            {row.fuelDriverSpend > 0.005 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className={`text-[10px] font-medium cursor-help ${row.fuelNetPay >= 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                      Net {row.fuelNetPay >= 0 ? '+' : '-'}${Math.abs(row.fuelNetPay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[260px] text-xs">
                                    Driver already paid ${row.fuelDriverSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })} out-of-pocket for fuel this period. Net = Paid by Driver − Deduction. {row.fuelNetPay >= 0 ? 'Company owes the driver the difference.' : 'The shortfall is deducted from earnings.'}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
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
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold text-rose-600">
                        ${row.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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