import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { 
    AlertTriangle, 
    CheckCircle2, 
    Clock, 
    ChevronRight, 
    FileSearch, 
    AlertCircle,
    Check,
    X,
    MessageSquare,
    Eye,
    ChevronDown,
    ChevronUp,
    BarChart3,
    Fuel,
    Lock
} from "lucide-react";
import { api } from "../../services/api";
import { format } from "date-fns";
import { toast } from "sonner@2.0.3";
import { motion, AnimatePresence } from "motion/react";

export function FuelAuditDashboard() {
    const [summary, setSummary] = useState<any>(null);
    const [flaggedTx, setFlaggedTx] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [resolutionNote, setResolutionNote] = useState("");

    const fetchData = async () => {
        setLoading(true);
        try {
            const [summaryData, flaggedData] = await Promise.all([
                api.getFuelAuditSummary(),
                api.getFlaggedTransactions()
            ]);
            setSummary(summaryData);
            setFlaggedTx(flaggedData);
        } catch (err) {
            console.error("Audit Data Error:", err);
            toast.error("Failed to load audit data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleResolve = async (id: string, status: 'resolved' | 'disputed' | 'rejected') => {
        try {
            await api.resolveFuelAnomaly(id, status, resolutionNote);
            toast.success(`Transaction marked as ${status}`);
            setResolutionNote("");
            setSelectedId(null);
            fetchData();
        } catch (err) {
            toast.error("Failed to update status");
        }
    };

    const handleLock = async (id: string) => {
        try {
            await api.lockTransaction(id);
            toast.success("Transaction locked and finalized");
            fetchData();
        } catch (err) {
            toast.error("Failed to lock transaction");
        }
    };

    const getStatusColor = (status: string, auditStatus?: string, isHealed?: boolean) => {
        if (isHealed) return 'bg-blue-50 text-blue-700 border-blue-200';
        if (auditStatus === 'Observing') return 'bg-blue-100 text-blue-700 border-blue-200';
        if (auditStatus === 'Auto-Resolved') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        
        switch (status) {
            case 'critical': return 'bg-red-100 text-red-700 border-red-200';
            case 'warning': return 'bg-orange-100 text-orange-700 border-orange-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    if (loading && !summary) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-2">
                    <Clock className="animate-spin text-indigo-600 w-8 h-8" />
                    <p className="text-sm text-slate-500 font-medium">Loading Audit Trail...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-white border-slate-200 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 rounded-lg">
                                <FileSearch className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Fuel</p>
                                <p className="text-2xl font-bold text-slate-900">{summary?.totalFuelTransactions || 0}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white border-slate-200 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-50 rounded-lg">
                                <AlertCircle className="w-5 h-5 text-red-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Critical Flags</p>
                                <p className="text-2xl font-bold text-red-600">{summary?.criticalCount || 0}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white border-slate-200 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-orange-50 rounded-lg">
                                <AlertTriangle className="w-5 h-5 text-orange-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Warnings</p>
                                <p className="text-2xl font-bold text-orange-600">{(summary?.flaggedCount || 0) - (summary?.criticalCount || 0)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white border-slate-200 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-lg">
                                <Clock className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Observing</p>
                                <p className="text-2xl font-bold text-blue-600">{summary?.observingCount || 0}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white border-slate-200 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-50 rounded-lg">
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Resolved</p>
                                <p className="text-2xl font-bold text-green-600">{summary?.resolvedCount || 0}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Anomaly Feed */}
            <Card className="border-slate-200 shadow-md overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-indigo-600" />
                                Fuel Integrity Audit Feed
                            </CardTitle>
                            <CardDescription>Transactions flagged by Stop-to-Stop & Fuel Velocity algorithms</CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-100">
                            {summary?.pendingReview || 0} Pending Review
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {flaggedTx.length === 0 ? (
                        <div className="p-12 text-center">
                            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4 opacity-50" />
                            <h3 className="text-lg font-semibold text-slate-900">All Clear!</h3>
                            <p className="text-slate-500">No active anomalies found in the recent fuel transactions.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {flaggedTx.map((tx) => (
                                <div key={tx.id} className="group">
                                    <div 
                                        className={`p-4 transition-colors cursor-pointer hover:bg-slate-50 ${selectedId === tx.id ? 'bg-indigo-50/30' : ''}`}
                                        onClick={() => setSelectedId(selectedId === tx.id ? null : tx.id)}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`p-2 rounded-full border ${getStatusColor(tx.metadata?.integrityStatus, tx.metadata?.auditStatus, tx.metadata?.isHealed)}`}>
                                                {tx.metadata?.isHealed ? (
                                                    <ShieldCheck className="w-4 h-4" />
                                                ) : tx.metadata?.auditStatus === 'Observing' ? (
                                                    <Clock className="w-4 h-4" />
                                                ) : tx.metadata?.auditStatus === 'Auto-Resolved' ? (
                                                    <CheckCircle2 className="w-4 h-4" />
                                                ) : (
                                                    <AlertTriangle className="w-4 h-4" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="font-bold text-slate-900">Driver: {tx.driverName || tx.driverId}</span>
                                                    <span className="text-slate-400 text-xs">•</span>
                                                    <span className="text-slate-500 text-xs font-medium uppercase tracking-tighter bg-slate-100 px-1.5 py-0.5 rounded">Vehicle: {tx.vehicleId}</span>
                                                    {tx.metadata?.auditStatus === 'Observing' && (
                                                        <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 text-[10px] h-5">WAIT-AND-SEE</Badge>
                                                    )}
                                                    {tx.metadata?.isHealed && (
                                                        <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] h-5">HEALED</Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-slate-600 truncate">
                                                    {tx.metadata?.isHealed 
                                                        ? 'System Healed: Data drift corrected via integrity audit.'
                                                        : tx.metadata?.auditStatus === 'Observing' 
                                                            ? 'Observation Active: Awaiting next Full Tank for reconciliation.' 
                                                            : tx.metadata?.anomalyReason || 'Mathematical Inconsistency Detected'}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="font-bold text-slate-900">${Math.abs(tx.amount).toFixed(2)}</p>
                                                <p className="text-[10px] font-medium text-slate-400 uppercase">{format(new Date(tx.date), 'MMM dd, HH:mm')}</p>
                                            </div>
                                            <div className="shrink-0 ml-2">
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
                                                className="overflow-hidden bg-slate-50/50 border-t border-slate-100"
                                            >
                                                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                                                    {/* Audit Math Panel */}
                                                    <div className="space-y-4">
                                                        <h4 className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                                                            <BarChart3 className="w-3 h-3" />
                                                            Audit Log Evidence
                                                        </h4>
                                                        
                                                        {tx.metadata?.auditStatus === 'Observing' && (
                                                            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-[11px] text-blue-800 leading-relaxed mb-4">
                                                                <strong>System Note:</strong> This transaction triggered a "High Volume" warning. We are currently observing this vehicle. If the next Full Tank entry justifies this consumption, this flag will auto-resolve.
                                                            </div>
                                                        )}
                                                        
                                                        <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                                            <div className="flex justify-between text-sm py-1.5 border-b border-slate-50">
                                                                <span className="text-slate-500">Distance Since Anchor</span>
                                                                <span className="font-bold text-slate-900">{tx.metadata?.distanceSinceAnchor || 0} km</span>
                                                            </div>
                                                            <div className="flex justify-between text-sm py-1.5 border-b border-slate-50">
                                                                <span className="text-slate-500">Cumulative Volume</span>
                                                                <span className="font-bold text-slate-900">{tx.metadata?.cumulativeLitersAtEntry || 0}L</span>
                                                            </div>
                                                            <div className="flex justify-between text-sm py-1.5 border-b border-slate-50">
                                                                <span className="text-slate-500">Calculated Economy</span>
                                                                <span className={`font-bold ${tx.metadata?.calculatedEconomy > 10 ? 'text-red-600' : 'text-slate-900'}`}>
                                                                    {tx.metadata?.calculatedEconomy || '--'} L/100km
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between text-sm py-1.5">
                                                                <span className="text-slate-500">Fuel Velocity ($/km)</span>
                                                                <span className={`font-bold ${tx.metadata?.fuelVelocity > 0.25 ? 'text-red-600' : 'text-slate-900'}`}>
                                                                    ${tx.metadata?.fuelVelocity || '0.00'}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {tx.metadata?.odometerProofUrl && (
                                                            <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => window.open(tx.metadata.odometerProofUrl, '_blank')}>
                                                                <Eye className="w-3 h-3 mr-2" />
                                                                View Odometer Proof
                                                            </Button>
                                                        )}
                                                    </div>

                                                    {/* Resolution Panel */}
                                                    <div className="space-y-4">
                                                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Resolution Action</h4>
                                                        
                                                        <div className="space-y-4">
                                                            <div className="space-y-2">
                                                                <textarea 
                                                                    className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                                                                    placeholder="Add internal note for resolution..."
                                                                    rows={3}
                                                                    value={resolutionNote}
                                                                    onChange={(e) => setResolutionNote(e.target.value)}
                                                                />
                                                            </div>
                                                            
                                                            <div className="flex gap-2">
                                                                {tx.isLocked ? (
                                                                    <div className="flex-1 flex items-center justify-center gap-2 p-2 bg-slate-100 text-slate-500 rounded-lg text-sm font-bold">
                                                                        <Lock className="w-4 h-4" />
                                                                        Record Locked
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <Button 
                                                                            className="flex-1 bg-green-600 hover:bg-green-700 text-white" 
                                                                            onClick={() => handleResolve(tx.id, 'resolved')}
                                                                        >
                                                                            <Check className="w-4 h-4 mr-2" />
                                                                            Resolve
                                                                        </Button>
                                                                        <Button 
                                                                            variant="outline"
                                                                            className="flex-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                                                            onClick={() => handleLock(tx.id)}
                                                                        >
                                                                            <Lock className="w-4 h-4 mr-2" />
                                                                            Lock
                                                                        </Button>
                                                                    </>
                                                                )}
                                                                <Button 
                                                                    className="flex-1 bg-slate-900 hover:bg-black text-white"
                                                                    onClick={() => handleResolve(tx.id, 'disputed')}
                                                                    disabled={tx.isLocked}
                                                                >
                                                                    <MessageSquare className="w-4 h-4 mr-2" />
                                                                    Dispute
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
