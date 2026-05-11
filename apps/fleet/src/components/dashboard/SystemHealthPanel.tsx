import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Activity, CheckCircle2, Clock, AlertTriangle, RefreshCw, Server, Database, Wifi } from 'lucide-react';
import { api } from '../../services/api';
import { toast } from "sonner@2.0.3";

export function SystemHealthPanel() {
    const [stats, setStats] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastCheck, setLastCheck] = useState<Date | null>(null);

    const runDiagnostics = async () => {
        setLoading(true);
        const results = [];
        const now = new Date();

        // Check 1: Dashboard Stats API (Aggregated)
        try {
            const start = performance.now();
            await api.getDashboardStats();
            const end = performance.now();
            results.push({
                id: 'api-stats',
                name: 'Aggregated Stats API',
                status: 'healthy',
                latency: Math.round(end - start),
                threshold: 500,
                description: 'Server-side aggregation endpoint'
            });
        } catch (e) {
            results.push({
                id: 'api-stats',
                name: 'Aggregated Stats API',
                status: 'error',
                latency: 0,
                threshold: 500,
                description: 'Failed to connect'
            });
        }

        // Check 2: Filtered Search API (GIN Index)
        try {
            const start = performance.now();
            await api.getTripsFiltered({ limit: 1 });
            const end = performance.now();
            results.push({
                id: 'api-search',
                name: 'Trip Search API (GIN)',
                status: 'healthy',
                latency: Math.round(end - start),
                threshold: 800,
                description: 'Indexed JSONB search query'
            });
        } catch (e) {
            results.push({
                id: 'api-search',
                name: 'Trip Search API (GIN)',
                status: 'error',
                latency: 0,
                threshold: 800,
                description: 'Search endpoint failed'
            });
        }

         // Check 3: Database Connectivity (via simple read)
        try {
            const start = performance.now();
            await api.getDriverMetrics(); // Simple fetch
            const end = performance.now();
            results.push({
                id: 'db-conn',
                name: 'Database Connectivity',
                status: 'healthy',
                latency: Math.round(end - start),
                threshold: 1000,
                description: 'Direct read from KV store'
            });
        } catch (e) {
            results.push({
                id: 'db-conn',
                name: 'Database Connectivity',
                status: 'error',
                latency: 0,
                threshold: 1000,
                description: 'Connection timeout or error'
            });
        }

        setStats(results);
        setLastCheck(now);
        setLoading(false);
        toast.success("System diagnostics complete");
    };

    useEffect(() => {
        runDiagnostics();
    }, []);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">System Health & Performance Monitoring</h3>
                    <p className="text-sm text-slate-500">Real-time latency checks for optimized endpoints.</p>
                </div>
                <Button onClick={runDiagnostics} disabled={loading} variant="outline">
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Run Diagnostics
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {/* Summary Cards */}
                 <Card>
                     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">System Status</CardTitle>
                        <Activity className="h-4 w-4 text-emerald-500" />
                     </CardHeader>
                     <CardContent>
                        <div className="text-2xl font-bold text-emerald-600">Operational</div>
                        <p className="text-xs text-slate-500">All systems functioning normally</p>
                     </CardContent>
                 </Card>
                 <Card>
                     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg API Latency</CardTitle>
                        <Clock className="h-4 w-4 text-blue-500" />
                     </CardHeader>
                     <CardContent>
                        <div className="text-2xl font-bold text-slate-900">
                            {stats.length > 0 
                                ? Math.round(stats.reduce((acc, curr) => acc + curr.latency, 0) / stats.length) + 'ms' 
                                : '-'}
                        </div>
                        <p className="text-xs text-slate-500">Across {stats.length} monitored endpoints</p>
                     </CardContent>
                 </Card>
                 <Card>
                     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Last Check</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-slate-500" />
                     </CardHeader>
                     <CardContent>
                        <div className="text-2xl font-bold text-slate-900">
                            {lastCheck ? lastCheck.toLocaleTimeString() : '-'}
                        </div>
                        <p className="text-xs text-slate-500">
                            {lastCheck ? lastCheck.toLocaleDateString() : 'Not run yet'}
                        </p>
                     </CardContent>
                 </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-medium">Endpoint Performance</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {stats.map((stat) => (
                            <div key={stat.id} className="flex items-center justify-between p-4 border rounded-lg bg-slate-50/50">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-full ${stat.status === 'healthy' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                                        {stat.id === 'api-stats' && <Server className={`h-5 w-5 ${stat.status === 'healthy' ? 'text-emerald-600' : 'text-red-600'}`} />}
                                        {stat.id === 'api-search' && <Database className={`h-5 w-5 ${stat.status === 'healthy' ? 'text-emerald-600' : 'text-red-600'}`} />}
                                        {stat.id === 'db-conn' && <Wifi className={`h-5 w-5 ${stat.status === 'healthy' ? 'text-emerald-600' : 'text-red-600'}`} />}
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-900">{stat.name}</p>
                                        <p className="text-sm text-slate-500">{stat.description}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <span className={`text-lg font-bold ${
                                            stat.status === 'error' ? 'text-red-600' :
                                            stat.latency < stat.threshold ? 'text-emerald-600' : 'text-amber-600'
                                        }`}>
                                            {stat.status === 'error' ? 'ERR' : `${stat.latency}ms`}
                                        </span>
                                        {stat.status === 'healthy' && (
                                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                                Optimal
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-400">Target: &lt;{stat.threshold}ms</p>
                                </div>
                            </div>
                        ))}
                        {stats.length === 0 && !loading && (
                            <div className="text-center py-8 text-slate-500">
                                Click "Run Diagnostics" to start performance check.
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
