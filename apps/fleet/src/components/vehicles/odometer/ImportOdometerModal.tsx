import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Upload, FileText, AlertTriangle, CheckCircle, XCircle, Loader2, Database, ArrowRight } from "lucide-react";
import { odometerService } from '../../../services/odometerService';
import { analyzeImportData, ImportAnalysisResult } from '../../../utils/odometerImportUtils';
import { UnifiedOdometerEntry } from '../../../types/vehicle';
import { toast } from 'sonner';
import { OdometerExportRow } from '../../../utils/odometerUtils';

interface ImportOdometerModalProps {
    vehicleId: string;
    onImportComplete: () => void;
    triggerClassName?: string;
}

type ImportStep = 'upload' | 'analyzing' | 'review' | 'importing' | 'complete';

export function ImportOdometerModal({ vehicleId, onImportComplete, triggerClassName }: ImportOdometerModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<ImportStep>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [analysis, setAnalysis] = useState<ImportAnalysisResult | null>(null);
    const [importStats, setImportStats] = useState<{ success: number; failed: number } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const resetState = () => {
        setStep('upload');
        setFile(null);
        setAnalysis(null);
        setImportStats(null);
        setIsProcessing(false);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            handleAnalyze(e.target.files[0]);
        }
    };

    const handleAnalyze = async (uploadedFile: File) => {
        setStep('analyzing');
        setIsProcessing(true);

        try {
            // 1. Fetch current history for context
            const currentHistory = await odometerService.getUnifiedHistory(vehicleId);

            // 2. Parse CSV
            Papa.parse(uploadedFile, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const rows = results.data as OdometerExportRow[];
                    
                    // 3. Analyze
                    const result = analyzeImportData(rows, currentHistory);
                    setAnalysis(result);
                    setStep('review');
                    setIsProcessing(false);
                },
                error: (error) => {
                    console.error("CSV Parse Error:", error);
                    toast.error("Failed to parse CSV file");
                    setStep('upload');
                    setIsProcessing(false);
                }
            });

        } catch (error) {
            console.error("Analysis Error:", error);
            toast.error("Failed to analyze import data");
            setStep('upload');
            setIsProcessing(false);
        }
    };

    const handleImport = async () => {
        if (!analysis) return;

        setStep('importing');
        setIsProcessing(true);

        // We currently only import "New Records". 
        // Conflicts/Duplicates are skipped as per strict safety rules, unless we add UI to override.
        // For Phase 8 MVP, we stick to safe imports.
        const recordsToImport = analysis.newRecords;

        if (recordsToImport.length === 0) {
            toast.info("No new records to import");
            setStep('review');
            setIsProcessing(false);
            return;
        }

        try {
            const result = await odometerService.restoreOdometerBatch(recordsToImport, vehicleId);
            setImportStats({
                success: result.success,
                failed: result.failed
            });
            
            if (result.failed > 0) {
                toast.warning(`Import complete with ${result.failed} errors`);
            } else {
                toast.success("Import completed successfully");
            }
            
            setStep('complete');
            onImportComplete(); // Refresh parent
        } catch (error) {
            console.error("Import Error:", error);
            toast.error("Critical error during import batch");
            setStep('review'); // Go back to review
        } finally {
            setIsProcessing(false);
        }
    };

    const renderUploadStep = () => (
        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
             onClick={() => fileInputRef.current?.click()}>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".csv" 
                onChange={handleFileChange}
            />
            <div className="bg-blue-100 p-3 rounded-full mb-4">
                <Upload className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">Upload Odometer History CSV</h3>
            <p className="text-sm text-slate-500 text-center max-w-xs">
                Select a previously exported Master Log to restore missing readings.
            </p>
        </div>
    );

    const renderReviewStep = () => {
        if (!analysis) return null;
        
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-lg flex flex-col items-center">
                        <span className="text-3xl font-bold text-emerald-600">{analysis.summary.new}</span>
                        <span className="text-sm font-medium text-emerald-800 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> New Records
                        </span>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg flex flex-col items-center opacity-75">
                        <span className="text-3xl font-bold text-amber-600">{analysis.summary.duplicates}</span>
                        <span className="text-sm font-medium text-amber-800 flex items-center gap-1">
                            <Database className="w-3 h-3" /> Duplicates
                        </span>
                    </div>
                    <div className="bg-rose-50 border border-rose-100 p-4 rounded-lg flex flex-col items-center">
                        <span className="text-3xl font-bold text-rose-600">{analysis.summary.conflicts}</span>
                        <span className="text-sm font-medium text-rose-800 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Conflicts
                        </span>
                    </div>
                </div>

                <div className="space-y-3">
                    <h4 className="font-medium text-sm text-slate-900">Analysis Details</h4>
                    
                    {analysis.summary.new > 0 && (
                        <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded border">
                            Ready to restore <strong>{analysis.summary.new}</strong> missing readings.
                            These will be added as "Hard" readings.
                        </div>
                    )}

                    {analysis.summary.conflicts > 0 && (
                        <div className="text-sm text-rose-700 bg-rose-50 p-3 rounded border border-rose-100">
                            <strong>{analysis.summary.conflicts} entries</strong> conflict with existing data (same ID but different value).
                            These will be <strong>skipped</strong> to prevent data corruption.
                        </div>
                    )}
                    
                    {analysis.summary.new === 0 && (
                        <div className="text-sm text-slate-500 bg-slate-50 p-3 rounded border text-center">
                            No new data found. Your history appears to be up to date.
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderCompleteStep = () => {
        if (!importStats) return null;
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
                <div className="bg-emerald-100 p-4 rounded-full">
                    <CheckCircle className="w-12 h-12 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Restoration Complete</h3>
                <div className="text-center space-y-1">
                    <p className="text-slate-600">Successfully restored <strong>{importStats.success}</strong> readings.</p>
                    {importStats.failed > 0 && (
                        <p className="text-rose-600 text-sm">{importStats.failed} items failed to save.</p>
                    )}
                </div>
                <Button onClick={() => setIsOpen(false)} className="mt-4">
                    Done
                </Button>
            </div>
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) setTimeout(resetState, 300);
        }}>
            <DialogTrigger asChild>
                <Button variant="outline" className={`gap-2 ${triggerClassName || ''}`}>
                    <Upload className="h-4 w-4" /> 
                    <span className="hidden sm:inline">Import</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Import Odometer History</DialogTitle>
                    <DialogDescription>
                        Restore missing readings from a Master Log CSV.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {step === 'upload' && renderUploadStep()}
                    
                    {step === 'analyzing' && (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                            <p className="text-sm text-slate-500">Analyzing your file...</p>
                        </div>
                    )}

                    {step === 'review' && renderReviewStep()}

                    {step === 'importing' && (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                            <p className="text-sm text-slate-500">Restoring readings to database...</p>
                            <p className="text-xs text-slate-400">Do not close this window.</p>
                        </div>
                    )}

                    {step === 'complete' && renderCompleteStep()}
                </div>

                <DialogFooter>
                    {step === 'review' && (
                        <>
                            <Button variant="ghost" onClick={resetState}>Cancel</Button>
                            <Button onClick={handleImport} disabled={!analysis || analysis.summary.new === 0}>
                                Start Import
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
