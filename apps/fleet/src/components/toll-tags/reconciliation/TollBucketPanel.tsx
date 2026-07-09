import React, { useState, useMemo, useEffect } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { FinancialTransaction, Trip } from "../../../types/data";
import { EditTollModal } from "./EditTollModal";
import { formatInFleetTz, useFleetTimezone } from '../../../utils/timezoneDisplay';
import { MatchResult } from "../../../utils/tollReconciliation";
import { isTripLinkConfirmed, isOrphanPersonalMatch, personalMatchReasonLabel } from "../../../utils/tollBucket";
import { SuggestedMatchCard } from "./SuggestedMatchCard";
import { ManualMatchModal } from "./ManualMatchModal";
import { CompetingTripsPickerDialog } from "./CompetingTripsPickerDialog";
import { TollDetailOverlay } from "./TollDetailOverlay";
import { EvidenceExpiryBadge } from '../../evidence/EvidenceExpiryBadge';
import { resolveEvidenceMediaState } from '../../evidence/evidenceState';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../ui/tooltip";
import { groupTollsByWeek } from "../../../utils/tollWeekPeriod";
import { resolveTollDisplayDriverName } from "@roam/types/driverIdentity";

function needsTripPick(tx: FinancialTransaction, match?: MatchResult): boolean {
  return !!(match?.isAmbiguous && !isTripLinkConfirmed(tx));
}

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
  /** Personal step: fleet covers cost (reimburse receipt or write off tag). */
  onAcceptPersonal?: (tx: FinancialTransaction) => void;
  onManualResolve?: (tx: FinancialTransaction, type: 'Personal' | 'WriteOff' | 'Business') => void;
  onEdit?: (transactionId: string, updates: Record<string, any>) => Promise<void>;
  drivers?: Array<{ id: string; name?: string; driverName?: string; firstName?: string; lastName?: string; uberDriverId?: string; inDriveDriverId?: string }>;
  emptyState: { icon: LucideIcon; title: string; description: string };
  listTitle?: string;
  listDescription?: string;
  /** Deadhead's "Approve"/"Link" already correctly reconciles it as a
   *  fleet-absorbed cost with no driver charge — this just relabels the
   *  button for clarity in that step, without changing behavior. */
  approveLabel?: string;
  /** Deadhead-only: bill this toll to the driver instead of the fleet absorbing it. */
  onChargeDriver?: (tx: FinancialTransaction, match: MatchResult) => void;
  /** Personal-use step: charge driver for orphan or trip-linked personal tolls. */
  onChargePersonal?: (tx: FinancialTransaction, match?: MatchResult) => void;
  /** Wizard step — controls orphan card surfacing and status labels. */
  stepId?: 'needs-review' | 'personal-use' | 'deadhead';
  /** Period wizard: one card + one list (no duplicate week headers / stacked smart zone). */
  unifiedPeriodView?: boolean;
  /** Shown inside empty state when the wizard step is complete. */
  advancePrompt?: React.ReactNode;
}

export function TollBucketPanel({
  tolls, suggestions, onReconcile, allTrips, onApprove, onReject, onFlag, onManualResolve, onEdit, drivers = [],
  emptyState, listTitle = 'Tolls', listDescription = "Toll provider charges that haven't been linked to a specific trip.",
  approveLabel = 'Approve', onChargeDriver, onChargePersonal, onAcceptPersonal, stepId, unifiedPeriodView = false, advancePrompt,
}: TollBucketPanelProps) {
    const [selectedTxForManual, setSelectedTxForManual] = useState<FinancialTransaction | null>(null);
    const [competingPickTx, setCompetingPickTx] = useState<FinancialTransaction | null>(null);
    const [sourceFilter, setSourceFilter] = useState<'all' | 'tag' | 'cash'>('all');
    const [visibleSmartMatches, setVisibleSmartMatches] = useState(10);
    const [visibleWeekCount, setVisibleWeekCount] = useState(12);
    const fleetTz = useFleetTimezone();

    const [detailTx, setDetailTx] = useState<FinancialTransaction | null>(null);
    const [detailMatch, setDetailMatch] = useState<MatchResult | null>(null);
    const [detailMatches, setDetailMatches] = useState<MatchResult[]>([]);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const [editTx, setEditTx] = useState<FinancialTransaction | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);

    // Reset visible counts when the underlying bucket changes (parent swaps `tolls`).
    useEffect(() => {
        setVisibleSmartMatches(10);
        setVisibleWeekCount(12);
    }, [tolls]);

    const openDetail = (tx: FinancialTransaction, match?: MatchResult, allMatches?: MatchResult[]) => {
        setDetailTx(tx);
        setDetailMatch(match || null);
        setDetailMatches(allMatches ?? (match ? [match] : []));
        setIsDetailOpen(true);
    };

    const closeDetail = () => {
        setIsDetailOpen(false);
        setDetailTx(null);
        setDetailMatch(null);
        setDetailMatches([]);
    };

    const openEdit = (tx: FinancialTransaction) => {
        setEditTx(tx);
        setIsEditOpen(true);
    };

    const closeEdit = () => {
        setIsEditOpen(false);
        setEditTx(null);
    };

    const openCompetingPicker = (tx: FinancialTransaction) => {
        setCompetingPickTx(tx);
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

    const renderActionButtons = (tx: FinancialTransaction, match?: MatchResult) => {
        const isClaim = tx.paymentMethod === 'Cash' || !!tx.receiptUrl;
        const isOrphan = !!match && isOrphanPersonalMatch(match);
        const tripPickRequired = needsTripPick(tx, match);

        if (tripPickRequired && match) {
            return (
                <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 border-indigo-400 bg-indigo-50 text-indigo-900 hover:bg-indigo-100 font-semibold"
                    onClick={() => openCompetingPicker(tx)}
                >
                    <Search className="h-3 w-3" /> Find match manually
                </Button>
            );
        }

        if (!match || isOrphan) {
             return (
                <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    {stepId === 'personal-use' && isOrphan && onChargePersonal && (
                        <Button
                            size="sm"
                            className="bg-rose-600 hover:bg-rose-700"
                            onClick={() => onChargePersonal(tx, match)}
                        >
                            Charge Driver
                        </Button>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-2">
                                Resolve <MoreHorizontal className="h-3 w-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 z-[200]">
                            <DropdownMenuLabel>Manual Resolution</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setSelectedTxForManual(tx)}>
                                <Search className="mr-2 h-4 w-4" /> Find Match...
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onManualResolve?.(tx, 'Personal')}>
                                <UserMinus className="mr-2 h-4 w-4 text-orange-600" /> Personal (Driver Pays)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onManualResolve?.(tx, 'WriteOff')}>
                                <FileText className="mr-2 h-4 w-4 text-blue-600" /> Write Off (Fleet Pays)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onManualResolve?.(tx, 'Business')}>
                                <Briefcase className="mr-2 h-4 w-4 text-slate-600" /> Business Expense
                            </DropdownMenuItem>
                            {onEdit && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => openEdit(tx)}>
                                        <Pencil className="mr-2 h-4 w-4 text-indigo-600" /> Edit Transaction
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            );
        }

        if (isClaim) {
            if (match.matchType === 'AMOUNT_VARIANCE' && onFlag) {
                 if (tripPickRequired) {
                     return (
                         <TooltipProvider>
                             <Tooltip>
                                 <TooltipTrigger asChild>
                                     <span><Button size="sm" disabled className="cursor-not-allowed">Flag</Button></span>
                                 </TooltipTrigger>
                                 <TooltipContent><p>Pick the correct trip first</p></TooltipContent>
                             </Tooltip>
                         </TooltipProvider>
                     );
                 }
                 return <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => onFlag(tx)}>Flag</Button>;
            }
            if (match.matchType === 'PERSONAL_MATCH') {
                 return (
                     <div className="flex items-center justify-end gap-2">
                         {onAcceptPersonal && (
                             <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onAcceptPersonal(tx)}>
                                 {isClaim ? 'Approve' : 'Fleet Pays'}
                             </Button>
                         )}
                         {isClaim && onReject && (
                             <Button size="sm" variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50" onClick={() => onReject(tx)}>
                                 Reject
                             </Button>
                         )}
                         {!isClaim && onChargePersonal && (
                             <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50" onClick={() => onChargePersonal(tx, match)}>
                                 Charge Driver
                             </Button>
                         )}
                     </div>
                 );
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
            <div className="flex items-center justify-end gap-2">
                {match.matchType === 'PERSONAL_MATCH' && onAcceptPersonal && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onAcceptPersonal(tx)}>
                        Fleet Pays
                    </Button>
                )}
                <Button
                    size="sm"
                    className={match.matchType === 'PERSONAL_MATCH' ? 'border-purple-300 text-purple-700 hover:bg-purple-50' : undefined}
                    variant={match.matchType === 'PERSONAL_MATCH' ? 'outline' : 'outline'}
                    onClick={() => {
                        if (match.matchType === 'PERSONAL_MATCH' && onChargePersonal) {
                            onChargePersonal(tx, match);
                        } else {
                            onReconcile(tx, match.trip);
                        }
                    }}
                >
                    {match.matchType === 'PERSONAL_MATCH' ? 'Charge Driver' : 'Link'}
                </Button>
            </div>
        );
    };

    const orphanSmartMatches = stepId === 'personal-use'
        ? filteredTolls.filter((tx) => {
            const best = suggestions.get(tx.id)?.[0];
            return best && isOrphanPersonalMatch(best);
        })
        : [];

    const smartMatches = filteredTolls.filter(tx => {
        const matches = suggestions.get(tx.id);
        const best = matches?.[0];
        if (best && isOrphanPersonalMatch(best)) return false;
        const hasHighScore = best?.confidenceScore != null ? best.confidenceScore >= 50 : (
            best?.confidence === 'high' ||
            best?.matchType === 'DEADHEAD_MATCH' ||
            best?.matchType === 'PERSONAL_MATCH'
        );
        return best && hasHighScore;
    });

    const visibleSmart = smartMatches.slice(0, visibleSmartMatches);
    const ambiguousSmartMatches = visibleSmart.filter(tx => needsTripPick(tx, suggestions.get(tx.id)?.[0]));
    const normalSmartMatches = visibleSmart.filter(tx => !needsTripPick(tx, suggestions.get(tx.id)?.[0]));

    const otherTolls = filteredTolls.filter(
        (tx) => !smartMatches.includes(tx) && !orphanSmartMatches.includes(tx),
    );

    const renderSmartMatchCards = (items: FinancialTransaction[]) => (
        smartWeekGroupsFor(items).map((week) => (
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
                        {week.items.map((tx) => (
                            <div key={tx.id}>{renderSuggestedMatchCard(tx)}</div>
                        ))}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        ))
    );

    const smartWeekGroupsFor = (items: FinancialTransaction[]) =>
        groupTollsByWeek(items, fleetTz);

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
                return (
                    <Badge className="bg-purple-500 hover:bg-purple-600">
                        {personalMatchReasonLabel(match.reasonCode, match.reason)}
                    </Badge>
                );
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

    const renderSuggestedMatchCard = (tx: FinancialTransaction, orphanMode = false) => {
        const matches = suggestions.get(tx.id) ?? [];
        const match = matches[0];
        if (!match) return null;
        return (
            <SuggestedMatchCard
                transaction={tx}
                match={match}
                allMatches={matches}
                orphanMode={orphanMode}
                onConfirm={() => {
                    if (orphanMode && onChargePersonal) {
                        onChargePersonal(tx, match);
                    } else if (match.matchType === 'PERSONAL_MATCH' && onChargePersonal) {
                        onChargePersonal(tx, match);
                    } else {
                        onReconcile(tx, match.trip);
                    }
                }}
                onApprove={onApprove ? () => onApprove(tx) : undefined}
                onReject={onReject ? () => onReject(tx) : undefined}
                onAcceptPersonal={onAcceptPersonal ? () => onAcceptPersonal(tx) : undefined}
                onFlag={onFlag ? () => onFlag(tx) : undefined}
                onChargeDriver={onChargeDriver ? () => onChargeDriver(tx, match) : undefined}
                onClickDetail={() => openDetail(tx, match, matches)}
                onSelectTrip={(trip) => onReconcile(tx, trip)}
                onFindMatch={() => openCompetingPicker(tx)}
            />
        );
    };

    const renderTollDataRow = (tx: FinancialTransaction) => {
        const txMatches = suggestions.get(tx.id) ?? [];
        const bestMatch = txMatches[0];
        const vehicleId = tx.vehiclePlate || tx.vehicleId || '';
        const inferredDriver = getInferredDriver(vehicleId, tx.date);
        const profileDriver = drivers.length > 0 ? resolveTollDisplayDriverName(tx, drivers) : '';
        const displayDriver = profileDriver || tx.driverName || bestMatch?.trip.driverName || inferredDriver;

        return (
            <TableRow key={tx.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors" onClick={() => openDetail(tx, bestMatch || undefined, txMatches)}>
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
                            } catch {
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
                            {!tx.driverName && <User className="w-3 h-3 mr-1.5 text-slate-400" />}
                            <span className={`text-sm font-medium ${tx.driverName ? 'text-slate-700' : 'text-slate-600'}`}>{displayDriver}</span>
                            {!tx.driverName && (
                                <span className="ml-2 hidden group-hover:inline-block text-[10px] text-slate-400 bg-slate-100 px-1 rounded">(Inferred)</span>
                            )}
                        </div>
                    ) : (
                        <span className="text-slate-400 font-normal italic">Unassigned</span>
                    )}
                </TableCell>
                <TableCell className="font-medium text-rose-600">-${Math.abs(tx.amount).toFixed(2)}</TableCell>
                <TableCell>
                    {bestMatch ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {getMatchBadge(bestMatch)}
                            {bestMatch.confidenceScore != null && (
                                <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${getScoreColor(bestMatch.confidenceScore)}`} title={`Confidence score: ${bestMatch.confidenceScore}/100`}>
                                    <Gauge className="h-3 w-3" />
                                    {bestMatch.confidenceScore}
                                </span>
                            )}
                            {bestMatch.isAmbiguous && (
                                <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50">Ambiguous — pick trip</Badge>
                            )}
                            {bestMatch.isAmbiguous && (
                                <span title="Ambiguous — multiple trips compete with similar scores">
                                    <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                                </span>
                            )}
                        </div>
                    ) : (
                        <Badge variant="outline" className="text-slate-600 border-slate-300 bg-slate-50">
                            {stepId === 'personal-use' ? 'Personal — confirm' : 'Unclassified'}
                        </Badge>
                    )}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {renderActionButtons(tx, bestMatch)}
                </TableCell>
            </TableRow>
        );
    };

    const overlayModals = (
        <>
            <CompetingTripsPickerDialog
                isOpen={!!competingPickTx}
                onClose={() => setCompetingPickTx(null)}
                transaction={competingPickTx}
                matches={competingPickTx ? (suggestions.get(competingPickTx.id) ?? []) : []}
                onSelectTrip={(trip) => {
                    if (competingPickTx) {
                        onReconcile(competingPickTx, trip);
                        setCompetingPickTx(null);
                    }
                }}
            />
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
                allMatches={detailMatches}
                onConfirm={detailTx && detailMatch && !needsTripPick(detailTx, detailMatch) ? () => {
                    onReconcile(detailTx, detailMatch.trip);
                    closeDetail();
                } : undefined}
                onApprove={detailTx && onApprove ? () => {
                    onApprove(detailTx);
                    closeDetail();
                } : undefined}
                onReject={detailTx && onReject ? () => {
                    onReject(detailTx);
                    closeDetail();
                } : undefined}
                onAcceptPersonal={detailTx && onAcceptPersonal ? () => {
                    onAcceptPersonal(detailTx);
                    closeDetail();
                } : undefined}
                onFlag={detailTx && onFlag && detailMatch && !needsTripPick(detailTx, detailMatch) ? () => {
                    onFlag(detailTx);
                    closeDetail();
                } : undefined}
                onChargeDriver={detailTx && detailMatch && onChargeDriver ? () => {
                    onChargeDriver(detailTx, detailMatch);
                    closeDetail();
                } : undefined}
                onSelectTrip={detailTx ? (trip) => {
                    onReconcile(detailTx, trip);
                    closeDetail();
                } : undefined}
                onFindMatch={detailTx && detailMatch && needsTripPick(detailTx, detailMatch) ? () => {
                    closeDetail();
                    openCompetingPicker(detailTx);
                } : undefined}
            />
            <EditTollModal
                isOpen={isEditOpen}
                onClose={closeEdit}
                transaction={editTx}
                onSave={onEdit || (async () => {})}
            />
        </>
    );

    if (tolls.length === 0) {
        const EmptyIcon = emptyState.icon;
        const emptyBody = (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <EmptyIcon className="h-10 w-10 text-slate-300 mb-3" />
                <h3 className="text-base font-medium text-slate-700">{emptyState.title}</h3>
                <p className="text-sm text-center max-w-md">{emptyState.description}</p>
                {advancePrompt}
            </div>
        );

        if (unifiedPeriodView) {
            return (
                <>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-4">
                            <div className="space-y-1">
                                <CardTitle>{listTitle}</CardTitle>
                                <CardDescription>{listDescription}</CardDescription>
                            </div>
                            <div className="w-[180px]">
                                <Select value={sourceFilter} onValueChange={(v: 'all' | 'tag' | 'cash') => setSourceFilter(v)}>
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
                        <CardContent>{emptyBody}</CardContent>
                    </Card>
                    {overlayModals}
                </>
            );
        }

        return emptyBody;
    }

    if (unifiedPeriodView) {
        const visibleSmartTolls = [...ambiguousSmartMatches, ...normalSmartMatches];

        return (
            <>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-4">
                        <div className="space-y-1">
                            <CardTitle>{listTitle}</CardTitle>
                            <CardDescription>{listDescription}</CardDescription>
                        </div>
                        <div className="w-[180px]">
                            <Select value={sourceFilter} onValueChange={(v: 'all' | 'tag' | 'cash') => setSourceFilter(v)}>
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
                    <CardContent className="space-y-4">
                        {orphanSmartMatches.length > 0 && (
                            <div className="space-y-3 w-full min-w-0">
                                <div className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50/60 px-3 py-2 text-purple-900 text-sm">
                                    <Sparkles className="h-4 w-4 shrink-0" />
                                    <span className="font-semibold">No trips match these tolls.</span>
                                </div>
                                {orphanSmartMatches.map((tx) => (
                                    <div key={tx.id} className="w-full min-w-0">
                                        {renderSuggestedMatchCard(tx, true)}
                                    </div>
                                ))}
                            </div>
                        )}
                        {visibleSmartTolls.length > 0 && (
                            <Collapsible defaultOpen className="group rounded-xl border border-slate-200 bg-slate-50/40 overflow-hidden">
                                <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-100/80 transition-colors">
                                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                        <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
                                        <span className="font-semibold text-slate-800">
                                            Smart suggestions ({visibleSmartTolls.length})
                                        </span>
                                    </div>
                                    <ChevronDown className="h-4 w-4 text-slate-500 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                </CollapsibleTrigger>
                                <CollapsibleContent className="px-4 pb-4 space-y-4 border-t border-slate-200/80">
                                    {normalSmartMatches.length > 0 && ambiguousSmartMatches.length === 0 && (
                                        <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-indigo-800 text-sm mt-3">
                                            <Sparkles className="h-4 w-4 shrink-0" />
                                            <span className="font-semibold">Ready to link ({normalSmartMatches.length})</span>
                                        </div>
                                    )}
                                    <div className="space-y-3 w-full min-w-0">
                                        {visibleSmartTolls.map((tx) => (
                                            <div key={tx.id} className="w-full min-w-0">
                                                {renderSuggestedMatchCard(tx)}
                                            </div>
                                        ))}
                                    </div>
                                    {visibleSmartMatches < smartMatches.length && (
                                        <div className="flex items-center justify-center pt-2 border-t border-slate-200">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setVisibleSmartMatches((prev) => prev + 10)}
                                                className="text-slate-600 hover:text-slate-900"
                                            >
                                                <ChevronDown className="h-4 w-4 mr-1" />
                                                Show more suggestions ({visibleSmartMatches} of {smartMatches.length})
                                            </Button>
                                        </div>
                                    )}
                                </CollapsibleContent>
                            </Collapsible>
                        )}
                        {otherTolls.length > 0 && (
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
                                    {otherTolls.map((tx) => renderTollDataRow(tx))}
                                </TableBody>
                            </Table>
                        )}
                        {filteredTolls.length === 0 && (
                            <p className="text-center text-slate-500 py-8 text-sm">No tolls match the current filter.</p>
                        )}
                    </CardContent>
                </Card>
                {overlayModals}
            </>
        );
    }

    return (
        <div className="space-y-6">
            {smartMatches.length > 0 && (
                <div className="space-y-6">
                    {ambiguousSmartMatches.length > 0 && (
                        <div className="space-y-3">
                            {renderSmartMatchCards(ambiguousSmartMatches)}
                        </div>
                    )}
                    {normalSmartMatches.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center space-x-2 text-indigo-600">
                                <Sparkles className="h-5 w-5" />
                                <h3 className="font-semibold">Smart Suggestions ({normalSmartMatches.length})</h3>
                            </div>
                            <div className="space-y-3">
                                {renderSmartMatchCards(normalSmartMatches)}
                            </div>
                        </div>
                    )}
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
                                                            {week.items.map((tx) => renderTollDataRow(tx))}
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

            {overlayModals}
        </div>
    );
}
