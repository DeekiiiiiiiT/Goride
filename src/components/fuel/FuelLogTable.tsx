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
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "../ui/tabs";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "../ui/accordion";
import { Label } from "../ui/label";
import { cn } from "../ui/utils";
import { Search, MoreHorizontal, Pencil, Trash2, Fuel, CreditCard, Banknote, AlertCircle, Filter as FilterIcon, X, ListFilter, ShieldCheck, HelpCircle, History, RotateCcw, Gauge, ChevronRight, Calculator, Calendar, ArrowRight } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { FuelEntry, FuelCard, FuelCycle } from '../../types/fuel';
import { FinancialTransaction } from '../../types/data';
import { Vehicle } from '../../types/vehicle';
import { api } from '../../services/api';
import { useFuelCycles } from '../../hooks/useFuelCycles';

import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "../ui/date-range-picker";

interface FuelLogTableProps {
    entries: FuelEntry[];
    transactions: FinancialTransaction[];
    vehicles: Vehicle[];
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
    vehicles,
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
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [activeView, setActiveView] = useState<'transactions' | 'cycles'>('transactions');

    // Phase 2: Cycle Mapping
    const allCycles = useFuelCycles(entries);

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
        filterAnchor !== 'all',
        filterStatus !== 'all'
    ].filter(Boolean).length;

    const clearFilters = () => {
        setFilterType('all');
        setFilterVehicle('all');
        setFilterDriver('all');
        setFilterAnchor('all');
        setFilterStatus('all');
    };

    const transactionMap = useMemo(() => {
        return new Map(transactions.map(t => [t.id, t]));
    }, [transactions]);

    const getLinkedTransaction = (entry: FuelEntry) => {
        if (entry.transactionId) return transactionMap.get(entry.transactionId);
        return transactions.find(t => t.metadata?.sourceId === entry.id);
    };

    const trustedEntryIds = useMemo(() => {
        const trusted = new Set<string>();
        entries.forEach(entry => {
            const isModifiedAnchor = (entry.metadata?.isEdited === true || !!entry.metadata?.editReason) && entry.type === 'Reimbursement';
            if (isModifiedAnchor) {
                trusted.add(entry.id);
                return;
            }
            const tx = getLinkedTransaction(entry);
            const isOriginallyTrusted = tx && tx.metadata?.source !== 'Manual' && tx.metadata?.source !== 'Fuel Log';
            if (isOriginallyTrusted) trusted.add(entry.id);
        });
        return trusted;
    }, [entries, transactions, transactionMap]);

    const { validAnchorIds, anchorFailures } = useMemo(() => {
        const anchors = new Set<string>();
        const failures = new Map<string, string>();
        const candidates: FuelEntry[] = [];
        
        entries.forEach(e => {
            if (e.type !== 'Reimbursement') return;
            if ((e.odometer ?? 0) <= 0) {
                failures.set(e.id, "Invalid Odometer (0)");
                return;
            }
            if (!trustedEntryIds.has(e.id)) {
                 failures.set(e.id, "Unverified Source (Manual/Admin)");
                 return;
            }
            candidates.push(e);
        });

        const byVehicle = new Map<string, FuelEntry[]>();
        candidates.forEach(e => {
            const vId = e.vehicleId || 'unknown';
            if (!byVehicle.has(vId)) byVehicle.set(vId, []);
            byVehicle.get(vId)!.push(e);
        });

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

    const isManualEntry = (entry: FuelEntry) => {
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
        if (filterType !== 'all') {
            if (filterType === 'Fuel_Manual_Entry') {
                if (!isManualEntry(entry)) return false;
            } else if (entry.type !== filterType) return false;
        }
        if (filterVehicle !== 'all' && entry.vehicleId !== filterVehicle) return false;
        if (filterDriver !== 'all' && entry.driverId !== filterDriver) return false;
        if (filterAnchor === 'valid' && !validAnchorIds.has(entry.id)) return false;
        if (filterAnchor === 'invalid' && (entry.type !== 'Reimbursement' || validAnchorIds.has(entry.id))) return false;
        if (filterStatus !== 'all') {
            const status = entry.reconciliationStatus || 'Pending';
            if (status !== filterStatus) return false;
        }
        if (dateRange?.from || dateRange?.to) {
            let entryDate: Date;
            if (entry.date.includes('-') && entry.date.length === 10) {
                const [y, m, d] = entry.date.split('-').map(Number);
                entryDate = new Date(y, m - 1, d);
            } else {
                entryDate = new Date(entry.date);
            }
            entryDate.setHours(0, 0, 0, 0);
            if (dateRange.from && entryDate < new Date(dateRange.from).setHours(0,0,0,0)) return false;
            if (dateRange.to && entryDate > new Date(dateRange.to).setHours(23,59,59,999)) return false;
        }
        return (
            getVehicleName(entry.vehicleId).toLowerCase().includes(searchTerm.toLowerCase()) ||
            getDriverName(entry.driverId).toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.location?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    const ledgerIntegrity = useMemo(() => {
        const integrityMap = new Map<string, 'Complete' | 'Partial' | 'Orphaned' | 'Pending'>();
        entries.forEach(entry => {
            if (!isManualEntry(entry)) return;
            if (entry.reconciliationStatus === 'Pending') {
                integrityMap.set(entry.id, 'Pending');
                return;
            }
            const related = transactions.filter(t => t.metadata?.sourceId === entry.id || t.id === entry.transactionId);
            const hasDebit = related.some(t => t.amount < 0);
            const hasCredit = related.some(t => t.amount > 0);
            if (hasDebit && hasCredit) integrityMap.set(entry.id, 'Complete');
            else if (hasDebit || hasCredit) integrityMap.set(entry.id, 'Partial');
            else integrityMap.set(entry.id, 'Orphaned');
        });
        return integrityMap;
    }, [entries, transactions]);

    const stats = useMemo(() => {
        const auditScopeEntries = entries.filter(entry => {
            if (!dateRange?.from && !dateRange?.to) return true;
            const entryDate = new Date(entry.date);
            if (dateRange.from && entryDate < dateRange.from) return false;
            if (dateRange.to && entryDate > dateRange.to) return false;
            return true;
        });
        const manualEntries = auditScopeEntries.filter(e => isManualEntry(e));
        const anchorEntries = auditScopeEntries.filter(e => validAnchorIds.has(e.id));
        const cycleScope = allCycles.filter(c => {
            if (!dateRange?.from && !dateRange?.to) return true;
            
            // Robust date parsing for filter comparison
            const dateStr = c.endDate.includes('-') ? c.endDate : c.endDate.replace(/\//g, '-');
            const cycleDate = new Date(dateStr);
            cycleDate.setHours(0, 0, 0, 0);

            const fromDate = dateRange.from ? new Date(dateRange.from) : null;
            if (fromDate) fromDate.setHours(0, 0, 0, 0);

            const toDate = dateRange.to ? new Date(dateRange.to) : null;
            if (toDate) toDate.setHours(23, 59, 59, 999);

            if (fromDate && cycleDate < fromDate) return false;
            if (toDate && cycleDate > toDate) return false;
            return true;
        });
        return {
            manualCount: manualEntries.length,
            anchorCount: anchorEntries.length,
            totalSpend: manualEntries.reduce((sum, e) => sum + e.amount, 0),
            anchorTotalSpent: anchorEntries.reduce((sum, e) => sum + e.amount, 0),
            imbalancedCount: manualEntries.filter(e => ledgerIntegrity.get(e.id) !== 'Complete' && ledgerIntegrity.get(e.id) !== 'Pending').length,
            completedCycles: cycleScope.filter(c => c.status === 'Complete').length,
            anomalyCycles: cycleScope.filter(c => c.status === 'Anomaly').length,
            activeCycles: cycleScope.filter(c => c.status === 'Active').length
        };
    }, [entries, validAnchorIds, dateRange, ledgerIntegrity, allCycles]);

    const filteredCycles = useMemo(() => {
        return allCycles.filter(c => {
            if (filterVehicle !== 'all' && c.vehicleId !== filterVehicle) return false;
            if (filterStatus === 'Flagged' && c.status !== 'Anomaly') return false;
            if (filterStatus === 'Verified' && c.status !== 'Complete') return false;
            if (filterStatus === 'Pending' && c.status !== 'Active') return false;
            if (dateRange?.from || dateRange?.to) {
                const cycleDate = new Date(c.endDate);
                if (dateRange.from && cycleDate < dateRange.from) return false;
                if (dateRange.to && cycleDate > dateRange.to) return false;
            }
            return getVehicleName(c.vehicleId).toLowerCase().includes(searchTerm.toLowerCase());
        });
    }, [allCycles, filterVehicle, filterStatus, dateRange, searchTerm, getVehicleName]);

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
        return new Date(dateString).toLocaleDateString();
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-2">
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center shrink-0">
                        <ListFilter className="h-5 w-5 text-blue-500" />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Log Volume</p>
                        <div className="flex items-baseline gap-3">
                            <div><p className="text-xl font-bold text-slate-700">{stats.manualCount}</p><p className="text-[10px] text-slate-500">Manual</p></div>
                            <div className="h-8 w-px bg-slate-100 mx-1"></div>
                            <div><p className="text-xl font-bold text-emerald-600">{stats.anchorCount}</p><p className="text-[10px] text-slate-500">Anchors</p></div>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                        stats.anomalyCycles > 0 ? "bg-rose-50" : "bg-emerald-50"
                    )}>
                        <RotateCcw className={cn(
                            "h-5 w-5",
                            stats.anomalyCycles > 0 ? "text-rose-500" : "text-emerald-500"
                        )} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fuel Integrity</p>
                        <div className="flex items-baseline gap-3">
                            <div><p className="text-xl font-bold text-emerald-600">{stats.completedCycles}</p><p className="text-[10px] text-slate-500">Verified</p></div>
                            <div className="h-8 w-px bg-slate-100 mx-1"></div>
                            <div>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <p className={cn("text-xl font-bold cursor-help", stats.anomalyCycles > 0 ? "text-rose-600 underline decoration-dotted" : "text-slate-400")}>
                                            {stats.anomalyCycles}
                                        </p>
                                    </TooltipTrigger>
                                    <TooltipContent><p className="text-[10px]">Cycles with &gt;105% tank volume or poor efficiency variance.</p></TooltipContent>
                                </Tooltip>
                                <p className="text-[10px] text-slate-500">Anomaly</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="h-10 w-10 bg-indigo-50 rounded-full flex items-center justify-center shrink-0">
                        <Banknote className="h-5 w-5 text-indigo-500" />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Spend</p>
                        <p className="text-xl font-bold text-slate-700">${stats.totalSpend.toFixed(0)}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className={cn("h-10 w-10 rounded-full flex items-center justify-center", stats.imbalancedCount > 0 ? "bg-red-50" : "bg-emerald-50")}>
                        {stats.imbalancedCount > 0 ? <AlertCircle className="h-5 w-5 text-red-500" /> : <ShieldCheck className="h-5 w-5 text-emerald-500" />}
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ledger Health</p>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-5 w-5 text-slate-400 hover:text-indigo-600 transition-colors"
                                onClick={async () => {
                                    const promise = api.runFuelBackfill();
                                    toast.promise(promise, {
                                        loading: 'Syncing tank capacities and fuel cycles...',
                                        success: 'Fleet-wide recalculation complete',
                                        error: 'Failed to update integrity'
                                    });
                                }}
                            >
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <RotateCcw className="h-3 w-3" />
                                    </TooltipTrigger>
                                    <TooltipContent>Recalculate all cycles based on latest tank capacities and full-tank flags.</TooltipContent>
                                </Tooltip>
                            </Button>
                        </div>
                        <p className={cn("text-xl font-bold", stats.imbalancedCount > 0 ? "text-red-600" : "text-emerald-600")}>
                            {stats.imbalancedCount > 0 ? `${stats.imbalancedCount} Imbalanced` : 'Healthy'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-1">
                    <Tabs value={activeView} onValueChange={(v: any) => setActiveView(v)} className="w-fit">
                        <TabsList className="bg-slate-100/50 p-1">
                            <TabsTrigger value="transactions" className="gap-2 px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                <History className="h-4 w-4" />
                                <span className="text-xs font-semibold">Transactions</span>
                            </TabsTrigger>
                            <TabsTrigger value="cycles" className="gap-2 px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                <RotateCcw className="h-4 w-4" />
                                <span className="text-xs font-semibold">Full Tanks</span>
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <div className="relative w-64">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input placeholder="Search..." className="pl-8 h-9 text-xs" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <Popover>
                        <PopoverTrigger asChild><Button variant="outline" size="sm" className="gap-2 h-9 border-dashed"><FilterIcon className="h-3.5 w-3.5" /> Filters</Button></PopoverTrigger>
                        <PopoverContent className="w-80"><div className="grid gap-2">
                            <Label>Vehicle</Label>
                            <Select value={filterVehicle} onValueChange={setFilterVehicle}>
                                <SelectTrigger><SelectValue placeholder="All Vehicles" /></SelectTrigger>
                                <SelectContent><SelectItem value="all">All Vehicles</SelectItem>{uniqueVehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-2 text-xs">Clear Filters</Button>
                        </div></PopoverContent>
                    </Popover>
                    {onDateRangeChange && <DatePickerWithRange date={dateRange} setDate={onDateRangeChange} />}
                </div>
                <div className="text-xs text-slate-500">Showing {activeView === 'transactions' ? filteredEntries.length : filteredCycles.length} records</div>
            </div>

            <div className="rounded-md border bg-white overflow-hidden">
                {activeView === 'transactions' ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Vehicle</TableHead>
                                <TableHead>Driver</TableHead>
                                <TableHead>Volume (L)</TableHead>
                                <TableHead>Cost ($)</TableHead>
                                <TableHead>Odometer</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredEntries.length === 0 ? <TableRow><TableCell colSpan={8} className="h-24 text-center">No transactions found</TableCell></TableRow> : 
                            filteredEntries.map(entry => (
                                <TableRow key={entry.id}>
                                    <TableCell>{formatDate(entry.date)}</TableCell>
                                    <TableCell><div className="flex items-center gap-2">{getTypeIcon(entry.type)}<span className="text-xs">{entry.type.replace('_', ' ')}</span></div></TableCell>
                                    <TableCell className="font-medium text-xs">{getVehicleName(entry.vehicleId)}</TableCell>
                                    <TableCell className="text-xs">{getDriverName(entry.driverId)}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium">{entry.liters?.toFixed(1)} L</span>
                                            {(() => {
                                                const vehicle = vehicles.find(v => v.id === entry.vehicleId);
                                                const tankCapacity = vehicle?.fuelSettings?.tankCapacity || Number(vehicle?.specifications?.tankCapacity) || 0;
                                                const cumulative = entry.metadata?.cumulativeLitersAtEntry;
                                                
                                                if (!tankCapacity || cumulative === undefined) return null;
                                                
                                                const percent = (cumulative / tankCapacity) * 100;
                                                const isApproachingAnchor = percent > 85;
                                                const isSoftAnchorReset = percent >= 100;
                                                const isOverflow = percent > 105;

                                                return (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="flex items-center gap-1 cursor-help">
                                                                <div className="w-8 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                                                    <div 
                                                                        className={cn(
                                                                            "h-full transition-all",
                                                                            isOverflow ? "bg-rose-500" :
                                                                            isSoftAnchorReset ? "bg-emerald-500" :
                                                                            isApproachingAnchor ? "bg-amber-500" : "bg-blue-500"
                                                                        )}
                                                                        style={{ width: `${Math.min(percent, 100)}%` }}
                                                                    />
                                                                </div>
                                                                <span className={cn(
                                                                    "text-[8px] font-bold",
                                                                    isOverflow ? "text-rose-600" :
                                                                    isSoftAnchorReset ? "text-emerald-600" :
                                                                    isApproachingAnchor ? "text-amber-600" : "text-slate-400"
                                                                )}>
                                                                    {percent.toFixed(0)}%
                                                                </span>
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <div className="space-y-1">
                                                                <p className="font-bold text-xs">Virtual Tank Level: {percent.toFixed(1)}%</p>
                                                                <p className="text-[10px] text-slate-500">Cumulative: {cumulative.toFixed(1)}L / {tankCapacity}L</p>
                                                                {isOverflow && <p className="text-[10px] text-rose-600 font-bold">ANOMALY: Tank Overflow Detected (&gt;105%)</p>}
                                                                {isSoftAnchorReset && !isOverflow && <p className="text-[10px] text-emerald-600 font-bold">SOFT ANCHOR: Cycle Reset (100%+)</p>}
                                                                {isApproachingAnchor && !isSoftAnchorReset && <p className="text-[10px] text-amber-600 font-bold">WARNING: Approaching Capacity (85%+)</p>}
                                                            </div>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                );
                                            })()}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-semibold text-xs">${entry.amount.toFixed(2)}</TableCell>
                                    <TableCell className="text-xs font-mono">{entry.odometer?.toLocaleString() || '-'}</TableCell>
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
                                                <DropdownMenuItem onClick={() => onEdit(entry)}>
                                                    <Pencil className="mr-2 h-4 w-4" /> Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem 
                                                    className="cursor-pointer"
                                                    onClick={async () => {
                                                        try {
                                                            const isNowFull = !entry.metadata?.isFullTank;
                                                            // Since we don't have direct access to a partial update method that handles metadata merge,
                                                            // we'll use the existing onEdit or a direct API call if available.
                                                            // Assuming api.updateFuelEntry exists based on standard patterns.
                                                            const updatedEntry = {
                                                                ...entry,
                                                                metadata: {
                                                                    ...entry.metadata,
                                                                    isFullTank: isNowFull,
                                                                    manualAnchorSetAt: isNowFull ? new Date().toISOString() : undefined
                                                                }
                                                            };
                                                            
                                                            await api.updateFuelEntry(entry.id, updatedEntry);
                                                            
                                                            toast.success(isNowFull ? "Marked as Full Tank" : "Removed Full Tank flag");
                                                            
                                                            // Refresh cycles logic
                                                            const promise = api.runFuelBackfill();
                                                            toast.promise(promise, {
                                                                loading: 'Recalculating cycles...',
                                                                success: 'Cycles updated successfully',
                                                                error: 'Failed to sync cycles'
                                                            });
                                                        } catch (e) {
                                                            console.error(e);
                                                            toast.error("Failed to update entry status");
                                                        }
                                                    }}
                                                >
                                                    <Gauge className={cn("mr-2 h-4 w-4", entry.metadata?.isFullTank ? "text-slate-400" : "text-emerald-500")} /> 
                                                    {entry.metadata?.isFullTank ? "Unmark Full Tank" : "Mark as Full Tank"}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => onDelete(entry.id)} className="text-red-600">
                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="p-4">
                        {filteredCycles.length === 0 ? <div className="h-24 flex items-center justify-center">No fuel cycles identified</div> : 
                        <Accordion type="multiple" className="space-y-3">
                            {filteredCycles.map(cycle => (
                                <AccordionItem key={cycle.id} value={cycle.id} className="border rounded-xl px-4 py-1 hover:bg-slate-50/50 transition-colors">
                                    <AccordionTrigger className="hover:no-underline py-3">
                                        <div className="flex items-center gap-8 w-full text-left">
                                            <div className="flex flex-col"><span className="text-[10px] text-slate-400 font-bold uppercase">{cycle.status === 'Active' ? 'Started' : 'Cycle End'}</span><span className="text-sm font-bold">{formatDate(cycle.status === 'Active' ? cycle.startDate : cycle.endDate)}</span></div>
                                            <div className="flex flex-col min-w-[120px]"><span className="text-[10px] text-slate-400 font-bold uppercase">Vehicle</span><span className="text-sm font-medium">{getVehicleName(cycle.vehicleId)}</span></div>
                                            <div className="flex flex-col"><span className="text-[10px] text-slate-400 font-bold uppercase">Distance</span><span className="text-sm font-bold text-indigo-600">{cycle.distance.toLocaleString()} km</span></div>
                                            <div className="flex flex-col"><span className="text-[10px] text-slate-400 font-bold uppercase">Volume</span><span className="text-sm font-bold">{cycle.totalLiters.toFixed(1)} L</span></div>
                                            <div className="flex flex-col"><span className="text-[10px] text-slate-400 font-bold uppercase">Efficiency</span><span className="text-sm font-bold text-emerald-600">{cycle.efficiency.toFixed(2)} <span className="text-[10px] font-normal text-slate-400">km/L</span></span></div>
                                            <div className="flex-1" />
                                            {cycle.status === 'Anomaly' ? (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Badge className="bg-rose-50 text-rose-700 border-rose-200 gap-1.5 cursor-help">
                                                            <AlertCircle className="h-3 w-3" />
                                                            ANOMALY
                                                        </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-[200px]">
                                                        <div className="space-y-1">
                                                            <p className="font-bold text-xs text-rose-600">Cycle Issues Detected:</p>
                                                            <ul className="text-[10px] list-disc pl-4 space-y-0.5">
                                                                {(cycle.totalLiters / (vehicles.find(v => v.id === cycle.vehicleId)?.fuelSettings?.tankCapacity || 1)) * 100 > 105 && (
                                                                    <li>Critical tank overflow (&gt;105%)</li>
                                                                )}
                                                                {cycle.efficiency < 8 && cycle.distance > 0 && <li>Efficiency below target baseline</li>}
                                                                {cycle.distance === 0 && <li>Incomplete distance data</li>}
                                                            </ul>
                                                        </div>
                                                    </TooltipContent>
                                                </Tooltip>
                                            ) : 
                                             cycle.status === 'Active' ? (
                                                <div className="flex flex-col items-end gap-1">
                                                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 animate-pulse">ACTIVE CYCLE</Badge>
                                                    <span className="text-[9px] text-blue-500 font-bold uppercase">Calculating...</span>
                                                </div>
                                             ) : 
                                             <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">VERIFIED</Badge>}
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-4 pb-2 border-t mt-1">
                                        <div className="grid grid-cols-4 gap-6 bg-slate-50 p-4 rounded-lg mb-4 border border-slate-100">
                                            <div><p className="text-[10px] font-bold text-slate-400 uppercase">Odo Range</p><p className="text-xs font-mono">{cycle.startOdometer?.toLocaleString()} → {cycle.endOdometer?.toLocaleString()}</p></div>
                                            <div><p className="text-[10px] font-bold text-slate-400 uppercase">Total Cost</p><p className="text-sm font-bold">${cycle.totalCost.toFixed(2)}</p></div>
                                            <div><p className="text-[10px] font-bold text-slate-400 uppercase">Avg Price/L</p><p className="text-sm">${cycle.avgPricePerLiter.toFixed(3)}</p></div>
                                            <div><p className="text-[10px] font-bold text-slate-400 uppercase">Reset Mode</p><Badge variant="outline" className="text-[9px] font-bold">{cycle.resetType}</Badge></div>
                                        </div>
                                        <Table>
                                            <TableHeader className="bg-slate-50/50"><TableRow><TableHead className="h-8 text-[10px]">Date</TableHead><TableHead className="h-8 text-[10px]">Type</TableHead><TableHead className="h-8 text-[10px]">Volume</TableHead><TableHead className="h-8 text-[10px]">Cost</TableHead><TableHead className="h-8 text-[10px]">Odo</TableHead><TableHead className="h-8 text-[10px] text-right">Action</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {cycle.transactions.map(tx => (
                                                    <TableRow key={tx.id} className="group hover:bg-slate-50">
                                                        <TableCell className="py-2 text-xs">{formatDate(tx.date)}</TableCell>
                                                        <TableCell className="py-2 text-xs"><div className="flex items-center gap-1">{getTypeIcon(tx.type)}{tx.type.replace('_', ' ')}</div></TableCell>
                                                        <TableCell className="py-2 text-xs font-medium">{tx.liters?.toFixed(1)} L</TableCell>
                                                        <TableCell className="py-2 text-xs font-bold">${tx.amount.toFixed(2)}</TableCell>
                                                        <TableCell className="py-2 text-xs font-mono">{tx.odometer?.toLocaleString() || '-'}</TableCell>
                                                        <TableCell className="py-2 text-right"><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(tx)}><Pencil className="h-3 w-3" /></Button></TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>}
                    </div>
                )}
            </div>
        </div>
    );
}
