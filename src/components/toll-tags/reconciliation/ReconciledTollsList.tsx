import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../ui/card";
import { Button } from "../../ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { Checkbox } from "../../ui/checkbox";
import { format } from "date-fns";
import { FinancialTransaction, Trip, Claim } from "../../../types/data";
import { History, Undo2, Loader2, TrendingUp, TrendingDown, AlertCircle, Info } from "lucide-react";
import { Badge } from "../../ui/badge";
import { calculateTollFinancials } from "../../../utils/tollReconciliation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";

interface ReconciledTollsListProps {
  tolls: FinancialTransaction[];
  trips: Trip[];
  claims: Claim[];
  onUnmatch: (tx: FinancialTransaction) => Promise<any> | void;
}

export function ReconciledTollsList({ tolls, trips, claims, onUnmatch }: ReconciledTollsListProps) {
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
                            <TableHead>Description</TableHead>
                            <TableHead>Platform</TableHead>
                            <TableHead>Recovered</TableHead>
                            <TableHead>Net Loss</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tolls.map(tx => {
                            const trip = trips.find(t => t.id === tx.tripId);
                            const claim = claims.find(c => c.transactionId === tx.id);
                            const isSelected = selectedIds.has(tx.id);
                            
                            const financials = calculateTollFinancials(tx, trip, claim);

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
                                            {(() => {
                                                try {
                                                    const timeStr = tx.time || '12:00:00';
                                                    const cleanTime = timeStr.length >= 5 ? timeStr : '12:00:00';
                                                    const localDate = new Date(`${tx.date}T${cleanTime}`);
                                                    const validDate = !isNaN(localDate.getTime()) ? localDate : new Date(tx.date);
                                                    
                                                    const isFutureDate = validDate > new Date();
                                                    return (
                                                        <>
                                                            <span className={`font-medium ${isFutureDate ? 'text-red-600' : ''}`}>{format(validDate, 'MMM d, yyyy')}</span>
                                                            <span className="text-xs text-slate-500">{format(validDate, 'h:mm a')}</span>
                                                            {isFutureDate && (
                                                                <span className="text-[10px] font-medium text-red-500 bg-red-50 px-1 py-0.5 rounded mt-0.5 inline-block">Future Date</span>
                                                            )}
                                                        </>
                                                    );
                                                } catch (e) {
                                                    return <span className="font-medium">{tx.date}</span>;
                                                }
                                            })()}
                                        </div>
                                    </TableCell>
                                    
                                    <TableCell>
                                        <div className="flex flex-col">
                                             <span className="font-medium text-slate-700">${financials.cost.toFixed(2)}</span>
                                             <span className="text-xs text-slate-500 truncate max-w-[150px]" title={tx.description}>
                                                {tx.description || 'Toll Charge'}
                                             </span>
                                        </div>
                                    </TableCell>

                                    <TableCell>
                                        {trip ? (
                                            <div className="flex flex-col">
                                                <Badge variant="outline" className="w-fit capitalize mb-1">
                                                    {trip.platform}
                                                </Badge>
                                                <span className="text-xs text-slate-500">
                                                    {trip.requestTime ? format(new Date(trip.requestTime), 'MMM d, h:mm a') : 'Unknown Date'}
                                                </span>
                                            </div>
                                        ) : (
                                            <Badge variant="secondary" className="bg-slate-100 text-slate-500 font-normal">
                                                Unmatched
                                            </Badge>
                                        )}
                                    </TableCell>

                                    <TableCell>
                                        {financials.totalRecovered > 0 ? (
                                            <Tooltip>
                                                <TooltipTrigger>
                                                    <div className="flex items-center gap-1 text-emerald-600 font-medium cursor-help">
                                                        +${financials.totalRecovered.toFixed(2)}
                                                        <Info className="h-3 w-3 opacity-50" />
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <div className="space-y-1 text-xs">
                                                        <div className="font-semibold">Recovery Breakdown</div>
                                                        <div className="flex justify-between gap-4">
                                                            <span>Platform Refund:</span>
                                                            <span>${financials.platformRefund.toFixed(2)}</span>
                                                        </div>
                                                        <div className="flex justify-between gap-4">
                                                            <span>Driver Charge:</span>
                                                            <span>${financials.driverRecovered.toFixed(2)}</span>
                                                        </div>
                                                        {financials.fleetAbsorbed > 0 && (
                                                            <div className="flex justify-between gap-4 text-amber-600">
                                                                <span>Fleet Absorbed:</span>
                                                                <span>${financials.fleetAbsorbed.toFixed(2)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </TooltipContent>
                                            </Tooltip>
                                        ) : (
                                            <span className="text-slate-300">-</span>
                                        )}
                                    </TableCell>

                                    <TableCell>
                                         {financials.netLoss > 0 ? (
                                            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                                                -${financials.netLoss.toFixed(2)}
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">
                                                $0.00
                                            </Badge>
                                        )}
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