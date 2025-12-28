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
    
    // Reverse engineer the raw log sum for display
    // Excess = deduction * tripCount
    // Raw = Job + Excess
    const excessHours = deductionPerTrip * tripCount; // Approximation if tripCount varies, but good enough for display
    const rawLogSumHours = fleetStats.totalOnJobHours + excessHours;
    
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
                            Reconciling Trip Logs with Vehicle Performance
                        </CardDescription>
                    </div>
                    <Badge variant={phantomLagDetected ? "destructive" : "secondary"} className={phantomLagDetected ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-green-100 text-green-800 hover:bg-green-100"}>
                        {phantomLagDetected ? "Phantom Lag Detected" : "Perfectly Balanced"}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-muted-foreground mb-1">Target (Official Job Time)</div>
                        <div className="text-xl font-semibold">{fleetStats.totalOnJobHours.toFixed(2)} hrs</div>
                        <div className="text-xs text-muted-foreground mt-1">From Vehicle Performance Report</div>
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
                                : "No adjustment needed"
                            }
                        </div>
                    </div>
                </div>

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
