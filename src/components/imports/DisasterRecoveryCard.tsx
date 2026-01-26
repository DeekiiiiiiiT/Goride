import React, { useState, useRef } from 'react';
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { 
    ShieldCheck, 
    Fuel, 
    Settings, 
    Car, 
    CloudDownload, 
    UploadCloud,
    ChevronsUpDown,
    ListChecks
} from "lucide-react";
import { toast } from "sonner@2.0.3";

import { generateBackupFiles } from '../../services/data-export';
import { downloadBlob } from '../../utils/csv-helper';
import { validateImportFile, ImportType } from '../../services/import-validator';
import { importExecutor } from '../../services/data-import-executor';

// Reusable Collapsible Section Component
const CollapsibleSection = ({ title, children, defaultOpen = true, icon }: { title: string, children: React.ReactNode, defaultOpen?: boolean, icon?: React.ReactNode }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
            <div className="flex items-center justify-between px-1">
                 <div className="flex items-center gap-2">
                    {icon}
                    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                </div>
                <div className="flex items-center gap-2">
                    {!isOpen && <Badge variant="outline" className="text-xs font-normal text-slate-500">Hidden</Badge>}
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-slate-200">
                            <ChevronsUpDown className="h-4 w-4 text-slate-500" />
                            <span className="sr-only">Toggle</span>
                        </Button>
                    </CollapsibleTrigger>
                </div>
            </div>
            <CollapsibleContent className="space-y-4">
                {children}
            </CollapsibleContent>
        </Collapsible>
    )
}

export function DisasterRecoveryCard() {
    const [isRestoring, setIsRestoring] = useState(false);
    const restoreFileInputRef = useRef<HTMLInputElement>(null);
    const [restoreType, setRestoreType] = useState<ImportType | null>(null);

    const handleDisasterRecoveryExport = async (type: ImportType) => {
        try {
            const toastId = toast.loading(`Generating ${type} backup...`);
            const files = await generateBackupFiles({ 
                fuel: type === 'fuel', 
                service: type === 'service', 
                odometer: type === 'odometer',
                checkin: type === 'checkin'
            });
            
            if (files.length > 0) {
                downloadBlob(files[0].content, files[0].filename);
                toast.success("Backup downloaded.");
            } else {
                toast.info("No data found to export.");
            }
            toast.dismiss(toastId);
        } catch(e) {
            console.error(e);
            toast.error("Export failed.");
        }
    };

    const onRestoreFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !restoreType) return;
        const file = e.target.files[0];
        
        setIsRestoring(true);
        const toastId = toast.loading(`Restoring ${restoreType} data...`);
        try {
            const text = await file.text();
            const validation = validateImportFile(text, restoreType);
            
            if (validation.errors.length > 0) {
                toast.dismiss(toastId);
                toast.error(`Validation failed: ${validation.errors.length} errors found.`);
                console.error(validation.errors);
                // In a real app, show a modal with errors
                return;
            }
            
            const records = validation.validRecords;
            
            // Use the Executor Service
            const result = await importExecutor.processBatch(
                records, 
                restoreType, 
                (pct) => {
                   // Optional: Could update a progress bar state here if we added one
                   // console.log(`Restore progress: ${pct}%`);
                }
            );

            if (result.failureCount > 0) {
                console.error("Restore errors:", result.errors);
                toast.warning(`Restored ${result.successCount} records. ${result.failureCount} failed.`);
            } else {
                toast.success(`Successfully restored ${result.successCount} ${restoreType} records.`);
            }
            toast.dismiss(toastId);

        } catch (err: any) {
            console.error(err);
            toast.dismiss(toastId);
            toast.error(`Restore failed: ${err.message}`);
        } finally {
            setIsRestoring(false);
            setRestoreType(null);
            if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';
        }
    };

    const triggerRestore = (type: ImportType) => {
        setRestoreType(type);
        setTimeout(() => restoreFileInputRef.current?.click(), 100);
    };

    return (
        <CollapsibleSection title="Disaster Recovery & Backups" defaultOpen={false} icon={<ShieldCheck className="h-5 w-5 text-indigo-600" />}>
            <Card className="border-slate-200 bg-slate-50/50">
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Fuel className="h-5 w-5 text-rose-500" />
                                <h4 className="font-semibold text-slate-900">Fuel Logs</h4>
                            </div>
                            <p className="text-sm text-slate-500">Export verified fuel entries and anchors.</p>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleDisasterRecoveryExport('fuel')}>
                                    <CloudDownload className="h-4 w-4 mr-2" /> Backup
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => triggerRestore('fuel')} disabled={isRestoring}>
                                    <UploadCloud className="h-4 w-4 mr-2" /> Restore
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Settings className="h-5 w-5 text-slate-600" />
                                <h4 className="font-semibold text-slate-900">Service Logs</h4>
                            </div>
                            <p className="text-sm text-slate-500">Backup maintenance and repair history.</p>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleDisasterRecoveryExport('service')}>
                                    <CloudDownload className="h-4 w-4 mr-2" /> Backup
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => triggerRestore('service')} disabled={isRestoring}>
                                    <UploadCloud className="h-4 w-4 mr-2" /> Restore
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <ListChecks className="h-5 w-5 text-emerald-600" />
                                <h4 className="font-semibold text-slate-900">Check-ins</h4>
                            </div>
                            <p className="text-sm text-slate-500">Archive of legacy weekly check-in data.</p>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleDisasterRecoveryExport('checkin')}>
                                    <CloudDownload className="h-4 w-4 mr-2" /> Backup
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => triggerRestore('checkin')} disabled={isRestoring}>
                                    <UploadCloud className="h-4 w-4 mr-2" /> Restore
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Car className="h-5 w-5 text-blue-600" />
                                <h4 className="font-semibold text-slate-900">Odometer History</h4>
                            </div>
                            <p className="text-sm text-slate-500">Preserve verified odometer checkpoints.</p>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleDisasterRecoveryExport('odometer')}>
                                    <CloudDownload className="h-4 w-4 mr-2" /> Backup
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => triggerRestore('odometer')} disabled={isRestoring}>
                                    <UploadCloud className="h-4 w-4 mr-2" /> Restore
                                </Button>
                            </div>
                        </div>
                    </div>
                    
                    {/* Hidden Input for Restore */}
                    <input 
                        type="file" 
                        ref={restoreFileInputRef} 
                        className="hidden" 
                        accept=".csv"
                        onChange={onRestoreFileSelect}
                    />
                </CardContent>
            </Card>
        </CollapsibleSection>
    );
}
