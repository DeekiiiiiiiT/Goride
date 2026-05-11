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

import { Vehicle } from '../../types/vehicle';
import { Trip } from '../../types/data';
import { FuelEntry, MileageAdjustment, WeeklyFuelReport, FuelDispute, FuelScenario, OdometerBucket } from '../../types/fuel';
import { FuelCalculationService, VehicleDeadheadInput } from '../../services/fuelCalculationService';
import { downloadCSV } from '../../utils/export';
import { ScenarioSplitDashboard } from './ScenarioSplitDashboard';
import { api } from '../../services/api';

interface ReconciliationTableProps {
    vehicles: Vehicle[];
    trips: Trip[];
    fuelEntries: FuelEntry[];
    adjustments?: MileageAdjustment[];
    disputes?: FuelDispute[];
    dateRange: DateRange | undefined;
    scenarios?: FuelScenario[];
    drivers?: any[];
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
    onFinalize,
    onAddAdjustment,
    onResolveDispute,
    onViewBuckets
}: ReconciliationTableProps) {
    const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = React.useState(false);

    // Phase 1 verification: confirm drivers data arrives
    console.log(`[ReconciliationTable] Phase 1 check — received ${drivers.length} driver(s)`);

    const weekStart = dateRange?.from;
    const weekEnd = dateRange?.to || dateRange?.from;

    // Phase 3: Deadhead attribution data from server
    const [deadheadMap, setDeadheadMap] = useState<Map<string, VehicleDeadheadInput>>(new Map());
    const [deadheadLoading, setDeadheadLoading] = useState(false);

    // Per-period deadhead fetch: use the selected week range directly
    // (previously used broad date range, which overcounted deadhead per week)
    useEffect(() => {
        if (!weekStart || !weekEnd) return;
        let cancelled = false;
        setDeadheadLoading(true);

        const startStr = format(weekStart, 'yyyy-MM-dd');
        const endStr = format(weekEnd, 'yyyy-MM-dd');

        console.log(`[ReconciliationTable] Fetching per-period deadhead: ${startStr} to ${endStr}`);

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

    // Calculate Data — hooks must always run (React rules of hooks)
    // Phase 2: Build a map of vehicleId -> Set of all known driver IDs for that vehicle's assigned driver
    const driverIdMap = useMemo(() => {
        const map = new Map<string, Set<string>>();
        for (const vehicle of vehicles) {
            const assignedDriverId = vehicle.currentDriverId;
            if (!assignedDriverId) continue;
            const idSet = new Set<string>([assignedDriverId]);
            const driverRecord = drivers.find((d: any) => d.id === assignedDriverId || d.driverId === assignedDriverId);
            if (driverRecord) {
                // Roam-only: only use native Roam IDs for driver-vehicle matching
                // (Uber/InDrive UUIDs were causing 59-vs-57 trip count mismatches)
                if (driverRecord.id) idSet.add(driverRecord.id);
                if (driverRecord.driverId) idSet.add(driverRecord.driverId);
            }
            map.set(vehicle.id, idSet);
        }
        console.log(`[ReconciliationTable] Phase 2 — Built driver ID map for ${map.size} vehicle(s):`, Array.from(map.entries()).map(([vId, ids]) => ({ vehicleId: vId, driverIds: Array.from(ids) })));
        return map;
    }, [vehicles, drivers]);

    const reports = useMemo(() => {
        if (!weekStart) return [];
        return vehicles.map(vehicle => {
            const driverIds = driverIdMap.get(vehicle.id);
            let driverTrips: Trip[];
            if (driverIds && driverIds.size > 0) {
                driverTrips = trips.filter(t => driverIds.has(t.driverId));
            } else {
                driverTrips = trips;
            }
            console.log(`[ReconciliationTable] Phase 2 — Vehicle ${vehicle.id}: driverIds=${driverIds ? Array.from(driverIds).join(',') : '(none)'}, totalTrips=${trips.length}, driverFilteredTrips=${driverTrips.length}`);
            return FuelCalculationService.calculateReconciliation(vehicle, weekStart, weekEnd!, driverTrips, fuelEntries, adjustments, scenarios, deadheadMap?.get(vehicle.id));
        });
    }, [vehicles, trips, fuelEntries, adjustments, weekStart, weekEnd, scenarios, deadheadMap, driverIdMap]);

    // Totals
    const totals = useMemo(() => {
        return reports.reduce((acc, r) => ({
            gasCard: acc.gasCard + r.totalGasCardCost,
            rideShare: acc.rideShare + r.rideShareCost,
            companyUsage: acc.companyUsage + r.companyUsageCost,
            deadhead: acc.deadhead + (r.deadheadCost || 0),
            personal: acc.personal + r.personalUsageCost,
            misc: acc.misc + r.miscellaneousCost,
            company: acc.company + r.companyShare,
            driver: acc.driver + r.driverShare
        }), { 
            gasCard: 0, 
            rideShare: 0, 
            companyUsage: 0, 
            deadhead: 0,
            personal: 0, 
            misc: 0, 
            company: 0, 
            driver: 0 
        });
    }, [reports]);

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
            const rStart = report.weekStart.split('T')[0];
            const rEnd = report.weekEnd.split('T')[0];
            const driverSpend = fuelEntries
                .filter(e => 
                    e.vehicleId === report.vehicleId && 
                    e.date >= rStart && 
                    e.date <= rEnd &&
                    (e.type === 'Reimbursement' || e.type === 'Manual_Entry' || e.type === 'Fuel_Manual_Entry')
                )
                .reduce((sum, e) => sum + e.amount, 0);

            return {
                WeekStart: format(new Date(report.weekStart), 'yyyy-MM-dd'),
                WeekEnd: format(new Date(report.weekEnd), 'yyyy-MM-dd'),
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

        await downloadCSV(data, `reconciliation-${format(weekStart, 'yyyy-MM-dd')}`, { checksum: true });
    };

    return (
        <div className="space-y-4">
            {/* Split Dashboard */}
            <ScenarioSplitDashboard reports={reports} scenarios={scenarios} vehicles={vehicles} />

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
                    <Button onClick={() => setIsFinalizeDialogOpen(true)} disabled={reports.length === 0}>
                        <FileCheck className="mr-2 h-4 w-4" />
                        Finalize
                    </Button>
                    <Button variant="outline" onClick={onAddAdjustment}>
                        <TrendingUp className="mr-2 h-4 w-4" />
                        Add Adjustment
                    </Button>
                </div>
            </div>

            {/* Main Table */}
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="w-[180px]">Vehicle / Driver</TableHead>
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
                                                    <p className="text-slate-300">Fuel cost attributed to logged ride-share trips (Uber, InDrive, etc.). This is the work-related portion of fuel consumption.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">How it's calculated</p>
                                                    <p className="text-slate-300">(Trip km ÷ efficiency km/L) × $/L</p>
                                                    <p className="text-slate-400 mt-1">Efficiency sourced from odometer data, vehicle settings, or system default (12.5 km/L). Price/L from actual fuel purchases in the period.</p>
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
                                                    <p className="text-slate-300">100% company-covered. This is always a company expense and never charged to the driver.</p>
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
                                                    <p className="text-slate-300">Unaccounted fuel that doesn't fit into any known category. A high value here signals potential fraud, data gaps, or untagged usage.</p>
                                                </div>
                                                <div className="border-t border-slate-600 pt-2">
                                                    <p className="font-semibold text-amber-400 text-[11px] uppercase tracking-wide mb-1">How it's calculated</p>
                                                    <p className="text-slate-300">Total Spend − Ride Share − Company Ops − Deadhead − Personal</p>
                                                    <p className="text-slate-400 mt-1">This is a residual catch-all. Ideally should be $0 or close to it. Non-zero values warrant investigation.</p>
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
                                const assignedDriver = vehicle?.currentDriverId
                                    ? drivers.find((d: any) => d.id === vehicle.currentDriverId || d.driverId === vehicle.currentDriverId)
                                    : null;
                                const driverName = assignedDriver?.name || vehicle?.currentDriverName || null;
                                
                                // Calculate "Paid by Driver" (Cash/Reimbursement)
                                const rStart = report.weekStart.split('T')[0];
                                const rEnd = report.weekEnd.split('T')[0];
                                const driverSpend = fuelEntries
                                    .filter(e => 
                                        e.vehicleId === report.vehicleId && 
                                        e.date >= rStart && 
                                        e.date <= rEnd &&
                                        (e.type === 'Reimbursement' || e.type === 'Manual_Entry' || e.type === 'Fuel_Manual_Entry')
                                    )
                                    .reduce((sum, e) => sum + e.amount, 0);

                                const netPay = driverSpend - report.driverShare;

                                // Check if dispute overlaps with report period
                                const dispute = disputes.find(d => {
                                    if (d.vehicleId !== report.vehicleId) return false;
                                    if (d.weekStart !== report.weekStart) return false;
                                    if (d.weekEnd) return d.weekEnd === report.weekEnd;
                                    return true;
                                });

                                return (
                                    <TableRow key={report.id}>
                                        <TableCell>
                                            <div className="flex items-start justify-between">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-slate-900">
                                                            {vehicle?.licensePlate || 'Unknown'} 
                                                        </span>
                                                    </div>
                                                    <span className="text-xs text-slate-500">
                                                        {vehicle?.model}
                                                    </span>
                                                    {driverName && (
                                                        <span className="text-xs text-indigo-600 font-medium">
                                                            {driverName}
                                                        </span>
                                                    )}
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
                                                {dispute && (
                                                    <Badge variant={
                                                        dispute.status === 'Open' ? 'destructive' : 
                                                        dispute.status === 'Resolved' ? 'default' : 'secondary'
                                                    } 
                                                    className="cursor-pointer hover:opacity-80 transition-opacity"
                                                    onClick={() => onResolveDispute?.(dispute)}
                                                    >
                                                        {dispute.status === 'Open' ? 'Dispute' : dispute.status}
                                                    </Badge>
                                                )}

                                                {(report.pendingCount || 0) > 0 && (
                                                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                                        {report.pendingCount} Pending
                                                    </Badge>
                                                )}

                                                {!dispute && (!report.pendingCount || report.pendingCount === 0) && (
                                                    <span className="text-slate-400 text-xs">-</span>
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
                                                        <span className={`cursor-help ${report.metadata?.rideShareCalc ? 'underline decoration-dotted decoration-slate-300 underline-offset-2' : ''}`}>
                                                            {formatCurrency(report.rideShareCost)}
                                                        </span>
                                                    </TooltipTrigger>
                                                    {report.metadata?.rideShareCalc && (
                                                        <TooltipContent side="bottom" className="max-w-xs p-0">
                                                            <div className="p-3 space-y-2 text-xs">
                                                                <div className="font-semibold text-slate-900 border-b border-slate-200 pb-1.5">
                                                                    Ride Share Calculation
                                                                </div>
                                                                <div className="space-y-1 text-slate-600">
                                                                    <div className="flex justify-between gap-4">
                                                                        <span>Total Rideshare km</span>
                                                                        <span className="font-medium text-slate-900">
                                                                            {report.metadata.rideShareCalc.totalRideshareKm?.toFixed(1)} km
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
                                <TableCell className="text-right border-l border-r border-slate-200">{formatCurrency(totals.gasCard)}</TableCell>
                                
                                <TableCell className="text-right">{formatCurrency(totals.rideShare)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(totals.companyUsage)}</TableCell>
                                <TableCell className="text-right text-amber-600">{formatCurrency(totals.deadhead)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(totals.personal)}</TableCell>
                                <TableCell className={`text-right border-r border-slate-200 ${getLeakageColor(totals.misc)}`}>
                                    {formatCurrency(totals.misc)}
                                </TableCell>

                                <TableCell className="text-right text-emerald-700">-</TableCell>
                                <TableCell className="text-right text-amber-700">{formatCurrency(totals.driver)}</TableCell>
                                <TableCell className="text-right">-</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </CardContent>
            </Card>

            {/* Explanation / Legend */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm text-slate-600">
                 <div className="p-3 bg-slate-50 rounded border">
                     <span className="font-semibold block mb-1">Ride Share</span>
                     Fuel cost for logged trips.
                 </div>
                 <div className="p-3 bg-slate-50 rounded border">
                     <span className="font-semibold block mb-1">Company Ops</span>
                     Authorized business errands & maintenance.
                 </div>
                 <div className="p-3 bg-amber-50 rounded border border-amber-200">
                     <span className="font-semibold block mb-1 text-amber-800">Deadhead</span>
                     Repositioning & cruising fuel (work-related, non-trip).
                 </div>
                 <div className="p-3 bg-slate-50 rounded border">
                     <span className="font-semibold block mb-1">Personal</span>
                     Personal usage calculated from logs + adjustments.
                 </div>
                 <div className="p-3 bg-slate-50 rounded border">
                     <span className="font-semibold block mb-1">Misc (Leakage)</span>
                     Unaccounted fuel (Total - All known categories).
                 </div>
            </div>

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
                            className="bg-emerald-600 hover:bg-emerald-700"
                        >
                            Process Ledger Entries
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}