import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Trip, FinancialTransaction, DriverMetrics } from '../../types/data';
import { format } from "date-fns";
import { DollarSign, Info, Eye, Scale } from "lucide-react";
import { cn } from "../ui/utils";
import {
  computeWeeklyCashSettlement,
  type CashWeekData,
} from '../../utils/cashSettlementCalc';
import { useFleetTimezone } from '../../utils/timezoneDisplay';
import type { PayoutPeriodRow } from '../../types/driverPayoutPeriod';
import { SettlementPeriodDetail } from './SettlementPeriodDetail';
import { CashWalletWeekDetail } from './CashWalletWeekDetail';
import { payoutToSettlementRow, type SettlementRow } from './SettlementSummaryView';

/** Monday key yyyy-MM-dd → Payout ledger settlement (same math as Settlement tab). */
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
    /**
     * Preferred: same cashWeeks as Settlement/Payout (`useDriverPayoutPeriodRows`).
     * When provided, skips a second computeWeeklyCashSettlement with different inputs.
     */
    cashWeeks?: CashWeekData[];
    /** Same period rows as Settlement/Payout — Settlement link only. */
    payoutPeriodRows?: PayoutPeriodRow[];
    /** Optional: net settlement per week from `useDriverPayoutPeriodRows` (weekly). */
    weekSettlementByMonday?: WeekSettlementMap;
    onLogPayment?: (periodStart: Date, periodEnd: Date, amountOwed: number) => void;
    onWeeksComputed?: (weeks: Array<{ start: Date; end: Date; amountOwed: number; amountPaid: number; balance: number; status: string }>) => void;
    readOnly?: boolean;
}

export function WeeklySettlementView({
    trips = [],
    transactions = [],
    csvMetrics = [],
    cashWeeks: cashWeeksProp,
    payoutPeriodRows = [],
    weekSettlementByMonday,
    onLogPayment,
    onWeeksComputed,
    readOnly = false,
}: WeeklySettlementViewProps) {
    const fleetTz = useFleetTimezone();
    const weeks = useMemo(() => {
        if (cashWeeksProp && cashWeeksProp.length > 0) return cashWeeksProp;
        // Fallback only when parent has not wired the shared pipeline yet.
        return computeWeeklyCashSettlement({ trips, transactions, csvMetrics, timezone: fleetTz });
    }, [cashWeeksProp, trips, transactions, csvMetrics, fleetTz]);

    const [selectedWalletWeek, setSelectedWalletWeek] = useState<CashWeekData | null>(null);
    const [selectedSettlementRow, setSelectedSettlementRow] = useState<SettlementRow | null>(null);

    const payoutByMonday = useMemo(() => {
        const map = new Map<string, PayoutPeriodRow>();
        for (const row of payoutPeriodRows) {
            map.set(format(row.periodStart, 'yyyy-MM-dd'), row);
        }
        return map;
    }, [payoutPeriodRows]);

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

    const openWalletDetail = (week: CashWeekData) => {
        setSelectedWalletWeek(week);
    };

    const openSettlementDetail = (week: CashWeekData) => {
        const key = format(week.start, 'yyyy-MM-dd');
        const payoutRow = payoutByMonday.get(key);
        if (payoutRow) {
            setSelectedSettlementRow(payoutToSettlementRow(payoutRow));
        }
    };

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

                                {/* Collection desk metrics — Settlement decision stays secondary */}
                                <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Passenger cash</p>
                                        <p className="text-lg font-bold text-slate-900">${week.amountOwed.toFixed(2)}</p>
                                    </div>
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Cash returned</p>
                                        <p className="text-lg font-bold text-emerald-600">${week.amountPaid.toFixed(2)}</p>
                                        <p className="text-[10px] text-slate-400">Tagged to this week</p>
                                    </div>
                                    <div className="space-y-0.5 min-w-[80px]">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                                            Collection gap
                                        </p>
                                        <p className={cn("text-lg font-bold", week.balance > 0.005 ? "text-red-600" : "text-slate-400")}>
                                            ${week.balance.toFixed(2)}
                                        </p>
                                    </div>
                                    {(week.bankSettled || 0) > 0.005 && (
                                        <div className="space-y-0.5">
                                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Bank Settled</p>
                                            <p className="text-sm font-semibold text-slate-400">${week.bankSettled.toFixed(2)}</p>
                                            <p className="text-[10px] text-slate-400">Info only</p>
                                        </div>
                                    )}
                                    {weekSettlementByMonday && (() => {
                                        const key = format(week.start, 'yyyy-MM-dd');
                                        const st = weekSettlementByMonday[key];
                                        if (!st) return null;
                                        if (!st.finalized) {
                                            return (
                                                <div className="space-y-0.5 min-w-[90px]">
                                                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                                        <Scale className="h-3 w-3" /> Settlement
                                                    </p>
                                                    <p className="text-[11px] font-medium text-amber-600">Pending</p>
                                                </div>
                                            );
                                        }
                                        const s = st.settlement;
                                        return (
                                            <button
                                                type="button"
                                                className="space-y-0.5 min-w-[90px] text-left hover:opacity-80"
                                                onClick={(e) => { e.stopPropagation(); openSettlementDetail(week); }}
                                                title="Open Settlement detail (Financials)"
                                                disabled={!payoutByMonday.has(key)}
                                            >
                                                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                                    <Scale className="h-3 w-3" /> Settlement
                                                </p>
                                                <p className={cn(
                                                    "text-sm font-semibold",
                                                    s < -0.005 ? "text-rose-500" : s > 0.005 ? "text-blue-500" : "text-emerald-500"
                                                )}>
                                                    {s < -0.005 ? '−' : s > 0.005 ? '+' : ''}
                                                    ${Math.abs(s).toFixed(2)}
                                                </p>
                                            </button>
                                        );
                                    })()}
                                </div>

                                {/* Action */}
                                <div className="flex items-center gap-2 shrink-0">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1.5 text-xs border-slate-300 hover:bg-slate-100 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); openWalletDetail(week); }}
                                    >
                                        <Eye className="h-3.5 w-3.5" />
                                        Details
                                    </Button>
                                    {!readOnly && week.status !== 'Paid' && week.status !== 'Overpaid' && week.amountOwed > 0 && onLogPayment && (
                                        <Button 
                                            size="sm" 
                                            className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                                            onClick={() => {
                                                // Prefill collection gap only (not settlement residual after fuel/tolls)
                                                const amt = Math.max(0, week.balance);
                                                onLogPayment(week.start, week.end, amt);
                                            }}
                                        >
                                            <DollarSign className="h-4 w-4 mr-2" />
                                            Log Cash
                                        </Button>
                                    )}
                                </div>
                            </div>
                            
                            {/* Collection progress + settlement still held (shared pipeline) */}
                            {week.amountOwed > 0.005 && (
                                <div className="mt-4 space-y-2">
                                    <div>
                                        <div className="flex justify-between text-xs mb-1.5">
                                            <span className="text-slate-500">Collection progress</span>
                                            <span className="text-slate-700 font-medium">
                                                {Math.round((week.amountPaid / week.amountOwed) * 100)}%
                                                <span className="text-slate-400 font-normal">
                                                    {' '}· ${week.amountPaid.toFixed(0)} / ${week.amountOwed.toFixed(0)}
                                                </span>
                                            </span>
                                        </div>
                                        <Progress 
                                            value={(week.amountPaid / week.amountOwed) * 100} 
                                            className="h-2" 
                                            indicatorClassName="bg-gradient-to-r from-orange-400 to-amber-600"
                                        />
                                    </div>
                                    {weekSettlementByMonday && (() => {
                                        const key = format(week.start, 'yyyy-MM-dd');
                                        const st = weekSettlementByMonday[key];
                                        if (!st) return null;
                                        if (!st.finalized) {
                                            return (
                                                <p className="text-[11px] text-amber-600">
                                                    Settlement: Awaiting Cash / not finalized
                                                </p>
                                            );
                                        }
                                        return (
                                            <p className="text-[11px] text-slate-500">
                                                Cash Still Held{' '}
                                                <span className={cn(
                                                    'font-semibold',
                                                    st.adjCashBalance > 0.005 ? 'text-rose-600' : 'text-emerald-600',
                                                )}>
                                                    ${st.adjCashBalance.toFixed(2)}
                                                </span>
                                                <span className="text-slate-400"> · same as Financials → Settlement</span>
                                            </p>
                                        );
                                    })()}
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

            {/* Cash Wallet collection desk */}
            <CashWalletWeekDetail
                week={selectedWalletWeek}
                transactions={transactions}
                open={!!selectedWalletWeek}
                onOpenChange={(open) => { if (!open) setSelectedWalletWeek(null); }}
                settlementEntry={
                    selectedWalletWeek && weekSettlementByMonday
                        ? weekSettlementByMonday[format(selectedWalletWeek.start, 'yyyy-MM-dd')] ?? null
                        : null
                }
            />

            {/* Settlement who-owes — only from the secondary Settlement link */}
            <SettlementPeriodDetail
                row={selectedSettlementRow}
                open={!!selectedSettlementRow}
                onOpenChange={(open) => { if (!open) setSelectedSettlementRow(null); }}
            />
        </div>
    );
}
