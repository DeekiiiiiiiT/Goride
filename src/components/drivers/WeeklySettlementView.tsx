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
    onLogPayment?: (periodStart: Date, periodEnd: Date, amountOwed: number) => void;
    readOnly?: boolean;
}

export function WeeklySettlementView({ trips = [], transactions = [], csvMetrics = [], onLogPayment, readOnly = false }: WeeklySettlementViewProps) {
    
    const weeks = useMemo(() => {
        // If we have CSV metrics but no trips, we should still show something
        if ((!trips || trips.length === 0) && (!csvMetrics || csvMetrics.length === 0)) return [];

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

        // Generate Weeks (Oldest to Newest)
        const weekIntervals = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });

        // Phase 1: Calculate Basics (Owed, Allocated Payments, Expenses)
        const weeksData = weekIntervals.map(weekStart => {
            const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
            
            // --- Calculate Owed (Cash Collected + Float Issued) ---
            const relevantCsvMetrics = csvMetrics.filter(m => {
                const mStart = parseISO(m.periodStart);
                const mEnd = parseISO(m.periodEnd);
                const overlaps = areIntervalsOverlapping({ start: mStart, end: mEnd }, { start: weekStart, end: weekEnd });
                if (!overlaps) return false;
                const overlapStart = mStart > weekStart ? mStart : weekStart;
                const overlapEnd = mEnd < weekEnd ? mEnd : weekEnd;
                const overlapDuration = overlapEnd.getTime() - overlapStart.getTime();
                const oneDay = 24 * 60 * 60 * 1000;
                return overlapDuration > (oneDay * 0.5);
            });

            const csvCash = relevantCsvMetrics.reduce((sum, m) => sum + (m.cashCollected || 0), 0);

            const weekTrips = trips.filter(t => isWithinInterval(new Date(t.date), { start: weekStart, end: weekEnd }));

            const tripCalculatedCash = weekTrips.reduce((sum, t) => {
                const cash = Number(t.cashCollected || 0);
                if (Math.abs(cash) > 0) return sum + Math.abs(cash);
                const platform = (t.platform || '').toLowerCase();
                const isCashPlatform = ['indrive', 'bolt', 'cash', 'goride', 'private'].includes(platform);
                const isCashMethod = t['paymentMethod'] === 'Cash';
                if (isCashPlatform || isCashMethod) return sum + Number(t.amount || 0);
                return sum;
            }, 0);

            // Float Issued in this week (Increases Debt)
            const weeklyFloat = transactions
                .filter(t => {
                    const tDate = new Date(t.date);
                    return t.category === 'Float Issue' && isWithinInterval(tDate, { start: weekStart, end: weekEnd });
                })
                .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

            const amountOwed = Math.max(csvCash, tripCalculatedCash) + weeklyFloat;
            const isFromCsv = csvCash > tripCalculatedCash;

            // --- Calculate Credits (Allocated Payments + Approved Cash Tolls) ---
            
            // 1. Allocated Payments (Metadata based)
            const allocatedPayments = transactions.filter(t => {
                if (t.metadata?.workPeriodStart) {
                    const payStart = parseISO(t.metadata.workPeriodStart);
                    const payEnd = t.metadata.workPeriodEnd ? parseISO(t.metadata.workPeriodEnd) : payStart;
                    return areIntervalsOverlapping({ start: payStart, end: payEnd }, { start: weekStart, end: weekEnd });
                }
                return false;
            });

            // 2. Approved Cash Toll Expenses (Treated as Credit/Payment)
            const weeklyExpenses = transactions
                .filter(t => {
                    const tDate = new Date(t.date);
                    const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
                    const isCash = t.paymentMethod === 'Cash' || !!t.receiptUrl;
                    const isResolved = t.status === 'Resolved';
                    return isToll && isCash && isResolved && isWithinInterval(tDate, { start: weekStart, end: weekEnd });
                })
                .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

            const allocatedPaid = allocatedPayments.reduce((sum, t) => sum + (t.amount || 0), 0) + weeklyExpenses;

            return {
                start: weekStart,
                end: weekEnd,
                amountOwed,
                allocatedPaid,
                weekTrips,
                isFromCsv,
                debtPaid: 0,    // Will be filled in Phase 2
                surplusPaid: 0  // Will be filled in Phase 2
            };
        });

        // Phase 2: Distribute Unallocated Payments (FIFO)
        // 1. Identify Unallocated Transactions
        // Exclude floats, expenses, and allocated payments
        const unallocatedTransactions = transactions.filter(t => {
             // Exclude Float Issue (Debt)
             if (t.category === 'Float Issue') return false;
             
             // Strict Safety: Never include Tag Balance operations as Driver Credits
             if (t.paymentMethod === 'Tag Balance') return false;
             if (t.description?.toLowerCase().includes('top-up')) return false;

             // Exclude Tolls (Expenses)
             const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
             if (isToll) return false;

             // Exclude Allocated (Metadata)
             if (t.metadata?.workPeriodStart) return false;

             // STRICT PAYMENT LOGIC: Only count explicit Cash Collections or Payment Received types
             // This excludes random positive adjustments or vehicle-linked credits
             const isPayment = t.category === 'Cash Collection' || t.type === 'Payment_Received';

             return isPayment && (t.amount || 0) > 0;
        });
        
        let totalUnallocatedPool = unallocatedTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
        
        // 2. Pay off Debt (Oldest Week First)
        weeksData.forEach(week => {
            const deficit = week.amountOwed - week.allocatedPaid;
            if (deficit > 0 && totalUnallocatedPool > 0) {
                const payment = Math.min(deficit, totalUnallocatedPool);
                week.debtPaid = payment;
                totalUnallocatedPool -= payment;
            }
        });

        // 3. Distribute Surplus (If any pool remains)
        // We assign remaining pool back to the weeks where the transactions originated (Newest first preference)
        if (totalUnallocatedPool > 0) {
            // Sort unallocated transactions Newest First to attribute surplus to latest payments
            const sortedTx = [...unallocatedTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            for (const tx of sortedTx) {
                if (totalUnallocatedPool <= 0) break;
                
                // How much of this transaction is still "available" as surplus?
                const amountToAssign = Math.min(tx.amount || 0, totalUnallocatedPool);
                
                // Find the week this transaction belongs to
                const txDate = new Date(tx.date);
                const targetWeek = weeksData.find(w => isWithinInterval(txDate, { start: w.start, end: w.end }));
                
                if (targetWeek) {
                    targetWeek.surplusPaid += amountToAssign;
                } else {
                    // Transaction is outside range (e.g. future date)? 
                    if (weeksData.length > 0) {
                        weeksData[weeksData.length - 1].surplusPaid += amountToAssign;
                    }
                }
                
                totalUnallocatedPool -= amountToAssign;
            }
        }

        // Phase 3: Final Assembly
        return weeksData.map(week => {
            const amountPaid = week.allocatedPaid + week.debtPaid + week.surplusPaid;
            
            const cashTripCount = week.weekTrips.filter(t => {
                const cash = Number(t.cashCollected || 0);
                const platform = (t.platform || '').toLowerCase();
                const isCashPlatform = ['indrive', 'bolt', 'cash', 'goride', 'private'].includes(platform);
                const isCashMethod = t['paymentMethod'] === 'Cash';
                return Math.abs(cash) > 0 || isCashPlatform || isCashMethod;
            }).length;

            // Status Logic
            let status: 'Paid' | 'Partial' | 'Unpaid' | 'Overpaid' | 'No Activity' = 'Unpaid';
            if (week.amountOwed === 0 && amountPaid === 0) status = 'No Activity';
            else if (amountPaid >= week.amountOwed - 0.01) status = 'Paid';
            else if (amountPaid > 0) status = 'Partial';
            
            if (amountPaid > week.amountOwed + 1) status = 'Overpaid';

            return {
                start: week.start,
                end: week.end,
                amountOwed: week.amountOwed,
                amountPaid,
                balance: week.amountOwed - amountPaid,
                status,
                tripCount: week.weekTrips.length,
                cashTripCount,
                isFromCsv: week.isFromCsv
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
                                            week.status === 'Overpaid' ? 'outline' : 
                                            week.status === 'No Activity' ? 'outline' : 'destructive'
                                        } className={cn(
                                            week.status === 'Paid' && "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200",
                                            week.status === 'Partial' && "bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200",
                                            week.status === 'Unpaid' && week.amountOwed > 0 && "bg-red-100 text-red-700 hover:bg-red-200 border-red-200",
                                            week.status === 'No Activity' && "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
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
                                {!readOnly && week.status !== 'Paid' && week.status !== 'Overpaid' && week.amountOwed > 0 && onLogPayment && (
                                    <Button 
                                        size="sm" 
                                        className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                                        onClick={() => onLogPayment(week.start, week.end, week.balance)}
                                    >
                                        <DollarSign className="h-4 w-4 mr-2" />
                                        Settle
                                    </Button>
                                )}
                                {(!readOnly && week.amountOwed === 0 && week.amountPaid === 0) || (readOnly) ? (
                                     <div className="w-[88px]"></div> // Spacer
                                ) : null}
                            </div>
                            
                            {/* Progress Bar for Partial */}
                            {week.status === 'Partial' && (
                                <div className="mt-4">
                                    <div className="flex justify-between text-xs mb-1.5">
                                        <span className="text-slate-500">Repayment Progress</span>
                                        <span className="text-slate-700 font-medium">{Math.round((week.amountPaid / week.amountOwed) * 100)}%</span>
                                    </div>
                                    <Progress 
                                        value={(week.amountPaid / week.amountOwed) * 100} 
                                        className="h-2" 
                                        indicatorClassName="bg-gradient-to-r from-orange-400 to-amber-600"
                                    />
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
