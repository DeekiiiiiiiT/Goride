import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { format } from "date-fns";
import { FinancialTransaction, Trip } from "../../../types/data";
import { Search, CheckCircle2, Sparkles } from "lucide-react";
import { MatchResult } from "../../../utils/tollReconciliation";
import { SuggestedMatchCard } from "./SuggestedMatchCard";
import { ManualMatchModal } from "./ManualMatchModal";

interface UnmatchedTollsListProps {
  tolls: FinancialTransaction[];
  suggestions: Map<string, MatchResult[]>;
  onReconcile: (tx: FinancialTransaction, trip: Trip) => void;
  // We need all trips for manual search
  allTrips: Trip[];
}

export function UnmatchedTollsList({ tolls, suggestions, onReconcile, allTrips }: UnmatchedTollsListProps) {
    const [hiddenSuggestions, setHiddenSuggestions] = useState<Set<string>>(new Set());
    const [selectedTxForManual, setSelectedTxForManual] = useState<FinancialTransaction | null>(null);

    const handleDismiss = (txId: string) => {
        setHiddenSuggestions(prev => new Set(prev).add(txId));
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
    const smartMatches = tolls.filter(tx => {
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

    const otherTolls = tolls.filter(tx => !smartMatches.includes(tx));

    const getMatchBadge = (match: MatchResult) => {
        switch (match.matchType) {
            case 'PERFECT_MATCH':
                return <Badge className="bg-emerald-500 hover:bg-emerald-600">Reimbursed</Badge>;
            case 'DEADHEAD_MATCH':
                return <Badge className="bg-blue-500 hover:bg-blue-600">Deadhead</Badge>;
            case 'AMOUNT_VARIANCE':
                return <Badge className="bg-orange-500 hover:bg-orange-600">Underpaid</Badge>;
            case 'PERSONAL_MATCH':
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
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Standard List */}
            <Card>
                <CardHeader>
                    <CardTitle>Unmatched Tolls</CardTitle>
                    <CardDescription>Toll provider charges that haven't been linked to a specific trip. These might be personal trips or unmatched business expenses.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Vehicle</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {otherTolls.map(tx => {
                                const bestMatch = suggestions.get(tx.id)?.[0];
                                const hasHiddenMatch = hiddenSuggestions.has(tx.id);

                                return (
                                    <TableRow key={tx.id}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{format(new Date(tx.date), 'MMM d, yyyy')}</span>
                                                <span className="text-xs text-slate-500">{format(new Date(tx.date), 'h:mm a')}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {tx.vehiclePlate || tx.vehicleId || <span className="text-slate-400">Unknown</span>}
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
                                            {bestMatch && !hasHiddenMatch ? (
                                                <Button size="sm" variant="outline" onClick={() => onReconcile(tx, bestMatch.trip)}>
                                                    Link Proposed
                                                </Button>
                                            ) : (
                                                <Button size="sm" variant="outline" onClick={() => setSelectedTxForManual(tx)}>
                                                    <Search className="h-4 w-4 mr-1" /> Find
                                                </Button>
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
