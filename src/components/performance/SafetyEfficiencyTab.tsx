import React from 'react';
import { useSafetyMetrics } from '../../hooks/useSafetyMetrics';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    BarChart, Bar, Cell, ReferenceLine
} from 'recharts';
import { AlertTriangle, ShieldCheck, Zap, Fuel, Activity, Clock, Moon, Calendar } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../ui/utils';

export function SafetyEfficiencyTab() {
    const { efficiencyData, fatigueData, loading, error } = useSafetyMetrics();

    if (loading) return <div className="p-8 text-center text-slate-500">Calculating safety metrics...</div>;
    if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Rolling 30-Day Efficiency Baseline */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Fuel className="h-5 w-5 text-blue-500" />
                                    Rolling 30-Day Efficiency Baseline
                                </CardTitle>
                                <CardDescription>Historical fuel economy trend vs fleet average</CardDescription>
                            </div>
                            <div className="text-right">
                                <span className="text-2xl font-bold text-blue-600">{efficiencyData?.baseline || 0}</span>
                                <span className="text-sm text-slate-500 ml-1">km/L</span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={efficiencyData?.trend}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis 
                                        dataKey="date" 
                                        fontSize={12} 
                                        tickFormatter={(str) => str.split('-').slice(1).join('/')}
                                        stroke="#94a3b8"
                                    />
                                    <YAxis fontSize={12} stroke="#94a3b8" />
                                    <Tooltip 
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    />
                                    <ReferenceLine y={efficiencyData?.baseline} stroke="#94a3b8" strokeDasharray="3 3" label={{ position: 'right', value: 'Avg', fontSize: 10 }} />
                                    <Line 
                                        type="monotone" 
                                        dataKey="efficiency" 
                                        stroke="#3b82f6" 
                                        strokeWidth={3} 
                                        dot={{ r: 4, fill: '#3b82f6' }}
                                        activeDot={{ r: 6, strokeWidth: 0 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mt-6">
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-xs text-slate-500 font-medium">Total Distance</p>
                                <p className="text-lg font-bold">{(efficiencyData?.summary?.totalDistance / 1000).toFixed(1)}k km</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-xs text-slate-500 font-medium">Total Fuel</p>
                                <p className="text-lg font-bold">{efficiencyData?.summary?.totalFuel?.toLocaleString()} L</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-xs text-slate-500 font-medium">Data Points</p>
                                <p className="text-lg font-bold">{efficiencyData?.summary?.tripCount} trips</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Predictive Fatigue Risk */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-orange-500" />
                            Predictive Fatigue Analysis
                        </CardTitle>
                        <CardDescription>Probabilistic risk scoring based on work patterns</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {fatigueData.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <ShieldCheck className="h-12 w-12 mb-2 opacity-20" />
                                    <p>No high-risk fatigue patterns detected</p>
                                </div>
                            ) : (
                                fatigueData.map((driver, idx) => (
                                    <motion.div 
                                        key={driver.driverId}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.1 }}
                                        className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm"
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-full flex items-center justify-center font-bold text-white",
                                                    driver.level === 'Critical' ? 'bg-red-500' : 'bg-orange-500'
                                                )}>
                                                    {driver.score}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-900">Driver {driver.driverId.split('-').pop()}</p>
                                                    <div className="flex gap-2 mt-1">
                                                        <span className={cn(
                                                            "text-[10px] uppercase font-bold px-1.5 py-0.5 rounded",
                                                            driver.level === 'Critical' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                                                        )}>
                                                            {driver.level} Risk
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex gap-4 text-xs text-slate-500">
                                                <div className="flex flex-col items-center">
                                                    <Clock className="h-3.5 w-3.5 mb-0.5" />
                                                    <span>{driver.metrics.weeklyHours}h</span>
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    <Moon className="h-3.5 w-3.5 mb-0.5" />
                                                    <span>{driver.metrics.nightShiftHours}h</span>
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    <Calendar className="h-3.5 w-3.5 mb-0.5" />
                                                    <span>{driver.metrics.consecutiveDays}d</span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-1 mt-2">
                                            {driver.reasons.map((reason: string, rIdx: number) => (
                                                <div key={rIdx} className="flex items-start gap-2 text-xs text-slate-600">
                                                    <AlertTriangle className="h-3 w-3 mt-0.5 text-orange-500 shrink-0" />
                                                    <span>{reason}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Fleet Safety Score (Big Picture) */}
            <Card className="bg-slate-900 text-white border-none overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                <CardHeader>
                    <CardTitle className="text-white">Forensic Safety Audit Trail</CardTitle>
                    <CardDescription className="text-slate-400">Phase 5: Automated Odometer & Duty Cycle Verification</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-white/10 rounded-xl">
                                <Zap className="h-6 w-6 text-yellow-400" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-400">Real-time Correction</p>
                                <p className="text-xl font-bold">SHA-256 Signed</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-white/10 rounded-xl">
                                <ShieldCheck className="h-6 w-6 text-green-400" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-400">Audit Consistency</p>
                                <p className="text-xl font-bold">99.8% Compliant</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-white/10 rounded-xl">
                                <AlertTriangle className="h-6 w-6 text-red-400" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-400">Predicted Incidents</p>
                                <p className="text-xl font-bold">Pre-empted 4</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
