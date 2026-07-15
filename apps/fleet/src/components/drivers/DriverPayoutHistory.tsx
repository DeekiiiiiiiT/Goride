import React, { useEffect, useMemo, useState, startTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import {
  Download,
  ChevronDown,
  DollarSign,
  TrendingDown,
  Clock,
  Loader2,
  CheckCircle,
  Wallet,
  Info,
  Scale,
} from 'lucide-react';
import { FinancialTransaction, Trip, DriverMetrics } from '../../types/data';
import type { FuelEntry, MileageAdjustment, FuelScenario } from '../../types/fuel';
import { format } from 'date-fns';
import { exportToCSV } from '../../utils/csvHelpers';
import { toast } from 'sonner@2.0.3';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../ui/tooltip';
import { PayoutPeriodDetail } from './PayoutPeriodDetail';
import type { PayoutPeriodRow } from '../../types/driverPayoutPeriod';
import { useDriverPayoutPeriodRows, type PeriodType } from '../../hooks/useDriverPayoutPeriodRows';
import { getPeriodSettlementComponents } from '../../utils/driverSettlementMath';
import {
  computePayoutSummaryTotals,
  payoutStatusLabel,
} from '../../utils/computePayoutSummaryTotals';
import {
  applyDraftFuelToPayoutRows,
  buildDraftFuelByPeriod,
  rollupWeeklyPayoutRowsToMonthly,
} from '../../utils/payoutDraftFuel';
import { api } from '../../services/api';
import { fuelService } from '../../services/fuelService';
import type { DriverFinancialBundle, DriverLike } from '../../hooks/useDriverFinancialBundle';

interface DriverPayoutHistoryProps {
  driverId: string;
  driver?: DriverLike | null;
  transactions: FinancialTransaction[];
  trips?: Trip[];
  csvMetrics?: DriverMetrics[];
  financialBundle?: DriverFinancialBundle;
  /** Shared weekly rows from DriverDetail — used when periodType is weekly / monthly rollup. */
  weeklyPeriodData?: PayoutPeriodRow[];
}

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function HeaderTip({ label, tip, align = 'left' }: { label: string; tip: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 cursor-help ${
              align === 'right' ? 'justify-end w-full' : align === 'center' ? '' : ''
            }`}
          >
            {label}
            <Info className="h-3 w-3 text-slate-400" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[300px] text-xs">
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function DriverPayoutHistory({
  driverId,
  driver = null,
  transactions = [],
  trips = [],
  csvMetrics = [],
  financialBundle,
  weeklyPeriodData,
}: DriverPayoutHistoryProps) {
  const [periodType, setPeriodType] = useState<PeriodType>('weekly');
  const [visibleCount, setVisibleCount] = useState(12);
  const [draftFuelByPeriod, setDraftFuelByPeriod] = useState<
    Record<string, { deduction: number; fleetShare?: number }>
  >({});
  const [draftLoading, setDraftLoading] = useState(false);

  // Daily uses ledger hook; weekly/monthly prefer shared weekly pipeline (cash-aware).
  const useSharedForWeekly = Boolean(weeklyPeriodData?.length) && periodType === 'weekly';
  const useMonthlyRollup = Boolean(weeklyPeriodData?.length) && periodType === 'monthly';

  const { periodData: hookPeriodData, isReady, fuelDataLoading, financialBundle: resolvedBundle } =
    useDriverPayoutPeriodRows({
      driverId,
      driver,
      trips,
      transactions,
      csvMetrics,
      periodType: periodType === 'monthly' && useMonthlyRollup ? 'weekly' : periodType,
      financialBundle,
      sharedWeekly:
        useSharedForWeekly || useMonthlyRollup
          ? { periodData: weeklyPeriodData }
          : undefined,
      draftFuelByPeriod:
        periodType === 'daily' && Object.keys(draftFuelByPeriod).length
          ? draftFuelByPeriod
          : undefined,
    });

  const unifiedToll = resolvedBundle.unifiedToll;
  const vehicles = resolvedBundle.vehicles;
  const fuelCoreLoading = resolvedBundle.isCoreLoading;

  /** Weekly source for draft fuel load (never monthly aggregates). */
  const weeksForDraft = useMemo(() => {
    if (weeklyPeriodData?.length) return weeklyPeriodData;
    if (periodType === 'daily') return hookPeriodData;
    return hookPeriodData;
  }, [weeklyPeriodData, periodType, hookPeriodData]);

  // Draft fuel for Pending Fuel weeks (Payout estimates; Settlement stays locked).
  useEffect(() => {
    const pending = weeksForDraft.filter((r) => !r.isFinalized);
    if (!pending.length || fuelCoreLoading || !vehicles.length) {
      setDraftFuelByPeriod({});
      return;
    }

    let cancelled = false;
    const load = async () => {
      setDraftLoading(true);
      try {
        const vehicleIds = vehicles.map((v: { id?: string }) => v.id).filter(Boolean) as string[];
        const [entryLists, adjustments, scenarios] = await Promise.all([
          Promise.all(
            vehicleIds.map((vid) => api.getFuelEntriesByVehicle(vid).catch(() => [] as FuelEntry[])),
          ),
          fuelService.getMileageAdjustments().catch(() => [] as MileageAdjustment[]),
          fuelService.getFuelScenarios().catch(() => [] as FuelScenario[]),
        ]);
        if (cancelled) return;

        const byId = new Map<string, FuelEntry>();
        for (const list of entryLists as FuelEntry[][]) {
          for (const e of list) {
            if (e?.id) byId.set(e.id, e);
          }
        }
        const draft = buildDraftFuelByPeriod({
          periods: pending.map((r) => ({ periodStart: r.periodStart, periodEnd: r.periodEnd })),
          vehicles,
          trips,
          fuelEntries: Array.from(byId.values()),
          adjustments: (adjustments || []).filter((a: MileageAdjustment) =>
            vehicleIds.includes(a.vehicleId),
          ),
          scenarios: scenarios || [],
        });
        startTransition(() => {
          if (!cancelled) {
            setDraftFuelByPeriod(draft);
            setDraftLoading(false);
          }
        });
      } catch (e) {
        console.error('[DriverPayoutHistory] Draft fuel load failed:', e);
        if (!cancelled) setDraftLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [weeksForDraft, fuelCoreLoading, vehicles, trips, driverId]);

  const periodData = useMemo(() => {
    const apply = (rows: PayoutPeriodRow[]) => {
      const withFlags = rows.map((r) =>
        r.isFinalized ? r : { ...r, isEstimate: true as const },
      );
      return applyDraftFuelToPayoutRows(withFlags, draftFuelByPeriod, unifiedToll);
    };

    if (periodType === 'monthly' && weeklyPeriodData?.length) {
      return rollupWeeklyPayoutRowsToMonthly(apply(weeklyPeriodData));
    }
    if (periodType === 'weekly' && weeklyPeriodData?.length) {
      return apply(weeklyPeriodData);
    }
    return apply(hookPeriodData);
  }, [periodType, weeklyPeriodData, hookPeriodData, draftFuelByPeriod, unifiedToll]);
  const summaryTotals = useMemo(() => computePayoutSummaryTotals(periodData), [periodData]);

  const defaultPageSize = (pt: PeriodType) => (pt === 'daily' ? 14 : pt === 'monthly' ? 6 : 12);

  const handlePeriodChange = (pt: PeriodType) => {
    setPeriodType(pt);
    setVisibleCount(defaultPageSize(pt));
  };

  const formatPeriodLabel = (row: PayoutPeriodRow): string => {
    if (periodType === 'daily') return format(row.periodStart, 'EEE, dd/MM/yyyy');
    if (periodType === 'monthly') return format(row.periodStart, 'MMMM yyyy');
    return `${format(row.periodStart, 'MMM d')} – ${format(row.periodEnd, 'MMM d, yyyy')}`;
  };

  const showCashColumns = periodType !== 'daily';

  const settleForRow = (row: PayoutPeriodRow) =>
    getPeriodSettlementComponents(row, {
      includeEstimate: Boolean(row.isEstimate && !row.isFinalized),
    });

  const handleExport = () => {
    if (periodData.length === 0) {
      toast.error('No payout data to export');
      return;
    }

    const periodColumnLabel =
      periodType === 'daily' ? 'Date' : periodType === 'monthly' ? 'Month' : 'Week';

    const csvData = periodData.map((row) => {
      const periodLabel =
        periodType === 'daily'
          ? format(row.periodStart, 'yyyy-MM-dd')
          : periodType === 'monthly'
            ? format(row.periodStart, 'MMMM yyyy')
            : `${format(row.periodStart, 'MMM d')} – ${format(row.periodEnd, 'MMM d, yyyy')}`;

      const settled = settleForRow(row);
      const est = row.isEstimate && !row.isFinalized;

      return {
        [periodColumnLabel]: periodLabel,
        Trips: row.tripCount,
        'Ledger Gross Revenue': row.grossRevenue.toFixed(2),
        Tier: row.tierName,
        'Driver Share %': row.driverSharePercent + '%',
        'Driver Share': row.driverShare.toFixed(2),
        'Fuel Deduction':
          row.isFinalized || est ? row.fuelDeduction.toFixed(2) : 'Pending',
        'Charged to Driver': (row.personalTollCharge ?? 0).toFixed(2),
        'Net Take-Home': row.isFinalized || est ? row.netPayout.toFixed(2) : 'Pending',
        Estimate: est ? 'Yes' : 'No',
        'Passenger Cash': (row.passengerCash ?? row.cashOwed).toFixed(2),
        'Bank Settled': (row.bankSettled ?? 0).toFixed(2),
        'Cash Returned': row.cashPaid.toFixed(2),
        'Cash Still Held':
          showCashColumns && (row.isFinalized || est)
            ? settled.adjCashBalance.toFixed(2)
            : periodType === 'daily'
              ? 'N/A'
              : 'Pending',
        'Amount Due':
          showCashColumns && (row.isFinalized || est)
            ? settled.settlement.toFixed(2)
            : periodType === 'daily'
              ? 'N/A'
              : 'Pending',
        Status: payoutStatusLabel(row.status),
      };
    });

    exportToCSV(csvData, `payout-history-${driverId}`);
    toast.success('Payout history exported');
  };

  const [selectedRow, setSelectedRow] = useState<PayoutPeriodRow | null>(null);

  if (!isReady && periodType === 'daily') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Driver Payout</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Take-home after fuel, then settle against cash still held.
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

  const visibleRows = periodData.slice(0, visibleCount);
  const hasMore = periodData.length > visibleCount;

  const openBalanceSub =
    summaryTotals.openBalance < -0.005
      ? 'Driver owes fleet (open weeks)'
      : summaryTotals.openBalance > 0.005
        ? 'Fleet owes driver (open weeks)'
        : 'No open balance';

  return (
    <div className="space-y-6">
      {(fuelDataLoading || draftLoading) && (
        <p className="text-xs text-slate-400 inline-flex items-center gap-1.5 px-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          {draftLoading ? 'Updating fuel estimates…' : 'Updating fuel deductions…'}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-500">Net Take-Home</p>
                <p className="text-2xl font-bold text-emerald-700">
                  ${money(summaryTotals.netTakeHome)}
                </p>
                <p className="text-xs text-slate-400">
                  {summaryTotals.fuelLockedCount > 0
                    ? `${summaryTotals.fuelLockedCount} of ${summaryTotals.totalPeriods} weeks with fuel confirmed${
                        summaryTotals.awaitingCashCount > 0
                          ? ` (${summaryTotals.awaitingCashCount} still need cash)`
                          : ''
                      }`
                    : 'No weeks with fuel confirmed yet'}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2.5">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-500">Fuel Deducted</p>
                <p className="text-2xl font-bold text-rose-700">
                  ${money(summaryTotals.fuelDeducted)}
                </p>
                <p className="text-xs text-slate-400">
                  Driver fuel share across fuel-confirmed periods
                </p>
              </div>
              <div className="rounded-lg bg-rose-50 p-2.5">
                <TrendingDown className="h-5 w-5 text-rose-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-500">Open Balance</p>
                <p
                  className={`text-2xl font-bold ${
                    summaryTotals.openBalance < -0.005
                      ? 'text-rose-700'
                      : summaryTotals.openBalance > 0.005
                        ? 'text-blue-700'
                        : 'text-emerald-700'
                  }`}
                >
                  {summaryTotals.openBalance < -0.005 ? '−' : summaryTotals.openBalance > 0.005 ? '+' : ''}
                  ${money(Math.abs(summaryTotals.openBalance))}
                </p>
                <p className="text-xs text-slate-400">{openBalanceSub}</p>
              </div>
              <div
                className={`rounded-lg p-2.5 ${
                  summaryTotals.openBalance < -0.005
                    ? 'bg-rose-50'
                    : summaryTotals.openBalance > 0.005
                      ? 'bg-blue-50'
                      : 'bg-emerald-50'
                }`}
              >
                <Scale
                  className={`h-5 w-5 ${
                    summaryTotals.openBalance < -0.005
                      ? 'text-rose-600'
                      : summaryTotals.openBalance > 0.005
                        ? 'text-blue-600'
                        : 'text-emerald-600'
                  }`}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Driver Payout</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Take-home after fuel, then settle against cash still held.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            {(['weekly', 'daily', 'monthly'] as PeriodType[]).map((pt) => (
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
          {periodType === 'daily' && (
            <p className="text-[11px] text-slate-400">
              Cash Still Held and Amount Due are weekly — shown as — in daily view.
            </p>
          )}

          {visibleRows.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-xs">
                      <HeaderTip label="Period" tip="Pay period. Weekly is Monday–Sunday." />
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <HeaderTip
                        label="Driver Share"
                        tip="Driver’s earned cut of ledger gross before fuel."
                        align="right"
                      />
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <HeaderTip
                        label="Fuel Deduction"
                        tip="Driver fuel share. Subtracted from Driver Share to get Net Take-Home. Est. until the fuel report is finalized."
                        align="right"
                      />
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <HeaderTip
                        label="Charged to Driver"
                        tip="Personal / non-trip tolls billed via Toll Charge — same as Expenses and Toll Recon Charge Driver. Not subtracted from Net Take-Home; added into Cash Still Held."
                        align="right"
                      />
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      <HeaderTip
                        label="Net Take-Home"
                        tip="Driver Share − Fuel Deduction only. Charged to Driver tolls settle on the cash side."
                        align="right"
                      />
                    </TableHead>
                    {showCashColumns && (
                      <TableHead className="text-xs text-right">
                        <HeaderTip
                          label="Cash Still Held"
                          tip="Passenger cash + Charged to Driver − returns − fuel credit − cash toll credit."
                          align="right"
                        />
                      </TableHead>
                    )}
                    {showCashColumns && (
                      <TableHead className="text-xs text-right">
                        <HeaderTip
                          label="Amount Due"
                          tip="Net Take-Home − Cash Still Held. Positive = fleet owes driver; negative = driver owes fleet."
                          align="right"
                        />
                      </TableHead>
                    )}
                    <TableHead className="text-xs text-center">
                      <HeaderTip
                        label="Status"
                        tip="Pending Fuel = fuel report not locked. Cash Outstanding = fuel locked but cash still held. Closed = fuel locked and cash cleared."
                        align="center"
                      />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row, idx) => {
                    const est = Boolean(row.isEstimate && !row.isFinalized);
                    const showMoney = row.isFinalized || est;
                    const settled = settleForRow(row);
                    const fuelDed = row.fuelDeduction;
                    const chargedToDriver = Math.max(0, row.personalTollCharge ?? 0);
                    const amountDue = settled.settlement;
                    const stillHeld = settled.adjCashBalance;

                    return (
                      <TableRow
                        key={idx}
                        className={`cursor-pointer transition-colors hover:bg-slate-100/60 ${
                          row.status === 'Pending'
                            ? 'bg-amber-50/30'
                            : row.status === 'Awaiting Cash'
                              ? 'bg-blue-50/30'
                              : ''
                        }`}
                        onClick={() => setSelectedRow(row)}
                      >
                        <TableCell className="text-xs font-medium whitespace-nowrap">
                          {formatPeriodLabel(row)}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums font-medium">
                          ${money(row.driverShare)}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {showMoney ? (
                            <span className={fuelDed > 0.005 ? 'text-rose-600' : 'text-slate-400'}>
                              {fuelDed > 0.005 ? `−$${money(fuelDed)}` : '$0.00'}
                              {est && (
                                <span className="ml-1 text-[10px] text-amber-600 font-normal">
                                  est.
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {chargedToDriver > 0.005 ? (
                            <span className="text-rose-700 font-medium">
                              ${money(chargedToDriver)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums font-semibold">
                          {showMoney ? (
                            <span
                              className={
                                row.netPayout >= 0 ? 'text-emerald-700' : 'text-rose-700'
                              }
                            >
                              ${money(row.netPayout)}
                              {est && (
                                <span className="ml-1 text-[10px] text-amber-600 font-normal">
                                  est.
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-amber-600 font-normal italic">Pending</span>
                          )}
                        </TableCell>
                        {showCashColumns && (
                          <TableCell className="text-xs text-right tabular-nums">
                            {showMoney ? (
                              <span
                                className={
                                  stillHeld > 0.005 ? 'text-rose-700' : 'text-slate-400'
                                }
                              >
                                ${money(stillHeld)}
                                {est && (
                                  <span className="ml-1 text-[10px] text-amber-600 font-normal">
                                    est.
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </TableCell>
                        )}
                        {showCashColumns && (
                          <TableCell className="text-xs text-right tabular-nums font-semibold">
                            {showMoney ? (
                              <span
                                className={
                                  amountDue < -0.005
                                    ? 'text-rose-700'
                                    : amountDue > 0.005
                                      ? 'text-blue-700'
                                      : 'text-emerald-700'
                                }
                              >
                                {amountDue < -0.005 ? '−' : amountDue > 0.005 ? '+' : ''}
                                ${money(Math.abs(amountDue))}
                                {est && (
                                  <span className="ml-1 text-[10px] text-amber-600 font-normal">
                                    est.
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-amber-600 font-normal italic">Pending</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-xs text-center">
                          {row.status === 'Finalized' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              <CheckCircle className="h-3 w-3" /> Closed
                            </span>
                          ) : row.status === 'Awaiting Cash' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                              <Wallet className="h-3 w-3" /> Cash Outstanding
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              <Clock className="h-3 w-3" /> Pending Fuel
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVisibleCount((prev) => prev + defaultPageSize(periodType))}
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

      <PayoutPeriodDetail
        row={selectedRow}
        open={!!selectedRow}
        onOpenChange={(open) => {
          if (!open) setSelectedRow(null);
        }}
        showCash={showCashColumns}
      />
    </div>
  );
}
