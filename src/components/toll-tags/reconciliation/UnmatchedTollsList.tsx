import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { format } from "date-fns";
import { FinancialTransaction, Trip } from "../../../types/data";
import { EditTollModal } from "./EditTollModal";
import { formatInFleetTz, useFleetTimezone } from '../../../utils/timezoneDisplay';
import { MatchResult } from "../../../utils/tollReconciliation";
import { SuggestedMatchCard } from "./SuggestedMatchCard";
import { ManualMatchModal } from "./ManualMatchModal";
import { TollDetailOverlay } from "./TollDetailOverlay";
import { Search, CheckCircle2, Sparkles, Camera, Tag, User, MoreHorizontal, FileText, Briefcase, UserMinus, ChevronDown, AlertTriangle, Gauge, Pencil, HelpCircle, DollarSign, Route, CarFront } from "lucide-react";

type UnmatchedSubTab = 'needs-review' | 'underpaid' | 'deadhead' | 'personal-use';

interface UnmatchedTollsListProps {
  tolls: FinancialTransaction[];
  suggestions: Map<string, MatchResult[]>;
  onReconcile: (tx: FinancialTransaction, trip: Trip) => void;
  // We need all trips for manual search
  allTrips: Trip[];
  onOpenDispute?: (tx: FinancialTransaction, match: MatchResult) => void;
  onApprove?: (tx: FinancialTransaction) => void;
  onReject?: (tx: FinancialTransaction) => void;
  onFlag?: (tx: FinancialTransaction) => void;
  onManualResolve?: (tx: FinancialTransaction, type: 'Personal' | 'WriteOff' | 'Business') => void;
  onEdit?: (transactionId: string, updates: Record<string, any>) => Promise<void>;
}

export function UnmatchedTollsList({ tolls, suggestions, onReconcile, allTrips, onOpenDispute, onApprove, onReject, onFlag, onManualResolve, onEdit }: UnmatchedTollsListProps) {
    const [hiddenSuggestions, setHiddenSuggestions] = useState<Set<string>>(new Set());
    const [selectedTxForManual, setSelectedTxForManual] = useState<FinancialTransaction | null>(null);
    const [sourceFilter, setSourceFilter] = useState<'all' | 'tag' | 'cash'>('all');
    const [visibleSmartMatches, setVisibleSmartMatches] = useState(10);
    const [visibleOtherTolls, setVisibleOtherTolls] = useState(25);
    const [activeSubTab, setActiveSubTab] = useState<UnmatchedSubTab>('needs-review');
    const fleetTz = useFleetTimezone();

    // Detail overlay state
    const [detailTx, setDetailTx] = useState<FinancialTransaction | null>(null);
    const [detailMatch, setDetailMatch] = useState<MatchResult | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    // Edit modal state
    const [editTx, setEditTx] = useState<FinancialTransaction | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);

    // Custom dropdown state (replaces Radix DropdownMenu which crashes in Figma Make iframe)
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

    // Filter tolls based on source
    const filteredTolls = useMemo(() => {
        return tolls.filter(tx => {
            const isCash = tx.paymentMethod === 'Cash' || !!tx.receiptUrl;
            if (sourceFilter === 'tag') return !isCash;
            if (sourceFilter === 'cash') return isCash;
            return true;
        });
    }, [tolls, sourceFilter]);

    // Phase 3: Classify tolls into sub-tab buckets based on best match type
    const classified = useMemo(() => {
        const buckets: Record<UnmatchedSubTab, FinancialTransaction[]> = {
            'needs-review': [],
            'underpaid': [],
            'deadhead': [],
            'personal-use': [],
        };
        filteredTolls.forEach(tx => {
            const best = suggestions.get(tx.id)?.[0];
            if (!best) {
                buckets['needs-review'].push(tx);
                return;
            }
            switch (best.matchType) {
                case 'AMOUNT_VARIANCE':
                    buckets['underpaid'].push(tx);
                    break;
                case 'DEADHEAD_MATCH':
                    buckets['deadhead'].push(tx);
                    break;
                case 'PERSONAL_MATCH':
                    if (best.reason?.includes('Approach')) {
                        buckets['deadhead'].push(tx);
                    } else {
                        buckets['personal-use'].push(tx);
                    }
                    break;
                case 'POSSIBLE_MATCH':
                default:
                    buckets['needs-review'].push(tx);
                    break;
            }
        });
        return buckets;
    }, [filteredTolls, suggestions]);

    // Reset visible counts when sub-tab changes
    useEffect(() => {
        setVisibleSmartMatches(10);
        setVisibleOtherTolls(25);
    }, [activeSubTab]);

    // Group trips by vehicle for time-based driver inference
    // This allows us to handle shared vehicles (Day/Night shifts) accurately
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
        
        // Find the trip closest in time to this toll
        // This ensures accuracy even if drivers swap vehicles
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
        
        if (!match) {
             // Custom dropdown for Unmatched items (Radix DropdownMenu crashes in Figma Make iframe)
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
            if (onApprove) {
                 return <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onApprove(tx)}>Approve</Button>;
            }
        }
        
        // Tag Logic
        return (
            <Button size="sm" variant="outline" onClick={() => onReconcile(tx, match.trip)}>
                Link
            </Button>
        );
    };

    if (tolls.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4" />
                <h3 className="text-lg font-medium text-slate-900">All Tolls Reconciled</h3>
                <p>Great job! No unmatched toll transactions found.</p>
            </div>
        );
    }

    // Separate tolls into those with visible matches and others
    // Phase 4: Scope to active sub-tab bucket instead of all filteredTolls
    const activeTabTolls = classified[activeSubTab];

    const smartMatches = activeTabTolls.filter(tx => {
        const matches = suggestions.get(tx.id);
        const best = matches?.[0];
        // Phase 3: Use confidenceScore >= 50 when available, fall back to old logic
        const hasHighScore = best?.confidenceScore != null ? best.confidenceScore >= 50 : (
            best?.confidence === 'high' || 
            best?.matchType === 'DEADHEAD_MATCH' || 
            best?.matchType === 'PERSONAL_MATCH'
        );
        return best && hasHighScore && !hiddenSuggestions.has(tx.id);
    });

    const otherTolls = activeTabTolls.filter(tx => !smartMatches.includes(tx));

    const getMatchBadge = (match: MatchResult) => {
        switch (match.matchType) {
            case 'PERFECT_MATCH':
                return <Badge className="bg-emerald-500 hover:bg-emerald-600">Reimbursed</Badge>;
            case 'DEADHEAD_MATCH':
                return <Badge className="bg-blue-500 hover:bg-blue-600">Deadhead</Badge>;
            case 'AMOUNT_VARIANCE':
                return <Badge className="bg-orange-500 hover:bg-orange-600">Underpaid</Badge>;
            case 'PERSONAL_MATCH':
                if (match.reason?.includes('Approach')) {
                    return <Badge className="bg-purple-600 hover:bg-purple-700">Unreimbursed</Badge>;
                }
                return <Badge className="bg-purple-500 hover:bg-purple-600">Personal</Badge>;
            default:
                return <Badge variant="secondary">{match.confidence === 'medium' ? 'Possible Match' : 'Low Confidence'}</Badge>;
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-emerald-600';
        if (score >= 50) return 'text-amber-600';
        return 'text-rose-600';
    };

    return (
        <div className="space-y-6">
            
            {/* Phase 3: Sub-tab bar */}
            <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-1">
                {([
                    { key: 'needs-review' as UnmatchedSubTab, label: 'Needs Review', icon: HelpCircle, color: 'text-amber-600 border-amber-500 bg-amber-50' },
                    { key: 'underpaid' as UnmatchedSubTab, label: 'Underpaid', icon: DollarSign, color: 'text-orange-600 border-orange-500 bg-orange-50' },
                    { key: 'deadhead' as UnmatchedSubTab, label: 'Deadhead', icon: Route, color: 'text-blue-600 border-blue-500 bg-blue-50' },
                    { key: 'personal-use' as UnmatchedSubTab, label: 'Personal Use', icon: CarFront, color: 'text-purple-600 border-purple-500 bg-purple-50' },
                ] as const).map(tab => {
                    const count = classified[tab.key].length;
                    const isActive = activeSubTab === tab.key;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveSubTab(tab.key)}
                            className={`
                                flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md border-b-2 transition-all
                                ${isActive
                                    ? `${tab.color} border-current`
                                    : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50'
                                }
                            `}
                        >
                            <Icon className="h-4 w-4" />
                            <span>{tab.label}</span>
                            <span className={`
                                ml-1 text-[11px] font-semibold rounded-full px-1.5 py-0.5 min-w-[20px] text-center
                                ${isActive
                                    ? 'bg-white/80 text-current'
                                    : 'bg-slate-100 text-slate-500'
                                }
                            `}>
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Phase 4: Per-sub-tab empty state */}
            {activeTabTolls.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                    {activeSubTab === 'needs-review' && (
                        <>
                            <HelpCircle className="h-10 w-10 text-amber-300 mb-3" />
                            <h3 className="text-base font-medium text-slate-700">No tolls pending review</h3>
                            <p className="text-sm">All tolls have been classified into other categories.</p>
                        </>
                    )}
                    {activeSubTab === 'underpaid' && (
                        <>
                            <DollarSign className="h-10 w-10 text-orange-300 mb-3" />
                            <h3 className="text-base font-medium text-slate-700">No underpaid tolls found</h3>
                            <p className="text-sm">All platform reimbursements match the actual toll amounts.</p>
                        </>
                    )}
                    {activeSubTab === 'deadhead' && (
                        <>
                            <Route className="h-10 w-10 text-blue-300 mb-3" />
                            <h3 className="text-base font-medium text-slate-700">No deadhead tolls found</h3>
                            <p className="text-sm">No unreimbursed business driving tolls detected.</p>
                        </>
                    )}
                    {activeSubTab === 'personal-use' && (
                        <>
                            <CarFront className="h-10 w-10 text-purple-300 mb-3" />
                            <h3 className="text-base font-medium text-slate-700">No personal use tolls detected</h3>
                            <p className="text-sm">No tolls were classified as personal driver use.</p>
                        </>
                    )}
                </div>
            ) : (
                <>
            {/* Smart Matches Section */}
            {smartMatches.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center space-x-2 text-indigo-600">
                        <Sparkles className="h-5 w-5" />
                        <h3 className="font-semibold">Smart Suggestions ({smartMatches.length})</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        {smartMatches.slice(0, visibleSmartMatches).map(tx => {
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
                                    onClickDetail={() => openDetail(tx, match)}
                                />
                            );
                        })}
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

            {/* Standard List */}
            {activeSubTab === 'needs-review' && (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-4">
                    <div className="space-y-1">
                        <CardTitle>Unmatched Tolls</CardTitle>
                        <CardDescription>Toll provider charges that haven't been linked to a specific trip.</CardDescription>
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
                            {otherTolls.slice(0, visibleOtherTolls).map(tx => {
                                const bestMatch = suggestions.get(tx.id)?.[0];
                                const hasHiddenMatch = hiddenSuggestions.has(tx.id);
                                const vehicleId = tx.vehiclePlate || tx.vehicleId || '';
                                const inferredDriver = getInferredDriver(vehicleId, tx.date);
                                const displayDriver = tx.driverName || bestMatch?.trip.driverName || inferredDriver;

                                return (
                                    <TableRow key={tx.id} className="cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => openDetail(tx, bestMatch || undefined)}>
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
                                                    <a href={tx.receiptUrl} target="_blank" rel="noopener noreferrer" className="cursor-pointer hover:opacity-80 transition-opacity">
                                                        <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 transition-colors">
                                                            <Camera className="w-3 h-3 mr-1" /> Receipt
                                                        </Badge>
                                                    </a>
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
                                                <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50">Likely Personal</Badge>
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
                        </TableBody>
                    </Table>
                    {visibleOtherTolls < otherTolls.length && (
                        <div className="flex items-center justify-center pt-4 border-t mt-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setVisibleOtherTolls(prev => prev + 25)}
                                className="text-slate-600 hover:text-slate-900"
                            >
                                <ChevronDown className="h-4 w-4 mr-1" />
                                Show More ({visibleOtherTolls} of {otherTolls.length})
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
            )}
                </>
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