import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Info, RefreshCw, ShieldCheck, Database } from 'lucide-react';
import { ScenarioList } from './ScenarioList';
import { Button } from "../ui/button";
import { api } from '../../services/api';
import { toast } from "sonner@2.0.3";

export function FuelConfiguration() {
    const [isBackfilling, setIsBackfilling] = React.useState(false);

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
                </div>
            </CardContent>
        </Card>
    );
}
