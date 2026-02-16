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
import { Search, MoreHorizontal, Pencil, Trash2, Fuel, CreditCard, Banknote, AlertCircle, Filter as FilterIcon, X, ListFilter, ShieldCheck, HelpCircle, History, RotateCcw, Gauge, ChevronRight, Calculator, Calendar, ArrowRight, Scissors, CheckCircle2, Link2 } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { FuelEntry, FuelCard, FuelCycle } from '../../types/fuel';
import { FinancialTransaction } from '../../types/data';
import { Vehicle } from '../../types/vehicle';
import { api } from '../../services/api';
import { useFuelCycles } from '../../hooks/useFuelCycles';
import { useFuelAnchors } from '../../hooks/useFuelAnchors';

import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "../ui/date-range-picker";
import { downloadBlob, jsonToCsv } from '../../utils/csv-helper';
import { FUEL_CSV_COLUMNS } from '../../types/csv-schemas';
import { Download } from 'lucide-react';

interface FuelLogTableProps {
    entries: FuelEntry[];
    transactions: FinancialTransaction[];
    vehicles: Vehicle[];
    onEdit: (entry: FuelEntry) => void;
    onDelete: (id: string) => void;
    onVerifyLog?: (id: string) => void;
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
    onVerifyLog,
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
    const allCycles = useFuelCycles(entries, vehicles);
    
    // Phase 7: Shared Anchor Logic
    const { validAnchorIds, anchorFailures, getLinkedTransaction } = useFuelAnchors(entries, transactions);

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
            entry.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.vendor?.toLowerCase().includes(searchTerm.toLowerCase())
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
            totalSpend: auditScopeEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
            anchorTotalSpent: anchorEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
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
                            <div><p className="text-xl font-bold text-emerald-600">{stats.completedCycles}</p><p className="text-[10px] text-slate-500">Verified Cycles</p></div>
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
                    <div className="flex gap-2">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="gap-2 h-9"
                            onClick={() => {
                                const csv = jsonToCsv(filteredEntries, FUEL_CSV_COLUMNS);
                                downloadBlob(csv, `fuel_logs_${new Date().toISOString().split('T')[0]}.csv`);
                                toast.success("Exporting fuel logs...");
                            }}
                        >
                            <Download className="h-3.5 w-3.5" />
                            Export
                        </Button>
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
                    </div>
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
                                <TableHead>Station</TableHead>
                                <TableHead>Vehicle</TableHead>
                                <TableHead>Driver</TableHead>
                                <TableHead>Volume (L)</TableHead>
                                <TableHead>Cost ($)</TableHead>
                                <TableHead className="text-center">Audit</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredEntries.length === 0 ? <TableRow><TableCell colSpan={9} className="h-24 text-center">No transactions found</TableCell></TableRow> : 
                            filteredEntries.map(entry => {
                                const confidenceScore = entry.metadata?.auditConfidenceScore;
                                const isHighlyTrusted = entry.metadata?.isHighlyTrusted || (confidenceScore !== undefined && confidenceScore >= 90);
                                const isLocked = entry.isLocked || entry.status === 'Finalized';

                                return (
                                <TableRow key={entry.id} className={cn(isLocked && "bg-slate-50/50")}>
                                    <TableCell>{formatDate(entry.date)}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {getTypeIcon(entry.type)}
                                            <span className="text-xs">{entry.type.replace('_', ' ')}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-semibold text-slate-700 truncate max-w-[140px]">
                                                    {entry.vendor || entry.metadata?.stationName || "Unknown Vendor"}
                                                </span>
                                                {entry.metadata?.locationStatus === 'verified' && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="bg-blue-50 text-blue-600 p-0.5 rounded-full border border-blue-100 flex-shrink-0 animate-in zoom-in-95 duration-300">
                                                                <ShieldCheck className="h-2.5 w-2.5" />
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <div className="space-y-1">
                                                                <p className="text-[10px] font-bold">Verified Station</p>
                                                                <p className="text-[10px]">Mapped to Master Ledger via {entry.metadata?.verificationMethod?.replace('_', ' ') || 'GPS'}.</p>
                                                                {entry.metadata?.matchDistance !== undefined && (
                                                                    <p className="text-[10px] text-blue-500 font-medium">Accuracy: {entry.metadata.matchDistance}m</p>
                                                                )}
                                                                {entry.signature && (
                                                                    <div className="mt-1 pt-1 border-t border-blue-100 flex items-center gap-1">
                                                                        <CheckCircle2 className="h-2.5 w-2.5 text-blue-600" />
                                                                        <p className="text-[8px] font-mono text-blue-400">Signed: {entry.signature.substring(0, 8)}...</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}
                                                {(entry.metadata?.locationStatus === 'unknown' || !entry.metadata?.locationStatus) && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100 animate-pulse">
                                                                <AlertCircle className="h-2.5 w-2.5" />
                                                                <span className="text-[8px] font-bold uppercase tracking-tighter">Review Required</span>
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p className="text-[10px] font-bold">Unverified Location</p>
                                                            <p className="text-[10px]">Transaction funneled to review queue. Promoting the station will secure this log.</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}
                                            </div>
                                            <span title={entry.location} className="text-[10px] text-slate-400 truncate max-w-[140px]">
                                                {entry.location || "No GPS metadata"}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium text-xs">{getVehicleName(entry.vehicleId)}</TableCell>
                                    <TableCell className="text-xs">{getDriverName(entry.driverId)}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium">{entry.liters?.toFixed(1)} L</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-bold text-xs">${entry.amount.toFixed(2)}</TableCell>
                                    <TableCell>
                                        <div className="flex justify-center">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div className={cn(
                                                        "flex flex-col items-center justify-center w-10 h-10 rounded-lg border transition-all cursor-help",
                                                        confidenceScore === undefined ? "bg-slate-50 border-slate-100 text-slate-300" :
                                                        confidenceScore >= 90 ? "bg-emerald-50 border-emerald-100 text-emerald-600" :
                                                        confidenceScore >= 70 ? "bg-blue-50 border-blue-100 text-blue-600" :
                                                        "bg-amber-50 border-amber-100 text-amber-600"
                                                    )}>
                                                        {isLocked ? (
                                                            <ShieldCheck className="h-4 w-4" />
                                                        ) : (
                                                            <span className="text-[10px] font-bold">{confidenceScore ?? '??'}</span>
                                                        )}
                                                        <div className="flex gap-0.5 mt-0.5">
                                                            <div className={cn("h-1 w-1 rounded-full", (entry.matchedStationId) ? "bg-current" : "bg-slate-200")}></div>
                                                            <div className={cn("h-1 w-1 rounded-full", (entry.signature) ? "bg-current" : "bg-slate-200")}></div>
                                                            <div className={cn("h-1 w-1 rounded-full", (entry.odometer > 0) ? "bg-current" : "bg-slate-200")}></div>
                                                        </div>
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent className="w-64 p-0" side="left">
                                                    <div className="p-3 space-y-3">
                                                        <div className="flex justify-between items-center">
                                                            <p className="text-xs font-bold uppercase tracking-wider">Audit Confidence</p>
                                                            <Badge className={cn(
                                                                "h-5 text-[9px] border-none",
                                                                isHighlyTrusted ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600"
                                                            )}>
                                                                {confidenceScore ?? 'PENDING'}%
                                                            </Badge>
                                                        </div>
                                                        
                                                        <div className="space-y-1.5">
                                                            <AuditBreakdownItem label="GPS Handshake" value={entry.metadata?.auditConfidenceBreakdown?.gps} max={30} />
                                                            <AuditBreakdownItem label="Proximity Bonus" value={entry.metadata?.auditConfidenceBreakdown?.gps_bonus} max={5} />
                                                            <AuditBreakdownItem label="SHA-256 Sign" value={entry.metadata?.auditConfidenceBreakdown?.crypto} max={25} />
                                                            <AuditBreakdownItem label="Physical Data" value={entry.metadata?.auditConfidenceBreakdown?.physical} max={25} />
                                                            <AuditBreakdownItem label="Behavioral" value={entry.metadata?.auditConfidenceBreakdown?.behavioral} max={20} />
                                                        </div>

                                                        {isLocked && (
                                                            <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-emerald-600">
                                                                <CheckCircle2 className="h-3 w-3" />
                                                                <p className="text-[10px] font-bold">LOCKED & IMMUTABLE</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 text-slate-400 hover:text-slate-600"
                                                onClick={() => onEdit(entry)}
                                                disabled={isLocked}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 text-slate-400 hover:text-red-600"
                                                onClick={() => onDelete(entry.id)}
                                                disabled={isLocked}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )})}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="p-4">
                        {filteredCycles.length === 0 ? <div className="h-24 flex items-center justify-center">No fuel cycles identified</div> : 
                        <Accordion type="multiple" className="space-y-3">
                            {filteredCycles.map(cycle => {
                                const vehicle = vehicles.find(v => v.id === cycle.vehicleId);
                                const tankCap = vehicle?.fuelSettings?.tankCapacity || 40;
                                const calculatedEndPct = Math.min(100, (cycle.startingPercentage || 0) + (cycle.totalLiters / tankCap) * 100);
                                
                                return (
                                <AccordionItem key={cycle.id} value={cycle.id} className="border rounded-xl px-4 py-1 hover:bg-slate-50/50 transition-colors">
                                    <AccordionTrigger className="hover:no-underline py-3">
                                        <div className="flex items-center gap-6 w-full text-left">
                                            <div className="flex flex-col"><span className="text-[10px] text-slate-400 font-bold uppercase">{cycle.status === 'Active' ? 'Started' : 'Cycle End'}</span><span className="text-sm font-bold">{formatDate(cycle.status === 'Active' ? cycle.startDate : cycle.endDate)}</span></div>
                                            <div className="flex flex-col min-w-[110px]"><span className="text-[10px] text-slate-400 font-bold uppercase">Vehicle</span><span className="text-sm font-medium">{getVehicleName(cycle.vehicleId)}</span></div>
                                            <div className="flex flex-col"><span className="text-[10px] text-slate-400 font-bold uppercase">Distance</span><span className="text-sm font-bold text-indigo-600">{cycle.distance.toLocaleString()} km</span></div>
                                            <div className="flex flex-col"><span className="text-[10px] text-slate-400 font-bold uppercase">Efficiency</span><span className="text-sm font-bold text-emerald-600">{cycle.efficiency.toFixed(2)} <span className="text-[10px] font-normal text-slate-400">km/L</span></span></div>
                                            
                                            {/* Tank Visualization */}
                                            <div className="flex flex-col min-w-[120px]">
                                                <span className="text-[10px] text-slate-400 font-bold uppercase">Tank Range</span>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] font-bold text-slate-500">{(cycle.startingPercentage || 0).toFixed(0)}%</span>
                                                    <div className="h-1.5 w-14 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200/50">
                                                        <div 
                                                            className="h-full bg-slate-200" 
                                                            style={{ width: `${cycle.startingPercentage || 0}%` }} 
                                                        />
                                                        <div 
                                                            className="h-full bg-emerald-500" 
                                                            style={{ width: `${Math.min(100 - (cycle.startingPercentage || 0), (cycle.totalLiters / tankCap) * 100)}%` }} 
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-emerald-600">{cycle.isCapped ? '100%' : `${calculatedEndPct.toFixed(0)}%`}</span>
                                                </div>
                                            </div>

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
                                                                {cycle.isCapped && cycle.excessVolume && cycle.excessVolume > 5 && (
                                                                    <li>Significant overflow carried forward ({cycle.excessVolume.toFixed(1)} L)</li>
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
                                        <div className="grid grid-cols-5 gap-6 bg-slate-50 p-4 rounded-lg mb-4 border border-slate-100">
                                            <div><p className="text-[10px] font-bold text-slate-400 uppercase">Odo Range</p><p className="text-xs font-mono">{cycle.startOdometer?.toLocaleString()} → {cycle.endOdometer?.toLocaleString()}</p></div>
                                            <div><p className="text-[10px] font-bold text-slate-400 uppercase">Total Fuel</p><p className="text-sm font-bold">{cycle.totalLiters.toFixed(1)} L</p></div>
                                            <div><p className="text-[10px] font-bold text-slate-400 uppercase">Total Cost</p><p className="text-sm font-bold">${cycle.totalCost.toFixed(2)}</p></div>
                                            <div><p className="text-[10px] font-bold text-slate-400 uppercase">Avg Price/L</p><p className="text-sm">${cycle.avgPricePerLiter.toFixed(3)}</p></div>
                                            <div><p className="text-[10px] font-bold text-slate-400 uppercase">Reset Mode</p>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <Badge variant="outline" className="text-[9px] font-bold">{cycle.resetType}</Badge>
                                                    {cycle.isCapped && <Badge className="text-[8px] bg-amber-100 text-amber-700 border-amber-200">CAPPED @ 100%</Badge>}
                                                </div>
                                            </div>
                                        </div>
                                        <Table>
                                            <TableHeader className="bg-slate-50/50"><TableRow><TableHead className="h-8 text-[10px]">Date</TableHead><TableHead className="h-8 text-[10px]">Type</TableHead><TableHead className="h-8 text-[10px]">Contrib. Volume</TableHead><TableHead className="h-8 text-[10px]">Contrib. Cost</TableHead><TableHead className="h-8 text-[10px]">Odo</TableHead><TableHead className="h-8 text-[10px] text-right">Action</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {cycle.transactions.map((tx, txIdx) => (
                                                    <TableRow key={`${tx.id}-${txIdx}`} className={cn("group hover:bg-slate-50", tx.isCarryover && "bg-blue-50/30")}>
                                                        <TableCell className="py-2 text-xs">
                                                            <div className="flex flex-col">
                                                                <span>{formatDate(tx.date)}</span>
                                                                {tx.isCarryover && <span className="text-[9px] text-blue-600 font-bold uppercase flex items-center gap-0.5"><RotateCcw className="h-2 w-2" /> Balance from Prev.</span>}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-2 text-xs"><div className="flex items-center gap-1">{getTypeIcon(tx.type)}{tx.type.replace('_', ' ')}</div></TableCell>
                                                        <TableCell className="py-2 text-xs font-medium">
                                                            <div className="flex items-center gap-1.5">
                                                                {tx.volumeContributed?.toFixed(1) || tx.liters?.toFixed(1)} L
                                                                {tx.volumeContributed !== undefined && tx.liters !== undefined && tx.volumeContributed < tx.liters && !tx.isCarryover && (
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <div className="flex items-center text-[9px] text-amber-600 bg-amber-50 px-1 rounded border border-amber-200 cursor-help font-bold">
                                                                                <Scissors className="h-2 w-2 mr-0.5" /> SPLIT
                                                                            </div>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent>
                                                                            <p className="text-xs font-bold">Partial Fill applied to this cycle</p>
                                                                            <p className="text-[10px]">Receipt: {tx.liters.toFixed(1)} L</p>
                                                                            <p className="text-[10px] text-emerald-600 font-medium">{(tx.liters - tx.volumeContributed).toFixed(1)} L carried to next tank</p>
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-2 text-xs font-bold">
                                                            ${(tx.volumeContributed !== undefined && tx.liters !== undefined && tx.liters > 0 && !tx.isCarryover
                                                                ? (tx.amount * (tx.volumeContributed / tx.liters)) 
                                                                : (tx.isCarryover ? 0 : tx.amount)).toFixed(2)}
                                                        </TableCell>
                                                        <TableCell className="py-2 text-xs font-mono">{tx.odometer?.toLocaleString() || '-'}</TableCell>
                                                        <TableCell className="py-2 text-right">
                                                            {!tx.isCarryover && (
                                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(tx)}>
                                                                    <Pencil className="h-3 w-3" />
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </AccordionContent>
                                </AccordionItem>
                            )})}
                        </Accordion>}
                    </div>
                )}
            </div>
        </div>
    );
}

function AuditBreakdownItem({ label, value, max }: { label: string, value?: number, max: number }) {
    const percentage = ((value || 0) / max) * 100;
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-[9px] font-medium">
                <span className="text-slate-500">{label}</span>
                <span className={cn(value ? "text-slate-900" : "text-slate-300")}>{value ?? 0} / {max}</span>
            </div>
            <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                    className={cn(
                        "h-full rounded-full transition-all duration-500",
                        percentage >= 100 ? "bg-emerald-500" : 
                        percentage > 0 ? "bg-blue-500" : "bg-slate-200"
                    )} 
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}
