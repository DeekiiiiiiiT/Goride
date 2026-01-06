import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { format } from "date-fns";
import { FinancialTransaction, Trip } from "../../../types/data";
import { Search, CheckCircle2, Sparkles, Camera, Tag, User } from "lucide-react";
import { MatchResult } from "../../../utils/tollReconciliation";
import { SuggestedMatchCard } from "./SuggestedMatchCard";
import { ManualMatchModal } from "./ManualMatchModal";

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
}

export function UnmatchedTollsList({ tolls, suggestions, onReconcile, allTrips, onOpenDispute, onApprove, onReject, onFlag }: UnmatchedTollsListProps) {
    const [hiddenSuggestions, setHiddenSuggestions] = useState<Set<string>>(new Set());
    const [selectedTxForManual, setSelectedTxForManual] = useState<FinancialTransaction | null>(null);
    const [sourceFilter, setSourceFilter] = useState<'all' | 'tag' | 'cash'>('all');

    // Filter tolls based on source
    const filteredTolls = useMemo(() => {
        return tolls.filter(tx => {
            const isCash = tx.paymentMethod === 'Cash' || !!tx.receiptUrl;
            if (sourceFilter === 'tag') return !isCash;
            if (sourceFilter === 'cash') return isCash;
            return true;
        });
    }, [tolls, sourceFilter]);

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
             return (
                <Button size="sm" variant="outline" onClick={() => setSelectedTxForManual(tx)}>
                    <Search className="h-4 w-4 mr-1" /> Find
                </Button>
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
    const smartMatches = filteredTolls.filter(tx => {
        const matches = suggestions.get(tx.id);
        const best = matches?.[0];
        // Include High Confidence, Deadhead, AND Personal matches in the cards view
        // because our new logic is precise enough to trust "Personal" suggestions.
        return best && (
            best.confidence === 'high' || 
            best.matchType === 'DEADHEAD_MATCH' || 
            best.matchType === 'PERSONAL_MATCH'
        ) && !hiddenSuggestions.has(tx.id);
    });

    const otherTolls = filteredTolls.filter(tx => !smartMatches.includes(tx));

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

    return (
        <div className="space-y-6">
            
            {/* Smart Matches Section */}
            {smartMatches.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center space-x-2 text-indigo-600">
                        <Sparkles className="h-5 w-5" />
                        <h3 className="font-semibold">Smart Suggestions ({smartMatches.length})</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        {smartMatches.map(tx => {
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
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Standard List */}
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
                            {otherTolls.map(tx => {
                                const bestMatch = suggestions.get(tx.id)?.[0];
                                const hasHiddenMatch = hiddenSuggestions.has(tx.id);
                                const vehicleId = tx.vehiclePlate || tx.vehicleId || '';
                                const inferredDriver = getInferredDriver(vehicleId, tx.date);
                                const displayDriver = tx.driverName || bestMatch?.trip.driverName || inferredDriver;

                                return (
                                    <TableRow key={tx.id}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                {(() => {
                                                    try {
                                                        const timeStr = tx.time || '12:00:00';
                                                        const cleanTime = timeStr.length >= 5 ? timeStr : '12:00:00';
                                                        const localDate = new Date(`${tx.date}T${cleanTime}`);
                                                        const validDate = !isNaN(localDate.getTime()) ? localDate : new Date(tx.date);
                                                        
                                                        return (
                                                            <>
                                                                <span className="font-medium">{format(validDate, 'MMM d, yyyy')}</span>
                                                                <span className="text-xs text-slate-500">{format(validDate, 'h:mm a')}</span>
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
                                                getMatchBadge(bestMatch)
                                            ) : (
                                                <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50">Likely Personal</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
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
                </CardContent>
            </Card>

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
        </div>
    );
}
