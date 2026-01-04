import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Trip, FinancialTransaction, DriverMetrics } from '../../types/data';
import { 
    startOfWeek, 
    endOfWeek, 
    eachWeekOfInterval, 
    format, 
    isWithinInterval, 
    addDays, 
    startOfDay, 
    endOfDay,
    isSameDay,
    parseISO,
    differenceInDays,
    areIntervalsOverlapping
} from "date-fns";
import { CheckCircle2, AlertCircle, Clock, ChevronRight, DollarSign, Info } from "lucide-react";
import { cn } from "../ui/utils";

interface WeeklySettlementViewProps {
    trips: Trip[];
    transactions: FinancialTransaction[];
    csvMetrics: DriverMetrics[];
    onLogPayment: (periodStart: Date, periodEnd: Date, amountOwed: number) => void;
}

export function WeeklySettlementView({ trips, transactions, csvMetrics = [], onLogPayment }: WeeklySettlementViewProps) {
    
    const weeks = useMemo(() => {
        // If we have CSV metrics but no trips, we should still show something
        if (trips.length === 0 && csvMetrics.length === 0) return [];

        // 1. Determine Range
        const dates = [
            ...trips.map(t => new Date(t.date)),
            ...csvMetrics.map(m => new Date(m.periodStart))
        ];
        
        if (dates.length === 0) return [];

        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(); // Up to today

        // Align to weeks (Monday start)
        const start = startOfWeek(minDate, { weekStartsOn: 1 });
        const end = endOfWeek(maxDate, { weekStartsOn: 1 });

        // Generate Weeks
        const weekIntervals = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });

        // Process each week
        return weekIntervals.map(weekStart => {
            const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
            
            // 1. Calculate Owed (Cash Collected in this week)
            // Strategy: Check if there's a CSV report that fully covers this week or mostly covers it
            // We use areIntervalsOverlapping for robustness against timezone shifts
            const relevantCsvMetrics = csvMetrics.filter(m => {
                const mStart = parseISO(m.periodStart);
                const mEnd = parseISO(m.periodEnd);
                
                // Check if they overlap at all
                const overlaps = areIntervalsOverlapping(
                    { start: mStart, end: mEnd },
                    { start: weekStart, end: weekEnd }
                );
                
                if (!overlaps) return false;

                // Ensure the overlap is significant (e.g. > 1 day) to avoid edge cases
                // where a report ends at 00:00 on Monday and overlaps by 1 second.
                const overlapStart = mStart > weekStart ? mStart : weekStart;
                const overlapEnd = mEnd < weekEnd ? mEnd : weekEnd;
                const overlapDuration = overlapEnd.getTime() - overlapStart.getTime();
                const oneDay = 24 * 60 * 60 * 1000;
                
                return overlapDuration > (oneDay * 0.5); // at least half a day
            });

            // Sum up CSV cash if available
            // If multiple reports overlap the same week, we sum them? 
            // Or maybe take the one with the best fit.
            // Usually reports are mutually exclusive, so summing is safe.
            const csvCash = relevantCsvMetrics.reduce((sum, m) => sum + (m.cashCollected || 0), 0);

            const weekTrips = trips.filter(t => {
                const d = new Date(t.date);
                return isWithinInterval(d, { start: weekStart, end: weekEnd });
            });

            const tripCalculatedCash = weekTrips.reduce((sum, t) => {
                // Priority 1: Use explicit cashCollected field if present (from CSV import)
                // Handle both number and string types, and negative values
                const cash = Number(t.cashCollected || 0);
                if (Math.abs(cash) > 0) {
                    return sum + Math.abs(cash);
                }
                
                // Priority 2: If platform implies cash (InDrive/Bolt are usually cash-only in this context)
                // or if explicitly marked as Cash payment method
                const platform = (t.platform || '').toLowerCase();
                const isCashPlatform = ['indrive', 'bolt', 'cash'].includes(platform);
                const isCashMethod = t['paymentMethod'] === 'Cash';
                
                if (isCashPlatform || isCashMethod) {
                    return sum + Number(t.amount || 0);
                }
                return sum;
            }, 0);

            // Use the greater of the two.
            const amountOwed = Math.max(csvCash, tripCalculatedCash);
            const isFromCsv = csvCash > tripCalculatedCash;

            // 2. Calculate Paid (Transactions linked to this week)
            // Strategy: Look for transactions with metadata.workPeriodStart matching this weekStart
            // OR strictly falling within this week if no metadata is present? 
            // The user wants strict tracking, so we prioritize metadata.
            // If we include non-metadata payments based on date, it might double count if they later add metadata.
            // Let's stick to Metadata strictly for "Settled" status, but maybe show "Unallocated" payments separately.
            // Actually, for a "Period View", we only care about payments explicitly for this period.
            
            const linkedPayments = transactions.filter(t => {
                if (t.metadata?.workPeriodStart) {
                    // Check if metadata start date falls in this week (or matches start)
                    // Robustness: Compare dates ignoring time
                    const periodStart = new Date(t.metadata.workPeriodStart);
                    return isSameDay(periodStart, weekStart) || isWithinInterval(periodStart, { start: weekStart, end: weekEnd }); 
                    // Note: Usually periodStart should match weekStart exactly if using weekly cycles, but let's be flexible.
                }
                return false;
            });

            const amountPaid = linkedPayments.reduce((sum, t) => sum + (t.amount || 0), 0);
            
            // Status
            let status: 'Paid' | 'Partial' | 'Unpaid' | 'Overpaid' = 'Unpaid';
            if (amountOwed === 0 && amountPaid === 0) status = 'Paid'; // No activity
            else if (amountPaid >= amountOwed - 0.01) status = 'Paid'; // Tolerance for float
            else if (amountPaid > 0) status = 'Partial';
            
            if (amountPaid > amountOwed + 1) status = 'Overpaid';

            return {
                start: weekStart,
                end: weekEnd,
                amountOwed,
                amountPaid,
                balance: amountOwed - amountPaid,
                status,
                tripCount: weekTrips.length,
                cashTripCount: weekTrips.filter(t => {
                    const cash = Number(t.cashCollected || 0);
                    const platform = (t.platform || '').toLowerCase();
                    const isCashPlatform = ['indrive', 'bolt', 'cash'].includes(platform);
                    const isCashMethod = t['paymentMethod'] === 'Cash';
                    
                    return Math.abs(cash) > 0 || isCashPlatform || isCashMethod;
                }).length,
                isFromCsv
            };
        }).reverse(); // Most recent first
    }, [trips, transactions, csvMetrics]);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
                {weeks.map((week, idx) => (
                    <Card key={idx} className={cn(
                        "transition-all hover:shadow-md",
                        week.status === 'Unpaid' && week.amountOwed > 0 ? "border-amber-200 bg-amber-50/30" : ""
                    )}>
                        <CardContent className="p-4 sm:p-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                
                                {/* Date & Status */}
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-slate-900">
                                            {format(week.start, "MMM d")} - {format(week.end, "MMM d, yyyy")}
                                        </h3>
                                        <Badge variant={
                                            week.status === 'Paid' ? 'default' : 
                                            week.status === 'Partial' ? 'secondary' : 
                                            week.status === 'Overpaid' ? 'outline' : 'destructive'
                                        } className={cn(
                                            week.status === 'Paid' && "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200",
                                            week.status === 'Partial' && "bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200",
                                            week.status === 'Unpaid' && week.amountOwed > 0 && "bg-red-100 text-red-700 hover:bg-red-200 border-red-200",
                                            week.status === 'Unpaid' && week.amountOwed === 0 && "bg-slate-100 text-slate-600"
                                        )}>
                                            {week.status}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-slate-500">
                                        {week.isFromCsv ? (
                                            <span className="flex items-center gap-1">
                                                <Info className="h-3 w-3" />
                                                Reported via Import ({week.tripCount} trips linked)
                                            </span>
                                        ) : (
                                            <span>{week.cashTripCount} cash trips • {week.tripCount} total trips</span>
                                        )}
                                    </p>
                                </div>

                                {/* Financials */}
                                <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Owed</p>
                                        <p className="text-lg font-bold text-slate-900">${week.amountOwed.toFixed(2)}</p>
                                    </div>
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Paid</p>
                                        <p className="text-lg font-bold text-emerald-600">${week.amountPaid.toFixed(2)}</p>
                                    </div>
                                    <div className="space-y-0.5 min-w-[80px]">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Balance</p>
                                        <p className={cn("text-lg font-bold", week.balance > 0 ? "text-red-600" : "text-slate-400")}>
                                            ${week.balance.toFixed(2)}
                                        </p>
                                    </div>
                                </div>

                                {/* Action */}
                                {week.status !== 'Paid' && week.status !== 'Overpaid' && week.amountOwed > 0 && (
                                    <Button 
                                        size="sm" 
                                        className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                                        onClick={() => onLogPayment(week.start, week.end, week.balance)}
                                    >
                                        <DollarSign className="h-4 w-4 mr-2" />
                                        Settle
                                    </Button>
                                )}
                                {week.amountOwed === 0 && week.amountPaid === 0 && (
                                     <div className="w-[88px]"></div> // Spacer
                                )}
                            </div>
                            
                            {/* Progress Bar for Partial */}
                            {week.status === 'Partial' && (
                                <div className="mt-4">
                                    <div className="flex justify-between text-xs mb-1.5">
                                        <span className="text-slate-500">Repayment Progress</span>
                                        <span className="text-slate-700 font-medium">{Math.round((week.amountPaid / week.amountOwed) * 100)}%</span>
                                    </div>
                                    <Progress value={(week.amountPaid / week.amountOwed) * 100} className="h-2" />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}

                {weeks.length === 0 && (
                     <div className="text-center py-12 text-slate-500">
                        No activity found.
                     </div>
                )}
            </div>
        </div>
    );
}
