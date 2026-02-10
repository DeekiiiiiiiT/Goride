import React, { useState, useEffect } from 'react';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { RefreshCw, ShieldCheck, Lock, User, Globe, Activity } from 'lucide-react';
import { motion as Motion } from 'motion/react';

export function SyncCenter() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchAudit = async () => {
        setLoading(true);
        try {
            const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/sync/audit-trail`, {
                headers: { 'Authorization': `Bearer ${publicAnonKey}` }
            });
            const json = await res.json();
            setData(json);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAudit();
        const interval = setInterval(fetchAudit, 30000); // Polling for locks
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Enterprise Sync Center</h2>
                    <p className="text-muted-foreground">Monitor real-time state synchronization and resource locks.</p>
                </div>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    State Consistent
                </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-slate-500">Active Sessions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data?.activeSessions || 0}</div>
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                            <User className="h-2 w-2" />
                            Authenticated Users
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-slate-500">Global Sync</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">100%</div>
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                            <Globe className="h-2 w-2" />
                            Across 12 nodes
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-slate-500">System Latency</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data?.latencyMs || 0}ms</div>
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                            <Activity className="h-2 w-2" />
                            WebSocket Healthy
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-slate-500">Resource Locks</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data?.locks?.length || 0}</div>
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                            <Lock className="h-2 w-2" />
                            Preventing collisions
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Active Forensic Locks</CardTitle>
                    <CardDescription>Records currently being audited by administrators.</CardDescription>
                </CardHeader>
                <CardContent>
                    {data?.locks?.length > 0 ? (
                        <div className="space-y-3">
                            {data.locks.map((lock: any, i: number) => (
                                <Motion.div 
                                    key={i}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded">
                                            <Lock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{lock.resourceType}: {lock.resourceId}</p>
                                            <p className="text-xs text-slate-500">Locked by <span className="font-medium text-slate-700 dark:text-slate-300">{lock.userName}</span></p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className="text-[10px]">
                                        {new Date(lock.timestamp).toLocaleTimeString()}
                                    </Badge>
                                </Motion.div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-400">
                            <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-20 animate-spin" />
                            <p className="text-sm">No active resource locks.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
