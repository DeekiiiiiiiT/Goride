/**
 * FuelWalletView.tsx — Cache-bust rebuild (2026-02-18T1200)
 *
 * This file was deleted and recreated from scratch to force the Figma Make
 * bundler to invalidate its module cache. The previous cached build referenced
 * a stale variable name ("summaryData") that no longer existed, causing
 * "summary is not defined" at runtime even though the source was correct.
 */
import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { FinancialTransaction } from '../../types/data';
import { formatSafeDate } from '../../utils/timeUtils';
import { FuelCalculationService } from '../../services/fuelCalculationService';
import { cn } from "../ui/utils";
import { Fuel, ArrowUpCircle, ArrowDownCircle, TrendingUp, TrendingDown, Minus, RefreshCw, Loader2, CheckCircle2, Calendar, ExternalLink } from "lucide-react";

interface FuelWalletViewProps {
    transactions: FinancialTransaction[];
    onBackfill?: () => Promise<{ created: number; skipped: number; total: number }>;
}

interface DateGroup {
    dateKey: string;
    displayDate: string;
    transactions: FinancialTransaction[];
    dayNet: number;
    dayCredits: number;
    dayDebits: number;
}

interface FuelWalletSummary {
    totalCredits: number;
    totalDebits: number;
    netImpact: number;
}

/**
 * FuelWalletView -- A simplified financial view for the Cash Wallet's "Fuel Activity" tab.
 *
 * Shows fuel-related credits and debits that affect the driver's cash balance.
 * Unlike FuelLedgerView (the audit tool), this has NO:
 *   - Odometer bucket groups
 *   - Integrity analysis (orphans, anomalies)
 *   - Integrity repair actions
 *   - Atomic purge / deletion
 *   - Manual fuel entry creation
 *
 * It only answers: "How does fuel affect what this driver owes or is owed?"
 */
export function FuelWalletView({ transactions, onBackfill }: FuelWalletViewProps) {
    const [isBackfilling, setIsBackfilling] = useState(false);
    const [backfillResult, setBackfillResult] = useState<{ created: number; skipped: number; total: number } | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<DateGroup | null>(null);

    // ── Step 1: Filter to only fuel-related financial transactions ──
    const fuelTransactions: FinancialTransaction[] = useMemo(() => {
        return transactions
            .filter(t => {
                if (!t) return false;
                const cat = (t.category || '').toLowerCase();
                const desc = (t.description || '').toLowerCase();
                const isFuelCategory = cat.includes('fuel');
                const isFuelDescription = desc.includes('fuel');
                const isAutoSettlement = t.metadata?.settlementType === 'RideShare_Cash_Offset';
                return isFuelCategory || isFuelDescription || isAutoSettlement;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions]);

    // ── Step 2: Compute summary totals (credits, debits, net) ──
    const summary: FuelWalletSummary = useMemo((): FuelWalletSummary => {
        let totalCredits = 0;
        let totalDebits = 0;

        for (const tx of fuelTransactions) {
            if (tx.amount > 0) {
                totalCredits += tx.amount;
            } else {
                totalDebits += Math.abs(tx.amount);
            }
        }

        return {
            totalCredits,
            totalDebits,
            netImpact: totalCredits - totalDebits,
        };
    }, [fuelTransactions]);

    // ── Step 3: Group transactions by date for accordion display ──
    const groupedByDate: DateGroup[] = useMemo(() => {
        const groups: DateGroup[] = [];
        const map = new Map<string, FinancialTransaction[]>();

        fuelTransactions.forEach(tx => {
            const d = new Date(tx.date);
            const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!map.has(dateKey)) map.set(dateKey, []);
            map.get(dateKey)!.push(tx);
        });

        map.forEach((txs, dateKey) => {
            let dayCredits = 0;
            let dayDebits = 0;
            txs.forEach(tx => {
                if (tx.amount > 0) dayCredits += tx.amount;
                else dayDebits += Math.abs(tx.amount);
            });
            groups.push({
                dateKey,
                displayDate: formatSafeDate(txs[0].date),
                transactions: txs,
                dayNet: dayCredits - dayDebits,
                dayCredits,
                dayDebits,
            });
        });

        return groups;
    }, [fuelTransactions]);

    // ── Determine the type badge for a transaction ──
    const getTypeBadge = (tx: FinancialTransaction) => {
        if (tx.category === 'Fuel Reimbursement Credit') {
            return (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-medium gap-1">
                    <ArrowUpCircle className="w-3 h-3" />
                    Wallet Credit
                </Badge>
            );
        }
        if (tx.metadata?.settlementType === 'RideShare_Cash_Offset') {
            return (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-medium gap-1">
                    <ArrowUpCircle className="w-3 h-3" />
                    Auto Settlement
                </Badge>
            );
        }
        if (tx.type === 'Reimbursement') {
            return (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] font-medium">
                    Reimbursement
                </Badge>
            );
        }
        if (tx.type === 'Expense' || tx.amount < 0) {
            return (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px] font-medium gap-1">
                    <ArrowDownCircle className="w-3 h-3" />
                    Expense
                </Badge>
            );
        }
        return (
            <Badge variant="outline" className="border-slate-200 text-slate-600 text-[10px] font-medium">
                {tx.category || tx.type}
            </Badge>
        );
    };

    // ── Empty state ──
    if (fuelTransactions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Fuel className="h-10 w-10 mb-3 text-slate-300" />
                <p className="text-sm font-medium">No fuel-related financial activity found.</p>
                <p className="text-xs mt-1">Approved fuel reimbursements will appear here as credits.</p>
            </div>
        );
    }

    // ── Main render ──
    return (
        <div className="space-y-4">
            {/* Backfill Button */}
            {onBackfill && (
                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-xs h-8 border-slate-300 hover:bg-slate-100"
                        onClick={async () => {
                            setIsBackfilling(true);
                            setBackfillResult(null);
                            try {
                                const result = await onBackfill();
                                setBackfillResult(result);
                            } catch (err) {
                                console.error('[FuelWalletView] Backfill error:', err);
                                setBackfillResult({ created: -1, skipped: 0, total: 0 });
                            } finally {
                                setIsBackfilling(false);
                            }
                        }}
                        disabled={isBackfilling}
                    >
                        {isBackfilling ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Sync Historical Credits
                    </Button>
                    {backfillResult && !isBackfilling && (
                        backfillResult.created === -1 ? (
                            <span className="text-xs text-red-500 font-medium">Sync failed. Check console for details.</span>
                        ) : (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                <span>
                                    {backfillResult.created > 0
                                        ? `Created ${backfillResult.created} wallet credit${backfillResult.created !== 1 ? 's' : ''} for previously approved reimbursements.`
                                        : 'All approved reimbursements already have wallet credits.'
                                    }
                                    {backfillResult.skipped > 0 && ` (${backfillResult.skipped} already existed)`}
                                </span>
                            </div>
                        )
                    )}
                </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 px-3 py-2 bg-slate-50 border rounded-lg text-[10px] font-medium text-slate-400">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Credit (reduces cash debt)</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span>Debit (increases cash debt)</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>Auto Settlement (system-generated)</span>
                </div>
            </div>

            {/* Summary Bar */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="h-7 w-7 rounded-full bg-emerald-50 flex items-center justify-center">
                            <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-600" />
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Credits</p>
                    </div>
                    <p className="text-lg font-bold font-mono text-emerald-600">
                        +{FuelCalculationService.formatCurrency(summary.totalCredits)}
                    </p>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="h-7 w-7 rounded-full bg-red-50 flex items-center justify-center">
                            <ArrowDownCircle className="h-3.5 w-3.5 text-red-500" />
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Debits</p>
                    </div>
                    <p className="text-lg font-bold font-mono text-red-600">
                        -{FuelCalculationService.formatCurrency(summary.totalDebits)}
                    </p>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <div className={cn(
                            "h-7 w-7 rounded-full flex items-center justify-center",
                            summary.netImpact >= 0 ? "bg-emerald-50" : "bg-red-50"
                        )}>
                            {summary.netImpact > 0 ? (
                                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                            ) : summary.netImpact < 0 ? (
                                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                            ) : (
                                <Minus className="h-3.5 w-3.5 text-slate-400" />
                            )}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Net Impact</p>
                    </div>
                    <p className={cn(
                        "text-lg font-bold font-mono",
                        summary.netImpact > 0 ? "text-emerald-600" : summary.netImpact < 0 ? "text-red-600" : "text-slate-700"
                    )}>
                        {summary.netImpact > 0 ? '+' : ''}{FuelCalculationService.formatCurrency(summary.netImpact)}
                    </p>
                </div>
            </div>

            {/* Transactions Table -- Grouped by Date */}
            <div className="rounded-md border bg-card overflow-hidden shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b">
                    <span className="text-xs font-medium text-slate-500">
                        {groupedByDate.length} date{groupedByDate.length !== 1 ? 's' : ''} &middot; {fuelTransactions.length} transaction{fuelTransactions.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[10px] text-slate-400">Click a date to view details</span>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50/50">
                            <TableHead className="w-[40px]"></TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-center w-[80px]">Items</TableHead>
                            <TableHead className="text-right w-[120px]">Credits</TableHead>
                            <TableHead className="text-right w-[120px]">Debits</TableHead>
                            <TableHead className="text-right w-[140px]">Net</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {groupedByDate.map((group) => (
                            <TableRow
                                key={`row-${group.dateKey}`}
                                className="hover:bg-blue-50/50 cursor-pointer transition-colors group/row"
                                onClick={() => setSelectedGroup(group)}
                            >
                                <TableCell className="py-3 px-3">
                                    <Calendar className="h-3.5 w-3.5 text-slate-400 group-hover/row:text-blue-500 transition-colors" />
                                </TableCell>
                                <TableCell className="py-3">
                                    <span className="text-sm font-semibold text-slate-700 group-hover/row:text-blue-700 transition-colors">
                                        {group.displayDate}
                                    </span>
                                </TableCell>
                                <TableCell className="py-3 text-center">
                                    <Badge variant="outline" className="text-[10px] font-medium border-slate-200 text-slate-500">
                                        {group.transactions.length}
                                    </Badge>
                                </TableCell>
                                <TableCell className="py-3 text-right">
                                    {group.dayCredits > 0 ? (
                                        <span className="text-xs font-mono font-medium text-emerald-600">
                                            +{FuelCalculationService.formatCurrency(group.dayCredits)}
                                        </span>
                                    ) : (
                                        <span className="text-xs font-mono text-slate-300">&mdash;</span>
                                    )}
                                </TableCell>
                                <TableCell className="py-3 text-right">
                                    {group.dayDebits > 0 ? (
                                        <span className="text-xs font-mono font-medium text-red-500">
                                            -{FuelCalculationService.formatCurrency(group.dayDebits)}
                                        </span>
                                    ) : (
                                        <span className="text-xs font-mono text-slate-300">&mdash;</span>
                                    )}
                                </TableCell>
                                <TableCell className="py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <span className={cn(
                                            "text-sm font-mono font-bold",
                                            group.dayNet > 0 ? "text-emerald-600" : group.dayNet < 0 ? "text-red-600" : "text-slate-500"
                                        )}>
                                            {group.dayNet > 0 ? '+' : ''}{FuelCalculationService.formatCurrency(group.dayNet)}
                                        </span>
                                        <ExternalLink className="h-3 w-3 text-slate-300 group-hover/row:text-blue-400 transition-colors" />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* ── Date Detail Overlay ── */}
            <Dialog open={!!selectedGroup} onOpenChange={(open) => { if (!open) setSelectedGroup(null); }}>
                <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
                    {selectedGroup && (
                        <>
                            {/* Overlay Header */}
                            <div className="px-6 pt-6 pb-4 border-b bg-slate-50/50">
                                <DialogHeader>
                                    <div className="flex items-center gap-2.5 mb-1">
                                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                            <Calendar className="h-4 w-4 text-blue-600" />
                                        </div>
                                        <div>
                                            <DialogTitle className="text-base">{selectedGroup.displayDate}</DialogTitle>
                                            <DialogDescription className="text-xs mt-0.5">
                                                {selectedGroup.transactions.length} fuel transaction{selectedGroup.transactions.length !== 1 ? 's' : ''} on this date
                                            </DialogDescription>
                                        </div>
                                    </div>
                                </DialogHeader>

                                {/* Day Summary Cards */}
                                <div className="grid grid-cols-3 gap-2.5 mt-4">
                                    <div className="bg-white rounded-lg border border-emerald-100 p-2.5 text-center">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Credits</p>
                                        <p className="text-sm font-bold font-mono text-emerald-600">
                                            +{FuelCalculationService.formatCurrency(selectedGroup.dayCredits)}
                                        </p>
                                    </div>
                                    <div className="bg-white rounded-lg border border-red-100 p-2.5 text-center">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Debits</p>
                                        <p className="text-sm font-bold font-mono text-red-600">
                                            -{FuelCalculationService.formatCurrency(selectedGroup.dayDebits)}
                                        </p>
                                    </div>
                                    <div className={cn(
                                        "bg-white rounded-lg border p-2.5 text-center",
                                        selectedGroup.dayNet >= 0 ? "border-emerald-100" : "border-red-100"
                                    )}>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Net</p>
                                        <p className={cn(
                                            "text-sm font-bold font-mono",
                                            selectedGroup.dayNet > 0 ? "text-emerald-600" : selectedGroup.dayNet < 0 ? "text-red-600" : "text-slate-600"
                                        )}>
                                            {selectedGroup.dayNet > 0 ? '+' : ''}{FuelCalculationService.formatCurrency(selectedGroup.dayNet)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Transaction List */}
                            <ScrollArea className="flex-1 overflow-auto">
                                <div className="px-6 py-4 space-y-2">
                                    {selectedGroup.transactions.map((tx, idx) => (
                                        <div
                                            key={tx.id}
                                            className={cn(
                                                "rounded-lg border p-3.5 transition-colors",
                                                tx.category === 'Fuel Reimbursement Credit' && "bg-emerald-50/40 border-emerald-100",
                                                tx.metadata?.settlementType === 'RideShare_Cash_Offset' && "bg-blue-50/40 border-blue-100",
                                                tx.category !== 'Fuel Reimbursement Credit' && tx.metadata?.settlementType !== 'RideShare_Cash_Offset' && "bg-white border-slate-200"
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span className="text-xs text-slate-400 font-mono">#{idx + 1}</span>
                                                        {getTypeBadge(tx)}
                                                    </div>
                                                    <p className="text-sm font-medium text-slate-800 leading-snug mb-1">
                                                        {tx.description}
                                                    </p>
                                                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-400">
                                                        {tx.merchant && (
                                                            <span>Merchant: <span className="text-slate-500">{tx.merchant}</span></span>
                                                        )}
                                                        {tx.referenceNumber && (
                                                            <span>Ref: <span className="text-slate-500 font-mono">{tx.referenceNumber}</span></span>
                                                        )}
                                                        {tx.category && (
                                                            <span>Category: <span className="text-slate-500">{tx.category}</span></span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className={cn(
                                                    "text-right shrink-0 pt-0.5",
                                                )}>
                                                    <p className={cn(
                                                        "text-base font-bold font-mono",
                                                        tx.amount > 0 ? "text-emerald-600" : "text-red-600"
                                                    )}>
                                                        {tx.amount > 0 ? '+' : '-'}
                                                        {FuelCalculationService.formatCurrency(Math.abs(tx.amount))}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                                        {tx.amount > 0 ? 'Credit' : 'Debit'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>

                            {/* Footer */}
                            <div className="px-6 py-3 border-t bg-slate-50/50 flex items-center justify-between">
                                <div className="flex items-center gap-4 text-[10px] font-medium text-slate-400">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <span>Credit</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-red-500" />
                                        <span>Debit</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                                        <span>Auto Settlement</span>
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-7"
                                    onClick={() => setSelectedGroup(null)}
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