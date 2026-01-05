import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { format, parseISO } from "date-fns";
import { FinancialTransaction } from '../../types/data';
import { cn } from "../ui/utils";
import { MoreHorizontal } from "lucide-react";
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
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedTransactions.map((tx) => (
                        <TableRow key={tx.id}>
                            <TableCell className="font-medium text-slate-700">
                                {format(parseISO(tx.date), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell className="text-slate-500">
                                {tx.paymentMethod}
                            </TableCell>
                            <TableCell className={cn(
                                "text-right font-bold",
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
