import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  AlertTriangle,
  Briefcase,
  CalendarRange,
  ChevronDown,
  FileText,
  Gauge,
  MoreHorizontal,
  Pencil,
  Search,
  Sparkles,
  Tag,
  User,
  UserMinus,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { FinancialTransaction, Trip } from "../../../types/data";
import { EditTollModal } from "./EditTollModal";
import { formatInFleetTz, useFleetTimezone } from '../../../utils/timezoneDisplay';
import { MatchResult } from "../../../utils/tollReconciliation";
import { SuggestedMatchCard } from "./SuggestedMatchCard";
import { ManualMatchModal } from "./ManualMatchModal";
import { TollDetailOverlay } from "./TollDetailOverlay";
import { EvidenceExpiryBadge } from '../../evidence/EvidenceExpiryBadge';
import { resolveEvidenceMediaState } from '../../evidence/evidenceState';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { groupTollsByWeek } from "../../../utils/tollWeekPeriod";

/**
 * Shared per-bucket toll list renderer, factored out of the old
 * UnmatchedTollsList (which mixed this rendering with its own sub-tab bar +
 * live-match bucketing). Now reused by the Needs Review / Personal Use /
 * Deadhead steps in ReconciliationDashboard — each just hands it a
 * pre-filtered `tolls` list and its own empty-state copy, instead of the
 * rendering being duplicated three times or gated behind an internal
 * sub-tab switch.
 */

export interface TollBucketPanelProps {
  tolls: FinancialTransaction[];
  suggestions: Map<string, MatchResult[]>;
  onReconcile: (tx: FinancialTransaction, trip: Trip) => void;
  allTrips: Trip[];
  onOpenDispute?: (tx: FinancialTransaction, match: MatchResult) => void;
  onApprove?: (tx: FinancialTransaction) => void;
  onReject?: (tx: FinancialTransaction) => void;
  onFlag?: (tx: FinancialTransaction) => void;
  onManualResolve?: (tx: FinancialTransaction, type: 'Personal' | 'WriteOff' | 'Business') => void;
  onEdit?: (transactionId: string, updates: Record<string, any>) => Promise<void>;
  emptyState: { icon: LucideIcon; title: string; description: string };
  listTitle?: string;
  listDescription?: string;
  /** Deadhead's "Approve"/"Link" already correctly reconciles it as a
   *  fleet-absorbed cost with no driver charge — this just relabels the
   *  button for clarity in that step, without changing behavior. */
  approveLabel?: string;
  /** Deadhead-only: bill this toll to the driver instead of the fleet absorbing it. */
  onChargeDriver?: (tx: FinancialTransaction, match: MatchResult) => void;
}

export function TollBucketPanel({
  tolls, suggestions, onReconcile, allTrips, onApprove, onReject, onFlag, onManualResolve, onEdit,
  emptyState, listTitle = 'Tolls', listDescription = "Toll provider charges that haven't been linked to a specific trip.",
  approveLabel = 'Approve', onChargeDriver,
}: TollBucketPanelProps) {
    const [hiddenSuggestions, setHiddenSuggestions] = useState<Set<string>>(new Set());
    const [selectedTxForManual, setSelectedTxForManual] = useState<FinancialTransaction | null>(null);
    const [sourceFilter, setSourceFilter] = useState<'all' | 'tag' | 'cash'>('all');
    const [visibleSmartMatches, setVisibleSmartMatches] = useState(10);
    const [visibleWeekCount, setVisibleWeekCount] = useState(12);
    const fleetTz = useFleetTimezone();

    const [detailTx, setDetailTx] = useState<FinancialTransaction | null>(null);
    const [detailMatch, setDetailMatch] = useState<MatchResult | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const [editTx, setEditTx] = useState<FinancialTransaction | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);

    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpenDropdownId(null);
            }
        };
        if (openDropdownId) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openDropdownId]);

    // Reset visible counts when the underlying bucket changes (parent swaps `tolls`).
    useEffect(() => {
        setVisibleSmartMatches(10);
        setVisibleWeekCount(12);
    }, [tolls]);

    const openDetail = (tx: FinancialTransaction, match?: MatchResult) => {
        setDetailTx(tx);
        setDetailMatch(match || null);
        setIsDetailOpen(true);
    };

    const closeDetail = () => {
        setIsDetailOpen(false);
        setDetailTx(null);
        setDetailMatch(null);
    };

    const openEdit = (tx: FinancialTransaction) => {
        setEditTx(tx);
        setIsEditOpen(true);
    };

    const closeEdit = () => {
        setIsEditOpen(false);
        setEditTx(null);
    };

    const filteredTolls = useMemo(() => {
        return tolls.filter(tx => {
            const isCash = tx.paymentMethod === 'Cash' || !!tx.receiptUrl;
            if (sourceFilter === 'tag') return !isCash;
            if (sourceFilter === 'cash') return isCash;
            return true;
        });
    }, [tolls, sourceFilter]);

    const tripsByVehicle = useMemo(() => {
        const map = new Map<string, Trip[]>();
        allTrips.forEach(t => {
            if (!t.vehicleId || !t.driverName) return;
            const list = map.get(t.vehicleId) || [];
            list.push(t);
            map.set(t.vehicleId, list);
        });
        return map;
    }, [allTrips]);

    const getInferredDriver = (plate: string, dateStr: string) => {
        if (!plate) return null;
        const trips = tripsByVehicle.get(plate);
        if (!trips || trips.length === 0) return null;

        const tollTime = new Date(dateStr).getTime();
        let closestDriver = null;
        let minDiff = Infinity;

        for (const trip of trips) {
             const tripTime = new Date(trip.requestTime).getTime();
             const diff = Math.abs(tripTime - tollTime);
             if (diff < minDiff) {
                 minDiff = diff;
                 closestDriver = trip.driverName;
             }
        }
        return closestDriver;
    };

    const handleDismiss = (txId: string) => {
        setHiddenSuggestions(prev => new Set(prev).add(txId));
    };

    const renderActionButtons = (tx: FinancialTransaction, match?: MatchResult) => {
        const isClaim = tx.paymentMethod === 'Cash' || !!tx.receiptUrl;
        const isOrphan = !!match && !match.trip?.id;

        if (!match || isOrphan) {
             const isOpen = openDropdownId === tx.id;
             return (
                <div className="relative flex items-center justify-end gap-2" ref={isOpen ? dropdownRef : undefined}>
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => setOpenDropdownId(isOpen ? null : tx.id)}>
                        Resolve <MoreHorizontal className="h-3 w-3" />
                    </Button>
                    {isOpen && (
                        <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-md border bg-white shadow-md py-1">
                            <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">Manual Resolution</div>
                            <div className="h-px bg-slate-200 mx-1 my-1" />
                            <button className="flex w-full items-center px-2 py-1.5 text-sm hover:bg-slate-100 rounded-sm" onClick={() => { setOpenDropdownId(null); setSelectedTxForManual(tx); }}>
                                <Search className="mr-2 h-4 w-4" /> Find Match...
                            </button>
                            <div className="h-px bg-slate-200 mx-1 my-1" />
                            <button className="flex w-full items-center px-2 py-1.5 text-sm hover:bg-slate-100 rounded-sm" onClick={() => { setOpenDropdownId(null); onManualResolve?.(tx, 'Personal'); }}>
                                <UserMinus className="mr-2 h-4 w-4 text-orange-600" /> Personal (Driver Pays)
                            </button>
                            <button className="flex w-full items-center px-2 py-1.5 text-sm hover:bg-slate-100 rounded-sm" onClick={() => { setOpenDropdownId(null); onManualResolve?.(tx, 'WriteOff'); }}>
                                <FileText className="mr-2 h-4 w-4 text-blue-600" /> Write Off (Fleet Pays)
                            </button>
                            <button className="flex w-full items-center px-2 py-1.5 text-sm hover:bg-slate-100 rounded-sm" onClick={() => { setOpenDropdownId(null); onManualResolve?.(tx, 'Business'); }}>
                                <Briefcase className="mr-2 h-4 w-4 text-slate-600" /> Business Expense
                            </button>
                            {onEdit && (
                                <>
                                    <div className="h-px bg-slate-200 mx-1 my-1" />
                                    <button className="flex w-full items-center px-2 py-1.5 text-sm hover:bg-slate-100 rounded-sm" onClick={() => { setOpenDropdownId(null); openEdit(tx); }}>
                                        <Pencil className="mr-2 h-4 w-4 text-indigo-600" /> Edit Transaction
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            );
        }

        if (isClaim) {
            if (match.matchType === 'AMOUNT_VARIANCE' && onFlag) {
                 return <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => onFlag(tx)}>Flag</Button>;
            }
            if (match.matchType === 'PERSONAL_MATCH' && onReject) {
                 return <Button size="sm" className="bg-rose-600 hover:bg-rose-700" onClick={() => onReject(tx)}>Reject</Button>;
            }
            if (match.matchType === 'DEADHEAD_MATCH' && onChargeDriver) {
                 return (
                     <div className="flex items-center justify-end gap-2">
                         {onApprove && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onApprove(tx)}>{approveLabel}</Button>}
                         <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50" onClick={() => onChargeDriver(tx, match)}>Charge Driver</Button>
                     </div>
                 );
            }
            if (onApprove) {
                 return <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onApprove(tx)}>{approveLabel}</Button>;
            }
        }

        return (
            <Button size="sm" variant="outline" onClick={() => onReconcile(tx, match.trip)}>
                Link
            </Button>
        );
    };

    const smartMatches = filteredTolls.filter(tx => {
        const matches = suggestions.get(tx.id);
        const best = matches?.[0];
        const isOrphan = best && !best.trip?.id;
        const hasHighScore = best?.confidenceScore != null ? best.confidenceScore >= 50 : (
            best?.confidence === 'high' ||
            best?.matchType === 'DEADHEAD_MATCH' ||
            best?.matchType === 'PERSONAL_MATCH'
        );
        return best && hasHighScore && !isOrphan && !hiddenSuggestions.has(tx.id);
    });

    const otherTolls = filteredTolls.filter(tx => !smartMatches.includes(tx));

    const smartWeekGroups = useMemo(
        () => groupTollsByWeek(smartMatches.slice(0, visibleSmartMatches), fleetTz),
        [smartMatches, visibleSmartMatches, fleetTz]
    );

    const otherWeekGroups = useMemo(() => groupTollsByWeek(otherTolls, fleetTz), [otherTolls, fleetTz]);
    const visibleOtherWeekGroups = otherWeekGroups.slice(0, visibleWeekCount);

    const getMatchBadge = (match: MatchResult) => {
        switch (match.matchType) {
            case 'PERFECT_MATCH':
                return <Badge className="bg-emerald-500 hover:bg-emerald-600">Reimbursed</Badge>;
            case 'DEADHEAD_MATCH':
                return <Badge className="bg-blue-500 hover:bg-blue-600">Deadhead</Badge>;
            case 'AMOUNT_VARIANCE':
                return <Badge className="bg-orange-500 hover:bg-orange-600">Underpaid</Badge>;
            case 'PERSONAL_MATCH': {
                const isApproach = match.reasonCode
                    ? match.reasonCode === 'ENROUTE_APPROACH'
                    : match.reason?.includes('Approach');
                if (isApproach) {
                    return <Badge className="bg-purple-600 hover:bg-purple-700">Unreimbursed</Badge>;
                }
                return <Badge className="bg-purple-500 hover:bg-purple-600">Personal</Badge>;
            }
            default:
                return <Badge variant="secondary">{match.confidence === 'medium' ? 'Possible Match' : 'Low Confidence'}</Badge>;
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-emerald-600';
        if (score >= 50) return 'text-amber-600';
        return 'text-rose-600';
    };

    if (tolls.length === 0) {
        const EmptyIcon = emptyState.icon;
        return (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <EmptyIcon className="h-10 w-10 text-slate-300 mb-3" />
                <h3 className="text-base font-medium text-slate-700">{emptyState.title}</h3>
                <p className="text-sm">{emptyState.description}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {smartMatches.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center space-x-2 text-indigo-600">
                        <Sparkles className="h-5 w-5" />
                        <h3 className="font-semibold">Smart Suggestions ({smartMatches.length})</h3>
                    </div>
                    <div className="space-y-3">
                        {smartWeekGroups.map((week) => (
                            <Collapsible key={week.key} defaultOpen={false} className="group rounded-xl border border-indigo-200/80 bg-indigo-50/50 dark:bg-indigo-950/25 dark:border-indigo-800/50 overflow-hidden shadow-sm">
                                <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-indigo-100/60 dark:hover:bg-indigo-900/40 transition-colors">
                                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                        <CalendarRange className="h-4 w-4 text-indigo-600 shrink-0" />
                                        <span className="font-semibold text-slate-800 dark:text-slate-100">{week.label}</span>
                                        <span className="text-[10px] uppercase tracking-wide text-slate-500">Mon–Sun</span>
                                        <Badge variant="secondary" className="text-[11px]">{week.items.length} toll{week.items.length !== 1 ? 's' : ''}</Badge>
                                    </div>
                                    <ChevronDown className="h-4 w-4 text-slate-500 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-0 group-data-[state=closed]:-rotate-90" />
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <div className="grid grid-cols-1 gap-4 px-4 pb-4 pt-0 border-t border-indigo-100/80 dark:border-indigo-800/50">
                                        {week.items.map(tx => {
                                            const match = suggestions.get(tx.id)![0];
                                            return (
                                                <SuggestedMatchCard
                                                    key={tx.id}
                                                    transaction={tx}
                                                    match={match}
                                                    onConfirm={() => onReconcile(tx, match.trip)}
                                                    onDismiss={() => handleDismiss(tx.id)}
                                                    onApprove={onApprove ? () => onApprove(tx) : undefined}
                                                    onReject={onReject ? () => onReject(tx) : undefined}
                                                    onFlag={onFlag ? () => onFlag(tx) : undefined}
                                                    onChargeDriver={onChargeDriver ? () => onChargeDriver(tx, match) : undefined}
                                                    onClickDetail={() => openDetail(tx, match)}
                                                />
                                            );
                                        })}
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        ))}
                    </div>
                    {visibleSmartMatches < smartMatches.length && (
                        <div className="flex items-center justify-center">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setVisibleSmartMatches(prev => prev + 10)}
                                className="text-slate-600 hover:text-slate-900"
                            >
                                <ChevronDown className="h-4 w-4 mr-1" />
                                Show More ({visibleSmartMatches} of {smartMatches.length})
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {filteredTolls.length > 0 && (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-4">
                    <div className="space-y-1">
                        <CardTitle>{listTitle}</CardTitle>
                        <CardDescription>{listDescription}</CardDescription>
                    </div>
                    <div className="w-[180px]">
                        <Select value={sourceFilter} onValueChange={(v: any) => setSourceFilter(v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter Source" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Sources</SelectItem>
                                <SelectItem value="tag">Tag Imports Only</SelectItem>
                                <SelectItem value="cash">Cash Claims Only</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Vehicle</TableHead>
                                <TableHead>Driver</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {otherTolls.length === 0 ? (
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={6} className="text-center text-slate-500 py-10 text-sm">
                                        No tolls in this list — remaining items may appear under Smart Suggestions above.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                visibleOtherWeekGroups.map((week) => (
                                    <TableRow key={week.key} className="border-0 hover:bg-transparent">
                                        <TableCell colSpan={6} className="p-0 align-top">
                                            <Collapsible defaultOpen={false} className="group border-b border-slate-200 last:border-b-0">
                                                <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-2 py-3 text-left bg-slate-50/80 dark:bg-slate-900/40 hover:bg-slate-100/90 dark:hover:bg-slate-800/50 transition-colors">
                                                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                                        <CalendarRange className="h-4 w-4 text-slate-500 shrink-0" />
                                                        <span className="font-semibold text-slate-800 dark:text-slate-100">{week.label}</span>
                                                        <span className="text-[10px] uppercase tracking-wide text-slate-500">Mon–Sun</span>
                                                        <Badge variant="secondary" className="text-[11px]">{week.items.length} toll{week.items.length !== 1 ? 's' : ''}</Badge>
                                                    </div>
                                                    <ChevronDown className="h-4 w-4 text-slate-500 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-0 group-data-[state=closed]:-rotate-90" />
                                                </CollapsibleTrigger>
                                                <CollapsibleContent>
                                                    <table className="w-full text-sm caption-bottom">
                                                        <tbody className="[&_tr:last-child]:border-0">
                                                            {week.items.map(tx => {
                                                                const bestMatch = suggestions.get(tx.id)?.[0];
                                                                const hasHiddenMatch = hiddenSuggestions.has(tx.id);
                                                                const vehicleId = tx.vehiclePlate || tx.vehicleId || '';
                                                                const inferredDriver = getInferredDriver(vehicleId, tx.date);
                                                                const displayDriver = tx.driverName || bestMatch?.trip.driverName || inferredDriver;

                                                                return (
                                                                    <TableRow key={tx.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors" onClick={() => openDetail(tx, bestMatch || undefined)}>
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
                                                                                                <span className={`font-medium ${isFutureDate ? 'text-red-600' : ''}`}>{formatInFleetTz(validDate, fleetTz, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                                                                <span className="text-xs text-slate-500">{formatInFleetTz(validDate, fleetTz, { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
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
                                                                            <div className="flex items-center space-x-2">
                                                                                <div className="flex items-center">
                                                                                    <Tag className="w-3 h-3 mr-1 text-slate-400" />
                                                                                    <span>{vehicleId || <span className="text-slate-400">Unknown</span>}</span>
                                                                                </div>
                                                                                {tx.receiptUrl && (
                                                                                    <EvidenceExpiryBadge
                                                                                      state={resolveEvidenceMediaState({
                                                                                        imageUrl: tx.receiptUrl,
                                                                                        evidenceExpired: tx.metadata?.evidenceExpired,
                                                                                        evidenceDeleteAfter: tx.metadata?.evidenceDeleteAfter,
                                                                                        parentStatus: tx.status,
                                                                                      })}
                                                                                      deleteAfter={tx.metadata?.evidenceDeleteAfter}
                                                                                    />
                                                                                )}
                                                                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-indigo-600" onClick={(e) => { e.stopPropagation(); openEdit(tx); }}>
                                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                                </Button>
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            {displayDriver ? (
                                                                                <div className="flex items-center group relative">
                                                                                    {!tx.driverName && (
                                                                                        <User className="w-3 h-3 mr-1.5 text-slate-400" />
                                                                                    )}
                                                                                    <span className={`text-sm font-medium ${tx.driverName ? 'text-slate-700' : 'text-slate-600'}`}>
                                                                                        {displayDriver}
                                                                                    </span>
                                                                                    {!tx.driverName && (
                                                                                        <span className="ml-2 hidden group-hover:inline-block text-[10px] text-slate-400 bg-slate-100 px-1 rounded">
                                                                                            (Inferred)
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <span className="text-slate-400 font-normal italic">Unassigned</span>
                                                                            )}
                                                                        </TableCell>
                                                                        <TableCell className="font-medium text-rose-600">
                                                                            -${Math.abs(tx.amount).toFixed(2)}
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            {bestMatch && !hasHiddenMatch ? (
                                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                                    {getMatchBadge(bestMatch)}
                                                                                    {bestMatch.confidenceScore != null && (
                                                                                        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${getScoreColor(bestMatch.confidenceScore)}`} title={`Confidence score: ${bestMatch.confidenceScore}/100`}>
                                                                                            <Gauge className="h-3 w-3" />
                                                                                            {bestMatch.confidenceScore}
                                                                                        </span>
                                                                                    )}
                                                                                    {bestMatch.isAmbiguous && (
                                                                                        <span title="Ambiguous — multiple trips compete with similar scores">
                                                                                            <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <Badge variant="outline" className="text-slate-600 border-slate-300 bg-slate-50">Unclassified</Badge>
                                                                            )}
                                                                        </TableCell>
                                                                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                                                            {hasHiddenMatch ? (
                                                                                <Button size="sm" variant="ghost" disabled>Dismissed</Button>
                                                                            ) : (
                                                                                renderActionButtons(tx, bestMatch)
                                                                            )}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </CollapsibleContent>
                                            </Collapsible>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    {otherTolls.length > 0 && visibleWeekCount < otherWeekGroups.length && (
                        <div className="flex items-center justify-center pt-4 border-t mt-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setVisibleWeekCount(prev => prev + 8)}
                                className="text-slate-600 hover:text-slate-900"
                            >
                                <ChevronDown className="h-4 w-4 mr-1" />
                                Show more weeks ({visibleWeekCount} of {otherWeekGroups.length})
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
            )}

            <ManualMatchModal
                isOpen={!!selectedTxForManual}
                onClose={() => setSelectedTxForManual(null)}
                transaction={selectedTxForManual}
                allTrips={allTrips}
                onConfirmMatch={(trip) => {
                    if (selectedTxForManual) {
                        onReconcile(selectedTxForManual, trip);
                        setSelectedTxForManual(null);
                    }
                }}
            />

            <TollDetailOverlay
                isOpen={isDetailOpen}
                onClose={closeDetail}
                transaction={detailTx}
                match={detailMatch}
                onConfirm={detailTx && detailMatch ? () => {
                    onReconcile(detailTx, detailMatch.trip);
                    closeDetail();
                } : undefined}
                onDismiss={() => {
                    if (detailTx) handleDismiss(detailTx.id);
                    closeDetail();
                }}
                onApprove={detailTx && onApprove ? () => {
                    onApprove(detailTx);
                    closeDetail();
                } : undefined}
                onReject={detailTx && onReject ? () => {
                    onReject(detailTx);
                    closeDetail();
                } : undefined}
                onFlag={detailTx && onFlag ? () => {
                    onFlag(detailTx);
                    closeDetail();
                } : undefined}
                onChargeDriver={detailTx && detailMatch && onChargeDriver ? () => {
                    onChargeDriver(detailTx, detailMatch);
                    closeDetail();
                } : undefined}
            />

            <EditTollModal
                isOpen={isEditOpen}
                onClose={closeEdit}
                transaction={editTx}
                onSave={onEdit || (async () => {})}
            />
        </div>
    );
}
