import React from 'react';
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Check, X, AlertTriangle, Sparkles, Wand2 } from 'lucide-react';
import { cn } from "../ui/utils";
import { AIReceiptResult } from '../../services/aiVerificationService';

interface AIExtractionReviewProps {
    image: string;
    result: AIReceiptResult;
    onConfirm: (data: Partial<AIReceiptResult>) => void;
    onCancel: () => void;
}

export function AIExtractionReview({ image, result, onConfirm, onCancel }: AIExtractionReviewProps) {
    const isLowConfidence = result.confidence < 0.7;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-indigo-500" />
                    <h3 className="font-bold text-lg">AI Extraction Review</h3>
                </div>
                <Badge variant={isLowConfidence ? "destructive" : "secondary"} className="gap-1">
                    {isLowConfidence ? <AlertTriangle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                    {Math.round(result.confidence * 100)}% Confidence
                </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Image Preview */}
                <div className="relative aspect-[3/4] bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                    <img src={image} alt="Receipt" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 pointer-events-none border-4 border-indigo-500/20 rounded-lg animate-pulse" />
                </div>

                {/* Data Fields */}
                <div className="space-y-4">
                    <p className="text-sm text-slate-500 mb-4">
                        Please verify the values extracted by Gemini Vision. Highlighted fields may need manual correction.
                    </p>

                    <div className="grid gap-3">
                        <ExtractionField 
                            label="Odometer" 
                            value={result.odometer?.toString()} 
                            unit="km"
                            confidence={result.confidence}
                        />
                        <ExtractionField 
                            label="Total Amount" 
                            value={result.amount ? `$${result.amount}` : undefined} 
                            confidence={result.confidence}
                        />
                        <ExtractionField 
                            label="Fuel Volume" 
                            value={result.liters?.toString()} 
                            unit="L"
                            confidence={result.confidence}
                        />
                        <ExtractionField 
                            label="Date" 
                            value={result.date || undefined} 
                            confidence={result.confidence}
                        />
                        <ExtractionField 
                            label="Station" 
                            value={result.stationName || undefined} 
                            confidence={result.confidence}
                        />
                    </div>

                    <div className="pt-6 flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={onCancel}>
                            <X className="h-4 w-4 mr-2" />
                            Discard
                        </Button>
                        <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={() => onConfirm(result)}>
                            <Check className="h-4 w-4 mr-2" />
                            Confirm Data
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ExtractionField({ label, value, unit, confidence }: { label: string, value?: string, unit?: string, confidence: number }) {
    const isEmpty = !value;
    return (
        <div className={cn(
            "p-3 rounded-md border transition-all",
            isEmpty ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"
        )}>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">{label}</span>
                {isEmpty && <Badge variant="outline" className="text-[8px] bg-white text-amber-600 border-amber-200">Missing</Badge>}
            </div>
            <div className="flex items-baseline gap-1">
                <span className={cn("text-lg font-mono font-bold", isEmpty ? "text-amber-400 italic" : "text-slate-900")}>
                    {value || "Not found"}
                </span>
                {unit && !isEmpty && <span className="text-xs text-slate-500">{unit}</span>}
            </div>
        </div>
    );
}
