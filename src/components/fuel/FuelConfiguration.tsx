import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Info, RefreshCw, ShieldCheck, Database, Trash2, AlertTriangle } from 'lucide-react';
import { ScenarioList } from './ScenarioList';
import { Button } from "../ui/button";
import { api } from '../../services/api';
import { toast } from "sonner@2.0.3";

export function FuelConfiguration() {
    const [isBackfilling, setIsBackfilling] = React.useState(false);
    const [isResetting, setIsResetting] = React.useState(false);

    const handleResetFuelData = async () => {
        const confirm1 = window.confirm("DANGER: This will permanently delete ALL fuel logs and their associated financial transactions. This action cannot be undone.");
        if (!confirm1) return;
        
        const confirm2 = window.confirm("Are you absolutely sure? Please confirm one last time to proceed with the data wipe.");
        if (!confirm2) return;

        setIsResetting(true);
        try {
            const entries = await api.getAllFuelEntries();
            let deletedCount = 0;
            
            // Execute deletions in parallel batches to speed up but not overwhelm server
            const batchSize = 5;
            for (let i = 0; i < entries.length; i += batchSize) {
                const batch = entries.slice(i, i + batchSize);
                await Promise.all(batch.map(async (entry: any) => {
                    // 1. Delete linked transaction if it exists
                    if (entry.transactionId) {
                        try {
                            await api.deleteTransaction(entry.transactionId);
                        } catch (e) {
                            console.warn(`Failed to delete linked transaction ${entry.transactionId}`, e);
                        }
                    }
                    // 2. Delete the fuel entry
                    await api.deleteFuelEntry(entry.id);
                    deletedCount++;
                }));
            }
            
            toast.success("Fuel Data Reset Complete", {
                description: `Successfully removed ${deletedCount} entries and linked transactions.`
            });
            
            // Force reload to clear all views
            setTimeout(() => window.location.reload(), 1500);
            
        } catch (e) {
            console.error(e);
            toast.error("Reset Failed", { description: "An error occurred while deleting data." });
        } finally {
            setIsResetting(false);
        }
    };

    const handleBackfill = async () => {
        const confirm = window.confirm("Are you sure? This will recalculate cumulative liters and integrity flags for ALL historical fuel entries. This may take a moment.");
        if (!confirm) return;

        setIsBackfilling(true);
        try {
            const result = await api.runFuelBackfill();
            toast.success("Historical Audit Complete", {
                description: `Processed ${result.processed} entries. Detected ${result.anomaliesDetected} anomalies.`
            });
        } catch (e) {
            console.error(e);
            toast.error("Backfill failed");
        } finally {
            setIsBackfilling(false);
        }
    };

    return (
        <Card className="border-0 shadow-none">
            <CardHeader className="px-0 pt-0">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Fuel Configuration</CardTitle>
                        <CardDescription>
                            Manage expense coverage scenarios and rules for your fleet.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="px-0 space-y-8">
                <Alert className="bg-blue-50 border-blue-200 text-blue-900">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertTitle>About Scenarios</AlertTitle>
                    <AlertDescription className="text-blue-800">
                        Scenarios allow you to define different expense coverage rules (e.g., "Company Car" vs. "Rental"). 
                        Assign these scenarios to vehicles or drivers to automate reimbursement calculations.
                    </AlertDescription>
                </Alert>

                <ScenarioList />

                <div className="pt-8 border-t">
                    <h3 className="text-lg font-bold text-slate-900 mb-2">System Maintenance</h3>
                    <p className="text-sm text-slate-500 mb-6">Tools for ensuring data integrity and reconciling historical records with current logic.</p>
                    
                    <Card className="border-amber-100 bg-amber-50/30">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                                    <Database className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-900">Historical Integrity Backfill</p>
                                    <p className="text-xs text-slate-600">Apply Phase 8 integrity rules (Cumulative counting & Overflow detection) to entries before January 2026.</p>
                                </div>
                            </div>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="border-amber-200 hover:bg-amber-100"
                                onClick={handleBackfill}
                                disabled={isBackfilling}
                            >
                                <RefreshCw className={`h-4 w-4 mr-2 ${isBackfilling ? 'animate-spin' : ''}`} />
                                {isBackfilling ? "Processing..." : "Run Backfill"}
                            </Button>
                        </CardContent>
                    </Card>

                    <div className="mt-4">
                        <Card className="border-red-100 bg-red-50/30">
                            <CardContent className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-red-100 rounded-lg text-red-600">
                                        <AlertTriangle className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-red-900">Danger Zone: Reset Fuel Data</p>
                                        <p className="text-xs text-red-700/80">Permanently delete ALL fuel logs and associated financial transactions. Use this for a fresh start.</p>
                                    </div>
                                </div>
                                <Button 
                                    variant="destructive" 
                                    size="sm" 
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                    onClick={handleResetFuelData}
                                    disabled={isResetting}
                                >
                                    <Trash2 className={`h-4 w-4 mr-2 ${isResetting ? 'animate-bounce' : ''}`} />
                                    {isResetting ? "Wiping Data..." : "Reset Data"}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
