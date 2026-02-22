import React, { useState } from 'react';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from "../ui/table";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { FinancialTransaction } from '../../types/data';
import { Check, X, Eye, FileText, Calendar, User, Truck, DollarSign, Plus, Pencil, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";

import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../ui/utils";
import { FuelEntry } from '../../types/fuel';

import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "../ui/date-range-picker";

interface FuelReimbursementTableProps {
    transactions: FinancialTransaction[];
    logs?: FuelEntry[];
    onApprove: (id: string, notes?: string) => void;
    onReject: (id: string, reason?: string) => void;
    onRequestSubmit?: () => void;
    onEdit?: (transaction: FinancialTransaction) => void;
    onDelete?: (id: string) => void;
    onViewDriverLedger?: (driverId: string) => void;
    dateRange?: DateRange;
    onDateRangeChange?: (range: DateRange | undefined) => void;
    isRefreshing?: boolean;
    onRefresh?: () => void;
}

export function FuelReimbursementTable({ 
    transactions, 
    logs = [],
    onApprove, 
    onReject, 
    onRequestSubmit, 
    onEdit, 
    onDelete,
    onViewDriverLedger,
    dateRange,
    onDateRangeChange,
    isRefreshing = false,
    onRefresh
}: FuelReimbursementTableProps) {
    const [selectedTx, setSelectedTx] = useState<FinancialTransaction | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [notes, setNotes] = useState('');
    const [action, setAction] = useState<'approve' | 'reject' | null>(null);

    // Find the settlement transaction for a given source ID
    const findSettlementTx = (sourceId: string) => {
        // Check for automated RideShare settlement
        const autoSettlement = transactions.find(t => 
            t.metadata?.sourceId === sourceId && 
            t.metadata?.settlementType === 'RideShare_Cash_Offset'
        );
        if (autoSettlement) return autoSettlement;
        
        // Check for Cash Wallet credit (from Phase 4)
        const walletCredit = transactions.find(t => 
            t.metadata?.fuelCreditSourceId === sourceId &&
            t.category === 'Fuel Reimbursement Credit'
        );
        return walletCredit || null;
    };

    // Filter mainly for Reimbursements. 
    // We exclude automated transactions to avoid "duplication" in the UI, 
    // as settlements are linked to and visible within the primary log entry.
    const isFuelReimbursement = (t: FinancialTransaction) => {
        const isStandardSource = !t.metadata?.automated || t.metadata?.source === 'Manual' || t.metadata?.source === 'Bulk Manual';
        const isReimbursementType = (t.type === 'Reimbursement' || t.type === 'Fuel_Manual_Entry' || t.type === 'Manual_Entry' || (t.type === 'Expense' && t.paymentMethod === 'Cash'));
        const isFuelCategory = (t.category === 'Fuel' || t.category === 'Fuel Reimbursement');
        
        return isStandardSource && isReimbursementType && isFuelCategory;
    };

    const isWithinRange = (t: FinancialTransaction) => {
        if (!dateRange?.from && !dateRange?.to) return true;
        
        // Parse transaction date as a local date object
        let txDate: Date;
        if (t.date.includes('T')) {
            // ISO string - parse and convert to local date at midnight
            const dateOnly = t.date.split('T')[0];
            const [y, m, d] = dateOnly.split('-').map(Number);
            txDate = new Date(y, m - 1, d);
        } else if (t.date.includes('-') && t.date.length === 10) {
            const [y, m, d] = t.date.split('-').map(Number);
            txDate = new Date(y, m - 1, d);
        } else {
            txDate = new Date(t.date);
            txDate.setHours(0, 0, 0, 0);
        }
        
        if (dateRange?.from) {
            const fromDate = new Date(dateRange.from);
            fromDate.setHours(0, 0, 0, 0);
            if (txDate < fromDate) return false;
        }
        if (dateRange?.to) {
            const toDate = new Date(dateRange.to);
            toDate.setHours(0, 0, 0, 0);
            if (txDate > toDate) return false;
        }
        return true;
    };

    const pending = transactions.filter(t => t.status === 'Pending' && isFuelReimbursement(t));
    const history = transactions.filter(t => (t.status === 'Approved' || t.status === 'Rejected') && isFuelReimbursement(t) && isWithinRange(t));

    const handleAction = (type: 'approve' | 'reject') => {
        setAction(type);
        setNotes('');
    };

    const confirmAction = () => {
        if (!selectedTx || !action) return;
        if (action === 'approve') {
            onApprove(selectedTx.id, notes);
        } else {
            onReject(selectedTx.id, notes);
        }
        setIsDetailsOpen(false);
        setAction(null);
        setSelectedTx(null);
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        // Fix for timezone issue: 'YYYY-MM-DD' parses as UTC, causing shift in Western timezones.
        // We parse it manually to ensure it's treated as local date.
        if (dateString.includes('-') && dateString.length === 10) {
            const parts = dateString.split('-');
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const day = parseInt(parts[2]);
            return new Date(year, month, day).toLocaleDateString();
        }
        return new Date(dateString).toLocaleDateString();
    };

    const getStatusBadge = (status: string) => {
        switch(status) {
            case 'Pending': return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Pending</Badge>;
            case 'Approved': return <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">Approved</Badge>;
            case 'Rejected': return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">Rejected</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    const renderTable = (data: FinancialTransaction[], showActions = false) => {
        // Helper: resolve a display-friendly description, falling back to vendor or linked log data
        const resolveDescription = (tx: FinancialTransaction) => {
            const desc = tx.description || '';
            // If the stored description doesn't contain "Unknown", use it as-is
            if (desc && !desc.toLowerCase().includes('unknown')) return desc;
            // Try vendor field
            if (tx.vendor && !tx.vendor.toLowerCase().includes('unknown')) {
                return `${tx.category || 'Fuel'} Expense - ${tx.vendor}`;
            }
            // Try merchant field
            if ((tx as any).merchant && !(tx as any).merchant.toLowerCase().includes('unknown')) {
                return `${tx.category || 'Fuel'} Expense - ${(tx as any).merchant}`;
            }
            // Try metadata parentCompany
            if (tx.metadata?.parentCompany) {
                return `${tx.category || 'Fuel'} Expense - ${tx.metadata.parentCompany}`;
            }
            // Try linked fuel log
            const linkedLog = logs.find(l => l.transactionId === tx.id || l.id === tx.metadata?.sourceId);
            if (linkedLog) {
                const name = linkedLog.vendor || linkedLog.location || linkedLog.stationName;
                if (name && !name.toLowerCase().includes('unknown')) {
                    return `${tx.category || 'Fuel'} Expense - ${name}`;
                }
            }
            // Last resort — show a cleaner label than "Unknown"
            return `${tx.category || 'Fuel'} Expense - Unverified Station`;
        };

        return (
            <div className="rounded-md border bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Driver</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Settled</TableHead>
                            <TableHead>Details</TableHead>
                            <TableHead>Receipt</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                                    No records found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.map((tx) => (
                                <TableRow key={tx.id}>
                                    <TableCell className="font-medium">
                                        {formatDate(tx.date)}
                                        <div className="text-xs text-slate-500">{tx.time}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium">
                                                {tx.driverName?.charAt(0) || 'D'}
                                            </div>
                                            <span>{tx.driverName || 'Unknown'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-semibold text-slate-900">
                                        <div className="flex flex-col">
                                            <span>${Math.abs(tx.amount).toFixed(2)}</span>
                                            {(() => {
                                                const linkedLog = logs.find(l => l.transactionId === tx.id || l.id === tx.metadata?.sourceId);
                                                if (!linkedLog) return null;

                                                const amountMismatch = Math.abs(Math.abs(tx.amount) - linkedLog.amount) > 0.01;

                                                return (
                                                    <div className="flex items-center gap-1 mt-1">
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Badge variant="outline" className={cn(
                                                                    "text-[8px] h-3.5 px-1 font-bold tracking-tighter uppercase",
                                                                    amountMismatch ? "border-amber-500 text-amber-600 bg-amber-50" : "border-slate-200 text-slate-400"
                                                                )}>
                                                                    {amountMismatch ? "Mismatch" : "Linked"}
                                                                </Badge>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                {amountMismatch ? (
                                                                    <div className="space-y-1">
                                                                        <p className="font-bold text-amber-600">Log Mismatch Detected</p>
                                                                        <p className="text-xs text-slate-500">Ledger: ${Math.abs(tx.amount).toFixed(2)}</p>
                                                                        <p className="text-xs text-slate-500">Log: ${linkedLog.amount.toFixed(2)}</p>
                                                                        <p className="text-[10px] text-slate-400 mt-1 italic">Synchronization may be pending.</p>
                                                                    </div>
                                                                ) : (
                                                                    <p className="text-xs">Synchronized with Fuel Log</p>
                                                                )}
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {tx.status === 'Approved' ? (
                                            (() => {
                                                const settlement = findSettlementTx(tx.id);
                                                return settlement ? (
                                                    <div className="flex flex-col">
                                                        <span className="text-emerald-600 font-semibold">${settlement.amount.toFixed(2)}</span>
                                                        <span className="text-[10px] text-slate-400">
                                                            {settlement.category === 'Fuel Reimbursement Credit' ? 'Wallet Credit: OK' : 'Ledger Sync: OK'}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 text-xs italic">Pending sync</span>
                                                );
                                            })()
                                        ) : (
                                            <span className="text-slate-300">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col max-w-[200px]">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <span className="truncate text-sm font-medium">{resolveDescription(tx)}</span>
                                                {tx.metadata?.source && (
                                                    <Badge variant="secondary" className={cn(
                                                        "text-[10px] h-5 px-1.5 font-normal border hover:bg-slate-200 transition-colors",
                                                        tx.metadata.source === 'Fuel Log' || tx.metadata.source === 'Bulk Log' 
                                                            ? "bg-blue-50 text-blue-700 border-blue-200" 
                                                            : "bg-slate-100 text-slate-600 border-slate-200"
                                                    )}>
                                                        {tx.metadata.source}
                                                    </Badge>
                                                )}
                                            </div>
                                            {tx.odometer && <span className="text-xs text-slate-500">Odo: {tx.odometer} km</span>}
                                            <div className="flex gap-2">
                                                {tx.quantity && <span className="text-xs text-slate-500">Vol: {tx.quantity} L</span>}
                                                {(tx.metadata?.pricePerLiter || (tx.quantity && tx.amount)) && (
                                                    <span className="text-xs text-slate-400">
                                                        @{tx.metadata?.pricePerLiter 
                                                            ? Number(tx.metadata.pricePerLiter).toFixed(3) 
                                                            : (Math.abs(tx.amount) / tx.quantity!).toFixed(2)}/L
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {tx.receiptUrl ? (
                                            <div className="relative h-10 w-10 overflow-hidden rounded border border-slate-200 group cursor-pointer" onClick={() => { setSelectedTx(tx); setIsDetailsOpen(true); }}>
                                                <ImageWithFallback src={tx.receiptUrl} alt="Receipt" className="h-full w-full object-cover" />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">No receipt</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {getStatusBadge(tx.status)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="outline" onClick={() => { setSelectedTx(tx); setIsDetailsOpen(true); }} title="View Details">
                                                <Eye className="h-4 w-4" />
                                            </Button>

                                            {/* Edit Button - Enabled for History and Pending to allow metadata repair */}
                                            {onEdit && (
                                                tx.metadata?.source === 'Manual' || 
                                                tx.metadata?.source === 'Bulk Manual' || 
                                                tx.metadata?.source === 'Manual Request' ||
                                                tx.metadata?.source === 'Maintenance Repair' || 
                                                !tx.metadata?.source
                                            ) && (
                                                <Button 
                                                    size="sm" 
                                                    variant="outline" 
                                                    onClick={() => onEdit(tx)} 
                                                    title="Edit Transaction"
                                                    className="hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            )}
                                            
                                            {showActions && tx.status === 'Pending' && (tx.metadata?.source === 'Manual' || !tx.metadata?.source) && (
                                                <>
                                                    {onDelete && (
                                                        <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => onDelete(tx.id)} title="Delete">
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </>
                                            )}

                                            {showActions && (
                                                <>
                                                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setSelectedTx(tx); setIsDetailsOpen(true); setAction('approve'); }} title="Approve">
                                                        <Check className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="sm" variant="destructive" onClick={() => { setSelectedTx(tx); setIsDetailsOpen(true); setAction('reject'); }} title="Reject">
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <Tabs defaultValue="pending" className="w-full">
                <div className="flex items-center justify-between mb-4">
                    <TabsList>
                        <TabsTrigger value="pending">
                            Pending
                            {pending.length > 0 && (
                                <Badge variant="secondary" className="ml-2 bg-orange-100 text-orange-700 hover:bg-orange-200">
                                    {pending.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="history">History</TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-2">
                        {onRefresh && (
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={onRefresh} 
                                disabled={isRefreshing}
                                className="h-9 px-2 text-slate-500 border-slate-200"
                            >
                                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                            </Button>
                        )}

                        {onDateRangeChange && (
                            <DatePickerWithRange 
                                date={dateRange} 
                                setDate={onDateRangeChange} 
                            />
                        )}
                        
                        {onRequestSubmit && (
                            <Button onClick={onRequestSubmit} size="sm" className="bg-slate-900 text-white hover:bg-slate-800">
                                <Plus className="h-4 w-4 mr-2" />
                                Log Receipt / Manual Entry
                            </Button>
                        )}
                    </div>
                </div>

                <TabsContent value="pending" className="space-y-4">
                    {isRefreshing && (
                        <div className="flex items-center gap-2 text-xs font-medium text-blue-600 bg-blue-50/50 p-2 rounded-md border border-blue-100 animate-pulse">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Synchronizing ledger and verifying manual entries...
                        </div>
                    )}
                    {renderTable(pending, true)}
                </TabsContent>

                <TabsContent value="history" className="space-y-4">
                    {renderTable(history, false)}
                </TabsContent>
            </Tabs>

            {/* Details Modal */}
            <Dialog open={isDetailsOpen} onOpenChange={(open) => { if(!open) { setIsDetailsOpen(false); setAction(null); } }}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>Reimbursement Request</DialogTitle>
                        <DialogDescription>
                            Review the details of this transaction.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedTx && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <Label className="text-slate-500 text-xs uppercase tracking-wider">Driver</Label>
                                    <div className="flex items-center gap-2 font-medium">
                                        <User className="h-4 w-4 text-slate-400" />
                                        {selectedTx.driverName}
                                    </div>
                                </div>
                                
                                <div className="space-y-1">
                                    <Label className="text-slate-500 text-xs uppercase tracking-wider">Date & Time</Label>
                                    <div className="flex items-center gap-2 font-medium">
                                        <Calendar className="h-4 w-4 text-slate-400" />
                                        {formatDate(selectedTx.date)} at {selectedTx.time}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-slate-500 text-xs uppercase tracking-wider">Amount Claimed</Label>
                                    <div className="flex items-center gap-2 font-bold text-lg text-emerald-600">
                                        <DollarSign className="h-5 w-5" />
                                        {Math.abs(selectedTx.amount).toFixed(2)}
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-50 rounded-lg space-y-2 border border-slate-100">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Odometer:</span>
                                        <span className="font-mono">{selectedTx.odometer ? `${selectedTx.odometer} km` : '-'}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Volume:</span>
                                        <span className="font-mono">{selectedTx.quantity ? `${selectedTx.quantity} L` : '-'}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Rate:</span>
                                        <span className="font-mono">
                                            {selectedTx.metadata?.pricePerLiter 
                                                ? `$${Number(selectedTx.metadata.pricePerLiter).toFixed(3)}/L` 
                                                : (selectedTx.quantity && selectedTx.amount 
                                                    ? `$${(Math.abs(selectedTx.amount) / selectedTx.quantity).toFixed(2)}/L` 
                                                    : '-')}
                                        </span>
                                    </div>
                                </div>
                                
                                {selectedTx.description && (
                                    <div className="space-y-1">
                                        <Label className="text-slate-500 text-xs uppercase tracking-wider">Notes</Label>
                                        <p className="text-sm text-slate-700 bg-slate-50 p-2 rounded">{selectedTx.description}</p>
                                    </div>
                                )}

                                {/* Phase 3: Settlement Summary */}
                                {selectedTx.status === 'Approved' && (
                                    <div className="mt-4 p-4 border border-emerald-100 bg-emerald-50/50 rounded-xl space-y-3">
                                        {(() => {
                                            const settlement = findSettlementTx(selectedTx.id);
                                            const isWalletCredit = settlement?.category === 'Fuel Reimbursement Credit';
                                            return (
                                                <>
                                                    <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                                                        <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center">
                                                            <Check className="h-3 w-3" />
                                                        </div>
                                                        {isWalletCredit ? 'Wallet Credit Applied' : 'Settlement Processed'}
                                                    </div>
                                                    
                                                    {!settlement ? (
                                                        <p className="text-xs text-slate-500 italic">No automated settlement found in ledger history.</p>
                                                    ) : (
                                                        <>
                                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                                <div className="text-slate-500">{isWalletCredit ? 'Method:' : 'Coverage Applied:'}</div>
                                                                <div className="font-medium text-right">
                                                                    {isWalletCredit ? 'Cash Wallet Credit' : `${settlement.metadata?.coveragePercent?.toFixed(0)}%`}
                                                                </div>
                                                                <div className="text-slate-500">{isWalletCredit ? 'Credit Amount:' : 'Auto-Credit Amount:'}</div>
                                                                <div className="font-bold text-right text-emerald-600">${settlement.amount.toFixed(2)}</div>
                                                                <div className="text-slate-500">Ledger Entry:</div>
                                                                <div className="font-mono text-right truncate">{settlement.id.split('-')[0]}...</div>
                                                            </div>
                                                            
                                                            {onViewDriverLedger && (
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    className="w-full mt-2 text-xs h-8 bg-white"
                                                                    onClick={() => onViewDriverLedger(selectedTx.driverId!)}
                                                                >
                                                                    View Driver Ledger
                                                                </Button>
                                                            )}
                                                        </>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <Label className="text-slate-500 text-xs uppercase tracking-wider">Receipt Proof</Label>
                                <div className="aspect-[3/4] w-full bg-slate-100 rounded-lg border border-slate-200 overflow-hidden relative">
                                    {selectedTx.receiptUrl ? (
                                        <a href={selectedTx.receiptUrl} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
                                            <ImageWithFallback 
                                                src={selectedTx.receiptUrl} 
                                                alt="Receipt" 
                                                className="h-full w-full object-contain bg-black/5" 
                                            />
                                        </a>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                            <FileText className="h-12 w-12 mb-2 opacity-50" />
                                            <span>No Receipt Uploaded</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Area */}
                    {action && (
                        <div className="pt-4 border-t">
                            <Label htmlFor="action-notes" className="mb-2 block">
                                {action === 'approve' ? 'Approval Notes (Optional)' : 'Rejection Reason (Required)'}
                            </Label>
                            <Textarea 
                                id="action-notes"
                                value={notes} 
                                onChange={(e) => setNotes(e.target.value)} 
                                placeholder={action === 'approve' ? "E.g. Verified odometer reading." : "E.g. Receipt is blurry, please re-upload."}
                                className="mb-4"
                            />
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setAction(null)}>Back</Button>
                                <Button 
                                    className={action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
                                    disabled={action === 'reject' && !notes.trim()}
                                    onClick={confirmAction}
                                >
                                    Confirm {action === 'approve' ? 'Approval' : 'Rejection'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {!action && selectedTx?.status === 'Pending' && (
                        <DialogFooter className="gap-2 sm:gap-0">
                            <div className="flex gap-2 w-full sm:w-auto mr-auto">
                                {onEdit && (
                                    selectedTx.metadata?.source === 'Manual' || 
                                    selectedTx.metadata?.source === 'Bulk Manual' || 
                                    selectedTx.metadata?.source === 'Manual Request' ||
                                    !selectedTx.metadata?.source
                                ) && (
                                    <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => { setIsDetailsOpen(false); onEdit(selectedTx); }}>
                                        <Pencil className="h-4 w-4 mr-2" />
                                        Edit
                                    </Button>
                                )}
                                <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setIsDetailsOpen(false)}>Close</Button>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <Button variant="destructive" className="flex-1 sm:flex-none" onClick={() => setAction('reject')}>Reject</Button>
                                <Button className="bg-emerald-600 hover:bg-emerald-700 flex-1 sm:flex-none" onClick={() => setAction('approve')}>Approve</Button>
                            </div>
                        </DialogFooter>
                    )}
                    
                    {!action && selectedTx?.status !== 'Pending' && (
                         <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Close</Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}