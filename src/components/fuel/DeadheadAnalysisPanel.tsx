import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
    Route,
    Car,
    Fuel,
    AlertTriangle,
    ChevronUp,
    ChevronDown,
    RefreshCw,
    Info,
    TrendingDown,
    Shield,
    Clock
} from "lucide-react";
import { api } from "../../services/api";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "../ui/tooltip";
import { toast } from "sonner@2.0.3";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend } from 'recharts';

interface DeadheadVehicleResult {
    vehicleId: string;
    vehicleName: string;
    totalOdometerKm: number;
    tripKm: number;
    deadheadKm: number;
    personalKm: number;
    unaccountedKm: number;
    method: 'A' | 'C' | 'combined' | 'fallback';
    confidenceLevel: 'high' | 'medium' | 'low';
    confidenceReason: string;
    timeRatioDeadheadPct: number;
    gapBasedDeadheadKm: number;
    gapBasedPersonalKm: number;
    onlineHours: number;
    onTripHours: number;
    segmentCount: number;
    gapCount: number;
}

interface FleetDeadheadSummary {
    vehicleCount: number;
    totalOdometerKm: number;
    totalTripKm: number;
    totalDeadheadKm: number;
    totalPersonalKm: number;
    totalUnaccountedKm: number;
    fleetDeadheadPct: number;
    fleetPersonalPct: number;
    avgConfidence: string;
    methodBreakdown: Record<string, number>;
}

const COLORS = {
    trip: '#6366f1',       // indigo
    deadhead: '#f59e0b',   // amber
    personal: '#ef4444',   // red
    unaccounted: '#94a3b8' // slate
};

const METHOD_LABELS: Record<string, string> = {
    'A': 'Time Ratio',
    'C': 'Trip-Gap',
    'combined': 'Blended',
    'fallback': 'Industry Avg'
};

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
    high:   { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    medium: { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
    low:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200' }
};

type SortField = 'vehicleName' | 'totalOdometerKm' | 'tripKm' | 'deadheadKm' | 'personalKm' | 'deadheadPct' | 'personalPct' | 'confidenceLevel';
type SortDir = 'asc' | 'desc';

export function DeadheadAnalysisPanel() {
    const [fleetData, setFleetData] = useState<{ fleet: FleetDeadheadSummary; vehicles: DeadheadVehicleResult[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortField, setSortField] = useState<SortField>('personalPct');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const fetchDeadhead = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.getFleetDeadhead();
            setFleetData(data);
        } catch (err: any) {
            console.error('[DeadheadPanel] Fetch error:', err);
            setError(err.message || 'Failed to load deadhead attribution data');
            toast.error('Failed to load KM attribution data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDeadhead(); }, []);

    const sortedVehicles = useMemo(() => {
        if (!fleetData?.vehicles) return [];
        const arr = [...fleetData.vehicles];

        arr.sort((a, b) => {
            let aVal: number | string = 0;
            let bVal: number | string = 0;

            switch (sortField) {
                case 'vehicleName': aVal = a.vehicleName.toLowerCase(); bVal = b.vehicleName.toLowerCase(); break;
                case 'totalOdometerKm': aVal = a.totalOdometerKm; bVal = b.totalOdometerKm; break;
                case 'tripKm': aVal = a.tripKm; bVal = b.tripKm; break;
                case 'deadheadKm': aVal = a.deadheadKm; bVal = b.deadheadKm; break;
                case 'personalKm': aVal = a.personalKm; bVal = b.personalKm; break;
                case 'deadheadPct':
                    aVal = a.totalOdometerKm > 0 ? a.deadheadKm / a.totalOdometerKm : 0;
                    bVal = b.totalOdometerKm > 0 ? b.deadheadKm / b.totalOdometerKm : 0;
                    break;
                case 'personalPct':
                    aVal = a.totalOdometerKm > 0 ? a.personalKm / a.totalOdometerKm : 0;
                    bVal = b.totalOdometerKm > 0 ? b.personalKm / b.totalOdometerKm : 0;
                    break;
                case 'confidenceLevel':
                    const order = { high: 3, medium: 2, low: 1 };
                    aVal = order[a.confidenceLevel] || 0;
                    bVal = order[b.confidenceLevel] || 0;
                    break;
            }

            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });

        return arr;
    }, [fleetData, sortField, sortDir]);

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
    };

    const fmtKm = (km: number) => km >= 1000 ? `${(km / 1000).toFixed(1)}k` : Math.round(km).toLocaleString();
    const fmtPct = (num: number, denom: number) => denom > 0 ? `${((num / denom) * 100).toFixed(1)}%` : '—';

    // Loading state
    if (loading) {
        return (
            <div className="p-12 flex flex-col items-center justify-center gap-4">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-sm text-slate-500 font-medium">Calculating deadhead attribution across fleet...</p>
                <p className="text-[10px] text-slate-400">Analyzing odometer segments, trip gaps, and time ratios</p>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="p-12 flex flex-col items-center justify-center gap-4">
                <AlertTriangle className="w-10 h-10 text-amber-400" />
                <p className="text-sm text-slate-700 font-medium">Unable to Load Attribution Data</p>
                <p className="text-xs text-slate-500 max-w-md text-center">{error}</p>
                <Button size="sm" variant="outline" onClick={fetchDeadhead}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
                </Button>
            </div>
        );
    }

    if (!fleetData) return null;

    const { fleet, vehicles } = fleetData;

    // Phase 9 (Step 9.2): Guard against missing/malformed API response
    if (!fleet || !Array.isArray(vehicles)) {
        return (
            <div className="p-12 flex flex-col items-center justify-center gap-4">
                <AlertTriangle className="w-10 h-10 text-amber-400" />
                <p className="text-sm text-slate-700 font-medium">Unexpected Response Format</p>
                <p className="text-xs text-slate-500">The server returned data in an unexpected format. Try refreshing.</p>
                <Button size="sm" variant="outline" onClick={fetchDeadhead}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
                </Button>
            </div>
        );
    }

    const hasData = vehicles.some(v => v.totalOdometerKm > 0);

    // No data state
    if (!hasData) {
        return (
            <div className="p-12 flex flex-col items-center justify-center gap-4">
                <Route className="w-12 h-12 text-slate-200" />
                <h3 className="text-lg font-semibold text-slate-900">No KM Attribution Data</h3>
                <p className="text-sm text-slate-500 max-w-md text-center">
                    Deadhead analysis requires at least 2 fuel entries with odometer readings per vehicle. 
                    Import trip data and fuel logs to enable this analysis.
                </p>
            </div>
        );
    }

    // Donut chart data
    const fleetTripPct = fleet.totalOdometerKm > 0 ? ((fleet.totalTripKm / fleet.totalOdometerKm) * 100) : 0;
    const donutData = [
        { name: 'Trip (Revenue)', value: fleet.totalTripKm, color: COLORS.trip },
        { name: 'Deadhead (Repositioning)', value: fleet.totalDeadheadKm, color: COLORS.deadhead },
        { name: 'Personal (Off-Duty)', value: fleet.totalPersonalKm, color: COLORS.personal },
    ].filter(d => d.value > 0);

    if (fleet.totalUnaccountedKm > 1) {
        donutData.push({ name: 'Unaccounted', value: fleet.totalUnaccountedKm, color: COLORS.unaccounted });
    }

    // Bar chart: top 10 vehicles by personal %
    const barData = [...vehicles]
        .filter(v => v.totalOdometerKm > 0)
        .map(v => ({
            name: v.vehicleName.length > 12 ? v.vehicleName.slice(0, 12) + '...' : v.vehicleName,
            tripPct: Number(((v.tripKm / v.totalOdometerKm) * 100).toFixed(1)),
            deadheadPct: Number(((v.deadheadKm / v.totalOdometerKm) * 100).toFixed(1)),
            personalPct: Number(((v.personalKm / v.totalOdometerKm) * 100).toFixed(1)),
        }))
        .sort((a, b) => b.personalPct - a.personalPct)
        .slice(0, 10);

    // Method breakdown for fleet
    const methodCounts = fleet.methodBreakdown || {};

    return (
        <TooltipProvider>
            <div className="p-6 space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SummaryCard
                        label="Total Odometer KM"
                        value={fmtKm(fleet.totalOdometerKm)}
                        icon={<Car className="w-4 h-4 text-slate-500" />}
                        subtitle="Across all vehicles"
                        color="slate"
                    />
                    <SummaryCard
                        label="Trip KM (Revenue)"
                        value={fmtKm(fleet.totalTripKm)}
                        icon={<Route className="w-4 h-4 text-indigo-500" />}
                        subtitle={`${fleetTripPct.toFixed(1)}% of total`}
                        color="indigo"
                    />
                    <SummaryCard
                        label="Deadhead KM"
                        value={fmtKm(fleet.totalDeadheadKm)}
                        icon={<Clock className="w-4 h-4 text-amber-500" />}
                        subtitle={`${fleet.fleetDeadheadPct}% — Repositioning`}
                        color="amber"
                    />
                    <SummaryCard
                        label="Personal KM"
                        value={fmtKm(fleet.totalPersonalKm)}
                        icon={<AlertTriangle className="w-4 h-4 text-rose-500" />}
                        subtitle={`${fleet.fleetPersonalPct}% — Potential leakage`}
                        color="rose"
                    />
                </div>

                {/* Confidence & Method Overview */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fleet Confidence:</span>
                        <Badge
                            variant="outline"
                            className={`${CONFIDENCE_STYLES[fleet.avgConfidence]?.bg || ''} ${CONFIDENCE_STYLES[fleet.avgConfidence]?.text || ''} ${CONFIDENCE_STYLES[fleet.avgConfidence]?.border || ''} text-[10px] font-bold uppercase`}
                        >
                            <Shield className="w-3 h-3 mr-1" />
                            {fleet.avgConfidence}
                        </Badge>
                    </div>
                    <div className="h-4 w-px bg-slate-200" />
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Methods Used:</span>
                        {Object.entries(methodCounts).filter(([, c]) => (c as number) > 0).map(([method, count]) => (
                            <Badge key={method} variant="outline" className="text-[10px] font-mono bg-slate-50 border-slate-200 text-slate-600">
                                {METHOD_LABELS[method] || method}: {count as number}
                            </Badge>
                        ))}
                    </div>
                    <div className="ml-auto">
                        <Button size="sm" variant="outline" onClick={fetchDeadhead} className="text-[10px] font-bold uppercase tracking-wider h-7">
                            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
                        </Button>
                    </div>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Donut Chart */}
                    <Card className="border-slate-200">
                        <CardContent className="p-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Fleet KM Distribution</p>
                            <div className="h-56">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={donutData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={55}
                                            outerRadius={85}
                                            paddingAngle={2}
                                            dataKey="value"
                                        >
                                            {donutData.map((entry, i) => (
                                                <Cell key={i} fill={entry.color} stroke="none" />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip
                                            formatter={(value: number, name: string) => [`${fmtKm(value)} km`, name]}
                                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                        />
                                        <Legend
                                            verticalAlign="bottom"
                                            height={36}
                                            formatter={(value: string) => <span className="text-[10px] font-medium text-slate-600">{value}</span>}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Stacked Bar Chart — Top 10 by Personal % */}
                    <Card className="border-slate-200">
                        <CardContent className="p-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Top Vehicles by Personal KM %</p>
                            {barData.length === 0 ? (
                                <div className="h-56 flex items-center justify-center text-xs text-slate-400">No vehicle data available</div>
                            ) : (
                                <div className="h-56">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                                            <RechartsTooltip
                                                formatter={(value: number, name: string) => [`${value}%`, name]}
                                                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                            />
                                            <Bar dataKey="tripPct" name="Trip" stackId="a" fill={COLORS.trip} radius={[0, 0, 0, 0]} />
                                            <Bar dataKey="deadheadPct" name="Deadhead" stackId="a" fill={COLORS.deadhead} />
                                            <Bar dataKey="personalPct" name="Personal" stackId="a" fill={COLORS.personal} radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Per-Vehicle Table */}
                <Card className="border-slate-200">
                    <CardContent className="p-0">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Per-Vehicle Breakdown</p>
                            <Badge variant="outline" className="text-[10px] bg-slate-50 border-slate-200">
                                {vehicles.filter(v => v.totalOdometerKm > 0).length} vehicles with data
                            </Badge>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-100">
                                        <SortableHeader field="vehicleName" label="Vehicle" currentSort={sortField} dir={sortDir} onSort={toggleSort} />
                                        <SortableHeader field="totalOdometerKm" label="Total KM" currentSort={sortField} dir={sortDir} onSort={toggleSort} />
                                        <SortableHeader field="tripKm" label="Trip KM" currentSort={sortField} dir={sortDir} onSort={toggleSort} />
                                        <SortableHeader field="deadheadKm" label="Deadhead KM" currentSort={sortField} dir={sortDir} onSort={toggleSort} />
                                        <SortableHeader field="deadheadPct" label="Deadhead %" currentSort={sortField} dir={sortDir} onSort={toggleSort} />
                                        <SortableHeader field="personalKm" label="Personal KM" currentSort={sortField} dir={sortDir} onSort={toggleSort} />
                                        <SortableHeader field="personalPct" label="Personal %" currentSort={sortField} dir={sortDir} onSort={toggleSort} />
                                        <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Method</th>
                                        <SortableHeader field="confidenceLevel" label="Confidence" currentSort={sortField} dir={sortDir} onSort={toggleSort} />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {sortedVehicles.filter(v => v.totalOdometerKm > 0).map((v) => {
                                        const deadPct = v.totalOdometerKm > 0 ? ((v.deadheadKm / v.totalOdometerKm) * 100) : 0;
                                        const persPct = v.totalOdometerKm > 0 ? ((v.personalKm / v.totalOdometerKm) * 100) : 0;
                                        const confStyle = CONFIDENCE_STYLES[v.confidenceLevel] || CONFIDENCE_STYLES.low;

                                        return (
                                            <tr key={v.vehicleId} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="p-3">
                                                    <p className="text-xs font-bold text-slate-900">{v.vehicleName}</p>
                                                    <p className="text-[10px] text-slate-400 font-mono">{v.vehicleId.slice(0, 8)}</p>
                                                </td>
                                                <td className="p-3 text-xs font-mono text-slate-700">{fmtKm(v.totalOdometerKm)}</td>
                                                <td className="p-3">
                                                    <span className="text-xs font-mono text-indigo-700 font-semibold">{fmtKm(v.tripKm)}</span>
                                                </td>
                                                <td className="p-3">
                                                    <span className="text-xs font-mono text-amber-700">{fmtKm(v.deadheadKm)}</span>
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-amber-400 rounded-full"
                                                                style={{ width: `${Math.min(100, deadPct)}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] font-bold text-amber-700">{deadPct.toFixed(1)}%</span>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <span className={`text-xs font-mono ${persPct > 30 ? 'text-rose-700 font-bold' : 'text-slate-700'}`}>
                                                        {fmtKm(v.personalKm)}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${persPct > 30 ? 'bg-rose-500' : persPct > 15 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                                                style={{ width: `${Math.min(100, persPct)}%` }}
                                                            />
                                                        </div>
                                                        <span className={`text-[10px] font-bold ${persPct > 30 ? 'text-rose-700' : persPct > 15 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                                            {persPct.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <Badge variant="outline" className="text-[9px] font-mono bg-slate-50 border-slate-200">
                                                        {METHOD_LABELS[v.method] || v.method}
                                                    </Badge>
                                                </td>
                                                <td className="p-3">
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Badge
                                                                variant="outline"
                                                                className={`${confStyle.bg} ${confStyle.text} ${confStyle.border} text-[9px] font-bold uppercase cursor-help`}
                                                            >
                                                                {v.confidenceLevel}
                                                            </Badge>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="left" className="max-w-xs text-xs">
                                                            <p className="font-semibold mb-1">Confidence: {v.confidenceLevel}</p>
                                                            <p className="text-slate-500">{v.confidenceReason}</p>
                                                            {v.segmentCount > 0 && <p className="mt-1 text-slate-400">{v.segmentCount} odometer segments, {v.gapCount} trip gaps analyzed</p>}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {sortedVehicles.filter(v => v.totalOdometerKm > 0).length === 0 && (
                            <div className="p-8 text-center text-xs text-slate-400">
                                No vehicles have sufficient odometer data for deadhead analysis.
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Info Banner */}
                <div className="flex items-start gap-3 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                    <Info className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">How KM Attribution Works</p>
                        <p className="text-xs text-indigo-600/80 leading-relaxed">
                            Deadhead (repositioning/cruising) is legitimate work driving that consumes fuel but generates no trip revenue.
                            The system uses up to three methods: <strong>Trip-Gap Analysis</strong> (classifies time between trips),
                            <strong> Time Ratio</strong> (online vs on-trip hours), and <strong>Industry Fallback</strong> (35% average).
                            Higher confidence means more data was available. Personal KM above 30% may indicate leakage worth investigating.
                        </p>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}

// --- Sub-components ---

function SummaryCard({ label, value, icon, subtitle, color }: {
    label: string; value: string; icon: React.ReactNode; subtitle: string; color: string;
}) {
    const colorMap: Record<string, string> = {
        slate: 'bg-slate-50 border-slate-100',
        indigo: 'bg-indigo-50 border-indigo-100',
        amber: 'bg-amber-50 border-amber-100',
        rose: 'bg-rose-50 border-rose-100',
    };

    return (
        <div className={`rounded-xl p-4 border ${colorMap[color] || colorMap.slate}`}>
            <div className="flex items-center gap-2 mb-2">
                {icon}
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
            </div>
            <p className="text-2xl font-black text-slate-900">{value}</p>
            <p className="text-[10px] text-slate-500 mt-1">{subtitle}</p>
        </div>
    );
}

function SortableHeader({ field, label, currentSort, dir, onSort }: {
    field: SortField; label: string; currentSort: SortField; dir: SortDir; onSort: (f: SortField) => void;
}) {
    const isActive = currentSort === field;
    return (
        <th
            className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 select-none whitespace-nowrap"
            onClick={() => onSort(field)}
        >
            {label}
            {isActive && (dir === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />)}
        </th>
    );
}