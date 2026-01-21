import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "../ui/tooltip";
import { format, parseISO } from "date-fns";
import { FinancialTransaction } from '../../types/data';
import { cn } from "../ui/utils";
import { MoreHorizontal, History } from "lucide-react";
import { Button } from "../ui/button";

interface TransactionLedgerViewProps {
    transactions: FinancialTransaction[];
}

export function TransactionLedgerView({ transactions }: TransactionLedgerViewProps) {
    // Sort by date descending
    const sortedTransactions = [...transactions].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    if (sortedTransactions.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500">
                No transactions found.
            </div>
        );
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[120px]">Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedTransactions.map((tx) => (
                        <TableRow key={tx.id} className={tx.metadata?.automated ? "bg-emerald-50/30" : ""}>
                            <TableCell className="font-medium text-slate-700">
                                {format(parseISO(tx.date), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-900">{tx.description}</span>
                                        {tx.metadata?.isEdited && (
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <div className="cursor-help text-amber-500">
                                                            <History className="h-3 w-3" />
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-xs">
                                                        <div className="space-y-1">
                                                            <p className="font-bold text-amber-700">Manually Adjusted</p>
                                                            <p className="text-xs">An administrator updated the original fuel entry values.</p>
                                                            <div className="mt-2 pt-2 border-t border-slate-200 text-[10px]">
                                                                <p className="font-semibold text-slate-700 uppercase">Reason:</p>
                                                                <p className="italic text-slate-600">"{tx.metadata.editReason || "No reason provided"}"</p>
                                                            </div>
                                                        </div>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        )}
                                    </div>
                                    {tx.metadata?.automated && (
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider px-1 py-0.5 bg-emerald-100/50 rounded">Automated Settlement</span>
                                            {tx.metadata?.splitRatio && (
                                                <span className="text-[10px] text-slate-500 italic">Ratio: {tx.metadata.splitRatio}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge 
                                    variant="outline" 
                                    className={cn(
                                        "text-[10px] font-normal",
                                        tx.category?.toLowerCase().includes('reimbursement') ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "border-slate-200"
                                    )}
                                >
                                    {tx.category || tx.type}
                                </Badge>
                            </TableCell>
                            <TableCell className={cn(
                                "text-right font-mono font-bold",
                                tx.amount > 0 ? "text-emerald-600" : "text-slate-900"
                            )}>
                                {tx.amount > 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
