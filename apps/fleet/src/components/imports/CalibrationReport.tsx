import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { AlertTriangle, CheckCircle, Clock, Info } from "lucide-react";
import { ProcessedBatch } from '../../utils/csvHelpers';

interface CalibrationReportProps {
    stats: NonNullable<ProcessedBatch['calibrationStats']>;
    tripCount: number;
}

export function CalibrationReport({ stats, tripCount }: CalibrationReportProps) {
    const { fleetStats, deductionPerTrip, phantomLagDetected } = stats;
    const isPreciseMode = !!(fleetStats.driverStats || fleetStats.vehicleStats);
    
    // Reverse engineer the raw log sum for display
    // Excess = deduction * tripCount
    // Raw = Job + Excess
    const excessHours = deductionPerTrip * tripCount; // Approximation if tripCount varies, but good enough for display
    const rawLogSumHours = fleetStats.totalOnJobHours + excessHours;

    // Helper to format hours back to HH:MM:SS for CSV parity
    const formatDuration = (hours: number): string => {
        if (!hours && hours !== 0) return "0:00:00";
        const totalSeconds = Math.round(hours * 3600);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const renderEfficiencyGrid = (currentStats: typeof fleetStats, title: string) => (
        <div className="mt-6 pt-6 border-t border-slate-100">
            <h4 className="text-sm font-medium text-slate-900 mb-4">{title}</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Online</div>
                    <div className="text-lg font-bold text-slate-900 mt-1">{formatDuration(currentStats.totalOnlineHours)}</div>
                    <div className="text-xs text-muted-foreground">{currentStats.totalOnlineHours.toFixed(2)}h</div>
                </div>

                <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                    <div className="text-xs text-slate-600 uppercase tracking-wider font-semibold">Unavailable Time</div>
                    <div className="text-lg font-bold text-slate-800 mt-1">{formatDuration(currentStats.totalUnavailableHours || 0)}</div>
                    <div className="text-xs text-muted-foreground">{(currentStats.totalUnavailableHours || 0).toFixed(2)}h</div>
                </div>
                
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="text-xs text-blue-700 uppercase tracking-wider font-semibold">Open Time</div>
                    <div className="text-lg font-bold text-blue-900 mt-1">
                        {formatDuration(Math.max(0, currentStats.totalOnlineHours - currentStats.totalOnJobHours))}
                    </div>
                    <div className="text-xs text-muted-foreground">{Math.max(0, currentStats.totalOnlineHours - currentStats.totalOnJobHours).toFixed(2)}h</div>
                </div>

                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 relative">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">On Job</div>
                    <div className="text-lg font-bold text-slate-900 mt-1">{formatDuration(currentStats.totalOnJobHours)}</div>
                    <div className="text-xs text-muted-foreground">{currentStats.totalOnJobHours.toFixed(2)}h</div>
                    {currentStats.totalOnJobHours === 0 && currentStats.totalOnlineHours > 0 && (
                        <div className="absolute top-2 right-2 text-amber-500">
                            <AlertTriangle className="h-4 w-4" />
                        </div>
                    )}
                </div>

                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <div className="text-xs text-amber-700 uppercase tracking-wider font-semibold">Enroute Time</div>
                    <div className="text-lg font-bold text-amber-900 mt-1">
                        {(currentStats.toTripRatio > 0 || currentStats.totalOnJobHours > 0) 
                            ? formatDuration(Math.max(0, currentStats.totalOnJobHours - currentStats.totalOnTripHours))
                            : <span className="text-sm text-amber-600/70">N/A</span>
                        }
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {(currentStats.toTripRatio > 0 || currentStats.totalOnJobHours > 0)
                            ? (Math.max(0, currentStats.totalOnJobHours - currentStats.totalOnTripHours).toFixed(2) + 'h')
                            : ''
                        }
                    </div>
                </div>

                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                    <div className="text-xs text-emerald-700 uppercase tracking-wider font-semibold">On Trip Time</div>
                    <div className="text-lg font-bold text-emerald-900 mt-1">{formatDuration(currentStats.totalOnTripHours)}</div>
                    <div className="text-xs text-muted-foreground">{currentStats.totalOnTripHours.toFixed(2)}h</div>
                </div>
            </div>
            
            {/* Warning for missing To Trip Data */}
            {currentStats.toTripRatio === 0 && currentStats.totalOnlineHours > 0 && (
                <div className="mt-4 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 p-3 rounded border border-amber-100">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <div>
                        <strong>Missing "Enroute Time" Data:</strong> We couldn't calculate the time spent driving to pickup. 
                        This usually happens when the <code>Vehicle Performance</code> report is missing or the <code>Driver Activity</code> log lacks the "Enroute Time" column.
                        </div>
                </div>
            )}
        </div>
    );
    
    const renderDistanceGrid = (currentStats: typeof fleetStats, title: string) => (
        <div className="mt-6 pt-6 border-t border-slate-100">
            <h4 className="text-sm font-medium text-slate-900 mb-4">{title}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="text-xs text-blue-700 uppercase tracking-wider font-semibold">Open Dist</div>
                    <div className="text-lg font-bold text-blue-900 mt-1">{(currentStats.totalOpenDistance || 0).toFixed(2)} km</div>
                </div>

                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <div className="text-xs text-amber-700 uppercase tracking-wider font-semibold">Enroute Dist</div>
                    <div className="text-lg font-bold text-amber-900 mt-1">{(currentStats.totalEnrouteDistance || 0).toFixed(2)} km</div>
                </div>

                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                    <div className="text-xs text-emerald-700 uppercase tracking-wider font-semibold">On Trip Dist</div>
                    <div className="text-lg font-bold text-emerald-900 mt-1">{(currentStats.totalOnTripDistance || 0).toFixed(2)} km</div>
                </div>

                <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                    <div className="text-xs text-slate-600 uppercase tracking-wider font-semibold">Unavailable Dist</div>
                    <div className="text-lg font-bold text-slate-800 mt-1">{(currentStats.totalUnavailableDistance || 0).toFixed(2)} km</div>
                </div>
            </div>
        </div>
    );

    return (
        <Card className="border-l-4 border-l-blue-500 mb-6">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Clock className="h-5 w-5 text-blue-500" />
                            Dynamic Auto-Calibration
                        </CardTitle>
                        <CardDescription>
                            {isPreciseMode 
                                ? "Using precise time & distance metrics from uploaded reports" 
                                : "Reconciling Trip Logs with Vehicle Performance"}
                        </CardDescription>
                    </div>
                    <Badge variant={phantomLagDetected ? "destructive" : "secondary"} className={phantomLagDetected ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-green-100 text-green-800 hover:bg-green-100"}>
                        {phantomLagDetected ? "Phantom Lag Detected" : (isPreciseMode ? "Verified Data Source" : "Perfectly Balanced")}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-muted-foreground mb-1">Target (Official Job Time)</div>
                        <div className="text-xl font-semibold">{fleetStats.totalOnJobHours.toFixed(2)} hrs</div>
                        <div className="text-xs text-muted-foreground mt-1">
                            {isPreciseMode ? "Directly from Time & Distance Reports" : "From Vehicle Performance Report"}
                        </div>
                    </div>
                    
                    <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-muted-foreground mb-1">Raw Logged Time</div>
                        <div className={`text-xl font-semibold ${phantomLagDetected ? "text-amber-600" : ""}`}>
                            {rawLogSumHours.toFixed(2)} hrs
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Sum of individual trip durations</div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-muted-foreground mb-1">Calibration Adjustment</div>
                        <div className="flex items-baseline gap-2">
                            <div className="text-xl font-bold">
                                {(deductionPerTrip * 60).toFixed(2)} min
                            </div>
                            <span className="text-muted-foreground">/ trip</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                            {phantomLagDetected 
                                ? "Deducted to match Job Time target"
                                : (isPreciseMode ? "Exact data matched" : "No adjustment needed")
                            }
                        </div>
                    </div>
                </div>

                {/* Phase 3: Fleet Efficiency Breakdown */}
                {/* If both Driver and Vehicle stats are available separately, show both. Otherwise show standard breakdown */}
                {fleetStats.driverStats && fleetStats.vehicleStats ? (
                    <>
                        {renderEfficiencyGrid(fleetStats.driverStats, "Driver Time Metric")}
                        {/* Only show Distance Metrics if data exists (>0) */}
                        {(fleetStats.driverStats.totalOpenDistance || 0) + (fleetStats.driverStats.totalOnTripDistance || 0) > 0 && 
                            renderDistanceGrid(fleetStats.driverStats, "Driver Distance Metric")
                        }
                        
                        {renderEfficiencyGrid(fleetStats.vehicleStats, "Vehicle Time Metric")}
                        {(fleetStats.vehicleStats.totalOpenDistance || 0) + (fleetStats.vehicleStats.totalOnTripDistance || 0) > 0 && 
                            renderDistanceGrid(fleetStats.vehicleStats, "Vehicle Distance Metric")
                        }
                    </>
                ) : (
                    renderEfficiencyGrid(fleetStats, "Fleet Efficiency Breakdown")
                )}

                {phantomLagDetected && (
                    <div className="mt-4 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 p-3 rounded border border-amber-100">
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                        <div>
                            <strong>Why is this happening?</strong> Trip logs often include "phantom time" (e.g. driving to pickup) that overlaps or isn't counted in the official "On Job" timer. We've automatically calibrated your data to match the official fleet report.
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
