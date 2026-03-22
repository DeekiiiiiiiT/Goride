import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { Trip, FinancialTransaction, DriverMetrics } from '../../types/data';
import { format } from "date-fns";
import { DollarSign, Info, Eye, ArrowUpCircle, ArrowDownCircle, Wallet, Banknote, Fuel, Receipt, CreditCard, Scale } from "lucide-react";
import { cn } from "../ui/utils";
import { computeWeeklyCashSettlement } from '../../utils/cashSettlementCalc';

/** Match PayoutPeriodDetail currency display. */
function fmtMoney(n: number) {
    return '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Monday key yyyy-MM-dd → Payout ledger settlement (same math as Payout period detail). */
export type WeekSettlementEntry =
    | { finalized: false }
    | {
          finalized: true;
          settlement: number;
          adjCashBalance: number;
          netPayoutApplied: number;
          cashBalance: number;
          fuelCredits: number;
      };

export type WeekSettlementMap = Record<string, WeekSettlementEntry>;

interface WeeklySettlementViewProps {
    trips: Trip[];
    transactions: FinancialTransaction[];
    csvMetrics: DriverMetrics[];
    /** Optional: net settlement per week from `useDriverPayoutPeriodRows` (weekly). */
    weekSettlementByMonday?: WeekSettlementMap;
    onLogPayment?: (periodStart: Date, periodEnd: Date, amountOwed: number) => void;
    onWeeksComputed?: (weeks: Array<{ start: Date; end: Date; amountOwed: number; amountPaid: number; balance: number; status: string }>) => void;
    readOnly?: boolean;
}

export function WeeklySettlementView({ trips = [], transactions = [], csvMetrics = [], weekSettlementByMonday, onLogPayment, onWeeksComputed, readOnly = false }: WeeklySettlementViewProps) {
    
    const weeks = useMemo(() => {
        return computeWeeklyCashSettlement({ trips, transactions, csvMetrics });
    }, [trips, transactions, csvMetrics]);

    type WeekData = typeof weeks[number];
    const [selectedWeek, setSelectedWeek] = useState<WeekData | null>(null);

    // Call onWeeksComputed if provided
    useEffect(() => {
        if (onWeeksComputed && weeks.length > 0) {
            onWeeksComputed(weeks.map(week => ({
                start: week.start,
                end: week.end,
                amountOwed: week.amountOwed,
                amountPaid: week.amountPaid,
                balance: week.balance,
                status: week.status,
            })));
        }
    }, [weeks, onWeeksComputed]);

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
                                    {weekSettlementByMonday && (() => {
                                        const key = format(week.start, 'yyyy-MM-dd');
                                        const st = weekSettlementByMonday[key];
                                        if (!st) return null;
                                        if (!st.finalized) {
                                            return (
                                                <div className="space-y-0.5 min-w-[100px] max-w-[140px]">
                                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
                                                        <Scale className="h-3 w-3" /> Net settlement
                                                    </p>
                                                    <p className="text-xs font-medium text-amber-600">Pending</p>
                                                </div>
                                            );
                                        }
                                        const s = st.settlement;
                                        return (
                                            <div className="space-y-0.5 min-w-[100px] max-w-[140px]">
                                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
                                                    <Scale className="h-3 w-3" /> Net settlement
                                                </p>
                                                <p className={cn(
                                                    "text-sm font-bold",
                                                    s > 0.005 ? "text-rose-600" : s < -0.005 ? "text-blue-600" : "text-emerald-600"
                                                )}>
                                                    ${s.toFixed(2)}
                                                </p>
                                            </div>
                                        );
                                    })()}
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

                                    {/* ── Net settlement (Payout ledger) — Adj. cash balance − net payout ── */}
                                    {weekSettlementByMonday && (() => {
                                        const mondayKey = format(selectedWeek.start, 'yyyy-MM-dd');
                                        const st = weekSettlementByMonday[mondayKey];
                                        return (
                                            <div className="rounded-lg border border-indigo-200/90 bg-indigo-50/50 p-4 space-y-3">
                                                <div className="flex items-start gap-2.5">
                                                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                                        <Scale className="h-4 w-4 text-indigo-600" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-sm font-semibold text-slate-800">Net settlement</h4>
                                                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                                            Same formula as the Payout tab: adj. cash balance (after fuel credit) minus net payout — what&apos;s left after accounting for earnings owed to the driver.
                                                        </p>
                                                    </div>
                                                </div>

                                                {!st && (
                                                    <p className="text-sm text-slate-600">
                                                        No Payout row matched this week. If the week start doesn&apos;t align with Payout periods, net settlement won&apos;t appear here.
                                                    </p>
                                                )}

                                                {st && st.finalized === false && (
                                                    <div className="rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-900">
                                                        <span className="font-semibold">Pending</span>
                                                        {' '}
                                                        <span className="text-amber-800/95">
                                                            Fuel or earnings aren&apos;t finalized for this period yet — net settlement can&apos;t be computed.
                                                        </span>
                                                    </div>
                                                )}

                                                {st && st.finalized === true && (() => {
                                                    const driverOwes = st.settlement > 0.005;
                                                    const companyOwes = st.settlement < -0.005;
                                                    const isSettled = !driverOwes && !companyOwes;
                                                    const signedSettlement =
                                                        st.settlement < 0
                                                            ? `-${fmtMoney(st.settlement)}`
                                                            : st.settlement > 0
                                                              ? fmtMoney(st.settlement)
                                                              : fmtMoney(0);
                                                    return (
                                                        <div className="space-y-3">
                                                            <div className="rounded-lg border border-slate-200/80 bg-white/80 divide-y divide-slate-100">
                                                                <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                                                                            <Banknote className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                                                            Adj. cash balance
                                                                        </p>
                                                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                                                            {st.fuelCredits > 0.005
                                                                                ? `Cash balance ${fmtMoney(st.cashBalance)} minus ${fmtMoney(st.fuelCredits)} fuel credit`
                                                                                : 'Cash balance for this period (no fuel credit applied)'}
                                                                        </p>
                                                                    </div>
                                                                    <span className="text-sm font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                                                                        {fmtMoney(st.adjCashBalance)}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                                                                            <DollarSign className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                                                            Net payout
                                                                        </p>
                                                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                                                            Subtracted — amount the company owes the driver for this period
                                                                        </p>
                                                                    </div>
                                                                    <span className="text-sm font-mono font-semibold text-emerald-700 tabular-nums shrink-0">
                                                                        −{fmtMoney(st.netPayoutApplied)}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <p className="text-center text-[11px] text-slate-500 font-medium px-1">
                                                                Adj. cash balance − Net payout = Net settlement
                                                            </p>

                                                            <div
                                                                className={cn(
                                                                    'rounded-lg border px-3 py-3 flex items-center justify-between gap-2',
                                                                    isSettled
                                                                        ? 'border-emerald-200 bg-emerald-50/90'
                                                                        : driverOwes
                                                                          ? 'border-rose-200 bg-rose-50/90'
                                                                          : 'border-blue-200 bg-blue-50/90'
                                                                )}
                                                            >
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-semibold text-slate-800">Net settlement</p>
                                                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                                                        {isSettled
                                                                            ? 'Fully settled for this period'
                                                                            : driverOwes
                                                                              ? 'Driver owes the fleet'
                                                                              : 'Company owes the driver'}
                                                                    </p>
                                                                </div>
                                                                <p
                                                                    className={cn(
                                                                        'text-xl font-bold font-mono tabular-nums shrink-0',
                                                                        isSettled
                                                                            ? 'text-emerald-700'
                                                                            : driverOwes
                                                                              ? 'text-rose-700'
                                                                              : 'text-blue-700'
                                                                    )}
                                                                >
                                                                    {isSettled ? fmtMoney(0) : signedSettlement}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        );
                                    })()}
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