import React, { useMemo, useState, useEffect } from 'react';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow,
    TableFooter
} from "../ui/table";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { 
    CalendarIcon, 
    FileCheck, 
    AlertCircle, 
    TrendingUp, 
    Info, 
    Download, 
    History,
    CheckCircle2,
    AlertTriangle,
    ShieldCheck
} from "lucide-react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../ui/alert-dialog";
import { Progress } from "../ui/progress";
import { Checkbox } from "../ui/checkbox";
import { WeekSessionPanel } from "./WeekSessionPanel";
import {
  FUEL_PERSONAL_SESSIONS_ENABLED,
  FLEET_USE_FUEL_BRAIN,
  FUEL_BRAIN_SHADOW_COMPARE,
} from "../../utils/fuelBrainFlags";

import { Vehicle } from '../../types/vehicle';
import { Trip } from '../../types/data';
import { FuelEntry, MileageAdjustment, WeeklyFuelReport, FuelDispute, FuelScenario, OdometerBucket, FinalizedFuelReport, FuelCard } from '../../types/fuel';
import { FuelCalculationService, VehicleDeadheadInput, FuelBrainClassificationInput } from '../../services/fuelCalculationService';
import { classifyWeekForRecon } from '../../services/fuelBrainClient';
import { fuelService } from '../../services/fuelService';
import { sumTripRideshareKm } from '../../utils/tripRideshareKm';
import { evaluateUnknownFinalizeGate } from '../../utils/fuelBrainUnknownGate';
import { downloadCSV } from '../../utils/export';
import { ScenarioSplitDashboard } from './ScenarioSplitDashboard';
import { api } from '../../services/api';
import { UNASSIGNED_FUEL_DRIVER_ID } from '../../types/fuel';
import { reportWeekYmdBounds, toEntryYmd, isSameFuelStatement } from '../../utils/fuelWeekPeriod';
import { sumPaidByDriverForReport } from '../../utils/fuelPaidByDriver';
import { resolveActiveFuelPolicyForDriverWeek } from '../../utils/fuelPolicyVersion';

interface ReconciliationTableProps {
    vehicles: Vehicle[];
    trips: Trip[];
    fuelEntries: FuelEntry[];
    adjustments?: MileageAdjustment[];
    disputes?: FuelDispute[];
    dateRange: DateRange | undefined;
    scenarios?: FuelScenario[];
    drivers?: any[];
    fuelCards?: FuelCard[];
    /** Prior finalized snapshots — used to warn when re-finalizing a vehicle/week that was already posted. */
    finalizedReports?: FinalizedFuelReport[];
    /** When true, week is locked — hide Add Adjustment / mutate CTAs. */
    periodLocked?: boolean;
    hideFinalize?: boolean;
    hideDashboard?: boolean;
    /** Emit live weekly reports for period wizard strip / gating. */
    onReportsChange?: (reports: WeeklyFuelReport[]) => void;
    onFinalize?: (reports: WeeklyFuelReport[]) => void;
    onAddAdjustment?: () => void;
    onResolveDispute?: (dispute: FuelDispute) => void;
    onViewBuckets?: (vehicle: Vehicle) => void;
}

export function ReconciliationTable({
    vehicles,
    trips,
    fuelEntries,
    adjustments = [],
    disputes = [],
    dateRange,
    scenarios = [],
    drivers = [],
    fuelCards = [],
    finalizedReports = [],
    periodLocked = false,
    hideFinalize = false,
    hideDashboard = false,
    onReportsChange,
    onFinalize,
    onAddAdjustment,
    onResolveDispute,
    onViewBuckets
}: ReconciliationTableProps) {
    const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = React.useState(false);
    const [sessionFocusReportId, setSessionFocusReportId] = React.useState<string | null>(null);

    const weekStart = dateRange?.from;
    const weekEnd = dateRange?.to || dateRange?.from;

    // Phase 3: Deadhead attribution data from server
    const [deadheadMap, setDeadheadMap] = useState<Map<string, VehicleDeadheadInput>>(new Map());
    const [deadheadLoading, setDeadheadLoading] = useState(false);
    const [brainByDriverVehicle, setBrainByDriverVehicle] = useState<Map<string, FuelBrainClassificationInput>>(new Map());
    const [unknownAck, setUnknownAck] = useState(false);

    // Per-period deadhead fetch: use the selected week range directly
    // (previously used broad date range, which overcounted deadhead per week)
    useEffect(() => {
        if (!weekStart || !weekEnd) return;
        let cancelled = false;
        setDeadheadLoading(true);

        const startStr = format(weekStart, 'yyyy-MM-dd');
        const endStr = format(weekEnd, 'yyyy-MM-dd');

        api.getFleetDeadhead(startStr, endStr)
            .then((data: any) => {
                if (cancelled) return;
                const map = new Map<string, VehicleDeadheadInput>();
                for (const v of (data?.vehicles || [])) {
                    map.set(v.vehicleId, {
                        vehicleId: v.vehicleId,
                        deadheadKm: v.deadheadKm || 0,
                        personalKm: v.personalKm || 0,
                        totalOdometerKm: v.totalOdometerKm || 0,
                        method: v.method || 'fallback',
                        confidenceLevel: v.confidenceLevel || 'low',
                        confidenceReason: v.confidenceReason || 'No data',
                    });
                }
                setDeadheadMap(map);
            })
            .catch((err: any) => {
                console.error('Failed to fetch deadhead attribution:', err);
                // Graceful degradation: reconciliation still works without deadhead
            })
            .finally(() => {
                if (!cancelled) setDeadheadLoading(false);
            });

        return () => { cancelled = true; };
    }, [weekStart, weekEnd]);

    // Fuel Brain classify (consumer or shadow) — flag off → empty map (legacy path)
    useEffect(() => {
        if (!weekStart || !weekEnd) return;
        if (!FLEET_USE_FUEL_BRAIN && !FUEL_BRAIN_SHADOW_COMPARE) {
            setBrainByDriverVehicle(new Map());
            return;
        }
        let cancelled = false;
        const startStr = format(weekStart, 'yyyy-MM-dd');
        const endStr = format(weekEnd, 'yyyy-MM-dd');

        (async () => {
            const map = new Map<string, FuelBrainClassificationInput>();
            try {
                for (const v of vehicles) {
                    const driverId = v.currentDriverId || '';
                    if (!driverId) continue;
                    const vTrips = trips.filter(
                        (t) =>
                            t.vehicleId === v.id &&
                            (t.status === 'Completed' || t.status === 'Cancelled'),
                    );
                    const vAdj = adjustments.filter((a) => a.vehicleId === v.id);
                    const companyOpsKm = vAdj
                        .filter((a) => a.type === 'Company_Misc' || a.type === 'Maintenance')
                        .reduce((s, a) => s + (a.distance || 0), 0);
                    const sessions = await fuelService
                        .listDrivingSessions({
                            driverId,
                            vehicleId: v.id,
                            weekStart: startStr,
                            weekEnd: endStr,
                        })
                        .catch(() => []);
                    const dh = deadheadMap.get(v.id);
                    const classified = await classifyWeekForRecon({
                        driverId,
                        vehicleId: v.id,
                        weekStart: startStr,
                        weekEnd: endStr,
                        totalOdometerKm: dh?.totalOdometerKm || 0,
                        tripRideshareKm: sumTripRideshareKm(vTrips),
                        companyOpsKm,
                        sessions: sessions.map((s) => ({
                            mode: s.mode,
                            startAt: s.startAt,
                            endAt: s.endAt,
                            startOdo: s.startOdo,
                            endOdo: s.endOdo,
                        })),
                        deadheadHintKm: dh?.deadheadKm || 0,
                    });
                    map.set(`${driverId}:${v.id}`, {
                        rideShareKm: classified.rideShareKm,
                        personalKm: classified.personalKm,
                        companyOpsKm: classified.companyOpsKm,
                        deadheadKm: classified.deadheadKm,
                        unknownKm: classified.unknownKm,
                        unknownPct: classified.unknownPct,
                        confidence: classified.confidence as Record<string, string>,
                        method: classified.method,
                    });
                }
            } catch (e) {
                console.warn('[FuelBrain] classify batch failed', e);
            }
            if (!cancelled) setBrainByDriverVehicle(map);
        })();

        return () => {
            cancelled = true;
        };
    }, [weekStart, weekEnd, vehicles, trips, adjustments, deadheadMap]);

    // Calculate Data — hooks must always run (React rules of hooks)
    // Driver-first: one report per driver+week (shared cars → multiple rows)
    const reports = useMemo(() => {
        if (!weekStart) return [];
        return FuelCalculationService.generateDriverFleetReport(
            vehicles,
            drivers,
            weekStart,
            weekEnd!,
            trips,
            fuelEntries,
            adjustments,
            scenarios,
            deadheadMap,
            fuelCards,
            // Only inject into money path when consumer flag is on
            FLEET_USE_FUEL_BRAIN ? brainByDriverVehicle : undefined,
        );
    }, [vehicles, drivers, trips, fuelEntries, adjustments, weekStart, weekEnd, scenarios, deadheadMap, fuelCards, brainByDriverVehicle]);

    useEffect(() => {
        onReportsChange?.(reports);
    }, [reports, onReportsChange]);

    // Totals — settlement columns use the same Paid-by-Driver helper as rows
    const paidByDriverCtx = useMemo(
      () => ({ vehicles, fuelCards, trips }),
      [vehicles, fuelCards, trips],
    );

    const totals = useMemo(() => {
        return reports.reduce((acc, r) => {
            const paidByDriver = sumPaidByDriverForReport(fuelEntries, r, vehicles, paidByDriverCtx);
            const netPay = paidByDriver - r.driverShare;
            return {
                gasCard: acc.gasCard + r.totalGasCardCost,
                rideShare: acc.rideShare + r.rideShareCost,
                companyUsage: acc.companyUsage + r.companyUsageCost,
                deadhead: acc.deadhead + (r.deadheadCost || 0),
                personal: acc.personal + r.personalUsageCost,
                misc: acc.misc + r.miscellaneousCost,
                company: acc.company + r.companyShare,
                driver: acc.driver + r.driverShare,
                paidByDriver: acc.paidByDriver + paidByDriver,
                netPay: acc.netPay + netPay,
            };
        }, {
            gasCard: 0,
            rideShare: 0,
            companyUsage: 0,
            deadhead: 0,
            personal: 0,
            misc: 0,
            company: 0,
            driver: 0,
            paidByDriver: 0,
            netPay: 0,
        });
    }, [reports, fuelEntries, vehicles, paidByDriverCtx]);

    // Re-finalize safety (Step 2): flag reports that already have a prior finalized
    // snapshot for the same vehicle+week. Re-finalizing recomputes driverShare from
    // ALL entries in the week — adding a late entry can shift the week's observed
    // efficiency/price-per-liter and retroactively reallocate cost already posted —
    // so surface the delta before the admin confirms rather than silently overwriting.
    const reFinalizeWarnings = useMemo(() => {
        return reports.reduce((acc, r) => {
            const prior = finalizedReports.find((f) => isSameFuelStatement(f, r));
            if (prior) {
                const priorDriverShare = prior.postedDriverShare ?? prior.driverShare ?? 0;
                const delta = r.driverShare - priorDriverShare;
                acc.push({ vehicleId: r.vehicleId, driverId: r.driverId, priorDriverShare, delta });
            }
            return acc;
        }, [] as { vehicleId: string; driverId: string; priorDriverShare: number; delta: number }[]);
    }, [reports, finalizedReports]);

    // Finalize gating (Step 5): no existing "block on status" pattern exists in
    // this codebase, so this warns rather than hard-blocks — an admin may need to
    // override — but requires an explicit acknowledgment when any selected report
    // has a data-quality flag (Amber/Red health, unresolved pending logs, or an
    // Open dispute for that vehicle/week).
    const findDisputeForReport = (report: WeeklyFuelReport) => {
        const { start, end } = reportWeekYmdBounds(report);
        return disputes.find(d => {
            const dStart = toEntryYmd(d.weekStart);
            if (report.driverId && d.driverId && d.driverId === report.driverId) {
                if (dStart !== start) return false;
                if (d.weekEnd) return toEntryYmd(d.weekEnd) === end;
                return true;
            }
            if (d.vehicleId !== report.vehicleId) return false;
            if (dStart !== start) return false;
            if (d.weekEnd) return toEntryYmd(d.weekEnd) === end;
            return true;
        });
    };

    const dataQualityWarnings = useMemo(() => {
        return reports.reduce((acc, r) => {
            const openDispute = findDisputeForReport(r)?.status === 'Open';
            const isUnhealthy = r.healthStatus && r.healthStatus !== 'Emerald';
            const hasPending = (r.pendingCount || 0) > 0;
            if (openDispute || isUnhealthy || hasPending) {
                acc.push({ vehicleId: r.vehicleId, healthStatus: r.healthStatus, pendingCount: r.pendingCount || 0, openDispute });
            }
            return acc;
        }, [] as { vehicleId: string; healthStatus?: string; pendingCount: number; openDispute: boolean }[]);
    }, [reports, disputes]);

    const [financeWarningAcknowledged, setFinanceWarningAcknowledged] = useState(false);
    const unknownGate = useMemo(
      () =>
        FLEET_USE_FUEL_BRAIN
          ? evaluateUnknownFinalizeGate(reports, undefined, { acknowledge: unknownAck })
          : { blocked: false, warnOnly: false, reasons: [] as string[] },
      [reports, unknownAck],
    );
    const hasBlockingWarnings =
      dataQualityWarnings.length > 0 ||
      reFinalizeWarnings.some((w) => Math.abs(w.delta) > 0.01) ||
      (FLEET_USE_FUEL_BRAIN && unknownGate.blocked);

    // Handle invalid/loading date range — early return AFTER all hooks
    if (!dateRange || !dateRange.from) {
        return <div className="p-8 text-center text-slate-500">Select a date range to view reconciliation reports.</div>;
    }

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    };

    const getLeakageColor = (val: number) => {
        if (val > 50) return "text-red-600 font-bold"; // High leakage
        if (val > 0) return "text-amber-600"; // Minor leakage
        if (val < 0) return "text-emerald-600"; // Savings
        return "text-slate-600";
    };

    const handleExport = async () => {
        const data = reports.map(report => {
            const vehicle = vehicles.find(v => v.id === report.vehicleId);
            const { start: rStart, end: rEnd } = reportWeekYmdBounds(report);
            const driverSpend = sumPaidByDriverForReport(fuelEntries, report, vehicles, paidByDriverCtx);

            return {
                WeekStart: rStart,
                WeekEnd: rEnd,
                Vehicle: vehicle?.licensePlate || 'Unknown',
                DriverID: report.driverId,
                TotalSpend: Number(report.totalGasCardCost.toFixed(2)),
                RideShare: Number(report.rideShareCost.toFixed(2)),
                CompanyUsage: Number(report.companyUsageCost.toFixed(2)),
                DeadheadCost: Number((report.deadheadCost || 0).toFixed(2)),
                DeadheadKm: Number((report.deadheadDistance || 0).toFixed(1)),
                DeadheadMethod: report.deadheadMeta?.method || 'none',
                DeadheadConfidence: report.deadheadMeta?.confidenceLevel || 'none',
                PersonalUsage: Number(report.personalUsageCost.toFixed(2)),
                Miscellaneous: Number(report.miscellaneousCost.toFixed(2)),
                CompanyShare: Number(report.companyShare.toFixed(2)),
                DriverShare: Number(report.driverShare.toFixed(2)),
                PaidByDriver: Number(driverSpend.toFixed(2)),
                NetPay: Number((driverSpend - report.driverShare).toFixed(2))
            };
        });

        if (!weekStart) return;
        await downloadCSV(data, `reconciliation-${format(weekStart, 'yyyy-MM-dd')}`, { checksum: true });
    };

    return (
        <div className="space-y-4">
            {/* Split Dashboard */}
            {!hideDashboard && (
              <ScenarioSplitDashboard reports={reports} scenarios={scenarios} vehicles={vehicles} />
            )}

            {/* Header */}
            <div className="flex items-center justify-between bg-white p-4 rounded-lg border shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-start">
                        <span className="text-sm font-medium text-slate-500">Statement Period</span>
                        <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-slate-400" />
                            <span className="font-bold text-slate-900">
                                {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="text-right mr-4">
                        <p className="text-xs text-slate-500">Net Leakage</p>
                        <p className={`font-bold ${getLeakageColor(totals.misc)}`}>
                            {formatCurrency(totals.misc)}
                        </p>
                    </div>
                    <Button variant="outline" onClick={handleExport}>
                        <Download className="mr-2 h-4 w-4" />
                        Export
                    </Button>
                    {!hideFinalize && !periodLocked && (
                      <Button onClick={() => { setFinanceWarningAcknowledged(false); setUnknownAck(false); setIsFinalizeDialogOpen(true); }} disabled={reports.length === 0}>
                          <FileCheck className="mr-2 h-4 w-4" />
                          Finalize
                      </Button>
                    )}
                    {!periodLocked && onAddAdjustment && (
                      <Button variant="outline" onClick={onAddAdjustment}>
                          <TrendingUp className="mr-2 h-4 w-4" />
                          Add Adjustment
                      </Button>
                    )}
                </div>
            </div>

            {/* Main Table */}
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="w-[180px]">Driver / Vehicle(s)</TableHead>
                                <TableHead className="w-[120px] text-center">Data Health</TableHead>
                                <TableHead className="w-[100px]">Status</TableHead>
                                <TableHead className="text-right font-medium text-slate-900 border-l border-r border-slate-200 bg-slate-100">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center justify-end gap-1 cursor-help">
                                                Total Spend
                                                <Info className="h-3 w-3 text-slate-400" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-xs p-0">
                                            <div className="p-3 space-y-2.5 text-xs">
                                                <div>
                                                    <p className="font-bold text-slate-100 text-sm mb-1">Total Spend</p>
                                                    <p className="text-slate-300">Total fuel expenditure across all payment methods for this vehicle during the statement period.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">How it's calculated</p>
                                                    <p className="text-slate-300">Gas Card charges + Driver cash reimbursements + Manual entries.</p>
                                                    <p className="text-slate-400 mt-1">Sources: fuel card transactions, approved reimbursement requests, and admin-entered manual logs.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">Company / Driver Split</p>
                                                    <p className="text-slate-300">This column is pre-split. The breakdown into Ride Share, Company Ops, Deadhead, Personal, and Misc determines each party's share.</p>
                                                </div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TableHead>
                                
                                {/* The 4 New Columns (Breakdown) */}
                                <TableHead className="text-right text-xs text-slate-500 font-normal">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center justify-end gap-1 cursor-help">
                                                Ride Share
                                                <Info className="h-3 w-3 text-slate-400" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-xs p-0">
                                            <div className="p-3 space-y-2.5 text-xs">
                                                <div>
                                                    <p className="font-bold text-slate-100 text-sm mb-1">Ride Share</p>
                                                    <p className="text-slate-300">Estimated fuel cost of platform trip kilometers — not a slice of Total Spend receipts.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">How it's calculated</p>
                                                    <p className="text-slate-300">(Trip km ÷ efficiency km/L) × $/L</p>
                                                    <p className="text-slate-400 mt-1">Efficiency from odometer fills, vehicle settings, or 10 km/L default. Price/L from period purchases. Can exceed Total Spend when trip km or fallbacks inflate the estimate — Leakage then goes negative to balance.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">Company / Driver Split</p>
                                                    <p className="text-slate-300">Split is determined by the Ride Share coverage % in the active fuel scenario. Typically 100% company-covered.</p>
                                                </div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TableHead>
                                <TableHead className="text-right text-xs text-slate-500 font-normal">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center justify-end gap-1 cursor-help">
                                                Company Ops
                                                <Info className="h-3 w-3 text-slate-400" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-xs p-0">
                                            <div className="p-3 space-y-2.5 text-xs">
                                                <div>
                                                    <p className="font-bold text-slate-100 text-sm mb-1">Company Ops</p>
                                                    <p className="text-slate-300">Fuel consumed for authorized business errands, maintenance trips, and other company-directed usage outside of ride-share trips.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">How it's calculated</p>
                                                    <p className="text-slate-300">Sum of fuel entries tagged as "Company_Usage" or linked to company-authorized trips during the period.</p>
                                                    <p className="text-slate-400 mt-1">Requires explicit tagging via admin entry or driver check-in. Defaults to $0 if no entries are tagged.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">Company / Driver Split</p>
                                                    <p className="text-slate-300">Split follows the Company Ops coverage % on the vehicle&apos;s fuel policy (often 100% company, but configurable).</p>
                                                </div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TableHead>
                                <TableHead className="text-right text-xs text-amber-600 font-normal">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center justify-end gap-1 cursor-help">
                                                Deadhead
                                                <Info className="h-3 w-3 text-amber-400" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-xs p-0">
                                            <div className="p-3 space-y-2.5 text-xs">
                                                <div>
                                                    <p className="font-bold text-slate-100 text-sm mb-1">Deadhead</p>
                                                    <p className="text-slate-300">Fuel burned during repositioning, cruising for rides, and other work-related driving that doesn't have a paying passenger.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">How it's calculated</p>
                                                    <p className="text-slate-300">(Deadhead km ÷ efficiency km/L) × $/L</p>
                                                    <p className="text-slate-400 mt-1">Deadhead km = Total odometer delta − Trip km − Company Ops km. If no odometer data exists, falls back to mileage adjustments tagged as "Deadhead".</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">Company / Driver Split</p>
                                                    <p className="text-slate-300">Split uses 3-tier fallback: deadheadCoverage → companyUsageCoverage → base coverageValue from the active scenario.</p>
                                                </div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TableHead>
                                <TableHead className="text-right text-xs text-slate-500 font-normal">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center justify-end gap-1 cursor-help">
                                                Personal
                                                <Info className="h-3 w-3 text-slate-400" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-xs p-0">
                                            <div className="p-3 space-y-2.5 text-xs">
                                                <div>
                                                    <p className="font-bold text-slate-100 text-sm mb-1">Personal</p>
                                                    <p className="text-slate-300">Fuel consumed for non-work personal driving. This is the true personal residual after all work-related categories have been subtracted.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">How it's calculated</p>
                                                    <p className="text-slate-300">(Personal km ÷ efficiency km/L) × $/L</p>
                                                    <p className="text-slate-400 mt-1">Personal km = Total odometer delta − Trip km − Company Ops km − Deadhead km. If no odometer data exists, falls back to mileage adjustments tagged as "Personal".</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">Company / Driver Split</p>
                                                    <p className="text-slate-300">Split is determined by the Personal coverage % in the active fuel scenario. Typically 0% company-covered (fully driver responsibility).</p>
                                                </div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TableHead>
                                <TableHead className="text-right text-xs text-slate-500 font-normal border-r border-slate-200">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center justify-end gap-1 cursor-help">
                                                Misc
                                                <Info className="h-3 w-3 text-slate-400" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-xs p-0">
                                            <div className="p-3 space-y-2.5 text-xs">
                                                <div>
                                                    <p className="font-bold text-slate-100 text-sm mb-1">Misc (Leakage)</p>
                                                    <p className="text-slate-300">Residual after estimated categories: Total Spend − Ride Share − Company Ops − Deadhead − Personal. Large negative values mean estimates exceed receipts (often inflated Ride Share), not necessarily fraud.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">How it's calculated</p>
                                                    <p className="text-slate-300">Total Spend − Ride Share − Company Ops − Deadhead − Personal</p>
                                                    <p className="text-slate-400 mt-1">Residual catch-all. Ideally near $0. Large positive or negative values warrant checking trip km, efficiency, and price sources.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">Company / Driver Split</p>
                                                    <p className="text-slate-300">Split follows the Miscellaneous coverage % in the active scenario. Typically split 50/50 until the source is identified.</p>
                                                </div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TableHead>
                                {/* End of Breakdown */}

                                <TableHead className="text-right bg-emerald-50/50">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center justify-end gap-1 cursor-help">
                                                Paid by Driver
                                                <Info className="h-3 w-3 text-slate-400" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-xs p-0">
                                            <div className="p-3 space-y-2.5 text-xs">
                                                <div>
                                                    <p className="font-bold text-slate-100 text-sm mb-1">Paid by Driver</p>
                                                    <p className="text-slate-300">Total amount the driver paid out-of-pocket for fuel during this period (cash purchases submitted as reimbursement requests).</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">How it's calculated</p>
                                                    <p className="text-slate-300">Sum of all Reimbursement + Manual_Entry type fuel logs for this vehicle in the period.</p>
                                                    <p className="text-slate-400 mt-1">Only includes entries where the driver used personal funds. Gas card charges are excluded — those appear in Total Spend only.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">Net Pay Impact</p>
                                                    <p className="text-slate-300">This amount is credited back to the driver. Net Pay = Paid by Driver − Deduction. Positive = company owes driver.</p>
                                                </div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TableHead>
                                <TableHead className="text-right bg-amber-50/50">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center justify-end gap-1 cursor-help">
                                                Deduction
                                                <Info className="h-3 w-3 text-slate-400" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-xs p-0">
                                            <div className="p-3 space-y-2.5 text-xs">
                                                <div>
                                                    <p className="font-bold text-slate-100 text-sm mb-1">Deduction</p>
                                                    <p className="text-slate-300">The driver's total share of fuel costs for the period, calculated by applying the scenario split rules to each consumption category.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">How it's calculated</p>
                                                    <p className="text-slate-300">(Ride Share × driver%) + (Company Ops × driver%) + (Deadhead × driver%) + (Personal × driver%) + (Misc × driver%)</p>
                                                    <p className="text-slate-400 mt-1">Each category's driver% comes from the active fuel scenario configuration. The sum is the total amount charged to the driver.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">Finalization</p>
                                                    <p className="text-slate-300">When finalized, this amount is posted as a debit to the driver's main financial ledger.</p>
                                                </div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TableHead>
                                <TableHead className="text-right font-bold bg-slate-100">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center justify-end gap-1 cursor-help">
                                                Net Pay
                                                <Info className="h-3 w-3 text-slate-400" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-xs p-0">
                                            <div className="p-3 space-y-2.5 text-xs">
                                                <div>
                                                    <p className="font-bold text-slate-100 text-sm mb-1">Net Pay</p>
                                                    <p className="text-slate-300">The final settlement amount for this driver. Positive = company owes the driver. Negative = driver owes the company.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">How it's calculated</p>
                                                    <p className="text-slate-300">Paid by Driver − Deduction = Net Pay</p>
                                                    <p className="text-slate-400 mt-1">If the driver paid more out-of-pocket than their share, the company reimburses the difference. If less, the shortfall is deducted from their earnings.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">Finalization</p>
                                                    <p className="text-slate-300">When finalized, this net amount is posted to the driver's main ledger as either a credit (positive) or debit (negative).</p>
                                                </div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reports.map((report) => {
                                const vehicle = vehicles.find(v => v.id === report.vehicleId);
                                const reportDriver = report.driverId && report.driverId !== UNASSIGNED_FUEL_DRIVER_ID
                                    ? drivers.find((d: any) => d.id === report.driverId || d.driverId === report.driverId)
                                    : null;
                                const driverName =
                                    report.driverId === UNASSIGNED_FUEL_DRIVER_ID
                                        ? 'Unassigned fills'
                                        : reportDriver?.name ||
                                          [reportDriver?.firstName, reportDriver?.lastName].filter(Boolean).join(' ') ||
                                          vehicle?.currentDriverName ||
                                          null;

                                const plateLabel =
                                    (report.vehiclePlates && report.vehiclePlates.length > 0
                                        ? report.vehiclePlates.join(', ')
                                        : vehicle?.licensePlate) || 'Unknown';
                                
                                // Calculate "Paid by Driver" (Cash/Reimbursement) for this driver-week
                                const driverSpend = sumPaidByDriverForReport(fuelEntries, report, vehicles, paidByDriverCtx);

                                const netPay = driverSpend - report.driverShare;
                                const rideCalc = report.metadata?.rideShareCalc as
                                  | {
                                      totalRideshareKm?: number;
                                      observedEfficiency?: number;
                                      actualPricePerLiter?: number;
                                      efficiencySource?: string;
                                      priceSource?: string;
                                      tripsIncluded?: number;
                                    }
                                  | undefined;
                                const estimateExceedsSpend =
                                  report.rideShareCost > report.totalGasCardCost + 0.01 ||
                                  Math.abs(report.miscellaneousCost) > report.totalGasCardCost * 0.5;

                                // Check if dispute overlaps with report period (YMD bounds)
                                const dispute = findDisputeForReport(report);

                                return (
                                    <TableRow
                                      key={report.id}
                                      className={sessionFocusReportId === report.id ? 'bg-amber-50/50' : undefined}
                                      onClick={() => setSessionFocusReportId(report.id)}
                                    >
                                        <TableCell>
                                            <div className="flex items-start justify-between">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-slate-900">
                                                            {driverName || 'Unknown driver'}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs text-slate-500">
                                                        {plateLabel}
                                                        {vehicle?.model ? ` · ${vehicle.model}` : ''}
                                                    </span>
                                                    {(() => {
                                                        const weekKey = reportWeekYmdBounds(report).start;
                                                        const policy = resolveActiveFuelPolicyForDriverWeek(
                                                          scenarios,
                                                          report.driverId,
                                                          weekKey,
                                                        );
                                                        const policyName =
                                                          policy?.scenario.name ||
                                                          report.metadata?.scenarioName;
                                                        if (!policyName) return null;
                                                        const isExplicitMembership = Boolean(
                                                          policy?.hit &&
                                                            report.driverId &&
                                                            policy.version.driverIds?.includes(report.driverId),
                                                        );
                                                        return (
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <span className={`inline-flex items-center gap-1 text-[10px] cursor-help w-fit ${isExplicitMembership ? 'text-slate-500' : 'text-amber-600'}`}>
                                                                        <Info className="h-2.5 w-2.5" />
                                                                        {isExplicitMembership ? policyName : `${policyName} (default)`}
                                                                    </span>
                                                                </TooltipTrigger>
                                                                <TooltipContent side="bottom" className="max-w-xs text-xs">
                                                                    {isExplicitMembership
                                                                      ? `Fuel policy for this driver-week: ${policyName}.`
                                                                      : `No schedule membership for this driver-week — using ${policyName}. Assign drivers on the Schedule tab if this isn't intentional.`}
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                        );
                                                    })()}
                                                </div>
                                                {onViewBuckets && vehicle && (
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-8 w-8 text-slate-400 hover:text-blue-600"
                                                                    onClick={() => onViewBuckets(vehicle)}
                                                                >
                                                                    <History className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>View Odometer Buckets</TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col items-center justify-center gap-1">
                                                <div className="flex items-center gap-1.5">
                                                    {report.healthStatus === 'Emerald' ? (
                                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                    ) : report.healthStatus === 'Amber' ? (
                                                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                                                    ) : (
                                                        <AlertCircle className="h-4 w-4 text-rose-500" />
                                                    )}
                                                    <span className={`text-[10px] font-bold uppercase ${
                                                        report.healthStatus === 'Emerald' ? 'text-emerald-600' :
                                                        report.healthStatus === 'Amber' ? 'text-amber-600' : 'text-rose-600'
                                                    }`}>
                                                        {report.healthStatus}
                                                    </span>
                                                </div>
                                                <Progress value={report.healthScore} className="h-1 w-12" />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1 items-start">
                                                {(() => {
                                                    const isLocked = periodLocked || finalizedReports.some(
                                                        (f) => isSameFuelStatement(f, report)
                                                    );
                                                    return (
                                                        <Badge variant={isLocked ? 'secondary' : 'outline'} className="text-[10px]">
                                                            {isLocked ? 'Locked' : 'Draft'}
                                                        </Badge>
                                                    );
                                                })()}
                                                {dispute && (
                                                    <Badge variant={
                                                        dispute.status === 'Open' ? 'destructive' : 
                                                        dispute.status === 'Resolved' ? 'default' : 'secondary'
                                                    } 
                                                    className="cursor-pointer hover:opacity-80 transition-opacity"
                                                    onClick={() => onResolveDispute?.(dispute)}
                                                    >
                                                        {dispute.status === 'Open' ? 'Disputed' : dispute.status}
                                                    </Badge>
                                                )}

                                                {(report.pendingCount || 0) > 0 && (
                                                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                                        {report.pendingCount} Pending
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        
                                        {/* Total Spend */}
                                        <TableCell className="text-right font-medium border-l border-r border-slate-200 bg-slate-50">
                                            {formatCurrency(report.totalGasCardCost)}
                                        </TableCell>

                                        {/* Breakdown Columns */}
                                        <TableCell className="text-right text-slate-600 text-sm">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span className={`inline-flex flex-col items-end gap-0.5 cursor-help ${report.metadata?.rideShareCalc ? 'underline decoration-dotted decoration-slate-300 underline-offset-2' : ''}`}>
                                                            <span className={estimateExceedsSpend ? 'text-amber-700 font-semibold' : ''}>
                                                              {formatCurrency(report.rideShareCost)}
                                                            </span>
                                                            {estimateExceedsSpend && (
                                                              <span className="text-[9px] font-medium text-amber-600 normal-case no-underline">
                                                                Est. &gt; spend
                                                              </span>
                                                            )}
                                                        </span>
                                                    </TooltipTrigger>
                                                    {report.metadata?.rideShareCalc && (
                                                        <TooltipContent side="bottom" className="max-w-xs p-0">
                                                            <div className="p-3 space-y-2 text-xs">
                                                                <div className="font-semibold text-slate-900 border-b border-slate-200 pb-1.5">
                                                                    Ride Share Calculation
                                                                </div>
                                                                {estimateExceedsSpend && (
                                                                  <p className="text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                                                                    Estimate exceeds Total Spend — check km, efficiency source, and $/L below. Leakage absorbs the difference.
                                                                  </p>
                                                                )}
                                                                <div className="space-y-1 text-slate-600">
                                                                    <div className="flex justify-between gap-4">
                                                                        <span>Total Rideshare km</span>
                                                                        <span className="font-medium text-slate-900">
                                                                            {rideCalc?.totalRideshareKm?.toFixed(1) ?? report.metadata.rideShareCalc.totalRideshareKm?.toFixed(1)} km
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between gap-4">
                                                                        <span>Efficiency</span>
                                                                        <span className="font-medium text-slate-900">
                                                                            {report.metadata.rideShareCalc.observedEfficiency} km/L
                                                                            <span className={`ml-1 px-1 py-0.5 rounded text-[10px] ${
                                                                                report.metadata.rideShareCalc.efficiencySource === 'odometer' 
                                                                                    ? 'bg-emerald-100 text-emerald-700' 
                                                                                    : report.metadata.rideShareCalc.efficiencySource === 'vehicle_settings'
                                                                                    ? 'bg-blue-100 text-blue-700'
                                                                                    : 'bg-amber-100 text-amber-700'
                                                                            }`}>
                                                                                {report.metadata.rideShareCalc.efficiencySource === 'odometer' 
                                                                                    ? 'ODO' 
                                                                                    : report.metadata.rideShareCalc.efficiencySource === 'vehicle_settings'
                                                                                    ? 'SETTINGS'
                                                                                    : 'DEFAULT'}
                                                                            </span>
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between gap-4">
                                                                        <span>Price / Liter</span>
                                                                        <span className="font-medium text-slate-900">
                                                                            ${report.metadata.rideShareCalc.actualPricePerLiter}
                                                                            <span className={`ml-1 px-1 py-0.5 rounded text-[10px] ${
                                                                                report.metadata.rideShareCalc.priceSource === 'fuel_entries' 
                                                                                    ? 'bg-emerald-100 text-emerald-700' 
                                                                                    : 'bg-amber-100 text-amber-700'
                                                                            }`}>
                                                                                {report.metadata.rideShareCalc.priceSource === 'fuel_entries' ? 'ACTUAL' : 'DEFAULT'}
                                                                            </span>
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="border-t border-slate-200 pt-1.5 space-y-1 text-slate-500">
                                                                    <div className="flex justify-between gap-4">
                                                                        <span>Liters in period</span>
                                                                        <span className="text-slate-700">{report.metadata.rideShareCalc.totalLitersInPeriod} L</span>
                                                                    </div>
                                                                    <div className="flex justify-between gap-4">
                                                                        <span>Trips counted</span>
                                                                        <span className="text-slate-700">
                                                                            {report.metadata.rideShareCalc.tripsIncluded}
                                                                            {' '}({report.metadata.rideShareCalc.completedTrips} done, {report.metadata.rideShareCalc.cancelledTrips} cx)
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </TooltipContent>
                                                    )}
                                                </Tooltip>
                                            </TooltipProvider>
                                        </TableCell>
                                        <TableCell className="text-right text-slate-600 text-sm">
                                            {formatCurrency(report.companyUsageCost)}
                                        </TableCell>
                                        <TableCell className="text-right text-amber-600 text-sm">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span className={`cursor-help ${report.deadheadMeta ? 'underline decoration-dotted decoration-amber-300 underline-offset-2' : ''}`}>
                                                            {formatCurrency(report.deadheadCost || 0)}
                                                        </span>
                                                    </TooltipTrigger>
                                                    {report.deadheadMeta && (
                                                        <TooltipContent side="bottom" className="max-w-xs p-0">
                                                            <div className="p-3 space-y-2 text-xs">
                                                                <div className="font-semibold text-slate-900 border-b border-slate-200 pb-1.5">
                                                                    Deadhead Attribution
                                                                </div>
                                                                <div className="space-y-1 text-slate-600">
                                                                    <div className="flex justify-between gap-4">
                                                                        <span>Deadhead km</span>
                                                                        <span className="font-medium text-slate-900">{(report.deadheadDistance || 0).toFixed(1)} km</span>
                                                                    </div>
                                                                    <div className="flex justify-between gap-4">
                                                                        <span>Method</span>
                                                                        <span className="font-medium text-slate-900">{report.deadheadMeta.method}</span>
                                                                    </div>
                                                                    <div className="flex justify-between gap-4">
                                                                        <span>Confidence</span>
                                                                        <span className={`font-medium ${
                                                                            report.deadheadMeta.confidenceLevel === 'high' ? 'text-emerald-700' :
                                                                            report.deadheadMeta.confidenceLevel === 'medium' ? 'text-amber-700' : 'text-rose-700'
                                                                        }`}>{report.deadheadMeta.confidenceLevel}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </TooltipContent>
                                                    )}
                                                </Tooltip>
                                            </TooltipProvider>
                                        </TableCell>
                                        <TableCell className="text-right text-slate-600 text-sm">
                                            {formatCurrency(report.personalUsageCost)}
                                        </TableCell>
                                        <TableCell className={`text-right text-sm border-r border-slate-200 ${getLeakageColor(report.miscellaneousCost)}`}>
                                            {formatCurrency(report.miscellaneousCost)}
                                        </TableCell>
                                        {/* End Breakdown */}

                                        <TableCell className="text-right bg-emerald-50/30 text-emerald-700 font-medium">
                                            {formatCurrency(driverSpend)}
                                        </TableCell>
                                        <TableCell className="text-right bg-amber-50/30 text-amber-700 font-medium">
                                            {formatCurrency(report.driverShare)}
                                        </TableCell>
                                        <TableCell className={`text-right font-bold ${netPay >= 0 ? 'text-emerald-700' : 'text-rose-700'} bg-slate-50`}>
                                            {formatCurrency(netPay)}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            
                            {reports.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={12} className="h-24 text-center text-slate-500">
                                        No vehicles found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        <TableFooter className="bg-slate-100 font-bold">
                            <TableRow>
                                <TableCell>Totals</TableCell>
                                <TableCell></TableCell>
                                <TableCell></TableCell>
                                <TableCell className="text-right border-l border-r border-slate-200">{formatCurrency(totals.gasCard)}</TableCell>
                                
                                <TableCell className="text-right">{formatCurrency(totals.rideShare)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(totals.companyUsage)}</TableCell>
                                <TableCell className="text-right text-amber-600">{formatCurrency(totals.deadhead)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(totals.personal)}</TableCell>
                                <TableCell className={`text-right border-r border-slate-200 ${getLeakageColor(totals.misc)}`}>
                                    {formatCurrency(totals.misc)}
                                </TableCell>

                                <TableCell className="text-right text-emerald-700">{formatCurrency(totals.paidByDriver)}</TableCell>
                                <TableCell className="text-right text-amber-700">{formatCurrency(totals.driver)}</TableCell>
                                <TableCell className={`text-right ${totals.netPay >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                    {formatCurrency(totals.netPay)}
                                </TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </CardContent>
            </Card>

            {/* Explanation / Legend */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm text-slate-600">
                 <div className="p-3 bg-slate-50 rounded border">
                     <span className="font-semibold block mb-1">Ride Share</span>
                     Estimated fuel cost for logged trip km (not a cut of receipts).
                 </div>
                 <div className="p-3 bg-slate-50 rounded border">
                     <span className="font-semibold block mb-1">Company Ops</span>
                     Authorized business errands & maintenance.
                 </div>
                 <div className="p-3 bg-slate-50 rounded border">
                     <span className="font-semibold block mb-1">Deadhead</span>
                     Repositioning & cruising fuel (work-related, non-trip).
                 </div>
                 <div className="p-3 bg-slate-50 rounded border">
                     <span className="font-semibold block mb-1">Personal</span>
                     Personal usage calculated from logs + adjustments.
                 </div>
                 <div className="p-3 bg-slate-50 rounded border">
                     <span className="font-semibold block mb-1">Misc (Leakage)</span>
                     Residual: Total Spend − estimated categories (can be largely negative).
                 </div>
            </div>

            {FUEL_PERSONAL_SESSIONS_ENABLED && (() => {
              const focus =
                reports.find((r) => r.id === sessionFocusReportId) || reports[0];
              if (!focus?.driverId || !focus.vehicleId) return null;
              return (
                <div className="mt-4">
                  <WeekSessionPanel
                    driverId={focus.driverId}
                    vehicleId={focus.vehicleId}
                    weekStart={String(focus.weekStart).split('T')[0]}
                    weekEnd={String(focus.weekEnd).split('T')[0]}
                  />
                </div>
              );
            })()}

            {/* Finalize Confirmation */}
            <AlertDialog open={isFinalizeDialogOpen} onOpenChange={setIsFinalizeDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-emerald-600" />
                            Finalize Reconciliation Statements
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="text-sm text-muted-foreground">
                                This will freeze the data for this period and post the final net amounts to each driver's main ledger. 
                                <div className="mt-4 p-3 bg-slate-50 rounded border border-slate-200 text-slate-900 space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span>Total Fleet Spend:</span>
                                        <span className="font-bold">{formatCurrency(totals.gasCard)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span>Company Share:</span>
                                        <span className="font-bold">{formatCurrency(totals.company)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm border-t pt-2 text-rose-600">
                                        <span>Driver Deductions (Net):</span>
                                        <span className="font-bold">{formatCurrency(totals.driver)}</span>
                                    </div>
                                </div>

                                {reFinalizeWarnings.length > 0 && (
                                    <div className="mt-3 p-3 bg-amber-50 rounded border border-amber-200 text-amber-900 space-y-1.5">
                                        <div className="flex items-center gap-1.5 font-semibold text-sm">
                                            <AlertTriangle className="h-4 w-4" />
                                            {reFinalizeWarnings.length} vehicle{reFinalizeWarnings.length !== 1 ? 's' : ''} already finalized for this week
                                        </div>
                                        <p className="text-xs text-amber-800">
                                            Re-finalizing recomputes driver share from all fuel data in the period, including entries already posted. This can reallocate cost due to updated efficiency/price data since the last finalize. Review the deltas below before proceeding.
                                        </p>
                                        <div className="space-y-1 pt-1">
                                            {reFinalizeWarnings.map((w) => {
                                                const vehicle = vehicles.find(v => v.id === w.vehicleId);
                                                return (
                                                    <div key={w.vehicleId} className="flex justify-between text-xs">
                                                        <span>{vehicle?.licensePlate || w.vehicleId}</span>
                                                        <span className={`font-medium ${Math.abs(w.delta) > 0.01 ? 'text-amber-900' : 'text-slate-500'}`}>
                                                            {Math.abs(w.delta) > 0.01
                                                                ? `${w.delta > 0 ? '+' : ''}${formatCurrency(w.delta)} vs. prior`
                                                                : 'No change'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {dataQualityWarnings.length > 0 && (
                                    <div className="mt-3 p-3 bg-rose-50 rounded border border-rose-200 text-rose-900 space-y-1.5">
                                        <div className="flex items-center gap-1.5 font-semibold text-sm">
                                            <AlertTriangle className="h-4 w-4" />
                                            {dataQualityWarnings.length} vehicle{dataQualityWarnings.length !== 1 ? 's' : ''} flagged for review
                                        </div>
                                        <p className="text-xs text-rose-800">
                                            These vehicles have an Amber/Red data-health status, unresolved pending logs, or an open dispute for this week. Finalizing will still freeze and post these numbers — review each flag before proceeding.
                                        </p>
                                        <div className="space-y-1 pt-1">
                                            {dataQualityWarnings.map((w) => {
                                                const vehicle = vehicles.find(v => v.id === w.vehicleId);
                                                const flags = [
                                                    w.healthStatus && w.healthStatus !== 'Emerald' ? w.healthStatus : null,
                                                    w.pendingCount > 0 ? `${w.pendingCount} pending` : null,
                                                    w.openDispute ? 'open dispute' : null,
                                                ].filter(Boolean).join(' · ');
                                                return (
                                                    <div key={w.vehicleId} className="flex justify-between text-xs">
                                                        <span>{vehicle?.licensePlate || w.vehicleId}</span>
                                                        <span className="font-medium text-rose-900">{flags}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {FLEET_USE_FUEL_BRAIN && unknownGate.reasons.length > 0 && (
                                    <div className="mt-3 p-3 bg-amber-50 rounded border border-amber-200 text-amber-950 space-y-1.5">
                                        <div className="flex items-center gap-1.5 font-semibold text-sm">
                                            <AlertTriangle className="h-4 w-4" />
                                            Unknown km above Fuel Brain threshold
                                        </div>
                                        <ul className="text-xs list-disc pl-4 space-y-0.5">
                                            {unknownGate.reasons.map((r) => (
                                                <li key={r}>{r}</li>
                                            ))}
                                        </ul>
                                        <p className="text-xs">
                                            Unexplained residual is Unknown — not Personal. Resolve in Dominion or acknowledge to finalize.
                                        </p>
                                        <div className="flex items-start gap-2 pt-1">
                                            <Checkbox
                                                id="unknown-ack"
                                                checked={unknownAck}
                                                onCheckedChange={(checked) => setUnknownAck(!!checked)}
                                            />
                                            <label htmlFor="unknown-ack" className="text-xs cursor-pointer">
                                                Acknowledge Unknown km and finalize anyway
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {hasBlockingWarnings && (
                                    <div className="mt-3 flex items-start gap-2">
                                        <Checkbox
                                            id="finalize-warning-ack"
                                            checked={financeWarningAcknowledged}
                                            onCheckedChange={(checked) => setFinanceWarningAcknowledged(!!checked)}
                                            className="mt-0.5"
                                        />
                                        <label htmlFor="finalize-warning-ack" className="text-xs text-slate-700 cursor-pointer">
                                            I've reviewed the warnings above and want to finalize anyway.
                                        </label>
                                    </div>
                                )}
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                onFinalize?.(reports);
                                setIsFinalizeDialogOpen(false);
                            }}
                            disabled={
                              (hasBlockingWarnings && !financeWarningAcknowledged) ||
                              (FLEET_USE_FUEL_BRAIN && unknownGate.blocked && !unknownAck)
                            }
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Process Ledger Entries
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}