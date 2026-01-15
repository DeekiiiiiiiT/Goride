import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Loader2, Fuel, AlertCircle, Info, TrendingUp, TrendingDown } from "lucide-react";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";
import { useAuth } from '../auth/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { api } from '../../services/api';
import { fuelService } from '../../services/fuelService';
import { FuelCalculationService } from '../../services/fuelCalculationService';
import { FuelDisputeService } from '../../services/fuelDisputeService';
import { WeeklyFuelReport, FuelDispute } from '../../types/fuel';
import { Separator } from "../ui/separator";
import { DisputeModal } from "../fuel/DisputeModal";

export function DriverFuelStats() {
    const { user } = useAuth();
    const { driverRecord } = useCurrentDriver();
    const [loading, setLoading] = useState(true);
    const [report, setReport] = useState<WeeklyFuelReport | null>(null);
    const [existingDispute, setExistingDispute] = useState<FuelDispute | null>(null);
    const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, -1 = last week
    const [isDisputeOpen, setIsDisputeOpen] = useState(false);

    useEffect(() => {
        if (user && driverRecord) loadData();
    }, [user, driverRecord, weekOffset]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Calculate dates
            const now = new Date();
            const targetDate = subWeeks(now, Math.abs(weekOffset));
            const start = startOfWeek(targetDate, { weekStartsOn: 1 }); // Monday
            const end = endOfWeek(targetDate, { weekStartsOn: 1 }); // Sunday

            // Fetch necessary data
            // In a real app, we'd have optimized endpoints for this.
            // For now, we fetch lists and filter client-side (MVP approach).
            const [vehicles, trips, entries, adjustments] = await Promise.all([
                api.getVehicles(),
                api.getTrips(),
                fuelService.getFuelEntries(),
                fuelService.getMileageAdjustments()
            ]);

            // Find driver's vehicle
            // This assumes the driver is assigned to a vehicle in the vehicle record
            // OR we check the trips/entries to find the vehicle they used most recently.
            // For now, let's look for a vehicle where currentDriverId matches.
            const myVehicle = vehicles.find((v: any) => v.currentDriverId === driverRecord?.id || v.currentDriverId === driverRecord?.driverId);

            if (!myVehicle) {
                setReport(null);
                setLoading(false);
                return;
            }

            const weeklyReport = FuelCalculationService.calculateReconciliation(
                myVehicle,
                start,
                end,
                trips,
                entries,
                adjustments
            );

            setReport(weeklyReport);

            // Check for dispute
            const dispute = await FuelDisputeService.getDisputeByReportId(
                weeklyReport.weekStart, 
                myVehicle.id, 
                weeklyReport.weekEnd
            );
            setExistingDispute(dispute || null);

        } catch (e) {
            console.error("Failed to load fuel stats", e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
        );
    }

    if (!report) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-slate-500">
                    <Fuel className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p>No vehicle assignment found.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">Fuel & Efficiency</h3>
                    <p className="text-sm text-slate-500">
                        Week of {format(new Date(report.weekStart), 'MMM d')} - {format(new Date(report.weekEnd), 'MMM d, yyyy')}
                    </p>
                </div>
                <div className="flex gap-2">
                     <Badge 
                        variant="outline" 
                        className="cursor-pointer hover:bg-slate-100"
                        onClick={() => setWeekOffset(prev => prev - 1)}
                    >
                        Previous Week
                    </Badge>
                    {weekOffset < 0 && (
                        <Badge 
                            variant="outline" 
                            className="cursor-pointer hover:bg-slate-100"
                            onClick={() => setWeekOffset(0)}
                        >
                            Current
                        </Badge>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Driver Liability Card */}
                <Card className="border-indigo-100 bg-indigo-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-medium text-indigo-900">Your Share (Deductions)</CardTitle>
                        <CardDescription>Amount to be deducted from earnings</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-indigo-700 mb-4">
                            ${report.driverShare.toFixed(2)}
                        </div>
                        <div className="space-y-2 text-sm text-indigo-800/80">
                            <div className="flex justify-between">
                                <span>Personal Usage ({Math.round(report.personalDistance)} km)</span>
                                <span>${report.personalCost.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Fuel Misc Share (50%)</span>
                                <span>${(report.fuelMiscCost > 0 ? report.fuelMiscCost / 2 : 0).toFixed(2)}</span>
                            </div>
                        </div>
                        {existingDispute ? (
                            <div className="mt-4 p-3 bg-white rounded border border-slate-200 shadow-sm flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                     <Badge variant={
                                         existingDispute.status === 'Resolved' ? 'default' : 
                                         existingDispute.status === 'Rejected' ? 'destructive' : 'secondary'
                                     }>
                                         {existingDispute.status}
                                     </Badge>
                                     <span className="text-xs font-medium text-slate-500">Dispute Active</span>
                                </div>
                                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setIsDisputeOpen(true)}>
                                    View Details
                                </Button>
                            </div>
                        ) : (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="w-full text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 mt-4 border border-indigo-200"
                                onClick={() => setIsDisputeOpen(true)}
                            >
                                Dispute This Calculation
                            </Button>
                        )}
                    </CardContent>
                </Card>

                {/* Company Liability Card */}
                <Card className="border-slate-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-medium text-slate-900">Company Share</CardTitle>
                        <CardDescription>Covered by the fleet</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900 mb-4">
                            ${report.companyShare.toFixed(2)}
                        </div>
                        <div className="space-y-2 text-sm text-slate-600">
                            <div className="flex justify-between">
                                <span>Operating Fuel (Trips)</span>
                                <span>${report.operatingFuelCost.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Company Misc ({Math.round(report.companyMiscDistance)} km)</span>
                                <span>${report.companyMiscCost.toFixed(2)}</span>
                            </div>
                             <div className="flex justify-between">
                                <span>Fuel Misc Share (50%)</span>
                                <span>${(report.fuelMiscCost > 0 ? report.fuelMiscCost / 2 : report.fuelMiscCost).toFixed(2)}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Phase 6: Mileage Waterfall */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Mileage Breakdown</CardTitle>
                    <CardDescription>How your total distance is allocated</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                        <span className="font-semibold text-slate-900">Total Odometer Change</span>
                        <span className="font-bold text-slate-900">{(report.totalTripDistance + report.companyMiscDistance + report.personalDistance).toFixed(1)} km</span>
                    </div>
                    
                    <div className="flex justify-between items-center py-2 text-slate-600">
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400">-</span>
                            <span>Business Trips</span>
                        </div>
                        <span>{report.totalTripDistance.toFixed(1)} km</span>
                    </div>

                    <div className="flex justify-between items-center py-2 text-slate-600">
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400">-</span>
                            <span>Company Errands</span>
                        </div>
                        <span>{report.companyMiscDistance.toFixed(1)} km</span>
                    </div>

                    <div className="flex justify-between items-center py-3 mt-2 bg-indigo-50 px-3 -mx-3 rounded-md border border-indigo-100">
                        <span className="font-medium text-indigo-900">= Personal Usage</span>
                        <span className="font-bold text-indigo-700">{report.personalDistance.toFixed(1)} km</span>
                    </div>
                </CardContent>
            </Card>

            {/* Efficiency Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Efficiency Analysis</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-6">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white rounded-md shadow-sm">
                                <Fuel className="h-5 w-5 text-orange-500" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-900">Total Fuel Bill</p>
                                <p className="text-xs text-slate-500">Gas Card Charges</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-bold text-slate-900">${report.totalGasCardCost.toFixed(2)}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                             <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-500">Fuel Efficiency Rating</span>
                                <span className={
                                    report.fuelMiscCost > 10 ? "text-rose-600 font-medium" : 
                                    report.fuelMiscCost < 0 ? "text-emerald-600 font-medium" : 
                                    "text-amber-600 font-medium"
                                }>
                                    {report.fuelMiscCost > 10 ? "Needs Improvement" : 
                                     report.fuelMiscCost < 0 ? "Excellent" : "Average"}
                                </span>
                            </div>
                            
                            {/* Leakage Indicator */}
                             <div className="p-3 rounded-md bg-slate-50 border text-xs text-slate-600 leading-relaxed">
                                {report.fuelMiscCost > 0 ? (
                                    <div className="flex gap-2">
                                        <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-semibold text-rose-700">High Usage Detected.</span>
                                            <span className="block mt-1">
                                                Your actual fuel spend is ${report.fuelMiscCost.toFixed(2)} higher than calculated for your trips. 
                                                This could be due to idling, heavy traffic, or missing mileage logs. 
                                                The excess cost is split 50/50.
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <TrendingDown className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-semibold text-emerald-700">Great Efficiency!</span>
                                            <span className="block mt-1">
                                                You are running under budget by ${Math.abs(report.fuelMiscCost).toFixed(2)}. 
                                                Keep up the good driving habits.
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {report && (
                <DisputeModal 
                    isOpen={isDisputeOpen}
                    onClose={() => setIsDisputeOpen(false)}
                    vehicleId={report.vehicleId}
                    driverId={report.driverId}
                    weekStart={report.weekStart}
                    weekEnd={report.weekEnd}
                    onSuccess={loadData}
                    existingDispute={existingDispute}
                />
            )}
        </div>
    );
}
