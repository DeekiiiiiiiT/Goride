import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "../ui/tooltip";
import { format, parseISO } from "date-fns";
import { FinancialTransaction } from '../../types/data';
import { formatSafeDate, formatSafeTime } from '../../utils/timeUtils';
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
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedTransactions.map((tx) => (
                        <TableRow key={tx.id} className={tx.metadata?.automated ? "bg-emerald-50/30" : ""}>
                            <TableCell className="font-medium text-slate-700">
                                {formatSafeDate(tx.date, tx.time)}
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
