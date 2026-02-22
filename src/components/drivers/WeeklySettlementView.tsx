import React, { useMemo, useState } from 'react';
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { Trip, FinancialTransaction, DriverMetrics } from '../../types/data';
import { 
    startOfWeek, 
    endOfWeek, 
    eachWeekOfInterval, 
    format, 
    isWithinInterval, 
    parseISO,
    areIntervalsOverlapping
} from "date-fns";
import { DollarSign, Info, Eye, ArrowUpCircle, ArrowDownCircle, Wallet, Banknote, Fuel, Receipt, CreditCard } from "lucide-react";
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
        // Safe access to arrays and filtering out null/undefined items
        const safeTrips = Array.isArray(trips) ? trips.filter(Boolean) : [];
        const safeTransactions = Array.isArray(transactions) ? transactions.filter(Boolean) : [];
        const safeCsvMetrics = Array.isArray(csvMetrics) ? csvMetrics.filter(Boolean) : [];

        // If we have CSV metrics but no trips, we should still show something
        if (safeTrips.length === 0 && safeCsvMetrics.length === 0) return [];

        // 1. Determine Range
        const dates = [
            ...safeTrips.map(t => new Date(t.date)),
            ...safeCsvMetrics.map(m => new Date(m.periodStart))
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
            const relevantCsvMetrics = safeCsvMetrics.filter(m => {
                if (!m || !m.periodStart || !m.periodEnd) return false;
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

            const weekTrips = safeTrips.filter(t => {
                if (!t || !t.date) return false;
                return isWithinInterval(new Date(t.date), { start: weekStart, end: weekEnd });
            });

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
            const weeklyFloat = safeTransactions
                .filter(t => {
                    if (!t || !t.date) return false;
                    const tDate = new Date(t.date);
                    return t.category === 'Float Issue' && isWithinInterval(tDate, { start: weekStart, end: weekEnd });
                })
                .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

            const amountOwed = Math.max(csvCash, tripCalculatedCash) + weeklyFloat;
            const isFromCsv = csvCash > tripCalculatedCash;

            // --- Calculate Credits (Allocated Payments + Approved Cash Tolls) ---
            
            // 1. Allocated Payments (Metadata based)
            const allocatedPayments = safeTransactions.filter(t => {
                if (!t) return false;
                if (t.metadata?.workPeriodStart) {
                    const payStart = parseISO(t.metadata.workPeriodStart);
                    const payEnd = t.metadata.workPeriodEnd ? parseISO(t.metadata.workPeriodEnd) : payStart;
                    return areIntervalsOverlapping({ start: payStart, end: payEnd }, { start: weekStart, end: weekEnd });
                }
                return false;
            });

            // 2. Approved Cash Toll Expenses (Treated as Credit/Payment)
            const weeklyExpenses = safeTransactions
                .filter(t => {
                    if (!t || !t.date) return false;
                    const tDate = new Date(t.date);
                    const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
                    const isCash = t.paymentMethod === 'Cash' || !!t.receiptUrl;
                    const isResolved = t.status === 'Resolved' || t.status === 'Approved'; // Accept both statuses
                    return isToll && isCash && isResolved && isWithinInterval(tDate, { start: weekStart, end: weekEnd });
                })
                .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

            // 3. Approved Fuel Reimbursement Credits in this week
            const weeklyFuelCredits = safeTransactions
                .filter(t => {
                    if (!t || !t.date) return false;
                    const tDate = new Date(t.date);
                    return t.category === 'Fuel Reimbursement Credit' 
                        && t.amount > 0
                        && isWithinInterval(tDate, { start: weekStart, end: weekEnd });
                })
                .reduce((sum, t) => sum + (t.amount || 0), 0);

            const allocatedPaid = allocatedPayments.reduce((sum, t) => sum + (t.amount || 0), 0) + weeklyExpenses + weeklyFuelCredits;

            return {
                start: weekStart,
                end: weekEnd,
                amountOwed,
                allocatedPaid,
                weeklyFuelCredits,
                weekTrips,
                isFromCsv,
                debtPaid: 0,    // Will be filled in Phase 2
                surplusPaid: 0, // Will be filled in Phase 2
                // Breakdown detail fields
                _cashCollected: Math.max(csvCash, tripCalculatedCash),
                _floatIssued: weeklyFloat,
                _allocatedPaymentsOnly: allocatedPayments.reduce((sum, t) => sum + (t.amount || 0), 0),
                _tollExpenses: weeklyExpenses,
                _fuelCredits: weeklyFuelCredits,
            };
        });

        // Phase 2: Distribute Unallocated Payments (FIFO)
        // 1. Identify Unallocated Transactions
        // Exclude floats, expenses, and allocated payments
        const unallocatedTransactions = safeTransactions.filter(t => {
             if (!t) return false;
             // Exclude Float Issue (Debt)
             if (t.category === 'Float Issue') return false;
             // Exclude Fuel Credits (already date-allocated above)
             if (t.category === 'Fuel Reimbursement Credit') return false;
             
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
                isFromCsv: week.isFromCsv,
                weeklyFuelCredits: week.weeklyFuelCredits,
                // Breakdown details for overlay
                breakdown: {
                    cashCollected: week._cashCollected,
                    floatIssued: week._floatIssued,
                    allocatedPayments: week._allocatedPaymentsOnly,
                    fifoPayments: week.debtPaid,
                    surplusPayments: week.surplusPaid,
                    tollExpenses: week._tollExpenses,
                    fuelCredits: week._fuelCredits,
                },
            };
        }).reverse(); // Most recent first
    }, [trips, transactions, csvMetrics]);

    type WeekData = typeof weeks[number];
    const [selectedWeek, setSelectedWeek] = useState<WeekData | null>(null);

    // Get individual transactions for the selected week's overlay
    const selectedWeekTransactions = useMemo(() => {
        if (!selectedWeek) return [];
        const safeTransactions = Array.isArray(transactions) ? transactions.filter(Boolean) : [];
        return safeTransactions
            .filter(t => {
                if (!t || !t.date) return false;
                const tDate = new Date(t.date);
                // Direct date match
                if (isWithinInterval(tDate, { start: selectedWeek.start, end: selectedWeek.end })) return true;
                // Also include allocated payments that reference this period
                if (t.metadata?.workPeriodStart) {
                    const payStart = parseISO(t.metadata.workPeriodStart);
                    const payEnd = t.metadata.workPeriodEnd ? parseISO(t.metadata.workPeriodEnd) : payStart;
                    return areIntervalsOverlapping(
                        { start: payStart, end: payEnd },
                        { start: selectedWeek.start, end: selectedWeek.end }
                    );
                }
                return false;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [selectedWeek, transactions]);

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
                                    {week.weeklyFuelCredits > 0 && (
                                        <p className="text-xs text-emerald-600 font-medium">
                                            Includes ${week.weeklyFuelCredits.toFixed(2)} fuel credit
                                        </p>
                                    )}
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
                                <div className="flex items-center gap-2 shrink-0">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1.5 text-xs border-slate-300 hover:bg-slate-100 hover:border-blue-300 hover:text-blue-700 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); setSelectedWeek(week); }}
                                    >
                                        <Eye className="h-3.5 w-3.5" />
                                        Details
                                    </Button>
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
                                </div>
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

            {/* ── Settlement Breakdown Overlay ── */}
            <Dialog open={!!selectedWeek} onOpenChange={(open) => { if (!open) setSelectedWeek(null); }}>
                <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
                    {selectedWeek && (
                        <>
                            {/* Overlay Header */}
                            <div className="px-6 pt-6 pb-4 border-b bg-slate-50/50">
                                <DialogHeader>
                                    <div className="flex items-center gap-2.5 mb-1">
                                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                            <Wallet className="h-4 w-4 text-blue-600" />
                                        </div>
                                        <div>
                                            <DialogTitle className="text-base">
                                                {format(selectedWeek.start, "MMM d")} - {format(selectedWeek.end, "MMM d, yyyy")}
                                            </DialogTitle>
                                            <DialogDescription className="text-xs mt-0.5">
                                                Settlement period breakdown &middot; {selectedWeek.cashTripCount} cash trips &middot; {selectedWeek.tripCount} total trips
                                            </DialogDescription>
                                        </div>
                                    </div>
                                </DialogHeader>

                                {/* Top-level Summary */}
                                <div className="grid grid-cols-3 gap-2.5 mt-4">
                                    <div className="bg-white rounded-lg border border-slate-200 p-2.5 text-center">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Owed</p>
                                        <p className="text-sm font-bold font-mono text-slate-900">${selectedWeek.amountOwed.toFixed(2)}</p>
                                    </div>
                                    <div className="bg-white rounded-lg border border-emerald-100 p-2.5 text-center">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Paid</p>
                                        <p className="text-sm font-bold font-mono text-emerald-600">${selectedWeek.amountPaid.toFixed(2)}</p>
                                    </div>
                                    <div className={cn(
                                        "bg-white rounded-lg border p-2.5 text-center",
                                        selectedWeek.balance > 0 ? "border-red-100" : "border-emerald-100"
                                    )}>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Balance</p>
                                        <p className={cn(
                                            "text-sm font-bold font-mono",
                                            selectedWeek.balance > 0 ? "text-red-600" : "text-emerald-600"
                                        )}>
                                            ${selectedWeek.balance.toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Scrollable Content */}
                            <ScrollArea className="flex-1 overflow-auto">
                                <div className="px-6 py-5 space-y-5">
                                    
                                    {/* ── OWED Breakdown ── */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="h-5 w-5 rounded bg-red-100 flex items-center justify-center">
                                                <ArrowUpCircle className="h-3 w-3 text-red-600" />
                                            </div>
                                            <h4 className="text-sm font-semibold text-slate-800">Debt Sources (What's Owed)</h4>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                                            <div className="divide-y divide-slate-100">
                                                <div className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/50">
                                                    <div className="flex items-center gap-2.5">
                                                        <Banknote className="h-3.5 w-3.5 text-slate-400" />
                                                        <span className="text-sm text-slate-700">Cash Collected</span>
                                                        {selectedWeek.isFromCsv && (
                                                            <Badge variant="outline" className="text-[9px] border-blue-200 text-blue-600">CSV Import</Badge>
                                                        )}
                                                    </div>
                                                    <span className="text-sm font-mono font-semibold text-slate-900">
                                                        ${selectedWeek.breakdown.cashCollected.toFixed(2)}
                                                    </span>
                                                </div>
                                                {selectedWeek.breakdown.floatIssued > 0 && (
                                                    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/50">
                                                        <div className="flex items-center gap-2.5">
                                                            <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                                                            <span className="text-sm text-slate-700">Float Issued</span>
                                                        </div>
                                                        <span className="text-sm font-mono font-semibold text-slate-900">
                                                            ${selectedWeek.breakdown.floatIssued.toFixed(2)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t">
                                                <span className="text-sm font-semibold text-slate-700">Total Owed</span>
                                                <span className="text-sm font-mono font-bold text-slate-900">
                                                    ${selectedWeek.amountOwed.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── PAID Breakdown ── */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="h-5 w-5 rounded bg-emerald-100 flex items-center justify-center">
                                                <ArrowDownCircle className="h-3 w-3 text-emerald-600" />
                                            </div>
                                            <h4 className="text-sm font-semibold text-slate-800">Credit Sources (What's Been Paid)</h4>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                                            <div className="divide-y divide-slate-100">
                                                {selectedWeek.breakdown.allocatedPayments > 0 && (
                                                    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/50">
                                                        <div className="flex items-center gap-2.5">
                                                            <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                                                            <span className="text-sm text-slate-700">Allocated Payments</span>
                                                            <Badge variant="outline" className="text-[9px] border-emerald-200 text-emerald-600">Period-Linked</Badge>
                                                        </div>
                                                        <span className="text-sm font-mono font-semibold text-emerald-600">
                                                            ${selectedWeek.breakdown.allocatedPayments.toFixed(2)}
                                                        </span>
                                                    </div>
                                                )}
                                                {selectedWeek.breakdown.fifoPayments > 0 && (
                                                    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/50">
                                                        <div className="flex items-center gap-2.5">
                                                            <DollarSign className="h-3.5 w-3.5 text-blue-500" />
                                                            <span className="text-sm text-slate-700">FIFO Pool Payments</span>
                                                            <Badge variant="outline" className="text-[9px] border-blue-200 text-blue-600">Auto-Applied</Badge>
                                                        </div>
                                                        <span className="text-sm font-mono font-semibold text-emerald-600">
                                                            ${selectedWeek.breakdown.fifoPayments.toFixed(2)}
                                                        </span>
                                                    </div>
                                                )}
                                                {selectedWeek.breakdown.surplusPayments > 0 && (
                                                    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/50">
                                                        <div className="flex items-center gap-2.5">
                                                            <DollarSign className="h-3.5 w-3.5 text-purple-500" />
                                                            <span className="text-sm text-slate-700">Surplus Distribution</span>
                                                            <Badge variant="outline" className="text-[9px] border-purple-200 text-purple-600">Overflow</Badge>
                                                        </div>
                                                        <span className="text-sm font-mono font-semibold text-emerald-600">
                                                            ${selectedWeek.breakdown.surplusPayments.toFixed(2)}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/50">
                                                    <div className="flex items-center gap-2.5">
                                                        <Receipt className="h-3.5 w-3.5 text-amber-500" />
                                                        <span className="text-sm text-slate-700">Approved Toll Expenses</span>
                                                    </div>
                                                    <span className={cn(
                                                        "text-sm font-mono font-semibold",
                                                        selectedWeek.breakdown.tollExpenses > 0 ? "text-emerald-600" : "text-slate-400"
                                                    )}>
                                                        ${selectedWeek.breakdown.tollExpenses.toFixed(2)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/50">
                                                    <div className="flex items-center gap-2.5">
                                                        <Fuel className="h-3.5 w-3.5 text-teal-500" />
                                                        <span className="text-sm text-slate-700">Fuel Reimbursement Credits</span>
                                                    </div>
                                                    <span className={cn(
                                                        "text-sm font-mono font-semibold",
                                                        selectedWeek.breakdown.fuelCredits > 0 ? "text-emerald-600" : "text-slate-400"
                                                    )}>
                                                        ${selectedWeek.breakdown.fuelCredits.toFixed(2)}
                                                    </span>
                                                </div>
                                                {selectedWeek.amountPaid === 0 && selectedWeek.breakdown.tollExpenses === 0 && selectedWeek.breakdown.fuelCredits === 0 && (
                                                    <div className="px-4 py-3 text-center text-sm text-slate-400">
                                                        No payments or credits applied to this period
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50/50 border-t">
                                                <span className="text-sm font-semibold text-slate-700">Total Paid</span>
                                                <span className="text-sm font-mono font-bold text-emerald-600">
                                                    ${selectedWeek.amountPaid.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── Net Balance ── */}
                                    <div className={cn(
                                        "rounded-lg border-2 p-4 flex items-center justify-between",
                                        selectedWeek.balance > 0.01 ? "border-red-200 bg-red-50/50" :
                                        selectedWeek.balance < -0.01 ? "border-emerald-200 bg-emerald-50/50" :
                                        "border-slate-200 bg-slate-50/50"
                                    )}>
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Outstanding Balance</p>
                                            <p className="text-[11px] text-slate-400 mt-0.5">
                                                {selectedWeek.balance > 0.01 ? "Driver still owes this amount" :
                                                 selectedWeek.balance < -0.01 ? "Driver has been overpaid" :
                                                 "Fully settled"}
                                            </p>
                                        </div>
                                        <p className={cn(
                                            "text-xl font-bold font-mono",
                                            selectedWeek.balance > 0.01 ? "text-red-600" :
                                            selectedWeek.balance < -0.01 ? "text-emerald-600" :
                                            "text-slate-600"
                                        )}>
                                            ${Math.abs(selectedWeek.balance).toFixed(2)}
                                        </p>
                                    </div>

                                    {/* ── Individual Transactions ── */}
                                    {selectedWeekTransactions.length > 0 && (
                                        <div>
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="h-5 w-5 rounded bg-slate-100 flex items-center justify-center">
                                                    <Receipt className="h-3 w-3 text-slate-500" />
                                                </div>
                                                <h4 className="text-sm font-semibold text-slate-800">
                                                    Transactions This Period
                                                </h4>
                                                <Badge variant="outline" className="text-[9px] border-slate-200 text-slate-500">
                                                    {selectedWeekTransactions.length}
                                                </Badge>
                                            </div>
                                            <div className="rounded-lg border border-slate-200 overflow-hidden">
                                                <div className="divide-y divide-slate-100">
                                                    {selectedWeekTransactions.map((tx) => (
                                                        <div key={tx.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/50">
                                                            <div className="flex-1 min-w-0 mr-3">
                                                                <p className="text-sm text-slate-700 truncate">
                                                                    {tx.description}
                                                                </p>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-[10px] text-slate-400">
                                                                        {format(new Date(tx.date), "MMM d, h:mm a")}
                                                                    </span>
                                                                    {tx.category && (
                                                                        <Badge variant="outline" className="text-[9px] border-slate-200 text-slate-500 py-0">
                                                                            {tx.category}
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <span className={cn(
                                                                "text-sm font-mono font-semibold shrink-0",
                                                                (tx.amount || 0) > 0 ? "text-emerald-600" : "text-red-600"
                                                            )}>
                                                                {(tx.amount || 0) > 0 ? '+' : '-'}${Math.abs(tx.amount || 0).toFixed(2)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>

                            {/* Footer */}
                            <div className="px-6 py-3 border-t bg-slate-50/50 flex items-center justify-between">
                                <Badge variant={
                                    selectedWeek.status === 'Paid' ? 'default' :
                                    selectedWeek.status === 'Partial' ? 'secondary' :
                                    selectedWeek.status === 'Overpaid' ? 'outline' : 'destructive'
                                } className={cn(
                                    "text-xs",
                                    selectedWeek.status === 'Paid' && "bg-emerald-100 text-emerald-700 border-emerald-200",
                                    selectedWeek.status === 'Partial' && "bg-amber-100 text-amber-700 border-amber-200",
                                    selectedWeek.status === 'Unpaid' && "bg-red-100 text-red-700 border-red-200",
                                    selectedWeek.status === 'Overpaid' && "bg-blue-100 text-blue-700 border-blue-200",
                                    selectedWeek.status === 'No Activity' && "bg-slate-100 text-slate-500 border-slate-200"
                                )}>
                                    Status: {selectedWeek.status}
                                </Badge>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-7"
                                    onClick={() => setSelectedWeek(null)}
                                >
                                    Close
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}