import React, { useState, useMemo, useEffect } from 'react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
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
import { Search, MoreHorizontal, Pencil, Trash2, Fuel, CreditCard, Banknote, AlertCircle, AlertTriangle, Filter as FilterIcon, X, ListFilter, ShieldCheck, HelpCircle, History, RotateCcw, Gauge, ChevronRight, Calculator, Calendar, ArrowRight, Scissors, CheckCircle2, Link2, Eye, MapPin, Clock, Hash, FileText } from "lucide-react";
import { toast } from "sonner";
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { FuelEntry, FuelCard, FuelCycle } from '../../types/fuel';
import { FinancialTransaction } from '../../types/data';
import { Vehicle } from '../../types/vehicle';
import { api } from '../../services/api';
import { useFuelCycles } from '../../hooks/useFuelCycles';
import { useFuelAnchors } from '../../hooks/useFuelAnchors';

import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { PeriodWeekDropdown } from "../ui/PeriodWeekDropdown";
import { downloadBlob, jsonToCsv } from '../../utils/csv-helper';
import { FUEL_CSV_COLUMNS } from '../../types/csv-schemas';
import { Download } from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';
import { isEntryInInclusiveYmdRange, toEntryYmd } from '../../utils/fuelWeekPeriod';
import { resolveFuelEntrySource } from '../../utils/fuelEntrySource';
import { isJaaStatementLedgerRow } from '../../utils/jaaFuelStatementMatcher';
import { countsInFuelLogSpend } from '../../utils/fuelOpsEligibility';
import { resolveGasCardLedgerIntegrity } from '../../utils/fuelLedgerIntegrity';

/** Sort/display timestamp: live ISO `date` or admin `date` + `time`. */
function fuelEntrySortMs(e: { date?: string; time?: string | null }): number {
    const dateRaw = String(e.date || '');
    const timeRaw = String(e.time || '').trim();
    if (dateRaw.includes('T')) {
        const m = dateRaw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (m) {
            return new Date(
                Number(m[1]), Number(m[2]) - 1, Number(m[3]),
                Number(m[4]), Number(m[5]), Number(m[6] || 0),
            ).getTime();
        }
        const t = new Date(dateRaw).getTime();
        return Number.isNaN(t) ? 0 : t;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
        const [y, mo, d] = dateRaw.split('-').map(Number);
        const tm = timeRaw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        const hh = tm ? Number(tm[1]) : 0;
        const mm = tm ? Number(tm[2]) : 0;
        const ss = tm ? Number(tm[3] || 0) : 0;
        return new Date(y, mo - 1, d, hh, mm, ss).getTime();
    }
    if (!dateRaw) return 0;
    const t = new Date(dateRaw).getTime();
    return Number.isNaN(t) ? 0 : t;
}

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
    onDateRangeChange,
}: FuelLogTableProps) {
    const { can } = usePermissions();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<string>('all');
    const [filterVehicle, setFilterVehicle] = useState<string>('all');
    const [filterDriver, setFilterDriver] = useState<string>('all');
    const [filterAnchor, setFilterAnchor] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterSource, setFilterSource] = useState<string>('all');
    const [activeView, setActiveView] = useState<'transactions' | 'cycles'>('transactions');
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [viewingEntry, setViewingEntry] = useState<FuelEntry | null>(null);
    const [focusEntryId, setFocusEntryId] = useState<string | null>(null);

    // Soft-highlight row when navigating from Review → Logs
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem('fuel_logs_focus_entry');
            if (!raw) return;
            sessionStorage.removeItem('fuel_logs_focus_entry');
            if (raw.startsWith('{')) {
                const parsed = JSON.parse(raw) as { date?: string; vehicleId?: string };
                const match = entries.find((e) => {
                    const dateOk = !parsed.date || String(e.date || '').startsWith(String(parsed.date).slice(0, 10));
                    const vehOk = !parsed.vehicleId || e.vehicleId === parsed.vehicleId;
                    return dateOk && vehOk;
                });
                if (match?.id) setFocusEntryId(match.id);
            } else {
                setFocusEntryId(raw);
            }
            const t = window.setTimeout(() => setFocusEntryId(null), 8000);
            return () => window.clearTimeout(t);
        } catch {
            /* ignore */
        }
    }, [entries]);

    const periodStart = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined;
    const periodEnd = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined;

    // Phase 2: Cycle Mapping (server snapshot when available)
    const allCycles = useFuelCycles(entries, vehicles, {
        weekStart: periodStart,
        weekEnd: periodEnd,
    });
    
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
        filterStatus !== 'all',
        filterSource !== 'all'
    ].filter(Boolean).length;

    const clearFilters = () => {
        setFilterType('all');
        setFilterVehicle('all');
        setFilterDriver('all');
        setFilterAnchor('all');
        setFilterStatus('all');
        setFilterSource('all');
    };

    const isManualEntry = (entry: FuelEntry) => {
        if (validAnchorIds.has(entry.id)) return false;
        const tx = getLinkedTransaction(entry);
        const isManualType = entry.type === 'Manual_Entry' || entry.type === 'Fuel_Manual_Entry';
        const hasManualPortalType = entry.metadata?.portal_type === 'Manual_Entry' || tx?.metadata?.portal_type === 'Manual_Entry';
        const hasManualSource = entry.metadata?.source?.toLowerCase().includes('manual') || 
                               entry.metadata?.source?.toLowerCase().includes('fuel log') ||
                               (entry as FuelEntry & { source?: string }).source?.toLowerCase().includes('manual') ||
                               (entry as FuelEntry & { source?: string }).source?.toLowerCase().includes('fuel log') ||
                               tx?.metadata?.source?.toLowerCase().includes('manual') ||
                               tx?.metadata?.source?.toLowerCase().includes('fuel log');
        return isManualType || hasManualPortalType || hasManualSource;
    };

    // Authorship label — delegates to shared resolver (isManual ≠ admin)
    const resolveEntrySource = (entry: FuelEntry) => resolveFuelEntrySource(entry);

    const entrySourceLabel = (src: string): { label: string; color: string } => {
        switch (src) {
            case 'admin-manual': return { label: 'Admin Entry', color: 'bg-amber-50 text-amber-700 border-amber-200' };
            case 'admin-edit': return { label: 'Admin Edit', color: 'bg-violet-50 text-violet-700 border-violet-200' };
            case 'bulk-import': return { label: 'Imported', color: 'bg-slate-100 text-slate-600 border-slate-200' };
            case 'fuel-card': return { label: 'Fuel Card', color: 'bg-blue-50 text-blue-600 border-blue-200' };
            case 'driver-portal': return { label: 'Portal', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' };
            default: return { label: src, color: 'bg-slate-50 text-slate-500 border-slate-200' };
        }
    };

    const filteredEntries = entries.filter(entry => {
        // Statement ledger belongs on Card Inventory — never Transaction Logs
        if (isJaaStatementLedgerRow(entry)) return false;
        if (filterType !== 'all') {
            if (filterType === 'Fuel_Manual_Entry') {
                if (!isManualEntry(entry)) return false;
            } else if (entry.type !== filterType) return false;
        }
        if (filterVehicle !== 'all' && entry.vehicleId !== filterVehicle) return false;
        if (filterDriver !== 'all' && entry.driverId !== filterDriver) return false;
        if (filterAnchor === 'valid' && !validAnchorIds.has(entry.id)) return false;
        if (filterAnchor === 'invalid') {
            const isClose = entry.metadata?.isCapacityClose === true || entry.metadata?.isSoftAnchor === true;
            if (!isClose || validAnchorIds.has(entry.id)) return false;
        }
        if (filterSource !== 'all') {
            if (resolveEntrySource(entry) !== filterSource) return false;
        }
        if (filterStatus !== 'all') {
            const status = entry.reconciliationStatus || 'Pending';
            if (status !== filterStatus) return false;
        }
        if (dateRange?.from || dateRange?.to) {
            const startYmd = dateRange.from ? toEntryYmd(dateRange.from) : '0000-01-01';
            const endYmd = dateRange.to ? toEntryYmd(dateRange.to) : (dateRange.from ? toEntryYmd(dateRange.from) : '9999-12-31');
            if (!isEntryInInclusiveYmdRange(entry.date, startYmd, endYmd)) return false;
        }
        return (
            getVehicleName(entry.vehicleId).toLowerCase().includes(searchTerm.toLowerCase()) ||
            getDriverName(entry.driverId).toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.vendor?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }).sort((a, b) => {
        // Newest fill first — use combined date+time (not date-only midnight)
        const diff = fuelEntrySortMs(b) - fuelEntrySortMs(a);
        if (diff !== 0) return diff;
        return ((b.odometer as number) || 0) - ((a.odometer as number) || 0);
    });

    const ledgerIntegrity = useMemo(() => {
        // Wallet credits post only at weekly Finalize — debit-only is normal until then (and for gas-card).
        const integrityMap = new Map<string, 'Complete' | 'Partial' | 'Orphaned' | 'Pending'>();
        entries.forEach(entry => {
            if (!isManualEntry(entry)) return;
            const gasCardIntegrity = resolveGasCardLedgerIntegrity(entry);
            if (gasCardIntegrity) {
                integrityMap.set(entry.id, gasCardIntegrity);
                return;
            }
            if (entry.reconciliationStatus === 'Pending') {
                integrityMap.set(entry.id, 'Pending');
                return;
            }
            const related = transactions.filter(t => t.metadata?.sourceId === entry.id || t.id === entry.transactionId);
            const hasDebit = related.some(t => t.amount < 0);
            const hasCredit = related.some(t => t.amount > 0);
            if (hasDebit && hasCredit) integrityMap.set(entry.id, 'Complete');
            else if (hasDebit) integrityMap.set(entry.id, 'Pending'); // awaiting Finalize / gas-card — not imbalanced
            else if (hasCredit) integrityMap.set(entry.id, 'Partial');
            else integrityMap.set(entry.id, 'Orphaned');
        });
        return integrityMap;
    }, [entries, transactions]);

    const stats = useMemo(() => {
        const auditScopeEntries = entries.filter(entry => {
            if (isJaaStatementLedgerRow(entry)) return false;
            if (!dateRange?.from && !dateRange?.to) return true;
            const startYmd = dateRange.from ? toEntryYmd(dateRange.from) : '0000-01-01';
            const endYmd = dateRange.to ? toEntryYmd(dateRange.to) : (dateRange.from ? toEntryYmd(dateRange.from) : '9999-12-31');
            return isEntryInInclusiveYmdRange(entry.date, startYmd, endYmd);
        });
        const adminEntries = auditScopeEntries.filter(e => resolveEntrySource(e) === 'admin-manual');
        const adminEdits = auditScopeEntries.filter(e => resolveEntrySource(e) === 'admin-edit');
        const portalEntries = auditScopeEntries.filter(e => resolveEntrySource(e) === 'driver-portal');
        // Mutually exclusive volume chips: Portal / Admin / Anchors (admin-edit counted under Admin volume)
        const manualVolume = portalEntries.length;
        const adminVolume = adminEntries.length + adminEdits.length;
        const anchorEntries = auditScopeEntries.filter(e => validAnchorIds.has(e.id));
        const cycleScope = allCycles.filter(c => {
            if (!dateRange?.from && !dateRange?.to) return true;
            const startYmd = dateRange.from ? toEntryYmd(dateRange.from) : '0000-01-01';
            const endYmd = dateRange.to ? toEntryYmd(dateRange.to) : (dateRange.from ? toEntryYmd(dateRange.from) : '9999-12-31');
            return isEntryInInclusiveYmdRange(c.endDate, startYmd, endYmd);
        });
        const manualEntries = auditScopeEntries.filter(e => isManualEntry(e));
        return {
            manualCount: manualVolume,
            adminCount: adminVolume,
            adminEditCount: adminEdits.length,
            anchorCount: anchorEntries.length,
            totalSpend: auditScopeEntries
                .filter(countsInFuelLogSpend)
                .reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
            anchorTotalSpent: anchorEntries
                .filter(countsInFuelLogSpend)
                .reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
            imbalancedCount: manualEntries.filter(e => ledgerIntegrity.get(e.id) !== 'Complete' && ledgerIntegrity.get(e.id) !== 'Pending').length,
            completedCycles: cycleScope.filter(c => c.status === 'Complete').length,
            anomalyCycles: cycleScope.filter(
                (c) => c.signalTier === 'exception' || (c.status === 'Anomaly' && c.signalTier !== 'review'),
            ).length,
            activeCycles: cycleScope.filter(c => c.status === 'Active').length
        };
    }, [entries, validAnchorIds, dateRange, ledgerIntegrity, allCycles]);

    // Build per-vehicle timeline to compute previous odometer for each entry.
    // Skip JAA statement ledger rows (fees/declines/statement-only) — they have no
    // odo and must not blank out Δ Prev for real portal/admin fills.
    const prevOdometerMap = useMemo(() => {
        const map = new Map<string, { prevOdo: number | null; prevDate: string | null }>();
        const byVehicle: Record<string, FuelEntry[]> = {};
        for (const e of entries) {
            if (isJaaStatementLedgerRow(e)) continue;
            const vid = e.vehicleId || 'unknown';
            if (!byVehicle[vid]) byVehicle[vid] = [];
            byVehicle[vid].push(e);
        }
        const validOdo = (e: FuelEntry): number | null => {
            const n = Number(e.odometer);
            return Number.isFinite(n) && n > 0 ? n : null;
        };
        for (const vid of Object.keys(byVehicle)) {
            byVehicle[vid].sort((a, b) => {
                const dc = fuelEntrySortMs(a) - fuelEntrySortMs(b);
                if (dc !== 0) return dc;
                return ((a.odometer as number) || 0) - ((b.odometer as number) || 0);
            });
            for (let i = 0; i < byVehicle[vid].length; i++) {
                const entry = byVehicle[vid][i];
                let prevOdo: number | null = null;
                let prevDate: string | null = null;
                for (let j = i - 1; j >= 0; j--) {
                    const o = validOdo(byVehicle[vid][j]);
                    if (o != null) {
                        prevOdo = o;
                        prevDate = byVehicle[vid][j].date ?? null;
                        break;
                    }
                }
                map.set(entry.id, { prevOdo, prevDate });
            }
        }
        return map;
    }, [entries]);

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

    const getTypeIcon = (label: string) => {
        switch(label) {
            case 'Gas Card': return <CreditCard className="h-4 w-4 text-indigo-500" />;
            case 'Driver Cash': return <Banknote className="h-4 w-4 text-emerald-500" />;
            case 'RideShare Cash': return <Banknote className="h-4 w-4 text-orange-500" />;
            case 'Petty Cash': return <Banknote className="h-4 w-4 text-amber-500" />;
            case 'Reimbursement': return <HelpCircle className="h-4 w-4 text-slate-400" />;
            default: return <Fuel className="h-4 w-4 text-slate-500" />;
        }
    };

    const resolvePaymentLabel = (entry: FuelEntry): string => {
        const source = entry.metadata?.paymentSource || (entry as any).paymentSource;
        if (source) {
            const labelMap: Record<string, string> = {
                'driver_cash': 'Driver Cash',
                'rideshare_cash': 'RideShare Cash',
                'company_card': 'Gas Card',
                'petty_cash': 'Petty Cash',
                'Personal': 'Driver Cash',
                'RideShare_Cash': 'RideShare Cash',
                'Gas_Card': 'Gas Card',
                'Petty_Cash': 'Petty Cash',
                'Cash': 'Driver Cash',
                'RideShare Cash': 'RideShare Cash',
                'Gas Card': 'Gas Card',
                'Other': 'Petty Cash',
            };
            if (labelMap[source]) return labelMap[source];
        }
        switch (entry.type) {
            case 'Card_Transaction': return 'Gas Card';
            case 'Fuel_Manual_Entry':
            case 'Manual_Entry':
                // Gas Card Roam anchors use Manual_Entry + paymentSource Gas_Card
                if (entry.paymentSource === 'Gas_Card') return 'Gas Card';
                return 'Driver Cash';
            case 'Reimbursement': return 'Reimbursement';
            default: return entry.type?.replace(/_/g, ' ') || 'Unknown';
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        // If date-only string (YYYY-MM-DD), parse as local date to avoid UTC timezone shift
        if (dateString.includes('-') && dateString.length === 10) {
            const [y, m, d] = dateString.split('-').map(Number);
            return new Date(y, m - 1, d).toLocaleDateString();
        }
        // ISO datetime (YYYY-MM-DDTHH:mm:ss) — show calendar day in local time
        if (dateString.includes('T')) {
            const day = dateString.slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
                const [y, m, d] = day.split('-').map(Number);
                return new Date(y, m - 1, d).toLocaleDateString();
            }
        }
        return new Date(dateString).toLocaleDateString();
    };

    /**
     * Time for any fuel log:
     * - Admin anchors: separate `time` (HH:mm:ss)
     * - Live/portal reimbursements: embedded in `date` as ISO `YYYY-MM-DDTHH:mm:ss`
     */
    const formatEntryTime = (entry: { date?: string; time?: string | null }) => {
        const fromTimeField = (timeRaw?: string | null) => {
            if (!timeRaw) return null;
            const m = String(timeRaw).trim().match(/^(\d{1,2}):(\d{2})/);
            if (!m) return null;
            const h = Number(m[1]);
            const min = Number(m[2]);
            if (Number.isNaN(h) || h > 23 || Number.isNaN(min)) return null;
            const d = new Date();
            d.setHours(h, min, 0, 0);
            return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
        };

        const viaField = fromTimeField(entry.time);
        if (viaField) return viaField;

        const dateRaw = String(entry.date || '');
        const iso = dateRaw.match(/T(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (iso) {
            return fromTimeField(`${iso[1]}:${iso[2]}`);
        }
        return null;
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
                            <div><p className="text-xl font-bold text-slate-700">{stats.manualCount}</p><p className="text-[10px] text-slate-500">Portal</p></div>
                            <div className="h-8 w-px bg-slate-100 mx-1"></div>
                            <div><p className="text-xl font-bold text-emerald-600">{stats.anchorCount}</p><p className="text-[10px] text-slate-500">Anchors</p></div>
                            {stats.adminCount > 0 && (<>
                                <div className="h-8 w-px bg-slate-100 mx-1"></div>
                                <div><p className="text-xl font-bold text-amber-600">{stats.adminCount}</p><p className="text-[10px] text-slate-500">Admin</p></div>
                            </>)}
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
                                    <TooltipContent>
                                      <p className="text-[10px] max-w-[220px]">
                                        Real exceptions only (odometer regression, ledger imbalance, unmatched duplicates). Review-tier items are not counted here.
                                      </p>
                                    </TooltipContent>
                                </Tooltip>
                                <p className="text-[10px] text-slate-500">Exceptions</p>
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
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ledger Health</p>
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
                        {can('fuel.export') && (
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
                        )}
                        <Popover>
                            <PopoverTrigger asChild><Button variant="outline" size="sm" className="gap-2 h-9 border-dashed"><FilterIcon className="h-3.5 w-3.5" /> Filters</Button></PopoverTrigger>
                            <PopoverContent className="w-80"><div className="grid gap-2">
                                <Label>Vehicle</Label>
                                <Select value={filterVehicle} onValueChange={setFilterVehicle}>
                                    <SelectTrigger><SelectValue placeholder="All Vehicles" /></SelectTrigger>
                                    <SelectContent><SelectItem value="all">All Vehicles</SelectItem>{uniqueVehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                                </Select>
                                <Label>Entry Source</Label>
                                <Select value={filterSource} onValueChange={setFilterSource}>
                                    <SelectTrigger><SelectValue placeholder="All Sources" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Sources</SelectItem>
                                        <SelectItem value="driver-portal">Driver Portal</SelectItem>
                                        <SelectItem value="admin-manual">Admin Entry</SelectItem>
                                        <SelectItem value="admin-edit">Admin Edit</SelectItem>
                                        <SelectItem value="bulk-import">Bulk Import</SelectItem>
                                        <SelectItem value="fuel-card">Fuel Card</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-2 text-xs">Clear Filters</Button>
                            </div></PopoverContent>
                        </Popover>
                    </div>
                    {onDateRangeChange && (
                        <PeriodWeekDropdown
                            selectedStart={periodStart}
                            selectedEnd={periodEnd}
                            placeholder="Select week period"
                            buttonClassName="h-9 text-xs"
                            allowCustomRange
                            onSelect={(period) => {
                                const [sy, sm, sd] = period.startDate.split('-').map(Number);
                                const [ey, em, ed] = period.endDate.split('-').map(Number);
                                onDateRangeChange({
                                    from: new Date(sy, sm - 1, sd),
                                    to: new Date(ey, em - 1, ed),
                                });
                            }}
                        />
                    )}
                </div>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="gap-2 h-9 text-slate-600 border-slate-200 hover:text-indigo-600 hover:border-indigo-300 transition-colors shrink-0"
                                disabled={isRecalculating}
                                onClick={async () => {
                                    setIsRecalculating(true);
                                    try {
                                        const scopeId = filterVehicle !== 'all' ? filterVehicle : undefined;
                                        const result = await api.recalculateAllIntegrity(
                                            scopeId ? { vehicleId: scopeId } : undefined,
                                        );
                                        toast.success(scopeId ? 'Vehicle recalculation complete' : 'Fleet recalculation complete', {
                                            description: `Re-scored ${result?.entriesModified ?? 0} entries / ${result?.modified ?? 0} transactions (capacity full @ 98%). Refresh to see cycles.`
                                        });
                                    } catch (err) {
                                        console.error('[Recalculate] failed:', err);
                                        toast.error('Failed to recalculate cycles', {
                                            description: String(err)
                                        });
                                    } finally {
                                        setIsRecalculating(false);
                                    }
                                }}
                            >
                                <RotateCcw className={cn("h-3.5 w-3.5", isRecalculating && "animate-spin")} />
                                <span className="text-xs font-semibold">{isRecalculating ? 'Recalculating...' : 'Recalculate'}</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[240px]">
                            <p className="text-xs font-semibold">Recalculate Capacity Cycles</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Runs Fuel Audit recalculate-all (optional vehicle filter). Cycles close at 98% capacity with spillover; driver Full Tank removed.</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            <div className="rounded-md border bg-white overflow-hidden">
                {activeView === 'transactions' ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Paid By</TableHead>
                                <TableHead>Station</TableHead>
                                <TableHead>Vehicle</TableHead>
                                <TableHead>Driver</TableHead>
                                <TableHead>Vol (L)</TableHead>
                                <TableHead>Odo</TableHead>
                                <TableHead title="Pump-to-pump odometer change only — not Odometer History / Live Status">Δ Fuel</TableHead>
                                <TableHead>Cost ($)</TableHead>
                                <TableHead className="text-center">Audit</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredEntries.length === 0 ? <TableRow><TableCell colSpan={11} className="h-24 text-center">No transactions found</TableCell></TableRow> : 
                            filteredEntries.map(entry => {
                                const locationStatus = entry.metadata?.locationStatus || entry.locationStatus;
                                const confidenceScore = entry.metadata?.auditConfidenceScore;
                                const isHighlyTrusted = entry.metadata?.isHighlyTrusted || (confidenceScore !== undefined && confidenceScore >= 90);
                                const isLocked = entry.isLocked || entry.status === 'Finalized';
                                const entryTimeLabel = formatEntryTime(entry);

                                return (
                                <TableRow
                                    key={entry.id}
                                    className={cn(
                                        isLocked && "bg-slate-50/50",
                                        focusEntryId === entry.id && "bg-emerald-50 ring-2 ring-inset ring-emerald-300",
                                    )}
                                >
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                            <span>{formatDate(entry.date)}</span>
                                            {entryTimeLabel && (
                                                <span className="text-[10px] text-slate-500 font-medium tabular-nums">
                                                    {entryTimeLabel}
                                                </span>
                                            )}
                                            {resolveEntrySource(entry) !== 'driver-portal' && (() => {
                                                const src = entrySourceLabel(resolveEntrySource(entry));
                                                return (
                                                    <Badge variant="outline" className={cn("text-[8px] font-bold px-1 py-0 h-4 w-fit", src.color)}>
                                                        {src.label}
                                                    </Badge>
                                                );
                                            })()}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {getTypeIcon(resolvePaymentLabel(entry))}
                                            <span className="text-xs">{resolvePaymentLabel(entry)}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-semibold text-slate-700 truncate max-w-[140px]">
                                                    {entry.location || entry.vendor || entry.metadata?.stationName || "Unknown Station"}
                                                </span>
                                                {locationStatus === 'verified' && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="bg-blue-50 text-blue-600 p-0.5 rounded-full border border-blue-100 flex-shrink-0 animate-in zoom-in-95 duration-300">
                                                                <ShieldCheck className="h-2.5 w-2.5" />
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <div className="space-y-1">
                                                                <p className="text-[10px] font-bold">Verified Station</p>
                                                                <p className="text-[10px]">
                                                                    Mapped to Master Ledger via{' '}
                                                                    {(entry.metadata?.verificationMethod || 'gps').replace(/_/g, ' ')}.
                                                                </p>
                                                                {entry.metadata?.matchDistance !== undefined && (
                                                                    <p className="text-[10px] text-blue-500 font-medium">
                                                                        GPS offset from station anchor: {entry.metadata.matchDistance}m
                                                                        {entry.metadata?.radiusUsed != null && (
                                                                            <span className="block text-[9px] font-normal text-slate-500 mt-0.5">
                                                                                Reference radius (verification): ±{entry.metadata.radiusUsed}m
                                                                            </span>
                                                                        )}
                                                                    </p>
                                                                )}
                                                                {entry.metadata?.matchConfidence && (
                                                                    <p className="text-[10px] text-blue-400">Confidence: {entry.metadata.matchConfidence}</p>
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
                                                {locationStatus === 'review_required' && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="bg-amber-50 text-amber-600 p-0.5 rounded-full border border-amber-100 flex-shrink-0">
                                                                <AlertTriangle className="h-2.5 w-2.5" />
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <div className="space-y-1">
                                                                <p className="text-[10px] font-bold">Review Required</p>
                                                                <p className="text-[10px]">GPS match requires admin review — {entry.metadata?.ambiguityReason || 'multiple nearby stations detected'}.</p>
                                                                {entry.metadata?.matchDistance !== undefined && (
                                                                    <p className="text-[10px] text-amber-500 font-medium">
                                                                        Distance to nearest candidate: {entry.metadata.matchDistance}m
                                                                    </p>
                                                                )}
                                                                {entry.metadata?.verificationMethod === 'gps_ambiguous' && (
                                                                    <p className="text-[9px] text-slate-500">
                                                                        Roam ops will resolve the GPS match.
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}
                                                {(locationStatus === 'unknown' || !locationStatus) && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100 animate-pulse">
                                                                <AlertCircle className="h-2.5 w-2.5" />
                                                                <span className="text-[8px] font-bold uppercase tracking-tighter">Review Required</span>
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p className="text-[10px] font-bold">Unverified Location</p>
                                                            <p className="text-[10px]">
                                                                No verified station link yet — Roam ops will match this, or wait for a server match.
                                                            </p>
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
                                        {(() => {
                                            const vehicle = vehicles.find(v => v.id === entry.vehicleId);
                                            const tankCap = Number(vehicle?.specifications?.tankCapacity) || vehicle?.fuelSettings?.tankCapacity || 40;
                                            const fillPct = Math.min(100, ((entry.liters || 0) / tankCap) * 100);
                                            return (
                                                <div className="flex flex-col gap-1 min-w-[50px]">
                                                    <span className="text-xs font-medium">{entry.liters?.toFixed(1)} L</span>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="h-1.5 w-12 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50 cursor-help">
                                                                <div 
                                                                    className={cn(
                                                                        "h-full rounded-full transition-all duration-300",
                                                                        fillPct >= 90 ? "bg-emerald-500" :
                                                                        fillPct >= 50 ? "bg-blue-500" :
                                                                        fillPct >= 25 ? "bg-amber-500" :
                                                                        "bg-slate-300"
                                                                    )}
                                                                    style={{ width: `${fillPct}%` }}
                                                                />
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p className="text-[10px]">{fillPct.toFixed(0)}% of {tankCap}L tank capacity</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                            );
                                        })()}
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-xs font-semibold font-mono text-slate-800">
                                            {(entry.odometer as number) > 0
                                                ? Number(entry.odometer).toLocaleString()
                                                : '—'}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        {(() => {
                                            const prev = prevOdometerMap.get(entry.id);
                                            if (!prev || prev.prevOdo == null) return <span className="text-xs text-slate-300">—</span>;
                                            const curOdo = (entry.odometer as number) || 0;
                                            const isRegression = curOdo < prev.prevOdo;
                                            const delta = Math.abs(curOdo - prev.prevOdo);
                                            const isZeroDelta = !isRegression && delta === 0;
                                            return (
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-slate-400">{prev.prevOdo.toLocaleString()}</span>
                                                    <span className={`text-[10px] font-medium ${
                                                      isRegression ? 'text-red-600' : isZeroDelta ? 'text-amber-600' : 'text-green-600'
                                                    }`}>
                                                        {isRegression
                                                          ? `▼ ${delta.toLocaleString()}`
                                                          : isZeroDelta
                                                            ? '+0 same odo'
                                                            : `▲ +${delta.toLocaleString()}`}
                                                    </span>
                                                </div>
                                            );
                                        })()}
                                    </TableCell>
                                    <TableCell className="font-bold text-xs">
                                        {(entry.metadata as any)?.awaitingCardStatement
                                          ? <span className="text-amber-600 font-medium">Awaiting</span>
                                          : (entry.metadata as any)?.jaaRowKind === 'declined'
                                            ? <span className="text-rose-600 font-medium">Declined</span>
                                            : (entry.metadata as any)?.jaaRowKind === 'fee'
                                              ? <span className="text-slate-500">${(entry.amount ?? 0).toFixed(2)} fee</span>
                                              : `$${(entry.amount ?? 0).toFixed(2)}`}
                                    </TableCell>
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
                                                        {entry.metadata?.decisionReason && (
                                                            <p className="text-[10px] text-slate-500">
                                                                Decision: {String(entry.metadata.decisionReason).replace(/_/g, ' ')}
                                                            </p>
                                                        )}
                                                        
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
                                        <div className="flex justify-end">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600" title="Actions">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-40">
                                                    <DropdownMenuLabel className="text-[10px] text-slate-400 uppercase tracking-wider">Log Actions</DropdownMenuLabel>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => setViewingEntry(entry)} className="gap-2 text-xs cursor-pointer">
                                                        <Eye className="h-3.5 w-3.5 text-slate-500" />
                                                        View Details
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => onEdit(entry)} disabled={isLocked || !can('fuel.edit_entry')} className="gap-2 text-xs cursor-pointer">
                                                        <Pencil className="h-3.5 w-3.5 text-slate-500" />
                                                        Edit Log
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => onDelete(entry.id)} disabled={isLocked} className="gap-2 text-xs cursor-pointer text-red-600 focus:text-red-600">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                        Delete Log
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
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
                                const tankCap = Number(vehicle?.specifications?.tankCapacity) || vehicle?.fuelSettings?.tankCapacity || 40;
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
                                            {cycle.signalTier === 'exception' || cycle.status === 'Anomaly' ? (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Badge className="bg-rose-50 text-rose-700 border-rose-200 gap-1.5 cursor-help">
                                                            <AlertCircle className="h-3 w-3" />
                                                            EXCEPTION
                                                        </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-[200px]">
                                                        <div className="space-y-1">
                                                            <p className="font-bold text-xs text-rose-600">Cycle exception:</p>
                                                            <ul className="text-[10px] list-disc pl-4 space-y-0.5">
                                                                {cycle.closeReason && (
                                                                    <li>{String(cycle.closeReason).replace(/_/g, ' ')}</li>
                                                                )}
                                                                {cycle.isCapped && cycle.excessVolume && cycle.excessVolume > 5 && cycle.closeReason === 'tank_overfill' && (
                                                                    <li>Single-fill overfill ({cycle.excessVolume.toFixed(1)} L)</li>
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
                                             ) : cycle.trustTier === 'Soft' || cycle.trustTier === 'Capacity' || cycle.resetType === 'Auto_Soft' ? (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Badge className="bg-teal-50 text-teal-800 border-teal-200 gap-1 cursor-help">
                                                            CAPACITY FULL
                                                        </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-[220px]">
                                                        <p className="text-xs font-bold">Capacity full cycle close</p>
                                                        <p className="text-[10px] text-slate-300">Cumulative liters reached ~98% of tank. Spillover liters open the next cycle.</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                             ) : (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 cursor-help">
                                                            COMPLETE
                                                        </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-[220px]">
                                                        <p className="text-xs font-bold">Closed cycle</p>
                                                        <p className="text-[10px] text-slate-300">Cycle ended from capacity math (historical rows may still show older labels).</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                             )}
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
                                                    {cycle.isCapped && <Badge className="text-[8px] bg-amber-100 text-amber-700 border-amber-200">CAPPED @ 98%</Badge>}
                                                </div>
                                            </div>
                                        </div>
                                        <Table>
                                            <TableHeader className="bg-slate-50/50"><TableRow><TableHead className="h-8 text-[10px]">Date</TableHead><TableHead className="h-8 text-[10px]">Type</TableHead><TableHead className="h-8 text-[10px]">Contrib. Volume</TableHead><TableHead className="h-8 text-[10px]">Contrib. Cost</TableHead><TableHead className="h-8 text-[10px]">Odo</TableHead><TableHead className="h-8 text-[10px] text-right">Action</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {(cycle.transactions ?? []).map((tx, txIdx) => (
                                                    <TableRow key={`${tx.id}-${txIdx}`} className={cn("group hover:bg-slate-50", tx.isCarryover && "bg-blue-50/30")}>
                                                        <TableCell className="py-2 text-xs">
                                                            <div className="flex flex-col">
                                                                <span>{formatDate(tx.date)}</span>
                                                                {tx.isCarryover && <span className="text-[9px] text-blue-600 font-bold uppercase flex items-center gap-0.5"><RotateCcw className="h-2 w-2" /> Balance from Prev.</span>}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-2 text-xs"><div className="flex items-center gap-1">{getTypeIcon(String(tx.type || ''))}{String(tx.type || 'Fuel').replace(/_/g, ' ')}</div></TableCell>
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
                                                            {!tx.isCarryover && can('fuel.edit_entry') && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    disabled={!!(tx.isLocked || tx.status === 'Finalized')}
                                                                    title={tx.isLocked || tx.status === 'Finalized' ? 'Locked seal — edit disabled' : 'Edit log'}
                                                                    onClick={() => onEdit(tx)}
                                                                >
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

            {/* Detail View Overlay */}
            {viewingEntry && (() => {
                const entry = viewingEntry;
                const prev = prevOdometerMap.get(entry.id);
                const vehicle = vehicles.find(v => v.id === entry.vehicleId);
                const tankCap = Number(vehicle?.specifications?.tankCapacity) || vehicle?.fuelSettings?.tankCapacity || 40;
                const fillPct = Math.min(100, ((entry.liters || 0) / tankCap) * 100);
                const confidenceScore = entry.metadata?.auditConfidenceScore;
                const locationStatus = entry.metadata?.locationStatus || entry.locationStatus;
                const src = resolveEntrySource(entry);
                const srcLabel = entrySourceLabel(src);
                const curOdo = (entry.odometer as number) || 0;
                const delta = prev?.prevOdo != null ? Math.abs(curOdo - prev.prevOdo) : null;
                const isRegression = prev?.prevOdo != null ? curOdo < prev.prevOdo : false;

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setViewingEntry(null)}>
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                            {/* Header */}
                            <div className="bg-gradient-to-r from-slate-800 to-slate-700 p-5 text-white">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-white/15 rounded-lg p-2">
                                            <Fuel className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-base">Fuel Log Details</h3>
                                            <p className="text-slate-300 text-xs">{formatDate(entry.date)}{formatEntryTime(entry) ? ` at ${formatEntryTime(entry)}` : ''}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {src !== 'driver-portal' && (
                                            <Badge variant="outline" className={cn("text-[9px] font-bold border", srcLabel.color)}>{srcLabel.label}</Badge>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10" onClick={() => setViewingEntry(null)}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">
                                {/* Key Metrics Row */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="bg-emerald-50 rounded-lg p-3 text-center border border-emerald-100">
                                        <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider">Amount</p>
                                        <p className="text-lg font-bold text-emerald-700">${(entry.amount ?? 0).toFixed(2)}</p>
                                    </div>
                                    <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
                                        <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider">Volume</p>
                                        <p className="text-lg font-bold text-blue-700">{entry.liters?.toFixed(2) || '0'} L</p>
                                        <p className="text-[9px] text-blue-500">{fillPct.toFixed(0)}% of tank</p>
                                    </div>
                                    <div className="bg-violet-50 rounded-lg p-3 text-center border border-violet-100">
                                        <p className="text-[10px] text-violet-600 font-semibold uppercase tracking-wider">Price/L</p>
                                        <p className="text-lg font-bold text-violet-700">${(entry.pricePerLiter || (entry.amount && entry.liters ? entry.amount / entry.liters : 0)).toFixed(2)}</p>
                                    </div>
                                    <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-100">
                                        <p className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider">Fuel type</p>
                                        <p className="text-sm font-bold text-amber-900 leading-tight break-words">
                                          {String(
                                            entry.fuelType ||
                                              (entry.metadata as any)?.jaaFuelType ||
                                              '—',
                                          )}
                                        </p>
                                    </div>
                                </div>

                                {/* Detail Rows */}
                                <div className="space-y-1 divide-y divide-slate-100">
                                    <DetailRow icon={<MapPin className="h-3.5 w-3.5 text-slate-400" />} label="Station" value={
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-medium text-slate-800">{entry.vendor || entry.metadata?.stationName || 'Unknown'}</span>
                                            {locationStatus === 'verified' && <ShieldCheck className="h-3 w-3 text-blue-500" />}
                                            {locationStatus === 'learnt' && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                                        </div>
                                    } />
                                    {entry.location && (
                                        <DetailRow icon={<MapPin className="h-3.5 w-3.5 text-slate-400" />} label="Address" value={
                                            <span className="text-slate-600 text-xs">{entry.location}</span>
                                        } />
                                    )}
                                    <DetailRow icon={<Fuel className="h-3.5 w-3.5 text-slate-400" />} label="Vehicle" value={
                                        <span className="font-medium">{getVehicleName(entry.vehicleId)}</span>
                                    } />
                                    <DetailRow icon={<Hash className="h-3.5 w-3.5 text-slate-400" />} label="Driver" value={
                                        <span className="font-medium">{getDriverName(entry.driverId)}</span>
                                    } />
                                    <DetailRow icon={<CreditCard className="h-3.5 w-3.5 text-slate-400" />} label="Paid By" value={
                                        <div className="flex items-center gap-2">
                                            {getTypeIcon(resolvePaymentLabel(entry))}
                                            <span className="text-xs">{resolvePaymentLabel(entry)}</span>
                                        </div>
                                    } />
                                    <DetailRow icon={<Gauge className="h-3.5 w-3.5 text-slate-400" />} label="Odometer" value={
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold text-sm">{curOdo > 0 ? curOdo.toLocaleString() : '—'} km</span>
                                            {delta != null && (
                                                <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", isRegression ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600')}>
                                                    {isRegression ? `▼ ${delta.toLocaleString()}` : `▲ +${delta.toLocaleString()}`}
                                                </span>
                                            )}
                                        </div>
                                    } />
                                    {prev?.prevOdo != null && (
                                        <DetailRow icon={<History className="h-3.5 w-3.5 text-slate-400" />} label="Prev Odo" value={
                                            <span className="font-mono text-xs text-slate-500">{prev.prevOdo.toLocaleString()} km</span>
                                        } />
                                    )}
                                    <DetailRow icon={<Clock className="h-3.5 w-3.5 text-slate-400" />} label="Entry Type" value={
                                        <span className="text-xs">{entry.type || 'Unknown'}</span>
                                    } />
                                    {entry.entryMode && (
                                        <DetailRow icon={<Link2 className="h-3.5 w-3.5 text-slate-400" />} label="Entry Mode" value={
                                            <Badge variant="outline" className="text-[9px]">{entry.entryMode}</Badge>
                                        } />
                                    )}
                                </div>

                                {/* Audit Confidence */}
                                {confidenceScore !== undefined && (
                                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Audit Confidence</span>
                                            <Badge className={cn(
                                                "text-[9px] border-none",
                                                confidenceScore >= 90 ? "bg-emerald-500 text-white" :
                                                confidenceScore >= 70 ? "bg-blue-500 text-white" :
                                                "bg-amber-500 text-white"
                                            )}>{confidenceScore}%</Badge>
                                        </div>
                                        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                            <div className={cn(
                                                "h-full rounded-full transition-all",
                                                confidenceScore >= 90 ? "bg-emerald-500" :
                                                confidenceScore >= 70 ? "bg-blue-500" :
                                                "bg-amber-500"
                                            )} style={{ width: `${confidenceScore}%` }} />
                                        </div>
                                        {entry.metadata?.auditConfidenceBreakdown && (
                                            <div className="grid grid-cols-5 gap-2 mt-2 text-center">
                                                {[
                                                    { label: 'GPS', val: entry.metadata.auditConfidenceBreakdown.gps, max: 30 },
                                                    { label: 'Prox', val: entry.metadata.auditConfidenceBreakdown.gps_bonus, max: 5 },
                                                    { label: 'Crypto', val: entry.metadata.auditConfidenceBreakdown.crypto, max: 25 },
                                                    { label: 'Phys', val: entry.metadata.auditConfidenceBreakdown.physical, max: 25 },
                                                    { label: 'Behav', val: entry.metadata.auditConfidenceBreakdown.behavioral, max: 20 },
                                                ].map(b => (
                                                    <div key={b.label} className="text-[9px]">
                                                        <span className="text-slate-400">{b.label}</span>
                                                        <p className="font-bold text-slate-700">{b.val ?? 0}/{b.max}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Notes */}
                                {entry.notes && (
                                    <div className="bg-amber-50/50 rounded-lg p-3 border border-amber-100">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <FileText className="h-3 w-3 text-amber-500" />
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Notes</span>
                                        </div>
                                        <p className="text-xs text-slate-700">{entry.notes}</p>
                                    </div>
                                )}

                                {/* Metadata footer */}
                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                    <span className="text-[9px] text-slate-400 font-mono truncate max-w-[240px]">ID: {entry.id}</span>
                                    {entry.isLocked && (
                                        <div className="flex items-center gap-1 text-emerald-600">
                                            <ShieldCheck className="h-3 w-3" />
                                            <span className="text-[9px] font-bold">LOCKED</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="border-t border-slate-100 p-4 flex justify-between items-center bg-slate-50/50">
                                {can('fuel.edit_entry') && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs gap-1.5"
                                    disabled={!!(entry.isLocked || entry.status === 'Finalized')}
                                    title={entry.isLocked || entry.status === 'Finalized' ? 'Locked seal — edit disabled' : undefined}
                                    onClick={() => { setViewingEntry(null); onEdit(entry); }}
                                >
                                    <Pencil className="h-3 w-3" /> Edit This Log
                                </Button>
                                )}
                                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setViewingEntry(null)}>
                                    Close
                                </Button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center py-2.5 gap-3">
            {icon}
            <span className="text-xs text-slate-500 w-20 shrink-0">{label}</span>
            <div className="flex-1 text-sm">{value}</div>
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