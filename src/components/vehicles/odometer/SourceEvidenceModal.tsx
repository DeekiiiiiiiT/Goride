import React from 'react';
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
    FileText, 
    ExternalLink, 
    ShieldCheck, 
    AlertTriangle, 
    Calendar, 
    User, 
    Fuel, 
    Wrench,
    ClipboardCheck,
    Hash
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from "../../ui/utils";

import { ImageWithFallback } from '../../figma/ImageWithFallback';
import realOdometerScan from "figma:asset/d634a1f92df5341866fd1b5612457b3002467263.png";

// Forensic Evidence System - No demo pictures permitted
const fuelReceiptPlaceholder = null;
const odometerPlaceholder = null;

interface SourceEvidenceModalProps {
    isOpen: boolean;
    onClose: () => void;
    evidence: {
        id: string;
        type: string;
        source: string;
        date: string;
        value: number;
        imageUrl?: string;
        notes?: string;
        metadata?: any;
        isVerified?: boolean;
    } | null;
}

export function SourceEvidenceModal({ isOpen, onClose, evidence }: SourceEvidenceModalProps) {
    if (!evidence) return null;

    const getSourceIcon = (source: string) => {
        const s = source.toLowerCase();
        if (s.includes('fuel')) return <Fuel className="h-5 w-5 text-amber-500" />;
        if (s.includes('service') || s.includes('maintenance')) return <Wrench className="h-5 w-5 text-blue-500" />;
        if (s.includes('check')) return <ClipboardCheck className="h-5 w-5 text-indigo-500" />;
        return <FileText className="h-5 w-5 text-slate-500" />;
    };

    // Forensic Evidence Selection: No demo fallbacks allowed.
    // If no real evidence URL is provided by the system, we display an "Empty Evidence" state.
    const displayImage = evidence.imageUrl || 
                       evidence.metadata?.odometerProofUrl || 
                       evidence.metadata?.photoUrl ||
                       evidence.metadata?.receiptUrl || 
                       evidence.metadata?.invoiceUrl;

    const formatKey = (key: string) => {
        const labels: Record<string, string> = {
            'deltaKm': 'Distance Since Last',
            'prevReadingId': 'Previous Anchor ID',
            'liters': 'Fuel Volume',
            'price': 'Price per Liter',
            'totalCost': 'Total Cost',
            'paymentSource': 'Payment Method',
            'receiptUrl': 'Receipt Source',
            'odometerProofUrl': 'Odometer Scan',
            'odometerMethod': 'Capture Method',
            'weekStart': 'Reporting Week',
            'aiReading': 'AI Detected Value'
        };
        return labels[key] || key;
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[600px] overflow-hidden p-0">
                <div className="bg-slate-950 p-6 text-white relative">
                    <div className="absolute top-0 right-0 p-16 bg-indigo-500/10 blur-[60px] rounded-full"></div>
                    <DialogHeader className="relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-white/10 rounded-lg backdrop-blur-md">
                                {getSourceIcon(evidence.source)}
                            </div>
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                {evidence.isVerified ? 'Immutable Anchor' : 'Pending Verification'}
                            </Badge>
                        </div>
                        <DialogTitle className="text-2xl font-bold">Source Evidence: {evidence.source}</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Cryptographic Trace ID: <span className="font-mono text-[10px] uppercase">{evidence.id}</span>
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entry Date</p>
                                <div className="flex items-center gap-2 text-slate-900 font-medium">
                                    <Calendar className="h-4 w-4 text-slate-400" />
                                    {format(new Date(evidence.date), 'MMMM d, yyyy HH:mm')}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Odometer Reading</p>
                                <div className="flex items-center gap-2 text-slate-900 font-bold text-xl font-mono">
                                    <Hash className="h-4 w-4 text-slate-400" />
                                    {evidence.value.toLocaleString()} <span className="text-sm font-normal text-slate-500">km</span>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Auditor Status</p>
                                <div className="flex items-center gap-2">
                                    {evidence.isVerified ? (
                                        <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-sm">
                                            <ShieldCheck className="h-4 w-4" />
                                            System Verified
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 text-amber-600 font-bold text-sm">
                                            <AlertTriangle className="h-4 w-4" />
                                            Manual Review Required
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Capture Method</p>
                                <Badge variant="secondary" className="bg-slate-100 text-slate-700 capitalize">
                                    {evidence.metadata?.odometerMethod || evidence.metadata?.method || 'Direct Entry'}
                                </Badge>
                            </div>
                        </div>
                    </div>

                    {displayImage ? (
                        <div className="space-y-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Original Document Image</p>
                            <div className="relative group border rounded-xl overflow-hidden bg-slate-50 shadow-inner">
                                <ImageWithFallback 
                                    src={displayImage} 
                                    alt="Source Evidence" 
                                    className="w-full h-auto max-h-[400px] object-contain transition-transform duration-500 group-hover:scale-[1.02]" 
                                />
                                <div className="absolute inset-0 bg-indigo-500/0 group-hover:bg-indigo-500/5 transition-colors pointer-events-none"></div>
                                <Button 
                                    size="sm" 
                                    variant="secondary" 
                                    className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md shadow-lg"
                                    onClick={() => window.open(displayImage, '_blank')}
                                >
                                    <ExternalLink className="h-3 w-3 mr-2" />
                                    View Full Resolution
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-8 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                            <FileText className="h-12 w-12 mb-2 opacity-20" />
                            <p className="text-sm font-medium">No image evidence attached</p>
                            <p className="text-[10px]">Manual log entry without digital scan</p>
                        </div>
                    )}

                    {evidence.notes && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Auditor Notes</p>
                            <div className="p-4 bg-slate-50 rounded-lg border italic text-sm text-slate-600">
                                "{evidence.notes}"
                            </div>
                        </div>
                    )}

                    {evidence.metadata && Object.keys(evidence.metadata).length > 0 && (
                        <div className="space-y-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Metadata</p>
                            <div className="grid grid-cols-2 gap-2">
                                {Object.entries(evidence.metadata).map(([key, val]) => {
                                    // Filter out specific forensic fields requested by the user
                                    const excludedKeys = [
                                        'cycleId', 'backfilledAt', 'isFragmented', 'integrityStatus', 
                                        'isHighFrequency', 'actualKmPerLiter', 'profileKmPerLiter', 
                                        'volumeContributed', 'distanceSinceAnchor', 'cumulativeLitersAtEntry', 
                                        'odometerMethod', 'method', 'prevReadingId', 'receiptUrl', 'odometerProofUrl'
                                    ];
                                    
                                    if (excludedKeys.includes(key)) return null;

                                    return val !== undefined && val !== null && val !== 'undefined' && typeof val !== 'object' && (
                                        <div key={key} className="flex flex-col p-3 bg-slate-50 rounded border border-slate-100 text-[10px]">
                                            <span className="text-slate-400 font-bold uppercase mb-1">{formatKey(key)}</span>
                                            <span className="text-slate-700 font-mono text-xs overflow-hidden text-ellipsis">
                                                {typeof val === 'number' && key.toLowerCase().includes('km') ? val.toLocaleString() + ' km' : 
                                                 typeof val === 'number' && (key.toLowerCase().includes('price') || key.toLowerCase().includes('cost')) ? '$' + val.toFixed(2) :
                                                 String(val)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-slate-50 border-t flex justify-end">
                    <Button onClick={onClose} className="bg-slate-900">Close Evidence Viewer</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
