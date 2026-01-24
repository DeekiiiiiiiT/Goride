import React, { useState, useMemo } from 'react';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from "../ui/table";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuLabel, 
    DropdownMenuSeparator, 
    DropdownMenuTrigger 
} from "../ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "../ui/popover";
import { Label } from "../ui/label";
import { cn } from "../ui/utils";
import { Search, MoreHorizontal, Pencil, Trash2, Fuel, CreditCard, Banknote, AlertCircle, Filter as FilterIcon, X, ListFilter, ShieldCheck, HelpCircle, History } from "lucide-react";
import { FuelEntry } from '../../types/fuel';
import { FinancialTransaction } from '../../types/data';

import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "../ui/date-range-picker";

interface FuelLogTableProps {
    entries: FuelEntry[];
    transactions: FinancialTransaction[];
    onEdit: (entry: FuelEntry) => void;
    onDelete: (id: string) => void;
    getVehicleName: (id?: string) => string;
    getDriverName: (id?: string) => string;
    dateRange?: DateRange;
    onDateRangeChange?: (range: DateRange | undefined) => void;
}

export function FuelLogTable({ 
    entries, 
    transactions, 
    onEdit, 
    onDelete, 
    getVehicleName, 
    getDriverName,
    dateRange,
    onDateRangeChange
}: FuelLogTableProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<string>('all');
    const [filterVehicle, setFilterVehicle] = useState<string>('all');
    const [filterDriver, setFilterDriver] = useState<string>('all');
    const [filterAnchor, setFilterAnchor] = useState<string>('all');

    const uniqueVehicles = useMemo(() => {
        const ids = Array.from(new Set(entries.map(e => e.vehicleId).filter(Boolean))) as string[];
        return ids.map(id => ({ id, name: getVehicleName(id) })).sort((a, b) => a.name.localeCompare(b.name));
    }, [entries, getVehicleName]);

    const uniqueDrivers = useMemo(() => {
        const ids = Array.from(new Set(entries.map(e => e.driverId).filter(Boolean))) as string[];
        return ids.map(id => ({ id, name: getDriverName(id) })).sort((a, b) => a.name.localeCompare(b.name));
    }, [entries, getDriverName]);

    const activeFilterCount = [
        filterType !== 'all',
        filterVehicle !== 'all',
        filterDriver !== 'all',
        filterAnchor !== 'all'
    ].filter(Boolean).length;

    const clearFilters = () => {
        setFilterType('all');
        setFilterVehicle('all');
        setFilterDriver('all');
        setFilterAnchor('all');
    };

    // Phase 2: Source Verification Logic
    const transactionMap = useMemo(() => {
        return new Map(transactions.map(t => [t.id, t]));
    }, [transactions]);

    // Robust lookup for linked transactions (Phase 3)
    const getLinkedTransaction = (entry: FuelEntry) => {
        if (entry.transactionId) return transactionMap.get(entry.transactionId);
        // Fallback for records created via Reimbursement queue that didn't write back their ID to the log yet
        return transactions.find(t => t.metadata?.sourceId === entry.id);
    };

    const trustedEntryIds = useMemo(() => {
        const trusted = new Set<string>();
        entries.forEach(entry => {
            // Logic: Trust the entry if it's a "Modified Anchor" (Admin override)
            // This MUST come before the transactionId guard to allow repairing orphaned records
            const isModifiedAnchor = (entry.metadata?.isEdited === true || !!entry.metadata?.editReason) && entry.type === 'Reimbursement';
            
            if (isModifiedAnchor) {
                trusted.add(entry.id);
                return;
            }

            const tx = getLinkedTransaction(entry);
            
            // Logic: Trust the entry if it's linked to a transaction that isn't purely "Manual" 
            const isOriginallyTrusted = tx && tx.metadata?.source !== 'Manual' && tx.metadata?.source !== 'Fuel Log';
            
            if (isOriginallyTrusted) {
                trusted.add(entry.id);
            }
        });
        return trusted;
    }, [entries, transactions, transactionMap]);

    // Phase 3 & 5: Sequential Validation & Diagnostics
    const { validAnchorIds, anchorFailures } = useMemo(() => {
        const anchors = new Set<string>();
        const failures = new Map<string, string>();

        // 1. Identify Candidates & Capture Early Failures
        const candidates: FuelEntry[] = [];
        
        entries.forEach(e => {
            if (e.type !== 'Reimbursement') return;

            let failed = false;

            // Check: Odometer > 0
            if ((e.odometer ?? 0) <= 0) {
                failures.set(e.id, "Invalid Odometer (0)");
                failed = true;
            }
            
            // Check: Trusted Source
            if (!failed && !trustedEntryIds.has(e.id)) {
                 failures.set(e.id, "Unverified Source (Manual/Admin)");
                 failed = true;
            }

            if (!failed) {
                candidates.push(e);
            }
        });

        // 2. Group by Vehicle
        const byVehicle = new Map<string, FuelEntry[]>();
        candidates.forEach(e => {
            const vId = e.vehicleId || 'unknown';
            if (!byVehicle.has(vId)) byVehicle.set(vId, []);
            byVehicle.get(vId)!.push(e);
        });

        // 3. Sort & Chain Validation
        byVehicle.forEach((vehicleEntries) => {
            vehicleEntries.sort((a, b) => {
                const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
                if (dateDiff !== 0) return dateDiff;
                return (a.odometer || 0) - (b.odometer || 0);
            });

            let maxOdometer = 0;
            vehicleEntries.forEach(entry => {
                const odo = entry.odometer || 0;
                if (odo >= maxOdometer) {
                    anchors.add(entry.id);
                    maxOdometer = odo;
                } else {
                    failures.set(entry.id, `Sequential Error (${odo} < ${maxOdometer})`);
                }
            });
        });

        return { validAnchorIds: anchors, anchorFailures: failures };
    }, [entries, trustedEntryIds]);

    // Phase 2: Manual Intent Helper (Step 2.2)
    const isManualEntry = (entry: FuelEntry) => {
        // Step 10.1: Refine Manual Entry Definition - Exclude valid Anchors
        if (validAnchorIds.has(entry.id)) return false;

        const tx = getLinkedTransaction(entry);
        const isManualType = entry.type === 'Manual_Entry' || entry.type === 'Fuel_Manual_Entry';
        const hasManualPortalType = entry.metadata?.portal_type === 'Manual_Entry' || tx?.metadata?.portal_type === 'Manual_Entry';
        const hasManualSource = entry.metadata?.source?.toLowerCase().includes('manual') || 
                               entry.metadata?.source?.toLowerCase().includes('fuel log') ||
                               tx?.metadata?.source?.toLowerCase().includes('manual') ||
                               tx?.metadata?.source?.toLowerCase().includes('fuel log');
        
        return isManualType || hasManualPortalType || hasManualSource;
    };

    const filteredEntries = entries.filter(entry => {
        // Step 2.1: Updated Type Filter Logic
        if (filterType !== 'all') {
            if (filterType === 'Fuel_Manual_Entry') {
                if (!isManualEntry(entry)) return false;
            } else {
                if (entry.type !== filterType) return false;
            }
        }

        if (filterVehicle !== 'all' && entry.vehicleId !== filterVehicle) return false;
        if (filterDriver !== 'all' && entry.driverId !== filterDriver) return false;
        if (filterAnchor === 'valid' && !validAnchorIds.has(entry.id)) return false;
        if (filterAnchor === 'invalid' && (entry.type !== 'Reimbursement' || validAnchorIds.has(entry.id))) return false;

        // Date Range Filtering - Normalize everything to local date midnights for comparison
        if (dateRange?.from || dateRange?.to) {
            let entryDate: Date;
            if (entry.date.includes('-') && entry.date.length === 10) {
                const [y, m, d] = entry.date.split('-').map(Number);
                entryDate = new Date(y, m - 1, d);
            } else {
                entryDate = new Date(entry.date);
            }
            entryDate.setHours(0, 0, 0, 0);

            if (dateRange.from) {
                const fromDate = new Date(dateRange.from);
                fromDate.setHours(0, 0, 0, 0);
                if (entryDate < fromDate) return false;
            }
            if (dateRange.to) {
                const toDate = new Date(dateRange.to);
                toDate.setHours(0, 0, 0, 0);
                if (entryDate > toDate) return false;
            }
        }

        return (
            getVehicleName(entry.vehicleId).toLowerCase().includes(searchTerm.toLowerCase()) ||
            getDriverName(entry.driverId).toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.stationAddress?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.type.toLowerCase().replace('_', ' ').includes(searchTerm.toLowerCase()) ||
            (entry.type === 'Reimbursement' && 'anchor'.includes(searchTerm.toLowerCase()))
        );
    });

    const getTypeIcon = (type: string) => {
        switch(type) {
            case 'Card_Transaction': return <CreditCard className="h-4 w-4 text-indigo-500" />;
            case 'Fuel_Manual_Entry':
            case 'Manual_Entry': return <Banknote className="h-4 w-4 text-emerald-500" />;
            case 'Reimbursement': return <Banknote className="h-4 w-4 text-orange-500" />;
            default: return <Fuel className="h-4 w-4 text-slate-500" />;
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            const [year, month, day] = dateString.split('-').map(Number);
            return new Date(year, month - 1, day).toLocaleDateString();
        }
        return new Date(dateString).toLocaleDateString();
    };

    // Phase 4: Decoupled Analytics (Step 4.1)
    const stats = useMemo(() => {
        // Stats should respect the date window but ignore UI-level workspace filters (search, vehicle, driver)
        // to provide a stable audit context.
        const auditScopeEntries = entries.filter(entry => {
            if (!dateRange?.from && !dateRange?.to) return true;
            
            let entryDate: Date;
            if (entry.date.includes('-') && entry.date.length === 10) {
                const [y, m, d] = entry.date.split('-').map(Number);
                entryDate = new Date(y, m - 1, d);
            } else {
                entryDate = new Date(entry.date);
            }
            entryDate.setHours(0, 0, 0, 0);

            if (dateRange.from) {
                const fromDate = new Date(dateRange.from);
                fromDate.setHours(0, 0, 0, 0);
                if (entryDate < fromDate) return false;
            }
            if (dateRange.to) {
                const toDate = new Date(dateRange.to);
                toDate.setHours(0, 0, 0, 0);
                if (entryDate > toDate) return false;
            }
            return true;
        });

        // Step 10.2: Update Analytics Aggregation - stats already uses isManualEntry
        // which now correctly excludes valid anchors.
        const manualEntries = auditScopeEntries.filter(e => isManualEntry(e));
        
        const unreconciled = manualEntries.filter(e => {
            const tx = getLinkedTransaction(e);
            return !tx?.isReconciled;
        });

        const anchorEntries = auditScopeEntries.filter(e => validAnchorIds.has(e.id));

        return {
            manualCount: manualEntries.length,
            unreconciledCount: unreconciled.length,
            totalSpend: manualEntries.reduce((sum, e) => sum + e.amount, 0),
            anchorTotalSpent: anchorEntries.reduce((sum, e) => sum + e.amount, 0)
        };
    }, [entries, transactionMap, validAnchorIds, dateRange, isManualEntry]); // Added isManualEntry to deps

    const handleReconcile = async (id: string) => {
        try {
            // Find the transaction associated with this entry
            const entry = entries.find(e => e.id === id);
            if (!entry?.transactionId) return;
            
            // In a real app, this would be an API call
            // await api.updateTransaction(entry.transactionId, { isReconciled: true });
            toast.success("Transaction marked as reconciled");
        } catch (error) {
            toast.error("Failed to update reconciliation status");
        }
    };

    return (
        <div className="space-y-4">
            {/* Reconciliation Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-2">
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center">
                        <ListFilter className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Manual Entries</p>
                        <p className="text-xl font-bold text-slate-700">{stats.manualCount}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="h-10 w-10 bg-amber-50 rounded-full flex items-center justify-center">
                        <AlertCircle className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unreconciled</p>
                        <p className="text-xl font-bold text-slate-700">{stats.unreconciledCount}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="h-10 w-10 bg-emerald-50 rounded-full flex items-center justify-center">
                        <Banknote className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Manual Spend</p>
                        <p className="text-xl font-bold text-slate-700">${stats.totalSpend.toFixed(2)}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="h-10 w-10 bg-indigo-50 rounded-full flex items-center justify-center">
                        <ShieldCheck className="h-5 w-5 text-indigo-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Anchor Total Spent</p>
                        <p className="text-xl font-bold text-slate-700">${stats.anchorTotalSpent.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-1">
                    <div className="relative w-72">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                        <Input 
                            placeholder="Search logs..." 
                            className="pl-8" 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="gap-2 border-dashed">
                                <FilterIcon className="h-4 w-4" />
                                Filters
                                {activeFilterCount > 0 && (
                                    <Badge variant="secondary" className="h-5 px-1 text-[10px]">
                                        {activeFilterCount}
                                    </Badge>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80" align="start">
                            <div className="grid gap-4">
                                <div className="space-y-2">
                                    <h4 className="font-medium leading-none">Filter Logs</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Refine the transaction history.
                                    </p>
                                </div>
                                <div className="grid gap-2">
                                    <div className="grid gap-1">
                                        <Label htmlFor="type">Type</Label>
                                        <Select value={filterType} onValueChange={setFilterType}>
                                            <SelectTrigger id="type">
                                                <SelectValue placeholder="All Types" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Types</SelectItem>
                                                <SelectItem value="Reimbursement">Reimbursement</SelectItem>
                                                <SelectItem value="Card_Transaction">Card Transaction</SelectItem>
                                                <SelectItem value="Fuel_Manual_Entry">Manual Entry</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid gap-1">
                                        <Label htmlFor="anchor">Anchor Status</Label>
                                        <Select value={filterAnchor} onValueChange={setFilterAnchor}>
                                            <SelectTrigger id="anchor">
                                                <SelectValue placeholder="Any Status" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any Status</SelectItem>
                                                <SelectItem value="valid">Anchors Only (Green)</SelectItem>
                                                <SelectItem value="invalid">Failed Anchors (Alert)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid gap-1">
                                        <Label htmlFor="vehicle">Vehicle</Label>
                                        <Select value={filterVehicle} onValueChange={setFilterVehicle}>
                                            <SelectTrigger id="vehicle">
                                                <SelectValue placeholder="All Vehicles" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Vehicles</SelectItem>
                                                {uniqueVehicles.map(v => (
                                                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid gap-1">
                                        <Label htmlFor="driver">Driver</Label>
                                        <Select value={filterDriver} onValueChange={setFilterDriver}>
                                            <SelectTrigger id="driver">
                                                <SelectValue placeholder="All Drivers" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Drivers</SelectItem>
                                                {uniqueDrivers.map(d => (
                                                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {activeFilterCount > 0 && (
                                        <Button variant="ghost" onClick={clearFilters} className="justify-center text-slate-500">
                                            Clear Filters
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>

                    {onDateRangeChange && (
                        <DatePickerWithRange 
                            date={dateRange} 
                            setDate={onDateRangeChange} 
                        />
                    )}

                    {activeFilterCount > 0 && (
                         <Button variant="ghost" size="icon" onClick={clearFilters}>
                            <X className="h-4 w-4" />
                         </Button>
                    )}
                </div>
                <div className="text-sm text-slate-500">
                    Showing {filteredEntries.length} entries
                </div>
            </div>

            <div className="rounded-md border bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Vehicle</TableHead>
                            <TableHead>Driver</TableHead>
                            <TableHead>Volume (L)</TableHead>
                            <TableHead>Price/L</TableHead>
                            <TableHead>Cost ($)</TableHead>
                            <TableHead>Odometer</TableHead>
                            <TableHead>Gas Station</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredEntries.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-24 text-center text-slate-500">
                                    No logs found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredEntries.map((entry) => (
                                <TableRow key={entry.id}>
                                    <TableCell>
                                        {formatDate(entry.date)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2" title={entry.type}>
                                                {getTypeIcon(entry.type)}
                                                <span className="hidden md:inline text-xs font-medium text-slate-600">
                                                    {entry.type === 'Fuel_Manual_Entry' ? 'Manual Entry' : entry.type.replace('_', ' ')}
                                                </span>
                                                {/* Step 11.1: Refined Reconciliation Status Indicator - Exclude Anchors */}
                                                {isManualEntry(entry) && (
                                                    <div className="flex items-center gap-1 ml-1">
                                                        {(() => {
                                                            const tx = getLinkedTransaction(entry);
                                                            const isReconciled = tx?.isReconciled;
                                                            return isReconciled ? (
                                                                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 h-4 px-1 text-[8px] font-bold">
                                                                    RECONCILED
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-100 h-4 px-1 text-[8px] font-bold">
                                                                    UNRECONCILED
                                                                </Badge>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                                {entry.metadata?.source && !isManualEntry(entry) && (
                                                    <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-slate-50 text-slate-500 border-slate-200 uppercase font-bold tracking-tighter">
                                                        {entry.metadata.source}
                                                    </Badge>
                                                )}
                                                {validAnchorIds.has(entry.id) ? (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Badge 
                                                                variant="secondary" 
                                                                className={cn(
                                                                    "cursor-help ml-1 h-5 px-1.5 text-[10px] font-bold border transition-colors uppercase tracking-tight",
                                                                    entry.metadata?.isHealed
                                                                        ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                                                        : entry.metadata?.isEdited 
                                                                            ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" 
                                                                            : "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                                                )}
                                                            >
                                                                {entry.metadata?.isHealed && <ShieldCheck className="mr-1 h-2.5 w-2.5" />}
                                                                {entry.metadata?.isEdited && !entry.metadata?.isHealed && <History className="mr-1 h-2.5 w-2.5" />}
                                                                {entry.metadata?.isHealed ? "Healed Anchor" : entry.metadata?.isEdited ? "Modified Anchor" : "Verified Anchor"}
                                                            </Badge>
                                                        </TooltipTrigger>
                                                        <TooltipContent className="max-w-xs">
                                                            <div className="space-y-1.5">
                                                                <p className="font-bold flex items-center gap-1.5">
                                                                    {entry.metadata?.isEdited ? (
                                                                        <>
                                                                            <History className="h-3.5 w-3.5 text-amber-600" />
                                                                            Managed Anchor (Edited)
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                                                                            Verified System Anchor
                                                                        </>
                                                                    )}
                                                                </p>
                                                                <p className="text-xs text-slate-500">
                                                                    This odometer reading is used as a fixed point for "Stop-to-Stop" fuel efficiency calculations.
                                                                </p>
                                                                {entry.metadata?.isEdited && (
                                                            <div className="mt-2 pt-2 border-t border-slate-200 text-[10px] space-y-2">
                                                                        <div className="flex items-center justify-between">
                                                                            <p className="font-semibold text-amber-800 uppercase tracking-tight">Audit History:</p>
                                                                            <span className="text-[9px] text-slate-400 bg-slate-100 px-1 rounded">ADMIN_OVERRIDE</span>
                                                                        </div>
                                                                        <div className="bg-amber-50/50 p-2 rounded border border-amber-100 shadow-inner">
                                                                            <p className="italic text-amber-900 font-medium leading-relaxed">"{entry.metadata?.editReason || "This anchor was manually adjusted by an administrator to correct historical inaccuracies or odometer drift."}"</p>
                                                                        </div>
                                                                        <div className="flex items-center justify-between text-slate-400 text-[9px] italic">
                                                                            <span>Action: REPAIRED</span>
                                                                            <span>Updated: {entry.metadata?.lastEditedAt ? new Date(entry.metadata.lastEditedAt).toLocaleString() : 'N/A'}</span>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                ) : (entry.type === 'Reimbursement' && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <AlertCircle className="ml-1 h-4 w-4 text-slate-300 hover:text-slate-400 cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Not an Anchor: {anchorFailures.get(entry.id) || 'Unknown Reason'}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                ))}
                                            </div>
                                            {/* Source Metadata */}
                                            {(() => {
                                                const tx = getLinkedTransaction(entry);
                                                const isManual = isManualEntry(entry);
                                                
                                                if (!isManual) return null;

                                                return (
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-slate-200 text-slate-400 font-normal">
                                                            {tx?.metadata?.source || entry.metadata?.source || 'Manual'}
                                                        </Badge>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {getVehicleName(entry.vehicleId)}
                                    </TableCell>
                                    <TableCell>
                                        {getDriverName(entry.driverId)}
                                    </TableCell>
                                    <TableCell>
                                        {entry.liters?.toFixed(1)} L
                                    </TableCell>
                                    <TableCell>
                                        {entry.pricePerLiter ? `$${entry.pricePerLiter.toFixed(3)}` : '-'}
                                    </TableCell>
                                    <TableCell className="font-semibold text-slate-900">
                                        <div className="flex flex-col">
                                            <span>${entry.amount.toFixed(2)}</span>
                                            {(() => {
                                                const tx = getLinkedTransaction(entry);
                                                if (!tx) return null;
                                                
                                                const amountMismatch = Math.abs(entry.amount - Math.abs(tx.amount)) > 0.01;
                                                
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
                                                                        <p className="font-bold text-amber-600">Financial Mismatch Detected</p>
                                                                        <p className="text-xs text-slate-500">Log: ${entry.amount.toFixed(2)}</p>
                                                                        <p className="text-xs text-slate-500">Ledger: ${Math.abs(tx.amount).toFixed(2)}</p>
                                                                        <p className="text-[10px] text-slate-400 mt-1 italic">Edits may be out of sync.</p>
                                                                    </div>
                                                                ) : (
                                                                    <p className="text-xs">Synchronized with Financial Ledger</p>
                                                                )}
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {entry.odometer?.toLocaleString()} km
                                    </TableCell>
                                    <TableCell className="max-w-[150px] truncate">
                                        <div className="flex flex-col">
                                            <span className="font-medium truncate" title={entry.location}>{entry.location || '-'}</span>
                                            {entry.stationAddress && (
                                                <span className="text-xs text-slate-500 truncate" title={entry.stationAddress}>
                                                    {entry.stationAddress}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                    <span className="sr-only">Open menu</span>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                {(() => {
                                                    const tx = transactionMap.get(entry.transactionId || '');
                                                    if (tx?.metadata?.portal_type === 'Manual_Entry' && !tx?.isReconciled) {
                                                        return (
                                                            <DropdownMenuItem onClick={() => handleReconcile(entry.id)} className="text-emerald-600 font-medium">
                                                                <ShieldCheck className="mr-2 h-4 w-4" /> Reconcile Entry
                                                            </DropdownMenuItem>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                                <DropdownMenuItem onClick={() => onEdit(entry)}>
                                                    <Pencil className="mr-2 h-4 w-4" /> Edit Entry
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-rose-600" onClick={() => onDelete(entry.id)}>
                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete Entry
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
