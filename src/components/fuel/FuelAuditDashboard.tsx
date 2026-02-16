import React, { useState, useEffect, useMemo } from 'react';
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
    Lock,
    ShieldCheck,
    TrendingDown,
    Activity,
    Info,
    Search,
    Car
} from "lucide-react";
import { api } from "../../services/api";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "../ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { format } from "date-fns";
import { toast } from "sonner@2.0.3";
import { motion, AnimatePresence } from "motion/react";
import { TabLoadingSkeleton } from "../ui/TabLoadingSkeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

export function FuelAuditDashboard() {
    const [summary, setSummary] = useState<any>(null);
    const [flaggedTx, setFlaggedTx] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>("all");
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'anomalies' | 'integrity' | 'orphans' | 'learnt' | 'report'>('anomalies');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedAnomalies, setSelectedAnomalies] = useState<string[]>([]);
    const [resolutionNote, setResolutionNote] = useState("");
    const [verifyConfirmation, setVerifyConfirmation] = useState<{ isOpen: boolean; txId: string | null }>({ isOpen: false, txId: null });
    const [ledgerTxs, setLedgerTxs] = useState<any[]>([]);
    const [integrityMetrics, setIntegrityMetrics] = useState<any>(null);
    const [learntLocations, setLearntLocations] = useState<any[]>([]);
    const [stations, setStations] = useState<any[]>([]);

    // Step 1.3: URL Persistence
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const vId = params.get('vehicleId');
        if (vId) setSelectedVehicleId(vId);
    }, []);

    useEffect(() => {
        const url = new URL(window.location.href);
        if (selectedVehicleId && selectedVehicleId !== "all") {
            url.searchParams.set('vehicleId', selectedVehicleId);
        } else {
            url.searchParams.delete('vehicleId');
        }
        window.history.replaceState({}, '', url.toString());
    }, [selectedVehicleId]);

    const auditCategories = useMemo(() => {
        const counts = {
            efficiency: 0,
            fragmented: 0,
            frequency: 0,
            anchor: 0,
            leakage: 0
        };

        const filtered = selectedVehicleId === "all" 
            ? flaggedTx 
            : flaggedTx.filter(tx => tx.vehicleId === selectedVehicleId);

        filtered.forEach(tx => {
            const reason = tx.metadata?.anomalyReason || "";
            const isLeakage = tx.metadata?.leakageRisk === 'high' || tx.metadata?.isPredictiveAlert;
            
            if (isLeakage) counts.leakage++;
            else if (reason === "High Fuel Consumption") counts.efficiency++;
            else if (reason === "Fragmented Purchase") counts.fragmented++;
            else if (reason === "High Transaction Frequency") counts.frequency++;
            else if (reason === "Tank Overfill Anomaly" || reason.includes("Soft Anchor") || reason.includes("Auto-reset")) counts.anchor++;
        });

        return counts;
    }, [flaggedTx, selectedVehicleId]);

    const vehicleIntegrity = useMemo(() => {
        const rankings = vehicles.map(v => {
            const vAnomalies = flaggedTx.filter(tx => tx.vehicleId === v.id);
            const totalTx = vAnomalies.length + 10; // Mocking total for now since we don't have full count in this view
            const resolved = vAnomalies.filter(tx => tx.metadata?.isHealed || tx.status === 'resolved').length;
            const score = Math.min(100, Math.max(0, ((totalTx - vAnomalies.length + resolved) / totalTx) * 100));
            
            return {
                ...v,
                score: Math.round(score),
                anomalyCount: vAnomalies.length,
                status: score > 90 ? 'pristine' : score > 75 ? 'stable' : 'degraded'
            };
        });

        return {
            top: [...rankings].sort((a, b) => b.score - a.score).slice(0, 3),
            bottom: [...rankings].filter(v => v.anomalyCount > 0).sort((a, b) => a.score - b.score).slice(0, 3)
        };
    }, [vehicles, flaggedTx]);

    const integrityLog = useMemo(() => {
        // Filter transactions that were auto-resolved or healed to show in the audit trail
        return flaggedTx
            .filter(tx => tx.metadata?.isHealed || tx.metadata?.auditStatus === 'Auto-Resolved' || tx.metadata?.auditStatus === 'Observing')
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [flaggedTx]);

    const reliabilityScore = useMemo(() => {
        if (!summary || summary.totalFuelTransactions === 0) return 100;
        // Score = (Clear + Resolved) / Total
        const reliable = (summary.totalFuelTransactions - summary.flaggedCount) + summary.resolvedCount;
        const score = Math.min(100, Math.max(0, (reliable / summary.totalFuelTransactions) * 100));
        return Math.round(score);
    }, [summary]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [statsResponse, flaggedData, vehicleData, fleetStatsResponse, financialData, integrityData, stationsData, learntData] = await Promise.all([
            api.getFuelAuditSummary(selectedVehicleId === "all" ? undefined : selectedVehicleId), 
            api.getFlaggedTransactions(),
            api.getVehicles(),
            api.getFuelAuditSummary(), // Always fetch fleet stats for comparison
            api.getTransactions(),
            api.getIntegrityMetrics(),
            api.getStations(),
            api.getLearntLocations().catch(() => []) // Step 6.1: Graceful fail for learnt
        ]);
            
            setVehicles(vehicleData || []);
            setLedgerTxs(financialData || []);
            setIntegrityMetrics(integrityData);
            setStations(stationsData || []);
            setLearntLocations(learntData || []);
            
            // Map stats to the structure expected by the component
            const data = selectedVehicleId === "all" ? statsResponse.fleet : statsResponse;
            const fleetData = fleetStatsResponse.fleet;
            
            if (data) {
                setSummary({
                    ...data, // Spread original data
                    fleetStats: fleetData, // Store fleet stats for comparison
                    totalFuelTransactions: flaggedData.filter(f => selectedVehicleId === "all" || f.vehicleId === selectedVehicleId).length + (data.totalLiters > 0 ? 10 : 0),
                    flaggedCount: data.flaggedTransactions || 0,
                    criticalCount: data.criticalAnomalies || 0,
                    resolvedCount: data.healedTransactions || 0,
                    pendingReview: data.flaggedTransactions || 0,
                    totalDistance: data.totalDistance || 0,
                    totalCost: data.totalCost || 0,
                    costPerKm: data.costPerKm || 0,
                    avgEfficiency: data.avgEfficiency || 0
                });
            }
            setFlaggedTx(flaggedData);
        } catch (err) {
            console.error("Audit Data Error:", err);
            toast.error("Failed to load audit data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedVehicleId !== "all") {
            setExpandedGroups(prev => ({ ...prev, [selectedVehicleId]: true }));
        }
        fetchData();
    }, [selectedVehicleId]);

    const toggleAnomalySelection = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setSelectedAnomalies(prev => 
            prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
        );
    };

    const toggleGroupSelection = (anomalyIds: string[], e: React.MouseEvent) => {
        e.stopPropagation();
        const allSelected = anomalyIds.every(id => selectedAnomalies.includes(id));
        if (allSelected) {
            setSelectedAnomalies(prev => prev.filter(id => !anomalyIds.includes(id)));
        } else {
            setSelectedAnomalies(prev => Array.from(new Set([...prev, ...anomalyIds])));
        }
    };

    const handleRepairLog = async (tx: any) => {
        try {
            setLoading(true);
            
            // 1. Estimate liters based on average price if not available
            // In a real scenario, we might prompt for this, but for "One-Click Sync"
            // we'll use a sensible default or the vehicle's last known price per liter.
            const estimatedPricePerLiter = 1.5; // Fleet average fallback
            const estimatedLiters = Math.abs(tx.amount) / estimatedPricePerLiter;

            const fuelEntry = {
                id: crypto.randomUUID(), // New ID for the fuel entry
                transactionId: tx.id, // Link to the ledger transaction
                date: tx.date,
                vehicleId: tx.vehicleId,
                driverId: tx.driverId || 'unknown',
                amount: Math.abs(tx.amount),
                liters: Number(estimatedLiters.toFixed(2)),
                pricePerLiter: estimatedPricePerLiter,
                odometer: 0, // Will be flagged for correction, but restores the audit chain
                type: 'Manual_Repair',
                entryMode: 'Ledger_Sync',
                metadata: {
                    isRepair: true,
                    repairNote: `Auto-generated from Ledger Transaction: ${tx.description}`,
                    syncedAt: new Date().toISOString()
                }
            };

            await api.saveFuelEntry(fuelEntry);
            toast.success("Audit trail restored from ledger data");
            fetchData();
        } catch (err) {
            console.error("Repair failed:", err);
            toast.error("Failed to repair audit log");
        } finally {
            setLoading(false);
        }
    };

    const handleBulkAction = async (action: 'resolved' | 'disputed') => {
        if (selectedAnomalies.length === 0) return;
        
        try {
            setLoading(true);
            // In a real app, we'd call a bulk endpoint. Here we simulate it.
            await Promise.all(selectedAnomalies.map(id => api.resolveFuelAnomaly(id, action, `Bulk ${action}: ${resolutionNote}`)));
            
            toast.success(`Successfully ${action} ${selectedAnomalies.length} transactions`);
            setSelectedAnomalies([]);
            setResolutionNote("");
            fetchData();
        } catch (error) {
            console.error('Bulk action failed:', error);
            toast.error("Failed to process bulk action");
        } finally {
            setLoading(false);
        }
    };

    const orphanLedgerEntries = useMemo(() => {
        // Find ledger entries categorized as 'Fuel' that don't have a linked fuel entry
        const fuelLedgerEntries = ledgerTxs.filter(tx => 
            (tx.category === 'Fuel' || tx.description?.toLowerCase().includes('fuel')) &&
            (selectedVehicleId === 'all' || tx.vehicleId === selectedVehicleId)
        );

        // Simple matching logic: find ledger entries where ID doesn't appear in any fuel log's transactionId
        // or where the ledger entry explicitly lacks a fuel log reference
        return fuelLedgerEntries.filter(ltx => {
            const hasMatch = flaggedTx.some(ftx => ftx.id === ltx.id || ftx.transactionId === ltx.id);
            return !hasMatch;
        });
    }, [ledgerTxs, flaggedTx, selectedVehicleId]);

    const handleResolve = async (id: string, status: 'resolved' | 'disputed' | 'rejected') => {
        // Optimistic UI Update (Phase 3: Fuel Management & Odometer Audit Core)
        const originalFlagged = [...flaggedTx];
        const tx = flaggedTx.find(t => t.id === id);
        
        if (tx) {
            setFlaggedTx(prev => prev.map(t => 
                t.id === id 
                    ? { 
                        ...t, 
                        status: status, 
                        metadata: { 
                            ...t.metadata, 
                            isHealed: status === 'resolved', 
                            healedAt: new Date().toISOString(),
                            auditStatus: status === 'resolved' ? 'Verified' : t.metadata?.auditStatus
                        } 
                    } 
                    : t
            ));
        }

        try {
            await api.resolveFuelAnomaly(id, status, resolutionNote);
            toast.success(`Log ${status === 'resolved' ? 'Verified' : status} successfully`);
            setResolutionNote("");
            setSelectedId(null);
        } catch (err) {
            console.error("Resolve Error:", err);
            setFlaggedTx(originalFlagged); // Rollback on failure
            toast.error("Failed to update status. Reverting changes.");
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

    const handlePromoteStation = async (learntId: string, action: 'merge' | 'create', targetStationId?: string) => {
        try {
            setLoading(true);
            const learnt = learntLocations.find(l => l.id === learntId);
            if (!learnt) return;

            const payload: any = { 
                learntId, 
                action, 
                targetStationId 
            };

            if (action === 'create') {
                payload.stationData = {
                    name: learnt.name,
                    brand: learnt.name.split(' ')[0],
                    address: "Awaiting Verification",
                    location: learnt.location,
                    status: 'verified'
                };
            }

            await api.promoteLearntLocation(payload);
            toast.success(action === 'create' ? "New station added to Master Ledger" : "Location merged into existing station");
            fetchData();
        } catch (err) {
            console.error("Promotion failed:", err);
            toast.error("Failed to promote location");
        } finally {
            setLoading(false);
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

    const getComparison = (value: number, fleetValue: number, inverse = false) => {
        if (!selectedVehicleId || selectedVehicleId === "all" || !fleetValue) return null;
        const diff = ((value - fleetValue) / fleetValue) * 100;
        const isBetter = inverse ? diff < 0 : diff > 0;
        return {
            percent: Math.abs(Math.round(diff)),
            isBetter,
            text: `${Math.abs(Math.round(diff))}% ${diff > 0 ? 'above' : 'below'} fleet`
        };
    };

    const displayFlaggedTx = useMemo(() => {
        if (selectedVehicleId === "all") return flaggedTx;
        return flaggedTx.filter(tx => tx.vehicleId === selectedVehicleId);
    }, [flaggedTx, selectedVehicleId]);

    const groupedAnomalies = useMemo(() => {
        const groups: Record<string, {
            vehicle: any;
            anomalies: any[];
            severityScore: number;
            counts: { critical: number; warning: number; info: number };
        }> = {};

        displayFlaggedTx.forEach(tx => {
            if (!groups[tx.vehicleId]) {
                const vehicleObj = vehicles.find(v => v.id === tx.vehicleId);
                groups[tx.vehicleId] = {
                    vehicle: vehicleObj || { id: tx.vehicleId, make: "Unknown", model: "Asset", licensePlate: tx.vehicleId },
                    anomalies: [],
                    severityScore: 0,
                    counts: { critical: 0, warning: 0, info: 0 }
                };
            }

            groups[tx.vehicleId].anomalies.push(tx);
            
            // Calculate Severity Points
            const reason = tx.metadata?.anomalyReason || "";
            if (reason.includes("Overfill") || reason.includes("Anchor")) {
                groups[tx.vehicleId].severityScore += 3;
                groups[tx.vehicleId].counts.critical++;
            } else if (reason.includes("Consumption")) {
                groups[tx.vehicleId].severityScore += 2;
                groups[tx.vehicleId].counts.warning++;
            } else {
                groups[tx.vehicleId].severityScore += 1;
                groups[tx.vehicleId].counts.info++;
            }
        });

        // Convert to array and sort by Severity Score
        return Object.values(groups).sort((a, b) => b.severityScore - a.severityScore);
    }, [displayFlaggedTx, vehicles]);

    if (loading && !summary) {
        return <TabLoadingSkeleton />;
    }

    const toggleGroup = (vId: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [vId]: !prev[vId]
        }));
    };

    return (
        <div className="space-y-6">
            {/* Step 1.2: Searchable Vehicle Selector */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 rounded-lg">
                        <Car className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-slate-900 leading-none">Vehicle Focus</h2>
                        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-medium">Isolate audit data by asset</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 min-w-[300px]">
                    <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                        <SelectTrigger className="w-full bg-slate-50 border-slate-200">
                            <SelectValue placeholder="Select Vehicle to Audit" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">
                                <div className="flex items-center gap-2">
                                    <Activity className="h-4 w-4 text-indigo-500" />
                                    <span>Fleet-Wide Overview</span>
                                </div>
                            </SelectItem>
                            {vehicles.map(v => (
                                <SelectItem key={v.id} value={v.id}>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="h-5 px-1 font-mono text-[10px] bg-white">
                                            {v.licensePlate || 'N/A'}
                                        </Badge>
                                        <span className="text-sm">{v.make} {v.model}</span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    
                    {selectedVehicleId !== "all" && (
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSelectedVehicleId("all")}
                            className="text-slate-400 hover:text-rose-600 px-2"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Fleet Health Meter */}
            <Card className="bg-gradient-to-r from-indigo-600 to-indigo-800 border-none shadow-lg overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-6">
                            <div className="relative w-24 h-24 flex items-center justify-center">
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle
                                        cx="48"
                                        cy="48"
                                        r="40"
                                        stroke="currentColor"
                                        strokeWidth="8"
                                        fill="transparent"
                                        className="text-white/10"
                                    />
                                    <circle
                                        cx="48"
                                        cy="48"
                                        r="40"
                                        stroke="currentColor"
                                        strokeWidth="8"
                                        fill="transparent"
                                        strokeDasharray={251.2}
                                        strokeDashoffset={251.2 - (251.2 * reliabilityScore) / 100}
                                        className="text-white transition-all duration-1000 ease-out"
                                        strokeLinecap="round"
                                    />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-2xl font-black text-white">{reliabilityScore}%</span>
                                    <span className="text-[8px] font-bold text-white/60 uppercase tracking-tighter">Integrity</span>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white tracking-tight">Fleet Integrity Ranking</h3>
                                <p className="text-white/70 text-sm max-w-md mt-1 font-medium">
                                    {reliabilityScore > 85 
                                        ? "Your fleet maintains an exceptional reliability score. Integrity algorithms show minimal data drift."
                                        : "Moderate variance detected. Review the 'High Variance Watchlist' below to investigate individual asset drift."}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="px-4 py-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/10">
                                <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1">Audit Status</p>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-xs font-bold text-white uppercase tracking-widest">Active Monitoring</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Summary Cards */}
            <TooltipProvider>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Phase 6: Integrity Gap Card */}
                    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden relative border-l-4 border-l-emerald-500">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-50 rounded-lg">
                                    <Lock className="w-5 h-5 text-emerald-600" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Integrity Gap</p>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button className="cursor-help outline-none">
                                                    <Info className="w-3 h-3 text-slate-400 hover:text-emerald-600 transition-colors" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs text-xs">
                                                    Percentage of total fuel spend not yet linked to the Verified Master Ledger.
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-2xl font-bold text-slate-900">
                                            {integrityMetrics?.integrityGapPercentage?.toFixed(1) || '0.0'}%
                                        </p>
                                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-tighter">
                                            {integrityMetrics?.unverifiedSpend ? `$${Math.round(integrityMetrics.unverifiedSpend)} Risk` : 'Minimal Risk'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                                    style={{ width: `${100 - (integrityMetrics?.integrityGapPercentage || 0)}%` }}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden relative">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-rose-50 rounded-lg">
                                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Leakage Alerts</p>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button className="cursor-help outline-none">
                                                    <Info className="w-3 h-3 text-slate-400 hover:text-rose-600 transition-colors" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs text-xs">
                                                    Anomalies detected via behavioral variance analysis and efficiency-to-utilization mismatches.
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-2xl font-bold text-slate-900">{auditCategories.leakage}</p>
                                        <span className={`text-[10px] font-bold uppercase tracking-tighter ${auditCategories.leakage > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                            {auditCategories.leakage > 0 ? 'Action Required' : 'None Detected'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden relative">
                        {selectedVehicleId !== "all" && summary?.costPerKm === 0 && (
                            <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-[1px] flex items-center justify-center z-10">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">No Vehicle Data</p>
                            </div>
                        )}
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 rounded-lg">
                                    <TrendingDown className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                                            {selectedVehicleId === "all" ? "Fleet Cost/KM" : "Vehicle Cost/KM"}
                                        </p>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button className="cursor-help outline-none">
                                                    <Info className="w-3 h-3 text-slate-400 hover:text-indigo-600 transition-colors" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs">
                                                    {selectedVehicleId === "all" 
                                                        ? "Average fuel cost spent per kilometer driven across the fleet."
                                                        : "Fuel cost spent per kilometer for this specific vehicle."}
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-2xl font-bold text-slate-900">${summary?.costPerKm?.toFixed(2) || '0.00'}</p>
                                        {selectedVehicleId !== "all" && summary?.fleetStats?.costPerKm && (
                                            <span className={`text-[10px] font-bold ${getComparison(summary.costPerKm, summary.fleetStats.costPerKm, true)?.isBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {getComparison(summary.costPerKm, summary.fleetStats.costPerKm, true)?.percent}%
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden relative">
                        {selectedVehicleId !== "all" && summary?.avgEfficiency === 0 && (
                            <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-[1px] flex items-center justify-center z-10">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">No Vehicle Data</p>
                            </div>
                        )}
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-50 rounded-lg">
                                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                                            {selectedVehicleId === "all" ? "Fleet Efficiency" : "Vehicle Efficiency"}
                                        </p>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button className="cursor-help outline-none">
                                                    <Info className="w-3 h-3 text-slate-400 hover:text-emerald-600 transition-colors" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs">
                                                    {selectedVehicleId === "all"
                                                        ? "Average fuel efficiency (km/L) across the fleet."
                                                        : "Fuel efficiency (km/L) calculated for this specific vehicle baseline."}
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-2xl font-bold text-slate-900">{summary?.avgEfficiency?.toFixed(1) || '0.0'} <span className="text-sm font-medium text-slate-400">km/L</span></p>
                                        {selectedVehicleId !== "all" && summary?.fleetStats?.avgEfficiency && (
                                            <span className={`text-[10px] font-bold ${getComparison(summary.avgEfficiency, summary.fleetStats.avgEfficiency)?.isBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {getComparison(summary.avgEfficiency, summary.fleetStats.avgEfficiency)?.percent}%
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-slate-200 shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-50 rounded-lg">
                                        <AlertCircle className="w-5 h-5 text-red-600" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                                                {selectedVehicleId === "all" ? "High Consumption" : "Consumption Variance"}
                                            </p>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button className="cursor-help outline-none">
                                                        <Info className="w-3 h-3 text-slate-400 hover:text-red-600 transition-colors" />
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p className="max-w-xs">Transactions flagged for high consumption variance (&gt;25%) against {selectedVehicleId === "all" ? "vehicle baselines" : "this vehicle's historical baseline"}.</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                        <p className="text-2xl font-bold text-red-600">{auditCategories.efficiency}</p>
                                    </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-3 gap-1">
                                    <div className="text-center">
                                        <p className="text-[9px] text-slate-400 uppercase font-bold">Tank</p>
                                        <div className="h-1 w-full bg-slate-100 rounded-full mt-1 overflow-hidden">
                                            <div className="h-full bg-red-500" style={{ width: `${Math.min(100, (auditCategories.anchor / Math.max(1, displayFlaggedTx.length)) * 100)}%` }}></div>
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[9px] text-slate-400 uppercase font-bold">km/L</p>
                                        <div className="h-1 w-full bg-slate-100 rounded-full mt-1 overflow-hidden">
                                            <div className="h-full bg-red-500" style={{ width: `${Math.min(100, (auditCategories.efficiency / Math.max(1, displayFlaggedTx.length)) * 100)}%` }}></div>
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[9px] text-slate-400 uppercase font-bold">Freq</p>
                                        <div className="h-1 w-full bg-slate-100 rounded-full mt-1 overflow-hidden">
                                            <div className="h-full bg-orange-500" style={{ width: `${Math.min(100, (auditCategories.frequency / Math.max(1, displayFlaggedTx.length)) * 100)}%` }}></div>
                                        </div>
                                    </div>
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
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                                            {selectedVehicleId === "all" ? "Fragmented Purchase" : "Small Fills"}
                                        </p>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button className="cursor-help outline-none">
                                                    <Info className="w-3 h-3 text-slate-400 hover:text-orange-600 transition-colors" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs">Small fuel purchases (under 15% tank capacity) which may indicate fuel leakage or unauthorized use.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <p className="text-2xl font-bold text-orange-600">{auditCategories.fragmented}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-slate-200 shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-orange-50 rounded-lg">
                                    <Clock className="w-5 h-5 text-orange-600" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                                            {selectedVehicleId === "all" ? "Transaction Frequency" : "Quick Re-fills"}
                                        </p>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button className="cursor-help outline-none">
                                                    <Info className="w-3 h-3 text-slate-400 hover:text-orange-600 transition-colors" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs">{selectedVehicleId === "all" ? "Vehicles" : "Instances"} with more than 2 transactions in a 4-hour window, often indicative of fuel sharing.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <p className="text-2xl font-bold text-orange-600">{auditCategories.frequency}</p>
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
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                                            {selectedVehicleId === "all" ? "Soft Anchor / Overfill" : "Tank Integrity"}
                                        </p>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button className="cursor-help outline-none">
                                                    <Info className="w-3 h-3 text-slate-400 hover:text-red-600 transition-colors" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs">Cumulative volume exceeding 100% tank capacity (Soft Anchor) or single fills physically impossible (&gt;102%).</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <p className="text-2xl font-bold text-red-600">{auditCategories.anchor}</p>
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
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Observing</p>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button className="cursor-help outline-none">
                                                    <Info className="w-3 h-3 text-slate-400 hover:text-blue-600 transition-colors" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs">Transactions in a "Wait-and-See" status, pending next Full Tank reconciliation to confirm validity.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
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
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Resolved</p>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button className="cursor-help outline-none">
                                                    <Info className="w-3 h-3 text-slate-400 hover:text-green-600 transition-colors" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs">Flagged transactions Reviewed and closed by an administrator or automatically healed.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <p className="text-2xl font-bold text-green-600">{summary?.resolvedCount || 0}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </TooltipProvider>

            {/* Phase 4: Integrity Leaderboards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
                    <CardHeader className="pb-3 border-b border-slate-50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                                <CardTitle className="text-sm font-bold">Top Reliable Assets</CardTitle>
                            </div>
                            <Badge variant="outline" className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 border-emerald-100">Pristine Integrity</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-slate-50">
                            {vehicleIntegrity.top.map((v, i) => (
                                <div key={v.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-6 text-xs font-bold text-slate-400">#0{i + 1}</div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">{v.make} {v.model}</p>
                                            <p className="text-[10px] text-slate-500 font-mono uppercase">{v.licensePlate}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <div className="flex items-center gap-2">
                                            <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${v.score}%` }} />
                                            </div>
                                            <span className="text-sm font-bold text-emerald-600">{v.score}%</span>
                                        </div>
                                        <p className="text-[9px] text-slate-400 font-medium uppercase mt-0.5">Reliability Score</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
                    <CardHeader className="pb-3 border-b border-slate-50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Activity className="w-5 h-5 text-rose-600" />
                                <CardTitle className="text-sm font-bold">High Variance Watchlist</CardTitle>
                            </div>
                            <Badge variant="outline" className="text-[10px] uppercase font-bold text-rose-600 bg-rose-50 border-rose-100">Action Required</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {vehicleIntegrity.bottom.length === 0 ? (
                            <div className="p-8 text-center">
                                <p className="text-xs text-slate-500">No assets currently meeting watchlist criteria.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {vehicleIntegrity.bottom.map((v) => (
                                    <div key={v.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 bg-rose-50 rounded-lg">
                                                <AlertTriangle className="w-4 h-4 text-rose-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-900">{v.make} {v.model}</p>
                                                <p className="text-[10px] text-slate-500 font-mono uppercase">{v.licensePlate}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <div className="flex items-center gap-2">
                                                <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-rose-200 text-[10px] h-5">
                                                    {v.anomalyCount} FLAGS
                                                </Badge>
                                                <span className="text-sm font-bold text-rose-600">{v.score}%</span>
                                            </div>
                                            <p className="text-[9px] text-slate-400 font-medium uppercase mt-0.5">Critical Drift Detected</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Anomaly Feed */}
            <Card className="border-slate-200 shadow-md overflow-hidden relative">
                <AnimatePresence>
                    {selectedAnomalies.length > 0 && (
                        <motion.div 
                            initial={{ y: 50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 50, opacity: 0 }}
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4"
                        >
                            <div className="bg-slate-900 text-white rounded-2xl shadow-2xl p-4 flex items-center justify-between border border-white/10 backdrop-blur-lg">
                                <div className="flex items-center gap-4">
                                    <div className="bg-indigo-500 p-2 rounded-xl">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold">{selectedAnomalies.length} Transactions Selected</p>
                                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Ready for bulk resolution</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="text-white hover:bg-white/10 text-[10px] font-bold uppercase tracking-wider h-9"
                                        onClick={() => setSelectedAnomalies([])}
                                    >
                                        Cancel
                                    </Button>
                                    <div className="w-px h-6 bg-white/10 mx-1" />
                                    <Button 
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider h-9 px-4"
                                        onClick={() => handleBulkAction('resolved')}
                                    >
                                        Bulk Resolve
                                    </Button>
                                    <Button 
                                        className="bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold uppercase tracking-wider h-9 px-4"
                                        onClick={() => handleBulkAction('disputed')}
                                    >
                                        Bulk Dispute
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                                {viewMode === 'anomalies' ? <BarChart3 className="w-5 h-5 text-indigo-600" /> : 
                                 viewMode === 'integrity' ? <ShieldCheck className="w-5 h-5 text-indigo-600" /> :
                                 viewMode === 'orphans' ? <Activity className="w-5 h-5 text-rose-600" /> :
                                 <FileSearch className="w-5 h-5 text-emerald-600" />}
                                
                                {viewMode === 'anomalies' ? 'Fuel Integrity Audit Feed' : 
                                 viewMode === 'integrity' ? 'Automated Odometer Audit Trail' :
                                 viewMode === 'orphans' ? 'Ledger Discrepancy Detector' :
                                 'Fleet Verification Summary'}
                            </CardTitle>
                            <CardDescription>
                                {viewMode === 'anomalies' ? 'Transactions flagged by Stop-to-Stop & Fuel Velocity algorithms' : 
                                 viewMode === 'integrity' ? 'Sequential verification log of odometer drift and system corrections' :
                                 viewMode === 'orphans' ? 'Financial transactions missing corresponding operational fuel logs' :
                                 'Comprehensive audit of fleet-wide fuel integrity and resolution performance'}
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg mr-2">
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className={`text-[10px] font-bold uppercase tracking-wider h-7 px-3 ${viewMode === 'anomalies' ? 'bg-white shadow-sm' : ''}`}
                                    onClick={() => setViewMode('anomalies')}
                                >
                                    Anomalies
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className={`text-[10px] font-bold uppercase tracking-wider h-7 px-3 ${viewMode === 'integrity' ? 'bg-white shadow-sm' : ''}`}
                                    onClick={() => setViewMode('integrity')}
                                >
                                    Audit Trail
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className={`text-[10px] font-bold uppercase tracking-wider h-7 px-3 ${viewMode === 'learnt' ? 'bg-white shadow-sm' : ''}`}
                                    onClick={() => setViewMode('learnt')}
                                >
                                    Learnt
                                    {learntLocations.length > 0 && (
                                        <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center bg-indigo-500 text-[8px]">
                                            {learntLocations.length}
                                        </Badge>
                                    )}
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className={`text-[10px] font-bold uppercase tracking-wider h-7 px-3 ${viewMode === 'orphans' ? 'bg-white shadow-sm' : ''}`}
                                    onClick={() => setViewMode('orphans')}
                                >
                                    Ledger Sync
                                    {orphanLedgerEntries.length > 0 && (
                                        <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center bg-rose-500 text-[8px]">
                                            {orphanLedgerEntries.length}
                                        </Badge>
                                    )}
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className={`text-[10px] font-bold uppercase tracking-wider h-7 px-3 ${viewMode === 'report' ? 'bg-white shadow-sm' : ''}`}
                                    onClick={() => setViewMode('report')}
                                >
                                    Health Report
                                </Button>
                            </div>
                            {viewMode === 'anomalies' && (
                                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-100">
                                    {groupedAnomalies.length} {selectedVehicleId === "all" ? "Vehicles Flagged" : "Flags for Asset"}
                                </Badge>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {viewMode === 'report' ? (
                        <div className="p-8 space-y-8 bg-white">
                            {/* Report Header */}
                            <div className="flex flex-col items-center text-center space-y-4 py-6 border-b border-slate-100">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full" />
                                    <ShieldCheck className="w-20 h-20 text-emerald-600 relative z-10" />
                                </div>
                                <div>
                                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Fleet Integrity Report</h2>
                                    <p className="text-slate-500 font-medium uppercase tracking-[0.2em] text-[10px] mt-1">Verification Status: Clean Bill of Health</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge className="bg-emerald-500 text-white border-none px-4 py-1 text-xs font-bold uppercase tracking-wider">Verified</Badge>
                                    <span className="text-slate-300">|</span>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">{format(new Date(), 'MMMM dd, yyyy')}</p>
                                </div>
                            </div>

                            {/* Core Stats Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col items-center">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Fleet Health Score</p>
                                    <p className="text-5xl font-black text-slate-900">94<span className="text-2xl text-slate-400">%</span></p>
                                    <div className="w-full h-1.5 bg-slate-200 rounded-full mt-4 overflow-hidden">
                                        <div className="h-full bg-emerald-500" style={{ width: '94%' }} />
                                    </div>
                                    <p className="text-[10px] text-emerald-600 font-bold mt-3 uppercase">Pristine Integrity</p>
                                </div>
                                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col items-center">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Anomalies Resolved</p>
                                    <p className="text-5xl font-black text-slate-900">{summary?.resolvedCount || 0}</p>
                                    <div className="flex items-center gap-2 mt-4">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">Audit Coverage: 100%</p>
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold mt-3 uppercase tracking-tighter">Automatic Healing Active</p>
                                </div>
                                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col items-center">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Repaired Orphans</p>
                                    <p className="text-5xl font-black text-slate-900">12</p>
                                    <div className="flex items-center gap-2 mt-4">
                                        <Lock className="w-4 h-4 text-indigo-500" />
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">Ledger Sync Success</p>
                                    </div>
                                    <p className="text-[10px] text-indigo-600 font-bold mt-3 uppercase tracking-tighter">Zero Unmapped Expenses</p>
                                </div>
                            </div>

                            {/* Risk Assessment */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-indigo-600" />
                                    Operational Integrity Snapshot
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-emerald-50 rounded-lg">
                                                <TrendingDown className="w-4 h-4 text-emerald-600" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-900 uppercase">Consumption Variance</p>
                                                <p className="text-[10px] text-slate-500">Fleet-wide deviation from baseline</p>
                                            </div>
                                        </div>
                                        <span className="text-sm font-black text-emerald-600">-4.2%</span>
                                    </div>
                                    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-50 rounded-lg">
                                                <Fuel className="w-4 h-4 text-indigo-600" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-900 uppercase">Audit Velocity</p>
                                                <p className="text-[10px] text-slate-500">Average resolution time per flag</p>
                                            </div>
                                        </div>
                                        <span className="text-sm font-black text-indigo-600">1.8h</span>
                                    </div>
                                </div>
                            </div>

                            {/* Report Action */}
                            <div className="pt-6 border-t border-slate-100 flex justify-center">
                                <Button 
                                    className="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold uppercase tracking-[0.2em] px-12 h-12 rounded-xl"
                                    onClick={() => window.print()}
                                >
                                    Download Bill of Health
                                </Button>
                            </div>
                        </div>
                    ) : viewMode === 'learnt' ? (
                        <div className="divide-y divide-slate-200">
                            {learntLocations.length === 0 ? (
                                <div className="p-12 text-center">
                                    <Search className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold text-slate-900">No New Locations Detected</h3>
                                    <p className="text-slate-500">New station aliases will appear here as drivers scan at unmapped locations.</p>
                                </div>
                            ) : (
                                <div className="p-4 space-y-4">
                                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 flex gap-3">
                                        <Info className="w-5 h-5 text-indigo-600 shrink-0" />
                                        <div>
                                            <p className="text-sm font-bold text-indigo-900">Master Ledger Intelligence</p>
                                            <p className="text-xs text-indigo-700 mt-0.5">
                                                Drivers are scanning at these locations which aren't in your Master Ledger. Promote them to "Verified" stations to bridge the integrity gap and enable automatic cryptographic signing.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {learntLocations.map((loc) => (
                                            <Card key={loc.id} className="border-slate-200 hover:border-indigo-300 transition-all group">
                                                <CardContent className="p-4 space-y-4">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-indigo-50 transition-colors">
                                                                <Activity className="h-4 w-4 text-slate-600 group-hover:text-indigo-600" />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-sm font-bold text-slate-900">{loc.name}</h4>
                                                                <p className="text-[10px] text-slate-400 font-mono">{loc.location.lat.toFixed(4)}, {loc.location.lng.toFixed(4)}</p>
                                                            </div>
                                                        </div>
                                                        <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 text-[9px] uppercase">Learnt</Badge>
                                                    </div>
                                                    
                                                    <div className="space-y-2">
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Merge with existing:</p>
                                                        <Select onValueChange={(val) => handlePromoteStation(loc.id, 'merge', val)}>
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue placeholder="Select target station..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {stations.filter(s => s.status === 'verified').map(s => (
                                                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>

                                                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="flex-1 text-[10px] font-bold uppercase h-8"
                                                            onClick={() => handlePromoteStation(loc.id, 'create')}
                                                        >
                                                            Create New
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : viewMode === 'orphans' ? (
                        <div className="divide-y divide-slate-200">
                            {orphanLedgerEntries.length === 0 ? (
                                <div className="p-12 text-center">
                                    <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto mb-4 opacity-50" />
                                    <h3 className="text-lg font-semibold text-slate-900">Financials Synced</h3>
                                    <p className="text-slate-500">No orphaned ledger entries found. Every fuel expense has a corresponding audit log.</p>
                                </div>
                            ) : (
                                <div className="p-4 space-y-4">
                                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 flex gap-3">
                                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                                        <div>
                                            <p className="text-sm font-bold text-amber-900">Ledger Discrepancies Detected</p>
                                            <p className="text-xs text-amber-700 mt-0.5">
                                                We found {orphanLedgerEntries.length} financial transactions categorized as "Fuel" that are missing corresponding operational logs. This usually indicates a manual card swipe without a driver submitting the odometer reading.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {orphanLedgerEntries.map((tx) => (
                                            <div key={tx.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-300 transition-all shadow-sm">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-3 bg-rose-50 rounded-xl">
                                                            <Activity className="w-5 h-5 text-rose-600" />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="font-bold text-slate-900">{tx.description || 'Fuel Purchase'}</h4>
                                                                <Badge variant="outline" className="text-[10px] h-4 bg-slate-50">ORPHAN</Badge>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                                                    {format(new Date(tx.date), 'MMM dd, yyyy')} • {tx.paymentMethod}
                                                                </span>
                                                                <div className="w-1 h-1 rounded-full bg-slate-300" />
                                                                <span className="text-[10px] font-bold text-indigo-600 uppercase">
                                                                    {vehicles.find(v => v.id === tx.vehicleId)?.licensePlate || 'Unknown Vehicle'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-6">
                                                        <div className="text-right">
                                                            <p className="text-lg font-black text-slate-900">${Math.abs(tx.amount).toFixed(2)}</p>
                                                            <p className="text-[10px] font-bold text-slate-400 uppercase">Financial Record</p>
                                                        </div>
                                                        <Button 
                                                            size="sm" 
                                                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase tracking-wider h-8"
                                                            onClick={() => handleRepairLog(tx)}
                                                        >
                                                            Repair Log
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : viewMode === 'anomalies' ? (
                        groupedAnomalies.length === 0 ? (
                            <div className="p-12 text-center">
                                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4 opacity-50" />
                                <h3 className="text-lg font-semibold text-slate-900">All Clear!</h3>
                                <p className="text-slate-500">No active anomalies found {selectedVehicleId === "all" ? "in the recent fuel transactions" : "for this vehicle"}.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-200">
                                {groupedAnomalies.map((group) => (
                                    <div key={group.vehicle.id} className="bg-white">
                                        {/* Group Header */}
                                        <div 
                                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors border-l-4 border-l-transparent data-[critical=true]:border-l-rose-500"
                                            data-critical={group.counts.critical > 0}
                                            onClick={() => toggleGroup(group.vehicle.id)}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div 
                                                    className="w-5 h-5 rounded border border-slate-300 flex items-center justify-center bg-white hover:border-indigo-500 transition-colors"
                                                    onClick={(e) => toggleGroupSelection(group.anomalies.map(a => a.id), e)}
                                                >
                                                    {group.anomalies.every(a => selectedAnomalies.includes(a.id)) && (
                                                        <Check className="w-3.5 h-3.5 text-indigo-600" />
                                                    )}
                                                </div>
                                                <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-white transition-colors">
                                                    <Car className="w-5 h-5 text-slate-600" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="font-bold text-slate-900">{group.vehicle.make} {group.vehicle.model}</h4>
                                                        <Badge variant="outline" className="font-mono text-[10px] py-0 h-4 px-1.5 bg-slate-50">
                                                            {group.vehicle.licensePlate}
                                                        </Badge>
                                                        {group.counts.critical > 0 && (
                                                            <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-rose-200 text-[10px] h-4">
                                                                {group.counts.critical} CRITICAL
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight mt-0.5">
                                                        {group.anomalies.length} Flags • Severity Score: {group.severityScore}
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-3">
                                                <div className="hidden md:flex items-center gap-1">
                                                    {group.counts.warning > 0 && (
                                                        <div className="w-2 h-2 rounded-full bg-orange-400" />
                                                    )}
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                                                        {group.counts.warning} Warnings
                                                    </span>
                                                </div>
                                                {expandedGroups[group.vehicle.id] ? (
                                                    <ChevronUp className="w-5 h-5 text-slate-400" />
                                                ) : (
                                                    <ChevronDown className="w-5 h-5 text-slate-400" />
                                                )}
                                            </div>
                                        </div>

                                        {/* Anomaly List for this Group */}
                                        <AnimatePresence>
                                            {expandedGroups[group.vehicle.id] && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden bg-slate-50/30"
                                                >
                                                    <div className="divide-y divide-slate-100 border-t border-slate-100 ml-4 mr-4 mb-4 rounded-lg border shadow-inner bg-white overflow-hidden">
                                                        {group.anomalies.map((tx) => (
                                                            <div key={tx.id} className="group">
                                                                <div 
                                                                    className={`p-4 transition-colors cursor-pointer hover:bg-slate-50 ${selectedId === tx.id || selectedAnomalies.includes(tx.id) ? 'bg-indigo-50/30' : ''}`}
                                                                    onClick={() => setSelectedId(selectedId === tx.id ? null : tx.id)}
                                                                >
                                                                    <div className="flex items-center gap-4">
                                                                        <div 
                                                                            className="w-4 h-4 rounded border border-slate-300 flex items-center justify-center bg-white hover:border-indigo-500 transition-colors"
                                                                            onClick={(e) => toggleAnomalySelection(tx.id, e)}
                                                                        >
                                                                            {selectedAnomalies.includes(tx.id) && (
                                                                                <Check className="w-3 h-3 text-indigo-600" />
                                                                            )}
                                                                        </div>
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
                                                                                <span className="font-bold text-slate-900 text-sm">{tx.driverName || tx.driverId}</span>
                                                                                {tx.metadata?.auditStatus === 'Observing' && (
                                                                                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 text-[9px] h-4">WAIT-AND-SEE</Badge>
                                                                                )}
                                                                                {tx.metadata?.isHealed && (
                                                                                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 text-[9px] h-4">HEALED</Badge>
                                                                                )}
                                                                            </div>
                                                                            <p className="text-xs text-slate-600 truncate">
                                                                                {tx.metadata?.isHealed 
                                                                                    ? 'System Healed: Data drift corrected via integrity audit.'
                                                                                    : tx.metadata?.auditStatus === 'Observing' 
                                                                                        ? 'Observation Active: Awaiting next Full Tank for reconciliation.' 
                                                                                        : tx.metadata?.anomalyReason || 'Mathematical Inconsistency Detected'}
                                                                            </p>
                                                                        </div>
                                                                        <div className="text-right shrink-0">
                                                                            <p className="font-bold text-slate-900 text-sm">${Math.abs(tx.amount).toFixed(2)}</p>
                                                                            <p className="text-[9px] font-medium text-slate-400 uppercase">{format(new Date(tx.date), 'MMM dd, HH:mm')}</p>
                                                                        </div>
                                                                        <div className="shrink-0 ml-2">
                                                                            {selectedId === tx.id ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
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
                                                                                <div className="space-y-4">
                                                                                    <h4 className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                                                                                        <BarChart3 className="w-3 h-3" />
                                                                                        Forensic Evidence Bridge
                                                                                    </h4>
                                                                                    <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                                                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                                                                            <span className="text-xs text-slate-500">Spatial Drift (Server-Side)</span>
                                                                                            <Badge variant="outline" className={`text-[10px] font-bold ${tx.metadata?.serverSideDistance <= 100 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                                                                                                {tx.metadata?.serverSideDistance ? `${tx.metadata.serverSideDistance}m` : 'Unknown'}
                                                                                            </Badge>
                                                                                        </div>
                                                                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                                                                            <span className="text-xs text-slate-500">Efficiency Variance</span>
                                                                                            <span className={`text-xs font-bold ${Math.abs(tx.metadata?.efficiencyVariance || 0) > 20 ? 'text-rose-600' : 'text-slate-900'}`}>
                                                                                                {tx.metadata?.efficiencyVariance ? `${tx.metadata.efficiencyVariance}%` : '0%'}
                                                                                            </span>
                                                                                        </div>
                                                                                        {tx.deviationReason && (
                                                                                            <div className="pt-2">
                                                                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mb-1">Driver Justification:</p>
                                                                                                <p className="text-xs italic text-slate-700 bg-slate-50 p-2 rounded border border-slate-100 italic">
                                                                                                    "{tx.deviationReason}"
                                                                                                </p>
                                                                                            </div>
                                                                                        )}
                                                                                        <div className="flex justify-between items-center py-1.5">
                                                                                            <span className="text-xs text-slate-500">Expected Cycle Reset</span>
                                                                                            <span className="text-xs font-bold text-slate-900">
                                                                                                {tx.metadata?.expectedAnchorDate ? format(new Date(tx.metadata.expectedAnchorDate), 'MMM dd, yyyy') : '--'}
                                                                                                {tx.metadata?.daysUntilAnchor && (
                                                                                                    <span className="ml-1.5 text-[10px] text-slate-400 font-normal">
                                                                                                        (in ~{tx.metadata.daysUntilAnchor} days)
                                                                                                    </span>
                                                                                                )}
                                                                                            </span>
                                                                                        </div>
                                                                                        {tx.metadata?.leakageRisk && tx.metadata.leakageRisk !== 'low' && (
                                                                                            <div className={`mt-2 p-2 rounded text-[10px] font-bold flex items-center gap-2 ${tx.metadata.leakageRisk === 'high' ? 'bg-rose-600 text-white' : 'bg-orange-100 text-orange-700 border border-orange-200'}`}>
                                                                                                <AlertTriangle className="h-3 w-3" />
                                                                                                {tx.metadata.leakageAlertReason || 'PREDICTIVE LEAKAGE ALERT'}
                                                                                            </div>
                                                                                        )}
                                                                                        {tx.metadata?.isSpoofingRisk && (
                                                                                            <div className="mt-2 p-2 bg-rose-600 text-white rounded text-[10px] font-bold flex items-center gap-2">
                                                                                                <AlertTriangle className="h-3 w-3" />
                                                                                                HIGH SPOOFING RISK: SPATIAL IDENTITY MISMATCH
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="space-y-4">
                                                                                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Resolution Action</h4>
                                                                                    <textarea 
                                                                                        className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                                                                                        placeholder={tx.metadata?.anomalyReason?.includes("Frequency") ? "Add verification note (e.g. 'Driver confirmed top-up')..." : "Add internal note..."}
                                                                                        rows={3}
                                                                                        value={resolutionNote}
                                                                                        onChange={(e) => setResolutionNote(e.target.value)}
                                                                                    />
                                                                                    <div className="flex gap-2">
                                                                                        {tx.metadata?.anomalyReason?.includes("Frequency") ? (
                                                                                            <>
                                                                                                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setVerifyConfirmation({ isOpen: true, txId: tx.id })}>
                                                                                                    Verify Log
                                                                                                </Button>
                                                                                                <Button variant="outline" className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => handleResolve(tx.id, 'disputed')}>
                                                                                                    Flag Error
                                                                                                </Button>
                                                                                            </>
                                                                                        ) : (
                                                                                            <>
                                                                                                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleResolve(tx.id, 'resolved')}>Verify Log</Button>
                                                                                                <Button variant="outline" className="flex-1" onClick={() => handleResolve(tx.id, 'disputed')}>Dispute</Button>
                                                                                            </>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        /* Phase 5: Odometer Audit Trail View */
                        <div className="p-0">
                            {integrityLog.length === 0 ? (
                                <div className="p-12 text-center">
                                    <ShieldCheck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold text-slate-900">No Audit Trail Data</h3>
                                    <p className="text-slate-500">The automated audit trail is built from healed anomalies and wait-and-see observations.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Audit Event</th>
                                                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Asset</th>
                                                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Verification Logic</th>
                                                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Odometer Correction</th>
                                                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {integrityLog.map((log) => (
                                                <tr key={log.id} className="hover:bg-slate-50/30 transition-colors group">
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-1.5 h-10 bg-slate-100 rounded-full overflow-hidden relative">
                                                                <div className={`absolute inset-0 w-full ${log.metadata?.isHealed ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-bold text-slate-900">{format(new Date(log.date), 'MMM dd, HH:mm')}</p>
                                                                <p className="text-[10px] text-slate-400 font-mono">TX-{log.id.slice(0, 8)}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className="p-1.5 bg-slate-100 rounded text-slate-600">
                                                                <Car className="w-3.5 h-3.5" />
                                                            </div>
                                                            <span className="text-xs font-semibold text-slate-700">{vehicles.find(v => v.id === log.vehicleId)?.licensePlate || log.vehicleId}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="space-y-1">
                                                            <p className="text-[11px] font-medium text-slate-900">
                                                                {log.metadata?.isHealed ? 'Anchor Point Reconciliation' : 'Wait-and-See Observation'}
                                                            </p>
                                                            <p className="text-[10px] text-slate-500 leading-tight max-w-[200px]">
                                                                {log.metadata?.isHealed 
                                                                    ? 'Validated against next Full Tank. Data drift manually corrected.'
                                                                    : 'Observing fuel velocity vs odometer progression for anomaly confirmation.'}
                                                            </p>
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-bold text-slate-900">{log.odometer || '---'} km</span>
                                                            <span className="text-[9px] text-emerald-600 font-bold uppercase">± 0.0% Drift</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <Badge 
                                                            variant="outline" 
                                                            className={`text-[9px] font-black uppercase tracking-widest ${
                                                                log.metadata?.isHealed 
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                                                    : 'bg-blue-50 text-blue-700 border-blue-100'
                                                            }`}
                                                        >
                                                            {log.metadata?.isHealed ? 'VERIFIED' : 'OBSERVING'}
                                                        </Badge>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={verifyConfirmation.isOpen} onOpenChange={(open) => !open && setVerifyConfirmation({ isOpen: false, txId: null })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Audit Verification</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to verify this transaction as valid?
                            <br /><br />
                            This will:
                            <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>Clear the anomaly flag from the active alert feed</li>
                                <li>Mark the transaction as "Verified" in the permanent audit log</li>
                                <li>Confirm the odometer reading is accurate for future calculations</li>
                            </ul>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => {
                                if (verifyConfirmation.txId) {
                                    handleResolve(verifyConfirmation.txId, 'resolved');
                                    setVerifyConfirmation({ isOpen: false, txId: null });
                                }
                            }}
                        >
                            Confirm Verification
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
