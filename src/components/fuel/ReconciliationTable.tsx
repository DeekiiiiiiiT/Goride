import React, { useMemo } from 'react';
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
import { CalendarIcon, FileCheck, AlertCircle, TrendingUp, Info, Download } from "lucide-react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

import { Vehicle } from '../../types/vehicle';
import { Trip } from '../../types/data';
import { FuelEntry, MileageAdjustment, WeeklyFuelReport, FuelDispute, FuelScenario } from '../../types/fuel';
import { FuelCalculationService } from '../../services/fuelCalculationService';
import { downloadCSV } from '../../utils/export';
import { ScenarioSplitDashboard } from './ScenarioSplitDashboard';

interface ReconciliationTableProps {
    vehicles: Vehicle[];
    trips: Trip[];
    fuelEntries: FuelEntry[];
    adjustments?: MileageAdjustment[];
    disputes?: FuelDispute[];
    dateRange: DateRange | undefined;
    scenarios?: FuelScenario[];
    onFinalize?: (reports: WeeklyFuelReport[]) => void;
    onAddAdjustment?: () => void;
    onResolveDispute?: (dispute: FuelDispute) => void;
}

export function ReconciliationTable({ 
    vehicles, 
    trips, 
    fuelEntries, 
    adjustments = [],
    disputes = [],
    dateRange,
    scenarios = [],
    onFinalize,
    onAddAdjustment,
    onResolveDispute
}: ReconciliationTableProps) {
    // Handle invalid/loading date range
    if (!dateRange || !dateRange.from) {
        return <div className="p-8 text-center text-slate-500">Select a date range to view reconciliation reports.</div>;
    }

    const weekStart = dateRange.from;
    const weekEnd = dateRange.to || dateRange.from; // Fallback to single day

    // Calculate Data
    const reports = useMemo(() => {
        return FuelCalculationService.generateFleetReport(
            vehicles, 
            weekStart, 
            weekEnd, 
            trips, 
            fuelEntries, 
            adjustments,
            [], // Check-ins not passed yet
            scenarios
        );
    }, [vehicles, trips, fuelEntries, adjustments, weekStart, weekEnd, scenarios]);

    // Totals
    const totals = useMemo(() => {
        return reports.reduce((acc, r) => ({
            gasCard: acc.gasCard + r.totalGasCardCost,
            rideShare: acc.rideShare + r.rideShareCost,
            companyUsage: acc.companyUsage + r.companyUsageCost,
            personal: acc.personal + r.personalUsageCost,
            misc: acc.misc + r.miscellaneousCost,
            company: acc.company + r.companyShare,
            driver: acc.driver + r.driverShare
        }), { 
            gasCard: 0, 
            rideShare: 0, 
            companyUsage: 0, 
            personal: 0, 
            misc: 0, 
            company: 0, 
            driver: 0 
        });
    }, [reports]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    };

    const getLeakageColor = (val: number) => {
        if (val > 50) return "text-red-600 font-bold"; // High leakage
        if (val > 0) return "text-amber-600"; // Minor leakage
        if (val < 0) return "text-emerald-600"; // Savings
        return "text-slate-600";
    };

    const handleExport = () => {
        const data = reports.map(report => {
            const vehicle = vehicles.find(v => v.id === report.vehicleId);
            const driverSpend = fuelEntries
                .filter(e => 
                    e.vehicleId === report.vehicleId && 
                    e.date >= report.weekStart && 
                    e.date <= report.weekEnd &&
                    (e.type === 'Reimbursement' || e.type === 'Manual_Entry')
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
                PersonalUsage: Number(report.personalUsageCost.toFixed(2)),
                Miscellaneous: Number(report.miscellaneousCost.toFixed(2)),
                CompanyShare: Number(report.companyShare.toFixed(2)),
                DriverShare: Number(report.driverShare.toFixed(2)), 
                PaidByDriver: Number(driverSpend.toFixed(2)),      
                NetPay: Number((driverSpend - report.driverShare).toFixed(2))
            };
        });

        downloadCSV(data, `reconciliation-${format(weekStart, 'yyyy-MM-dd')}`);
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
                    <Button onClick={() => onFinalize?.(reports)}>
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
                                <TableHead className="w-[200px]">Vehicle / Driver</TableHead>
                                <TableHead className="w-[100px]">Status</TableHead>
                                <TableHead className="text-right font-medium text-slate-900 border-l border-r border-slate-200 bg-slate-100">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center justify-end gap-1 cursor-help">
                                                Total Spend
                                                <Info className="h-3 w-3 text-slate-400" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Total fuel cost (Cards + Reimbursements).</p>
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
                                        <TooltipContent>
                                            <p>Cost derived from Trip Distance.</p>
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
                                        <TooltipContent>
                                            <p>Authorized business usage (non-trip).</p>
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
                                        <TooltipContent>
                                            <p>Personal usage + adjustments.</p>
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
                                        <TooltipContent>
                                            <p>Unaccounted usage (Leakage).</p>
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
                                        <TooltipContent>
                                            <p>Amount paid out-of-pocket (Reimbursement Due).</p>
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
                                        <TooltipContent>
                                            <p>Driver's share of costs.</p>
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
                                        <TooltipContent>
                                            <p>Amount to pay (or deduct from) driver.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reports.map((report) => {
                                const vehicle = vehicles.find(v => v.id === report.vehicleId);
                                
                                // Calculate "Paid by Driver" (Cash/Reimbursement)
                                const driverSpend = fuelEntries
                                    .filter(e => 
                                        e.vehicleId === report.vehicleId && 
                                        e.date >= report.weekStart && 
                                        e.date <= report.weekEnd &&
                                        (e.type === 'Reimbursement' || e.type === 'Manual_Entry')
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
                                            <div className="flex flex-col">
                                                <span className="font-medium text-slate-900">
                                                    {vehicle?.licensePlate || 'Unknown'} 
                                                    <span className="text-slate-400 font-normal ml-2">
                                                        ({vehicle?.model})
                                                    </span>
                                                </span>
                                                <span className="text-xs text-slate-500">
                                                    {report.driverId || 'Unassigned'}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {dispute ? (
                                                <Badge variant={
                                                    dispute.status === 'Open' ? 'destructive' : 
                                                    dispute.status === 'Resolved' ? 'default' : 'secondary'
                                                } 
                                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                                onClick={() => onResolveDispute?.(dispute)}
                                                >
                                                    {dispute.status === 'Open' ? 'Dispute' : dispute.status}
                                                </Badge>
                                            ) : (
                                                <span className="text-slate-400 text-xs">-</span>
                                            )}
                                        </TableCell>
                                        
                                        {/* Total Spend */}
                                        <TableCell className="text-right font-medium border-l border-r border-slate-200 bg-slate-50">
                                            {formatCurrency(report.totalGasCardCost)}
                                        </TableCell>

                                        {/* Breakdown Columns */}
                                        <TableCell className="text-right text-slate-600 text-sm">
                                            {formatCurrency(report.rideShareCost)}
                                        </TableCell>
                                        <TableCell className="text-right text-slate-600 text-sm">
                                            {formatCurrency(report.companyUsageCost)}
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
                                    <TableCell colSpan={11} className="h-24 text-center text-slate-500">
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-slate-600">
                 <div className="p-3 bg-slate-50 rounded border">
                     <span className="font-semibold block mb-1">Ride Share</span>
                     Fuel cost for logged trips.
                 </div>
                 <div className="p-3 bg-slate-50 rounded border">
                     <span className="font-semibold block mb-1">Company Ops</span>
                     Authorized business errands & maintenance.
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
        </div>
    );
}
