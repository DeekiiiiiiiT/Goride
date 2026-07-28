import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Trip, FinancialTransaction, DriverMetrics } from '../../types/data';
import { format } from "date-fns";
import { DollarSign, Info, Eye, Phone, Ban, Banknote } from "lucide-react";
import { cn } from "../ui/utils";
import {
  computeWeeklyCashSettlement,
  type CashWeekData,
} from '../../utils/cashSettlementCalc';
import { useFleetTimezone } from '../../utils/timezoneDisplay';
import { CashWalletWeekDetail } from './CashWalletWeekDetail';
import type { WalletCallOutstanding } from '../../utils/walletCallOutstanding';

/**
 * Cash Wallet week cards — CASH owed to fleet / cash returned only.
 * Never show passenger−returned as “unlogged debt” (fuel/toll/share already on Settlement).
 */

interface WeeklySettlementViewProps {
    trips: Trip[];
    transactions: FinancialTransaction[];
    csvMetrics: DriverMetrics[];
    cashWeeks?: CashWeekData[];
    /** Monday yyyy-MM-dd → cash still owed (Settlement SSOT, display only). */
    callOutstandingByMonday?: Record<string, WalletCallOutstanding>;
    onLogPayment?: (periodStart: Date, periodEnd: Date, amountOwed: number) => void;
    /** Write off cash still owed for this Settlement Week (company loss). */
    onWriteOff?: (periodStart: Date, periodEnd: Date, maxAmount: number) => void;
    /** Record fleet→driver payout when company owes for this Settlement Week. */
    onPayDriver?: (periodStart: Date, periodEnd: Date, maxAmount: number) => void;
    onDeleteWriteOff?: (txId: string) => void;
    onWeeksComputed?: (weeks: Array<{ start: Date; end: Date; amountOwed: number; amountPaid: number; balance: number; status: string }>) => void;
    readOnly?: boolean;
}

function plainAmount(n: number) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function WeeklySettlementView({
    trips = [],
    transactions = [],
    csvMetrics = [],
    cashWeeks: cashWeeksProp,
    callOutstandingByMonday = {},
    onLogPayment,
    onWriteOff,
    onPayDriver,
    onDeleteWriteOff,
    onWeeksComputed,
    readOnly = false,
}: WeeklySettlementViewProps) {
    const fleetTz = useFleetTimezone();
    const weeks = useMemo(() => {
        if (cashWeeksProp && cashWeeksProp.length > 0) return cashWeeksProp;
        return computeWeeklyCashSettlement({ trips, transactions, csvMetrics, timezone: fleetTz });
    }, [cashWeeksProp, trips, transactions, csvMetrics, fleetTz]);

    const [selectedWalletWeek, setSelectedWalletWeek] = useState<CashWeekData | null>(null);

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
                {weeks.map((week, idx) => {
                    const weekKey = format(week.start, 'yyyy-MM-dd');
                    const call = callOutstandingByMonday[weekKey];
                    // Collection residual only (never treat fleet_owes as $0 collectable).
                    const cashOwed =
                        call && call.callDirection === 'driver_owes'
                            ? call.callAmount
                            : call && call.callDirection === 'cash_with_driver'
                              ? call.callAmount
                              : 0;
                    const fleetOwes =
                        call?.callDirection === 'fleet_owes' ? call.callAmount : 0;
                    const outstandingCall =
                        call?.callDirection === 'fleet_owes'
                            ? fleetOwes
                            : cashOwed;
                    const isSettled =
                        call?.callDirection === 'settled' ||
                        (!!call?.finalized && outstandingCall < 0.005);
                    const logPrefill = call
                        ? (call.callDirection === 'fleet_owes' ? 0 : call.callAmount)
                        : Math.max(0, week.balance);
                    // Progress = collection desk only (passenger cash vs still collecting).
                    const clearedPct =
                        week.amountOwed > 0.005
                            ? Math.max(0, Math.min(100, (1 - cashOwed / week.amountOwed) * 100))
                            : isSettled
                              ? 100
                              : 0;
                    const showLog =
                        !readOnly &&
                        week.amountOwed > 0.005 &&
                        onLogPayment &&
                        (cashOwed > 0.005 || (week.status !== 'Paid' && week.status !== 'Overpaid'));
                    const showWriteOff =
                        !readOnly &&
                        cashOwed > 0.005 &&
                        !!onWriteOff;
                    const showPayDriver =
                        !readOnly &&
                        call?.callDirection === 'fleet_owes' &&
                        fleetOwes > 0.005 &&
                        !!onPayDriver;

                    return (
                    <Card key={idx} className={cn(
                        "transition-all hover:shadow-md",
                        cashOwed > 0.005 ? "border-amber-200 bg-amber-50/20" : "",
                        fleetOwes > 0.005 ? "border-emerald-200 bg-emerald-50/10" : "",
                    )}>
                        <CardContent className="p-4 sm:p-6 space-y-4">
                            {/* Header: week + actions stay on one band so Log Cash never drops into the metrics column */}
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-semibold text-slate-900">
                                            {format(week.start, "MMM d")} - {format(week.end, "MMM d, yyyy")}
                                        </h3>
                                        <Badge variant={
                                            isSettled ? 'default' :
                                            call?.callDirection === 'driver_owes' ? 'destructive' :
                                            call?.callDirection === 'fleet_owes' ? 'secondary' :
                                            'secondary'
                                        } className={cn(
                                            isSettled && "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200",
                                            call?.callDirection === 'driver_owes' && cashOwed > 0.005 && "bg-rose-100 text-rose-700 border-rose-200",
                                            call?.callDirection === 'fleet_owes' && fleetOwes > 0.005 && "bg-sky-100 text-sky-800 border-sky-200",
                                            call?.callDirection === 'cash_with_driver' && "bg-amber-100 text-amber-800 border-amber-200",
                                        )}>
                                            {isSettled
                                                ? 'Settled'
                                                : call?.callDirection === 'fleet_owes'
                                                    ? 'Fleet owes'
                                                    : call?.callDirection === 'driver_owes'
                                                        ? 'Cash owed'
                                                        : 'Cash with driver'}
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

                                <div className="flex flex-wrap items-center gap-2 sm:justify-end shrink-0">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 gap-1.5 text-xs border-slate-300 hover:bg-slate-100 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); setSelectedWalletWeek(week); }}
                                    >
                                        <Eye className="h-3.5 w-3.5" />
                                        Details
                                    </Button>
                                    {showWriteOff && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 border-slate-300 text-slate-700 hover:bg-slate-100"
                                            onClick={() => {
                                                onWriteOff!(week.start, week.end, cashOwed);
                                            }}
                                        >
                                            <Ban className="h-3.5 w-3.5 mr-1.5" />
                                            Write Off
                                        </Button>
                                    )}
                                    {showPayDriver && (
                                        <Button
                                            size="sm"
                                            className="h-8 bg-emerald-700 hover:bg-emerald-800"
                                            onClick={() => {
                                                onPayDriver!(week.start, week.end, call!.callAmount);
                                            }}
                                        >
                                            <Banknote className="h-3.5 w-3.5 mr-1.5" />
                                            Pay Driver
                                        </Button>
                                    )}
                                    {showLog && (
                                        <Button
                                            size="sm"
                                            className="h-8 bg-emerald-600 hover:bg-emerald-700"
                                            onClick={() => {
                                                onLogPayment!(week.start, week.end, logPrefill);
                                            }}
                                        >
                                            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
                                            Log Cash
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                                {/* Settled weeks: badge is enough — no owed/outstanding callout */}
                                {!isSettled && (
                                <div className="flex-1 min-w-[12rem] rounded-lg border border-slate-200 bg-white px-4 py-3">
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
                                        <Phone className="h-3.5 w-3.5" />
                                        {call?.callDirection === 'fleet_owes'
                                              ? 'Fleet owes'
                                              : 'Cash still owed'}
                                    </div>
                                    {call ? (
                                        <>
                                            <p className={cn(
                                                "text-xl font-bold mt-1 tabular-nums",
                                                call.callDirection === 'fleet_owes' && "text-emerald-700",
                                                call.callDirection === 'driver_owes' && "text-rose-700",
                                                call.callDirection === 'cash_with_driver' && "text-amber-800",
                                            )}>
                                                {call.callDirection === 'fleet_owes'
                                                        ? plainAmount(fleetOwes)
                                                        : plainAmount(cashOwed)}
                                            </p>
                                            <p className="text-sm font-medium text-slate-800 mt-0.5">
                                                {call.callDirection === 'fleet_owes'
                                                    ? call.callLabel
                                                    : call.callDirection === 'driver_owes'
                                                        ? 'Fleet cash cut still due'
                                                        : 'Cash still with driver'}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-sm text-slate-500 mt-2">Loading cash position…</p>
                                    )}
                                </div>
                                )}

                                <div className={cn(
                                  "flex gap-6 sm:gap-8 text-sm sm:items-center",
                                  !isSettled && "sm:pl-2",
                                )}>
                                    <div className="space-y-0.5">
                                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Passenger cash</p>
                                        <p className="font-semibold text-slate-700 tabular-nums">{plainAmount(week.amountOwed)}</p>
                                    </div>
                                    <div className="space-y-0.5">
                                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Cash returned</p>
                                        <p className="font-semibold text-emerald-700 tabular-nums">{plainAmount(week.amountPaid)}</p>
                                    </div>
                                    {(call?.breakdown.cashWrittenOff || 0) > 0.005 && (
                                        <div className="space-y-0.5">
                                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Written off</p>
                                            <p className="font-semibold text-slate-700 tabular-nums">{plainAmount(call!.breakdown.cashWrittenOff)}</p>
                                        </div>
                                    )}
                                    {(call?.breakdown.settlementPaid || 0) > 0.005 && (
                                        <div className="space-y-0.5">
                                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Paid to driver</p>
                                            <p className="font-semibold text-emerald-800 tabular-nums">{plainAmount(call!.breakdown.settlementPaid)}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {!isSettled && (week.amountOwed > 0.005 || cashOwed > 0.005 || fleetOwes > 0.005) && (
                                <div>
                                    <div className="flex justify-between text-xs mb-1.5">
                                        <span className="text-slate-500">
                                          {call?.callDirection === 'fleet_owes'
                                            ? 'Payout progress'
                                            : 'Cash position cleared'}
                                        </span>
                                        <span className="text-slate-700 font-medium">
                                            {call?.callDirection === 'fleet_owes'
                                              ? `${plainAmount(fleetOwes)} still owed to driver`
                                              : (
                                                <>
                                                  {Math.round(clearedPct)}%
                                                  <span className="text-slate-400 font-normal">
                                                    {' '}· {plainAmount(cashOwed)} still owed
                                                  </span>
                                                </>
                                              )}
                                        </span>
                                    </div>
                                    {call?.callDirection !== 'fleet_owes' && (
                                    <Progress
                                        value={clearedPct}
                                        className="h-2"
                                        indicatorClassName="bg-gradient-to-r from-emerald-400 to-emerald-600"
                                    />
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                    );
                })}

                {weeks.length === 0 && (
                     <div className="text-center py-12 text-slate-500">
                        No activity found.
                     </div>
                )}
            </div>

            <CashWalletWeekDetail
                week={selectedWalletWeek}
                transactions={transactions}
                callOutstanding={
                    selectedWalletWeek
                        ? callOutstandingByMonday[format(selectedWalletWeek.start, 'yyyy-MM-dd')]
                        : undefined
                }
                open={!!selectedWalletWeek}
                onOpenChange={(open) => { if (!open) setSelectedWalletWeek(null); }}
                onWriteOff={
                    !readOnly && onWriteOff
                        ? (start, end, maxAmount) => {
                            setSelectedWalletWeek(null);
                            onWriteOff(start, end, maxAmount);
                          }
                        : undefined
                }
                onPayDriver={
                    !readOnly && onPayDriver
                        ? (start, end, maxAmount) => {
                            setSelectedWalletWeek(null);
                            onPayDriver(start, end, maxAmount);
                          }
                        : undefined
                }
                onDeleteWriteOff={
                    !readOnly && onDeleteWriteOff
                        ? (txId) => onDeleteWriteOff(txId)
                        : undefined
                }
                onDeletePayout={
                    !readOnly && onDeleteWriteOff
                        ? (txId) => onDeleteWriteOff(txId)
                        : undefined
                }
            />
        </div>
    );
}
