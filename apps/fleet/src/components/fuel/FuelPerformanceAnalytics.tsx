import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { 
    LineChart, 
    Line, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    AreaChart, 
    Area, 
    BarChart, 
    Bar, 
    Legend,
    Cell
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { FuelEntry } from '../../types/fuel';
import { Vehicle } from '../../types/vehicle';
import { format, subMonths, isAfter, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';
import { TrendingUp, TrendingDown, Activity, AlertTriangle, Droplets, Zap, ShieldCheck, Users } from 'lucide-react';
import { cn } from "../ui/utils";

interface FuelPerformanceAnalyticsProps {
    entries: FuelEntry[];
    vehicles: Vehicle[];
    drivers: any[];
}

export function FuelPerformanceAnalytics({ entries, vehicles, drivers }: FuelPerformanceAnalyticsProps) {
    // 1. Prepare Long-term Trend Data (Last 6 Months)
    const trendData = useMemo(() => {
        const sixMonthsAgo = subMonths(new Date(), 6);
        const months = eachMonthOfInterval({
            start: startOfMonth(sixMonthsAgo),
            end: endOfMonth(new Date())
        });

        return months.map(month => {
            const monthStart = startOfMonth(month);
            const monthEnd = endOfMonth(month);
            const monthEntries = entries.filter(e => {
                const d = new Date(e.date);
                return d >= monthStart && d <= monthEnd;
            });

            const totalCost = monthEntries.reduce((sum, e) => sum + e.amount, 0);
            const totalLiters = monthEntries.reduce((sum, e) => sum + (e.liters || 0), 0);
            const anomalies = monthEntries.filter(e => e.metadata?.integrityStatus === 'critical').length;
            const avgPrice = totalLiters > 0 ? totalCost / totalLiters : 0;

            return {
                name: format(month, 'MMM'),
                cost: Number(totalCost.toFixed(2)),
                liters: Number(totalLiters.toFixed(1)),
                anomalies,
                avgPrice: Number(avgPrice.toFixed(2))
            };
        });
    }, [entries]);

    // 2. Efficiency by Vehicle
    const vehiclePerformance = useMemo(() => {
        return vehicles.map(v => {
            const vEntries = entries.filter(e => e.vehicleId === v.id);
            const totalLiters = vEntries.reduce((sum, e) => sum + (e.liters || 0), 0);
            
            // In a real scenario, we'd sum distances from trips or use last-to-first odo
            // For this view, we'll estimate or use the last 30 days distance if available.
            // Simplified: We'll show Liter Intensity as a proxy for efficiency if distance isn't reliable
            const totalCost = vEntries.reduce((sum, e) => sum + e.amount, 0);
            const flagCount = vEntries.filter(e => e.metadata?.integrityStatus === 'critical').length;

            return {
                plate: v.licensePlate,
                model: v.model,
                totalLiters,
                totalCost,
                flags: flagCount,
                health: v.metrics?.healthScore || 100
            };
        }).sort((a, b) => b.totalLiters - a.totalLiters).slice(0, 5);
    }, [entries, vehicles]);

    const totalStats = useMemo(() => {
        const critical = entries.filter(e => e.metadata?.integrityStatus === 'critical').length;
        const total = entries.length;
        const integrityRate = total > 0 ? ((total - critical) / total) * 100 : 100;

        return {
            totalEntries: total,
            criticalEntries: critical,
            integrityRate: Number(integrityRate.toFixed(1))
        };
    }, [entries]);

    // 3. Fuel Spend by Driver
    const driverPerformance = useMemo(() => {
        const driverMap: Record<string, { name: string; totalLiters: number; totalCost: number; flags: number }> = {};

        entries.forEach(e => {
            const dId = e.driverId || 'unknown';
            if (!driverMap[dId]) {
                const driverRecord = Array.isArray(drivers) ? drivers.find((d: any) => d.id === dId) : null;
                driverMap[dId] = {
                    name: driverRecord?.name || `Driver ${dId.slice(0, 6)}`,
                    totalLiters: 0,
                    totalCost: 0,
                    flags: 0,
                };
            }
            driverMap[dId].totalLiters += e.liters || 0;
            driverMap[dId].totalCost += e.amount;
            if (e.metadata?.integrityStatus === 'critical') {
                driverMap[dId].flags += 1;
            }
        });

        return Object.values(driverMap)
            .sort((a, b) => b.totalCost - a.totalCost)
            .slice(0, 5);
    }, [entries, drivers]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0 shadow-lg">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <ShieldCheck className="w-5 h-5 text-green-400" />
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Target: 98%</Badge>
                        </div>
                        <p className="text-sm font-medium text-slate-400">Data Integrity Rate</p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-3xl font-bold">{totalStats.integrityRate}%</h3>
                            <span className="text-xs text-slate-500">Verified</span>
                        </div>
                        <div className="mt-4 h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-green-500 transition-all duration-1000" 
                                style={{ width: `${totalStats.integrityRate}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6 flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-slate-500">System Anomalies</p>
                            <h3 className="text-2xl font-bold text-slate-900">{totalStats.criticalEntries}</h3>
                            <p className="text-[10px] text-red-600 flex items-center gap-1 font-bold uppercase">
                                <AlertTriangle className="w-3 h-3" />
                                Action Required
                            </p>
                        </div>
                        <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                            <Activity className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6 flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-slate-500">Price Volatility</p>
                            <h3 className="text-2xl font-bold text-slate-900">
                                {trendData.length > 1 ? (trendData[trendData.length - 1].avgPrice - trendData[trendData.length - 2].avgPrice).toFixed(2) : '0.00'}
                            </h3>
                            <p className="text-[10px] text-slate-500 font-medium">Monthly Change ($/L)</p>
                        </div>
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Consumption Trend</CardTitle>
                        <CardDescription>Monthly fuel volume and cost tracking.</CardDescription>
                    </CardHeader>
                    <CardContent className="min-h-[300px] w-full relative">
                        <div className="w-full">
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={trendData}>
                                    <defs>
                                        <linearGradient id="colorLiters" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                    <Tooltip 
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Area type="monotone" dataKey="liters" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorLiters)" name="Liters" />
                                    <Area type="monotone" dataKey="cost" stroke="#10b981" strokeWidth={2} fillOpacity={0.1} fill="#10b981" name="Cost ($)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Integrity Health by Vehicle</CardTitle>
                        <CardDescription>Top consumers and their flag frequency.</CardDescription>
                    </CardHeader>
                    <CardContent className="min-h-[300px] w-full relative">
                        <div className="w-full">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={vehiclePerformance} layout="vertical" margin={{ left: 30 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis 
                                        dataKey="plate" 
                                        type="category" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fontSize: 10, fontWeight: 'bold' }} 
                                    />
                                    <Tooltip 
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="totalLiters" radius={[0, 4, 4, 0]} barSize={20} name="Total Liters">
                                        {vehiclePerformance.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.flags > 0 ? '#f43f5e' : '#6366f1'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Zap className="w-5 h-5 text-orange-500 fill-orange-500" />
                        Anomaly Insights
                    </CardTitle>
                    <CardDescription>Automatic pattern detection from historical backfill data.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                                <TrendingDown className="w-4 h-4 text-red-500" />
                                High Efficiency Risk
                            </h4>
                            <div className="space-y-4">
                                {vehiclePerformance.filter(v => v.flags > 2).map((v, i) => (
                                    <div key={i} className="flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[10px] font-bold">
                                                {v.plate.substring(0, 2)}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-900">{v.plate}</p>
                                                <p className="text-[10px] text-slate-500">{v.model}</p>
                                            </div>
                                        </div>
                                        <Badge variant="destructive" className="text-[10px]">{v.flags} Critical Flags</Badge>
                                    </div>
                                ))}
                                {vehiclePerformance.filter(v => v.flags > 2).length === 0 && (
                                    <p className="text-xs text-slate-500 italic">No high-risk vehicles detected.</p>
                                )}
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-green-500" />
                                Best Performance
                            </h4>
                            <div className="space-y-4">
                                {vehiclePerformance.filter(v => v.flags === 0).map((v, i) => (
                                    <div key={i} className="flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-[10px] font-bold">
                                                {v.plate.substring(0, 2)}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-900">{v.plate}</p>
                                                <p className="text-[10px] text-slate-500">{v.model}</p>
                                            </div>
                                        </div>
                                        <Badge variant="outline" className="text-[10px] border-green-200 text-green-700 bg-green-50">100% Integrity</Badge>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Driver Performance Chart */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-500" />
                        Fuel Spend by Driver
                    </CardTitle>
                    <CardDescription>Top 5 drivers ranked by total fuel cost. Red bars indicate drivers with critical integrity flags.</CardDescription>
                </CardHeader>
                <CardContent className="min-h-[300px] w-full relative">
                    {driverPerformance.length > 0 ? (
                        <div className="w-full">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={driverPerformance} layout="vertical" margin={{ left: 50, right: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis 
                                        type="number" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                        tickFormatter={(value: number) => `$${value.toLocaleString()}`}
                                    />
                                    <YAxis 
                                        dataKey="name" 
                                        type="category" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fontSize: 11, fontWeight: 'bold', fill: '#334155' }}
                                        width={100}
                                    />
                                    <Tooltip 
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value: number, name: string) => {
                                            if (name === 'Total Cost') return [`$${value.toFixed(2)}`, name];
                                            return [value, name];
                                        }}
                                    />
                                    <Bar dataKey="totalCost" radius={[0, 4, 4, 0]} barSize={20} name="Total Cost">
                                        {driverPerformance.map((entry, index) => (
                                            <Cell key={`dcell-${index}`} fill={entry.flags > 0 ? '#f43f5e' : '#6366f1'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-[300px] text-slate-400">
                            <p className="text-sm">No driver data available.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}