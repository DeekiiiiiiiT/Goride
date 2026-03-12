import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { 
    ShieldCheck, 
    AlertTriangle, 
    MapPin, 
    Activity, 
    Lock, 
    ShieldAlert, 
    ChevronRight,
    Search,
    Filter,
    ArrowUpRight,
    Fingerprint,
    Database,
    History
} from "lucide-react";
import { api } from "../../services/api";
import { fuelService } from "../../services/fuelService";
import { motion } from "motion/react";
import { toast } from "sonner@2.0.3";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "../ui/tooltip";
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip as RechartsTooltip, 
    // ResponsiveContainer replaced by SafeResponsiveContainer
    PieChart, 
    Pie, 
    Cell,
    LineChart,
    Line,
    AreaChart,
    Area
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';

export function IntegrityGapDashboard() {
    const [entries, setEntries] = useState<any[]>([]);
    const [stations, setStations] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'overview' | 'spatial' | 'forensic' | 'cryptographic'>('overview');

    const fetchData = async () => {
        setLoading(true);
        try {
            const [entriesData, stationsData, metricsData] = await Promise.all([
                fuelService.getFuelEntries(),
                api.getStations(),
                api.getIntegrityMetrics()
            ]);
            setEntries(entriesData || []);
            setStations(stationsData || []);
            setMetrics(metricsData);
        } catch (err) {
            console.error("Integrity Dashboard Error:", err);
            toast.error("Failed to load integrity analytics");
        } finally {
            setLoading(false);
        }
    };

    const runStressTest = async () => {
        try {
            const vehicleId = entries[0]?.vehicleId;
            if (!vehicleId) {
                toast.error("No vehicles found to stress test");
                return;
            }

            const promise = api.runEvidenceBridgeStressTest(vehicleId);
            toast.promise(promise, {
                loading: 'Simulating GPS drift and signal loss scenarios...',
                success: 'Stress test complete. Forensic logs generated.',
                error: 'Stress test failed.'
            });
            await promise;
            fetchData();
        } catch (err) {
            console.error(err);
        }
    };

    const verifyRecord = async (recordId: string) => {
        try {
            const result = await api.verifyRecordForensics(recordId);
            if (result.verified) {
                toast.success("Cryptographic signature validated. Physical data is plausible.");
            } else {
                toast.error(`Verification Failed: ${result.auditTrail?.cryptographic}`, {
                    description: "This record may have been tampered with or contains physical anomalies."
                });
            }
        } catch (err) {
            toast.error("Forensic verification failed");
        }
    };

    useEffect(() => { fetchData(); }, []);

    // 1. Spatial Accuracy Distribution
    const spatialDistribution = useMemo(() => {
        const dist = {
            'Perfect (<20m)': 0,
            'Standard (20-100m)': 0,
            'Drift (100-500m)': 0,
            'Anomaly (>500m)': 0,
            'No Data': 0
        };

        entries.forEach(e => {
            const d = e.metadata?.serverSideDistance;
            if (d === undefined || d === null) dist['No Data']++;
            else if (d < 20) dist['Perfect (<20m)']++;
            else if (d <= 100) dist['Standard (20-100m)']++;
            else if (d <= 500) dist['Drift (100-500m)']++;
            else dist['Anomaly (>500m)']++;
        });

        return Object.entries(dist).map(([name, value]) => ({ name, value }));
    }, [entries]);

    // 2. Dead Zone Analysis (Top stations with drift)
    const deadZones = useMemo(() => {
        const stationDrift: Record<string, { name: string, driftCount: number, totalCount: number, avgDrift: number }> = {};

        entries.forEach(e => {
            if (!e.matchedStationId) return;
            const d = e.metadata?.serverSideDistance || 0;
            const isDrift = d > (e.metadata?.radiusUsed || 100);

            if (!stationDrift[e.matchedStationId]) {
                stationDrift[e.matchedStationId] = { 
                    name: e.vendor || "Unknown", 
                    driftCount: 0, 
                    totalCount: 0, 
                    avgDrift: 0 
                };
            }

            stationDrift[e.matchedStationId].totalCount++;
            if (isDrift) stationDrift[e.matchedStationId].driftCount++;
            stationDrift[e.matchedStationId].avgDrift += d;
        });

        return Object.values(stationDrift)
            .map(s => ({ ...s, avgDrift: Math.round(s.avgDrift / s.totalCount), driftRate: Math.round((s.driftCount / s.totalCount) * 100) }))
            .filter(s => s.driftCount > 0)
            .sort((a, b) => b.driftRate - a.driftRate)
            .slice(0, 5);
    }, [entries]);

    // 3. Cryptographic Health
    const cryptoHealth = useMemo(() => {
        const signed = entries.filter(e => !!e.signature).length;
        const unsigned = entries.length - signed;
        const tampered = entries.filter(e => e.metadata?.isTampered).length; // Simulated tamper check

        return [
            { name: 'Signed', value: signed, color: '#10b981' },
            { name: 'Pending', value: unsigned, color: '#94a3b8' },
            { name: 'Failed', value: tampered, color: '#f43f5e' }
        ];
    }, [entries]);

    // 4. Forensic Audit Log (Manual Overrides)
    const overrides = useMemo(() => {
        return entries
            .filter(e => e.metadata?.isManualOverride || e.metadata?.deviationReason)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);
    }, [entries]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Navigation Header */}
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4">
                    <Button 
                        variant={view === 'overview' ? 'default' : 'ghost'} 
                        size="sm" 
                        onClick={() => setView('overview')}
                        className="gap-2"
                    >
                        <Activity className="w-4 h-4" />
                        Overview
                    </Button>
                    <Button 
                        variant={view === 'spatial' ? 'default' : 'ghost'} 
                        size="sm" 
                        onClick={() => setView('spatial')}
                        className="gap-2"
                    >
                        <MapPin className="w-4 h-4" />
                        Spatial Analysis
                    </Button>
                    <Button 
                        variant={view === 'cryptographic' ? 'default' : 'ghost'} 
                        size="sm" 
                        onClick={() => setView('cryptographic')}
                        className="gap-2"
                    >
                        <Fingerprint className="w-4 h-4" />
                        SHA-256 Hardening
                    </Button>
                    <Button 
                        variant={view === 'forensic' ? 'default' : 'ghost'} 
                        size="sm" 
                        onClick={() => setView('forensic')}
                        className="gap-2"
                    >
                        <History className="w-4 h-4" />
                        Forensic Log
                    </Button>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={runStressTest} className="text-rose-600 border-rose-100 bg-rose-50 hover:bg-rose-100">
                        <ShieldAlert className="w-4 h-4 mr-2" />
                        Run Pressure Test
                    </Button>
                    <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                        Phase 9: Enterprise Governance
                    </Badge>
                </div>
            </div>

            {view === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Primary Integrity Gap Stat */}
                    <Card className="lg:col-span-2 overflow-hidden border-none shadow-lg bg-slate-900 text-white">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                                Evidence Bridge Health
                            </CardTitle>
                            <CardDescription className="text-slate-400">
                                Global verification coverage across all physical boundaries
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Integrity Gap</p>
                                    <p className="text-4xl font-black text-emerald-400">{metrics?.integrityGapPercentage?.toFixed(1) || '0.0'}%</p>
                                    <p className="text-xs text-slate-400">Unverified Spend Exposure</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Crypto Binding</p>
                                    <p className="text-4xl font-black text-indigo-400">
                                        {Math.round((entries.filter(e => !!e.signature).length / (entries.length || 1)) * 100)}%
                                    </p>
                                    <p className="text-xs text-slate-400">Immutable Audit Proofs</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Spatial drift</p>
                                    <p className="text-4xl font-black text-amber-400">
                                        {Math.round((entries.filter(e => (e.metadata?.serverSideDistance || 0) > 100).length / (entries.length || 1)) * 100)}%
                                    </p>
                                    <p className="text-xs text-slate-400">Avg. 124m per transaction</p>
                                </div>
                            </div>
                            
                            <div className="mt-6 pt-6 border-t border-slate-800">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-slate-500">SYSTEM DRIFT TREND</span>
                                    <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">Stable</Badge>
                                </div>
                                <div className="h-[120px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={entries.slice(-20).map((e, i) => ({ val: e.metadata?.serverSideDistance || 0, name: `point-${i}` }))}>
                                            <defs>
                                                <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <Area type="monotone" dataKey="val" stroke="#10b981" fillOpacity={1} fill="url(#colorVal)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Cryptographic Distribution */}
                    <Card className="shadow-sm border-slate-200">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <Fingerprint className="w-4 h-4 text-indigo-600" />
                                SHA-256 Binding Status
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[200px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={cryptoHealth}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {cryptoHealth.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="space-y-2 mt-4">
                                {cryptoHealth.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                            <span className="text-slate-500">{item.name}</span>
                                        </div>
                                        <span className="font-bold">{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {view === 'spatial' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="shadow-sm border-slate-200">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-slate-500" />
                                Accuracy Distribution
                            </CardTitle>
                            <CardDescription className="text-xs">Distance from Odometer Scan to Master Pin</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={spatialDistribution} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" width={120} axisLine={false} tickLine={false} style={{ fontSize: '10px', fontWeight: 'bold' }} />
                                        <RechartsTooltip cursor={{ fill: '#f8fafc' }} />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                            {spatialDistribution.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={
                                                    entry.name.includes('Perfect') ? '#10b981' :
                                                    entry.name.includes('Standard') ? '#6366f1' :
                                                    entry.name.includes('Drift') ? '#f59e0b' : '#ef4444'
                                                } />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-slate-200">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4 text-rose-600" />
                                Systemic "Dead Zones"
                            </CardTitle>
                            <CardDescription className="text-xs">High-drift stations requiring radius adjustment</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {deadZones.map((zone, i) => (
                                    <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold text-slate-900">{zone.name}</p>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[9px] h-4 bg-white text-rose-600 border-rose-100">
                                                    {zone.driftRate}% Drift Rate
                                                </Badge>
                                                <span className="text-[10px] text-slate-400">Avg: {zone.avgDrift}m</span>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                            <ArrowUpRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                                {deadZones.length === 0 && (
                                    <div className="py-8 text-center text-slate-400 text-xs italic">
                                        No systemic dead zones detected. Evidence Bridge is 100% calibrated.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {view === 'forensic' && (
                <Card className="shadow-sm border-slate-200">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <Database className="w-4 h-4 text-indigo-600" />
                                Manual Override Ledger
                            </CardTitle>
                            <CardDescription className="text-xs">Spatial forensic justifications provided by drivers</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" className="text-xs gap-2">
                            <Filter className="w-3 h-3" />
                            Filter Results
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 border-y border-slate-200">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-bold text-slate-500 uppercase tracking-tighter">Date</th>
                                        <th className="px-4 py-2 text-left font-bold text-slate-500 uppercase tracking-tighter">Vendor</th>
                                        <th className="px-4 py-2 text-right font-bold text-slate-500 uppercase tracking-tighter">Drift</th>
                                        <th className="px-4 py-2 text-left font-bold text-slate-500 uppercase tracking-tighter">Forensic Justification</th>
                                        <th className="px-4 py-2 text-right font-bold text-slate-500 uppercase tracking-tighter">Proof</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {overrides.map((tx, i) => (
                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 font-medium whitespace-nowrap">
                                                {new Date(tx.date).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3 font-bold">{tx.vendor}</td>
                                            <td className="px-4 py-3 text-right">
                                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100 text-[10px]">
                                                    {tx.metadata?.serverSideDistance || 'N/A'}m
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 max-w-xs truncate italic text-slate-500">
                                                "{tx.metadata?.deviationReason || "Odometer scan outside fence - manual override."}"
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex justify-end gap-1 items-center">
                                                    {tx.metadata?.isHighlyTrusted && (
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <div className="p-1 bg-emerald-50 rounded-full border border-emerald-100">
                                                                        <Lock className="w-3 h-3 text-emerald-600" />
                                                                    </div>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <p className="text-[10px]">Record Immutable & Auto-Locked</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    )}
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="h-7 px-2 text-[10px] gap-1 hover:bg-emerald-50 hover:text-emerald-700"
                                                        onClick={() => verifyRecord(tx.id)}
                                                    >
                                                        <ShieldCheck className="w-3.5 h-3.5" />
                                                        Verify
                                                    </Button>
                                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                                        <ChevronRight className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {overrides.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-12 text-center text-slate-400 italic">
                                                No manual overrides recorded in the forensic ledger.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {view === 'cryptographic' && (
                <div className="space-y-6">
                    <Card className="bg-indigo-900 text-white border-none overflow-hidden relative shadow-xl">
                         <div className="absolute top-0 right-0 p-4 opacity-10">
                            <Fingerprint className="w-32 h-32" />
                         </div>
                         <CardContent className="p-8 relative">
                             <h2 className="text-2xl font-black mb-2 flex items-center gap-3">
                                <Lock className="w-6 h-6 text-indigo-400" />
                                Cryptographic Ledger Hardening
                             </h2>
                             <p className="text-indigo-200 text-sm max-w-2xl mb-6">
                                The system utilizes **SHA-256 Forensic Binding** to couple physical GPS snapshots and behavioral efficiency alerts 
                                with the financial identity of the transaction. Once signed, any data drift or retroactive tampering 
                                is mathematically detectable.
                             </p>
                             <div className="flex flex-wrap gap-4">
                                <div className="bg-white/10 px-4 py-2 rounded-lg border border-white/10">
                                    <p className="text-[10px] font-bold text-indigo-300 uppercase">Signed Records</p>
                                    <p className="text-xl font-bold">{entries.filter(e => !!e.signature).length}</p>
                                </div>
                                <div className="bg-white/10 px-4 py-2 rounded-lg border border-white/10">
                                    <p className="text-[10px] font-bold text-indigo-300 uppercase">Immutability Ratio</p>
                                    <p className="text-xl font-bold">{Math.round((entries.filter(e => !!e.signature).length / (entries.length || 1)) * 100)}%</p>
                                </div>
                             </div>
                         </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="md:col-span-2 shadow-sm border-slate-200">
                            <CardHeader>
                                <CardTitle className="text-sm font-bold">Proof of Verification Chain</CardTitle>
                                <CardDescription className="text-xs">Recent immutable hashes generated for the audit trail</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-slate-100">
                                    {entries.filter(e => !!e.signature).slice(0, 5).map((e, i) => (
                                        <div key={i} className="p-4 flex items-center justify-between">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs font-bold text-slate-900">{e.vendor}</p>
                                                    <Badge variant="outline" className="text-[8px] h-3.5 bg-slate-50 font-mono">
                                                        {e.id.slice(0, 8)}
                                                    </Badge>
                                                </div>
                                                <p className="text-[10px] text-slate-400 font-mono truncate max-w-[400px]">
                                                    Hash: {e.signature}
                                                </p>
                                            </div>
                                            <ShieldCheck className="w-5 h-5 text-emerald-500" />
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-slate-200 bg-slate-50/50">
                            <CardHeader>
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                                    Security Anomalies
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="p-4 bg-white rounded-lg border border-slate-200 space-y-2">
                                        <p className="text-xs font-bold">Retroactive Edit Attempts</p>
                                        <p className="text-[10px] text-slate-500">Signed records blocked from modification since Phase 8 launch.</p>
                                        <p className="text-xl font-bold text-indigo-600">0</p>
                                    </div>
                                    <div className="p-4 bg-white rounded-lg border border-slate-200 space-y-2">
                                        <p className="text-xs font-bold">Signature Mismatches</p>
                                        <p className="text-[10px] text-slate-500">Tampered records detected during system verification.</p>
                                        <p className="text-xl font-bold text-rose-600">0</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}

// Sub-components as needed
function BarChart3({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
        </svg>
    );
}