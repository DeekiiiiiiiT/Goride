import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../ui/card";
import { Button } from "../../ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { Checkbox } from "../../ui/checkbox";
import { format } from "date-fns";
import { FinancialTransaction, Trip } from "../../../types/data";
import { History, Undo2, Loader2, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { Badge } from "../../ui/badge";

interface ReconciledTollsListProps {
  tolls: FinancialTransaction[];
  trips: Trip[];
  onUnmatch: (tx: FinancialTransaction) => Promise<any> | void;
}

export function ReconciledTollsList({ tolls, trips, onUnmatch }: ReconciledTollsListProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkUnmatching, setIsBulkUnmatching] = useState(false);

    const toggleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(new Set(tolls.map(t => t.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const toggleSelect = (id: string, checked: boolean) => {
        const newSelected = new Set(selectedIds);
        if (checked) {
            newSelected.add(id);
        } else {
            newSelected.delete(id);
        }
        setSelectedIds(newSelected);
    };

    const handleBulkUnmatch = async () => {
        if (selectedIds.size === 0) return;
        
        setIsBulkUnmatching(true);
        try {
            const txsToUnmatch = tolls.filter(t => selectedIds.has(t.id));
            await Promise.all(txsToUnmatch.map(tx => onUnmatch(tx)));
            setSelectedIds(new Set());
        } catch (e) {
            console.error("Bulk unmatch failed", e);
        } finally {
            setIsBulkUnmatching(false);
        }
    };

    if (tolls.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <History className="h-12 w-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-900">No Matched History</h3>
                <p>You haven't matched any tolls yet.</p>
            </div>
        );
    }

    const allSelected = tolls.length > 0 && selectedIds.size === tolls.length;
    const someSelected = selectedIds.size > 0 && selectedIds.size < tolls.length;

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="space-y-1.5">
                    <CardTitle>Matched History (Profit/Loss)</CardTitle>
                    <CardDescription>
                        Audit of toll expenses against platform reimbursements. 
                        Positive variance means you were reimbursed more than you spent.
                    </CardDescription>
                </div>
                {selectedIds.size > 0 && (
                    <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={handleBulkUnmatch}
                        disabled={isBulkUnmatching}
                    >
                        {isBulkUnmatching ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Undo2 className="h-4 w-4 mr-2" />
                        )}
                        Unmatch Selected ({selectedIds.size})
                    </Button>
                )}
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]">
                                <Checkbox 
                                    checked={allSelected || (someSelected ? "indeterminate" : false)}
                                    onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                                />
                            </TableHead>
                            <TableHead>Toll Date</TableHead>
                            <TableHead>Linked Trip (Reimbursement)</TableHead>
                            <TableHead>Actual Cost</TableHead>
                            <TableHead>Variance</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tolls.map(tx => {
                            const trip = trips.find(t => t.id === tx.tripId);
                            const isSelected = selectedIds.has(tx.id);
                            
                            // Variance Calculation
                            // Expense (tx.amount) is negative, e.g. -5.00
                            // Reimbursement (trip.tollCharges) is positive, e.g. 5.00
                            const expense = Math.abs(tx.amount);
                            const reimbursement = trip?.tollCharges || 0;
                            const variance = reimbursement - expense;
                            
                            // Determine status
                            const isProfit = variance > 0.01;
                            const isLoss = variance < -0.01;
                            const isNeutral = !isProfit && !isLoss;

                            return (
                                <TableRow key={tx.id} data-state={isSelected ? "selected" : undefined}>
                                    <TableCell>
                                        <Checkbox 
                                            checked={isSelected}
                                            onCheckedChange={(checked) => toggleSelect(tx.id, checked === true)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{format(new Date(tx.date), 'MMM d, yyyy')}</span>
                                            <span className="text-xs text-slate-500">{format(new Date(tx.date), 'h:mm a')}</span>
                                        </div>
                                    </TableCell>
                                    
                                    <TableCell>
                                        {trip ? (
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium capitalize">{trip.platform} Trip</span>
                                                    <span className="text-emerald-600 font-semibold text-xs bg-emerald-50 px-1.5 py-0.5 rounded">
                                                        +${reimbursement.toFixed(2)}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-slate-500">
                                                    {trip.requestTime ? format(new Date(trip.requestTime), 'MMM d, h:mm a') : 'Unknown Date'}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 italic">Trip not found</span>
                                        )}
                                    </TableCell>

                                    <TableCell className="font-medium text-slate-700">
                                        <div className="flex items-center gap-2">
                                            <span>${expense.toFixed(2)}</span>
                                            <Badge variant="outline" className="text-[10px] text-slate-500 font-normal">
                                                {tx.description?.substring(0, 15) || 'Toll'}
                                            </Badge>
                                        </div>
                                    </TableCell>

                                    <TableCell>
                                        <div className={`flex items-center gap-1.5 font-bold ${
                                            isProfit ? 'text-emerald-600' : isLoss ? 'text-rose-600' : 'text-slate-400'
                                        }`}>
                                            {isProfit && <TrendingUp className="h-4 w-4" />}
                                            {isLoss && <TrendingDown className="h-4 w-4" />}
                                            {isNeutral && <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
                                            
                                            {variance > 0 ? '+' : ''}{variance.toFixed(2)}
                                        </div>
                                    </TableCell>

                                    <TableCell className="text-right">
                                        <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            onClick={() => onUnmatch(tx)} 
                                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                            disabled={isBulkUnmatching}
                                            title="Unmatch Transaction"
                                        >
                                            <Undo2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
