import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../../ui/dialog";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { 
    History, 
    User, 
    Clock, 
    ArrowRight, 
    ShieldAlert,
    Hash
} from 'lucide-react';
import { format } from 'date-fns';
import { api } from '../../../services/api';

interface AuditTrailModalProps {
    isOpen: boolean;
    onClose: () => void;
    entityId: string | null;
}

export function AuditTrailModal({ isOpen, onClose, entityId }: AuditTrailModalProps) {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && entityId) {
            fetchLogs();
        }
    }, [isOpen, entityId]);

    const fetchLogs = async () => {
        if (!entityId) return;
        setLoading(true);
        try {
            const data = await api.getAuditLogs(entityId);
            setLogs(data);
        } catch (e) {
            console.error("Failed to fetch audit logs", e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="h-5 w-5 text-indigo-500" />
                        Audit History Trail
                    </DialogTitle>
                    <DialogDescription>
                        Immutable record of all changes made to this entry.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 max-h-[400px] overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : logs.length > 0 ? (
                        <div className="space-y-4">
                            {logs.map((log) => (
                                <div key={log.id} className="p-3 border rounded-lg bg-slate-50 relative overflow-hidden">
                                    <div className="flex justify-between items-start mb-2">
                                        <Badge variant="outline" className="text-[10px] capitalize bg-white">
                                            {log.action}
                                        </Badge>
                                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {format(new Date(log.timestamp), 'MMM d, HH:mm')}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-3 text-sm mb-2">
                                        <div className="font-mono font-bold text-slate-500 line-through decoration-red-400/50">
                                            {log.oldValue?.toLocaleString() || 'N/A'}
                                        </div>
                                        <ArrowRight className="h-3 w-3 text-slate-400" />
                                        <div className="font-mono font-bold text-indigo-600">
                                            {log.newValue?.toLocaleString() || 'N/A'}
                                        </div>
                                        <span className="text-xs text-slate-400 ml-1">km</span>
                                    </div>

                                    <div className="space-y-1">
                                        <p className="text-xs text-slate-600 italic">"{log.reason}"</p>
                                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                            <User className="h-3 w-3" />
                                            <span>Modified by: {log.userId}</span>
                                        </div>
                                    </div>

                                    <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between items-center">
                                        <div className="flex items-center gap-1 text-[9px] text-emerald-600 font-mono">
                                            <Hash className="h-2.5 w-2.5" />
                                            {log.hash.substring(0, 16)}...
                                        </div>
                                        <div className="flex items-center gap-1 text-[9px] text-slate-300">
                                            <ShieldAlert className="h-2.5 w-2.5" />
                                            Tamper-Evident Seal
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center p-8 text-slate-400">
                            <History className="h-12 w-12 mx-auto mb-2 opacity-10" />
                            <p className="text-sm">No audit logs found for this entry.</p>
                            <p className="text-[10px]">Changes made before Phase 4 are not tracked.</p>
                        </div>
                    )}
                </div>

                <div className="flex justify-end">
                    <Button onClick={onClose} variant="secondary">Close Trail</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
