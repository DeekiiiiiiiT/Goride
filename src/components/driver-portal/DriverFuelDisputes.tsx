import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { 
    AlertTriangle, 
    CheckCircle2, 
    Clock, 
    ChevronRight, 
    FileSearch, 
    Camera,
    Upload,
    MessageSquare,
    ChevronDown,
    ChevronUp,
    ShieldAlert,
    Fuel,
    History
} from "lucide-react";
import { api } from "../../services/api";
import { format } from "date-fns";
import { toast } from "sonner@2.0.3";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from '../auth/AuthContext';
import { FuelEntry } from '../../types/fuel';

export function DriverFuelDisputes() {
    const { user } = useAuth();
    const [flaggedEntries, setFlaggedEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [disputeNote, setDisputeNote] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // In a real app, we'd have a specific endpoint for driver flagged entries
            // For now, we fetch all flagged and filter by driver
            const data = await api.getFlaggedTransactions();
            const myFlagged = data.filter((tx: any) => tx.driverId === user.id);
            setFlaggedEntries(myFlagged);
        } catch (err) {
            console.error("Failed to load flagged entries:", err);
            toast.error("Could not load alerts");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [user?.id]);

    const handleDispute = async (id: string) => {
        if (!disputeNote.trim()) {
            toast.error("Please provide an explanation for your dispute");
            return;
        }

        setIsSubmitting(true);
        try {
            // Using the existing resolution endpoint but from the driver's perspective
            await api.resolveFuelAnomaly(id, 'disputed', disputeNote);
            toast.success("Dispute submitted for review");
            setDisputeNote("");
            setSelectedId(null);
            fetchData();
        } catch (err) {
            toast.error("Failed to submit dispute");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAccept = async (id: string) => {
        setIsSubmitting(true);
        try {
            await api.resolveFuelAnomaly(id, 'resolved', "Accepted by driver");
            toast.success("Anomaly acknowledged");
            setSelectedId(null);
            fetchData();
        } catch (err) {
            toast.error("Failed to acknowledge");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Clock className="animate-spin text-orange-600 mr-2" />
                <span className="text-slate-500">Checking for alerts...</span>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-orange-600" />
                    Fuel Integrity Alerts
                </h3>
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-100">
                    {flaggedEntries.length} Pending
                </Badge>
            </div>

            {flaggedEntries.length === 0 ? (
                <Card className="bg-green-50/30 border-green-100 border-dashed">
                    <CardContent className="p-8 text-center">
                        <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2 opacity-50" />
                        <p className="text-slate-600 font-medium">Your fuel logs look great!</p>
                        <p className="text-xs text-slate-500">No mathematical inconsistencies detected.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {flaggedEntries.map((tx) => (
                        <Card key={tx.id} className={`overflow-hidden transition-all border-l-4 ${tx.metadata?.integrityStatus === 'critical' ? 'border-l-red-500' : 'border-l-orange-500 shadow-sm'}`}>
                            <div 
                                className="p-4 cursor-pointer hover:bg-slate-50"
                                onClick={() => setSelectedId(selectedId === tx.id ? null : tx.id)}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-slate-900">{format(new Date(tx.date), 'MMM dd')}</span>
                                            <Badge variant="secondary" className="text-[10px] h-5">
                                                {tx.metadata?.anomalyReason || 'Audit Flag'}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-slate-500">
                                            Amount: <span className="font-semibold text-slate-700">${Math.abs(tx.amount).toFixed(2)}</span> • {tx.liters}L
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        {selectedId === tx.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                    </div>
                                </div>
                            </div>

                            <AnimatePresence>
                                {selectedId === tx.id && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                    >
                                        <div className="px-4 pb-4 pt-2 border-t border-slate-100 bg-slate-50/50 space-y-4">
                                            <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-2 shadow-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500 italic">System detected:</span>
                                                    <span className="font-bold text-red-600 uppercase tracking-tighter">{tx.metadata?.anomalyReason}</span>
                                                </div>
                                                <p className="text-slate-600 leading-relaxed bg-slate-50 p-2 rounded">
                                                    Your cumulative fuel ({tx.metadata?.cumulativeLitersAtEntry}L) exceeded the 5% expansion buffer of your tank capacity. Please verify the entry.
                                                </p>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="space-y-1.5">
                                                    <Label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Your Explanation</Label>
                                                    <Textarea 
                                                        placeholder="e.g. Tank was completely empty, or I bought fuel for a container."
                                                        className="text-sm bg-white"
                                                        value={disputeNote}
                                                        onChange={(e) => setDisputeNote(e.target.value)}
                                                    />
                                                </div>

                                                <div className="flex gap-2">
                                                    <Button 
                                                        variant="outline" 
                                                        className="flex-1 text-xs h-9 border-slate-300"
                                                        onClick={() => handleAccept(tx.id)}
                                                        disabled={isSubmitting}
                                                    >
                                                        Accept Flag
                                                    </Button>
                                                    <Button 
                                                        className="flex-1 text-xs h-9 bg-orange-600 hover:bg-orange-700"
                                                        onClick={() => handleDispute(tx.id)}
                                                        disabled={isSubmitting}
                                                    >
                                                        <MessageSquare className="w-3 h-3 mr-1" />
                                                        Dispute Entry
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </Card>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                <div className="p-1.5 bg-white rounded-md shadow-sm">
                    <History className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="flex-1">
                    <p className="text-xs font-bold text-indigo-900">Weekly Reconciliation</p>
                    <p className="text-[10px] text-indigo-700">All fuel flags must be resolved by Sunday 23:59 to avoid automatic payroll deductions.</p>
                </div>
                <ChevronRight className="w-4 h-4 text-indigo-400" />
            </div>
        </div>
    );
}
