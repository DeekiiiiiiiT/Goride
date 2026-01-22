import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { 
    ShieldAlert, 
    Link2Off, 
    RefreshCcw, 
    Database, 
    CheckCircle2, 
    AlertCircle,
    Wrench,
    ArrowRight,
    Loader2,
    Search,
    Filter
} from "lucide-react";
import { FuelEntry } from '../../types/fuel';
import { FinancialTransaction } from '../../types/data';
import { cn } from "../ui/utils";

interface FuelIntegrityAuditToolProps {
    logs: FuelEntry[];
    transactions: FinancialTransaction[];
    onHealLogToTx: (log: FuelEntry) => Promise<void>;
    onHealTxToLog: (tx: FinancialTransaction) => Promise<void>;
    onSyncRecords: (log: FuelEntry, tx: FinancialTransaction, source: 'log' | 'tx') => Promise<void>;
}

export function FuelIntegrityAuditTool({ 
    logs, 
    transactions, 
    onHealLogToTx, 
    onHealTxToLog, 
    onSyncRecords 
}: FuelIntegrityAuditToolProps) {
    const [isScanning, setIsScanning] = useState(false);
    const [lastScanDate, setLastScanDate] = useState<Date | null>(null);
    const [filter, setFilter] = useState<'all' | 'orphaned' | 'mismatch'>('all');
    const [healingId, setHealingId] = useState<string | null>(null);

    // Scan Engine
    const auditResults = useMemo(() => {
        const issues: any[] = [];
        
        // Map for fast lookup
        const txMap = new Map(transactions.map(t => [t.id, t]));
        const logMap = new Map(logs.map(l => [l.id, l]));
        const logByTxId = new Map(logs.filter(l => !!l.transactionId).map(l => [l.transactionId!, l]));

        // 1. Check for Orphaned Logs (Logs that should have a TX but don't)
        logs.forEach(log => {
            if (log.type === 'Reimbursement' || log.type === 'Manual_Entry') {
                const tx = txMap.get(log.transactionId || '');
                if (!tx) {
                    issues.push({
                        id: `orphan-log-${log.id}`,
                        type: 'Orphaned Log',
                        severity: 'high',
                        description: `Fuel log #${log.id.slice(0, 5)} exists but has no linked financial transaction in ledger.`,
                        data: { log },
                        action: 'create_tx'
                    });
                } else {
                    // 2. Check for Drift
                    const amountDrift = Math.abs(log.amount - Math.abs(tx.amount)) > 0.01;
                    if (amountDrift) {
                        issues.push({
                            id: `drift-${log.id}`,
                            type: 'Data Drift',
                            severity: 'medium',
                            description: `Amount mismatch: Log shows $${log.amount.toFixed(2)} while Ledger shows $${Math.abs(tx.amount).toFixed(2)}.`,
                            data: { log, tx },
                            action: 'sync'
                        });
                    }
                }
            }
        });

        // 3. Check for Orphaned Transactions (Fuel TXs that have no Log)
        transactions.forEach(tx => {
            if (tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement') {
                if (tx.metadata?.automated) return; // Ignore settlement credits

                const log = logByTxId.get(tx.id) || logs.find(l => l.metadata?.sourceId === tx.id);
                if (!log) {
                    issues.push({
                        id: `orphan-tx-${tx.id}`,
                        type: 'Orphaned Transaction',
                        severity: 'medium',
                        description: `Financial transaction "${tx.description}" exists but has no matching entry in Fuel Logs.`,
                        data: { tx },
                        action: 'create_log'
                    });
                }
            }
        });

        return issues;
    }, [logs, transactions]);

    const handleScan = () => {
        setIsScanning(true);
        setTimeout(() => {
            setIsScanning(false);
            setLastScanDate(new Date());
        }, 1200);
    };

    const runHeal = async (issue: any, param?: any) => {
        setHealingId(issue.id);
        try {
            if (issue.action === 'create_tx') {
                await onHealLogToTx(issue.data.log);
            } else if (issue.action === 'create_log') {
                await onHealTxToLog(issue.data.tx);
            } else if (issue.action === 'sync') {
                await onSyncRecords(issue.data.log, issue.data.tx, param || 'log');
            }
        } finally {
            setHealingId(null);
        }
    };

    const filteredIssues = auditResults.filter(i => {
        if (filter === 'all') return true;
        if (filter === 'orphaned') return i.type.includes('Orphaned');
        if (filter === 'mismatch') return i.type === 'Data Drift';
        return true;
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                        <ShieldAlert className="h-8 w-8 text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Integrity Audit & Maintenance</h2>
                        <p className="text-slate-400 text-sm">Scan and repair data drift between Fuel Logs and the Financial Ledger.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {lastScanDate && (
                        <span className="text-xs text-slate-500 font-mono hidden md:inline">
                            LAST SCAN: {lastScanDate.toLocaleTimeString()}
                        </span>
                    )}
                    <Button 
                        onClick={handleScan} 
                        disabled={isScanning}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 border-b-4 border-indigo-800 active:border-b-0 active:translate-y-1 transition-all"
                    >
                        {isScanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                        {isScanning ? "SCANNING..." : "RUN FULL AUDIT"}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Stats Panel */}
                <div className="lg:col-span-1 space-y-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <Database className="h-4 w-4 text-slate-400" />
                                SCAN SUMMARY
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Records Checked</p>
                                    <p className="text-xl font-bold text-slate-700">{logs.length + transactions.length}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Detected Issues</p>
                                    <p className={cn("text-xl font-bold", auditResults.length > 0 ? "text-amber-600" : "text-emerald-600")}>
                                        {auditResults.length}
                                    </p>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Orphaned Logs:</span>
                                    <span className="font-bold">{auditResults.filter(i => i.type === 'Orphaned Log').length}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Orphaned TXs:</span>
                                    <span className="font-bold">{auditResults.filter(i => i.type === 'Orphaned Transaction').length}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Data Drift:</span>
                                    <span className="font-bold">{auditResults.filter(i => i.type === 'Data Drift').length}</span>
                                </div>
                            </div>

                            <div className="pt-4 border-t space-y-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Filters</p>
                                <div className="flex flex-wrap gap-2">
                                    <Button 
                                        variant={filter === 'all' ? 'default' : 'outline'} 
                                        size="sm" 
                                        className="h-7 text-[10px]"
                                        onClick={() => setFilter('all')}
                                    >
                                        ALL ISSUES
                                    </Button>
                                    <Button 
                                        variant={filter === 'orphaned' ? 'default' : 'outline'} 
                                        size="sm" 
                                        className="h-7 text-[10px]"
                                        onClick={() => setFilter('orphaned')}
                                    >
                                        ORPHANS
                                    </Button>
                                    <Button 
                                        variant={filter === 'mismatch' ? 'default' : 'outline'} 
                                        size="sm" 
                                        className="h-7 text-[10px]"
                                        onClick={() => setFilter('mismatch')}
                                    >
                                        DRIFT
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                        <div className="flex gap-3">
                            <Wrench className="h-5 w-5 text-blue-500 shrink-0" />
                            <div className="space-y-1">
                                <p className="text-sm font-bold text-blue-900">Why does this happen?</p>
                                <p className="text-xs text-blue-700 leading-relaxed">
                                    Data drift typically occurs when records were created manually before the Phase 3/4 sync logic was active, or if a browser session timed out during a double-entry update.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Issues List */}
                <div className="lg:col-span-2 space-y-4">
                    <Card className="min-h-[400px]">
                        <CardHeader className="border-b bg-slate-50/30">
                            <CardTitle className="text-lg">Maintenance Queue</CardTitle>
                            <CardDescription>Actions to restore mathematical integrity across domains.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {filteredIssues.length === 0 ? (
                                <div className="flex flex-col items-center justify-center p-20 text-center space-y-3">
                                    <div className="h-16 w-16 bg-emerald-50 rounded-full flex items-center justify-center">
                                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="font-bold text-slate-900">No Issues Detected</h3>
                                        <p className="text-sm text-slate-500 max-w-xs mx-auto">
                                            Everything is synchronized. Run a full scan to double-check deep historical records.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {filteredIssues.map((issue) => (
                                        <div key={issue.id} className="p-4 hover:bg-slate-50/50 transition-colors group">
                                            <div className="flex items-start gap-4">
                                                <div className={cn(
                                                    "p-2 rounded-lg shrink-0",
                                                    issue.severity === 'high' ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
                                                )}>
                                                    <AlertCircle className="h-5 w-5" />
                                                </div>
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm text-slate-900">{issue.type}</span>
                                                        <Badge variant="outline" className="text-[9px] h-4 px-1 uppercase font-bold tracking-tighter">
                                                            {issue.severity} Severity
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs text-slate-600 leading-normal">
                                                        {issue.description}
                                                    </p>
                                                    
                                                    <div className="flex items-center gap-4 mt-2 pt-2">
                                                        {issue.action === 'sync' ? (
                                                            <div className="flex items-center gap-2">
                                                                <Button 
                                                                    size="sm" 
                                                                    variant="outline" 
                                                                    className="h-7 text-[10px] font-bold"
                                                                    disabled={!!healingId}
                                                                    onClick={() => runHeal(issue, 'log')}
                                                                >
                                                                    {healingId === issue.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCcw className="h-3 w-3 mr-1" />}
                                                                    USE LOG AS SOURCE
                                                                </Button>
                                                                <Button 
                                                                    size="sm" 
                                                                    variant="outline" 
                                                                    className="h-7 text-[10px] font-bold"
                                                                    disabled={!!healingId}
                                                                    onClick={() => runHeal(issue, 'tx')}
                                                                >
                                                                    {healingId === issue.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCcw className="h-3 w-3 mr-1" />}
                                                                    USE LEDGER AS SOURCE
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <Button 
                                                                size="sm" 
                                                                className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                                                                disabled={!!healingId}
                                                                onClick={() => runHeal(issue)}
                                                            >
                                                                {healingId === issue.id ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Wrench className="h-3.5 w-3.5 mr-2" />}
                                                                {issue.action === 'create_tx' ? 'Heal Ledger Record' : 'Repair Fuel Log'}
                                                                <ArrowRight className="h-3 w-3 ml-2 group-hover:translate-x-1 transition-transform" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
