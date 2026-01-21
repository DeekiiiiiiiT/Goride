import React, { useMemo } from 'react';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow,
} from "../ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { 
    AlertTriangle, 
    CheckCircle2, 
    Info, 
    Navigation, 
    Fuel, 
    ArrowRight,
    Gauge,
    History,
    Banknote,
    Loader2,
    RotateCcw
} from "lucide-react";
import { format } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import { toast } from "sonner@2.0.3";

import { api } from '../../services/api';
import { Vehicle } from '../../types/vehicle';
import { Trip, FinancialTransaction } from '../../types/data';
import { FuelEntry, MileageAdjustment, OdometerBucket } from '../../types/fuel';
import { FuelCalculationService } from '../../services/fuelCalculationService';
import { settlementService } from '../../services/settlementService';

interface BucketReconciliationViewProps {
    vehicle: Vehicle;
    trips: Trip[];
    fuelEntries: FuelEntry[];
    transactions?: FinancialTransaction[];
    adjustments?: MileageAdjustment[];
    onClose?: () => void;
    onRefresh?: () => void;
}

export function BucketReconciliationView({ 
    vehicle, 
    trips, 
    fuelEntries, 
    transactions = [],
    adjustments = [],
    onRefresh
}: BucketReconciliationViewProps) {
    const [isPosting, setIsPosting] = React.useState<string | null>(null);
    
    const buckets = useMemo(() => {
        const rawBuckets = FuelCalculationService.calculateOdometerBuckets(
            vehicle,
            fuelEntries,
            trips,
            adjustments
        );

        // Check for existing deductions
        return rawBuckets.map(bucket => {
            const deductionTx = transactions.find(tx => 
                tx.metadata?.bucketId === bucket.id && 
                tx.metadata?.transactionType === 'Gap_Deduction'
            );
            return { 
                ...bucket, 
                isDeductionPosted: !!deductionTx,
                deductionTransactionId: deductionTx?.id
            };
        });
    }, [vehicle, fuelEntries, trips, adjustments, transactions]);

    const handlePostDeduction = async (bucket: OdometerBucket) => {
        setIsPosting(bucket.id);
        try {
            await settlementService.processGapDeduction(bucket);
            toast.success("Deduction posted to driver ledger");
            if (onRefresh) onRefresh();
        } catch (e) {
            console.error(e);
            toast.error("Failed to post deduction");
        } finally {
            setIsPosting(null);
        }
    };

    const handleRevertDeduction = async (bucket: OdometerBucket) => {
        if (!bucket.deductionTransactionId) return;
        
        setIsPosting(bucket.id);
        try {
            await api.deleteTransaction(bucket.deductionTransactionId);
            toast.success("Deduction reverted");
            if (onRefresh) onRefresh();
        } catch (e) {
            console.error(e);
            toast.error("Failed to revert deduction");
        } finally {
            setIsPosting(null);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    };

    const getVarianceColor = (percent: number) => {
        if (Math.abs(percent) > 20) return "text-red-600 font-bold";
        if (Math.abs(percent) > 10) return "text-amber-600";
        return "text-emerald-600";
    };

    if (buckets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
                <History className="h-12 w-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-900">Insufficient Data</h3>
                <p className="text-sm text-slate-500 max-w-xs mt-2">
                    Odometer-based anchoring requires at least two fuel entries with odometer readings for this vehicle.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-slate-50/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                            <Gauge className="h-4 w-4 text-blue-500" />
                            <span className="text-sm font-medium text-slate-500">Efficiency Profile</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">
                            {vehicle.fuelSettings?.efficiencyCity || '10.0'} <span className="text-sm font-normal text-slate-500">L/100km</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Based on vehicle configuration</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-50/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                            <Navigation className="h-4 w-4 text-indigo-500" />
                            <span className="text-sm font-medium text-slate-500">Total Distance</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">
                            {(buckets[buckets.length - 1].endOdometer - buckets[0].startOdometer).toLocaleString()} <span className="text-sm font-normal text-slate-500">km</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Spanning {buckets.length} fuel stops</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-50/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                            <Fuel className="h-4 w-4 text-emerald-500" />
                            <span className="text-sm font-medium text-slate-500">Total Fuel</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">
                            {buckets.reduce((sum, b) => sum + b.actualFuelLiters, 0).toFixed(1)} <span className="text-sm font-normal text-slate-500">L</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Cost: {formatCurrency(buckets.reduce((sum, b) => sum + b.actualFuelCost, 0))}</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg">Stop-to-Stop Buckets</CardTitle>
                            <CardDescription>Precise fuel consumption between odometer anchors</CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            Phase 3 Active
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/50">
                                <TableHead className="w-[180px]">Odometer Range</TableHead>
                                <TableHead className="w-[120px]">Distance</TableHead>
                                <TableHead>Fuel Usage (Actual vs Expected)</TableHead>
                                <TableHead className="text-right">Variance</TableHead>
                                <TableHead className="text-right">Attribution (km)</TableHead>
                                <TableHead className="w-[120px] text-right">Deduction</TableHead>
                                <TableHead className="w-[100px] text-center">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {buckets.map((bucket, idx) => (
                                <TableRow key={bucket.id} className={bucket.status === 'Anomaly' ? "bg-amber-50/30" : ""}>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-1 text-sm font-medium">
                                                <span>{bucket.startOdometer.toLocaleString()}</span>
                                                <ArrowRight className="h-3 w-3 text-slate-400" />
                                                <span>{bucket.endOdometer.toLocaleString()}</span>
                                            </div>
                                            <span className="text-[10px] text-slate-500 uppercase mt-0.5">
                                                {format(new Date(bucket.startDate), 'MMM d')} - {format(new Date(bucket.endDate), 'MMM d')}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium text-slate-900">
                                            {(bucket.endOdometer - bucket.startOdometer).toLocaleString()} <span className="text-xs font-normal text-slate-500">km</span>
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                            {bucket.tripsCount} trips logged
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1.5 w-full max-w-[200px]">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-slate-500">Actual: {bucket.actualFuelLiters.toFixed(1)}L</span>
                                                <span className="text-slate-400 italic">Exp: {bucket.expectedFuelLiters.toFixed(1)}L</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                                <div 
                                                    className={`h-full ${bucket.variancePercent > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                                                    style={{ width: `${Math.min(100, (bucket.actualFuelLiters / bucket.expectedFuelLiters) * 50)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className={`text-sm font-bold ${getVarianceColor(bucket.variancePercent)}`}>
                                            {bucket.variancePercent > 0 ? '+' : ''}{bucket.variancePercent.toFixed(1)}%
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                            {bucket.varianceLiters > 0 ? '+' : ''}{bucket.varianceLiters.toFixed(1)} L
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="flex gap-1.5">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="flex items-center gap-0.5 text-[10px] px-1 bg-blue-50 text-blue-700 rounded border border-blue-100">
                                                                RS: {bucket.rideShareDistance}
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>RideShare Distance</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="flex items-center gap-0.5 text-[10px] px-1 bg-purple-50 text-purple-700 rounded border border-purple-100">
                                                                P: {bucket.personalDistance}
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>Personal Distance</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                            {bucket.unaccountedDistance > 0 && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="flex items-center gap-0.5 text-[10px] px-1 bg-red-50 text-red-700 rounded border border-red-200 font-bold">
                                                                GAP: {bucket.unaccountedDistance.toLocaleString()}
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            Unaccounted Distance (Odometer Jump)
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {bucket.deductionRecommendation ? (
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="text-sm font-bold text-red-600">
                                                    {formatCurrency(bucket.deductionRecommendation)}
                                                </div>
                                                {bucket.isDeductionPosted ? (
                                                    <div className="flex items-center gap-1">
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-100 uppercase font-bold">
                                                            Posted
                                                        </Badge>
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <button 
                                                                        onClick={() => handleRevertDeduction(bucket)}
                                                                        disabled={isPosting === bucket.id}
                                                                        className="text-slate-400 hover:text-red-600 transition-colors p-0.5 rounded-full hover:bg-red-50"
                                                                    >
                                                                        {isPosting === bucket.id ? (
                                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                                        ) : (
                                                                            <RotateCcw className="h-3 w-3" />
                                                                        )}
                                                                    </button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Revert (Undo) Deduction</TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    </div>
                                                ) : (
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        className="h-6 px-1.5 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center gap-1"
                                                        onClick={() => handlePostDeduction(bucket)}
                                                        disabled={isPosting === bucket.id}
                                                    >
                                                        {isPosting === bucket.id ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <Banknote className="h-3 w-3" />
                                                        )}
                                                        Charge Gap
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-400">No Leakage</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {bucket.status === 'Complete' ? (
                                            <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                                        ) : (
                                            <div className="flex flex-col items-center">
                                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                                                <span className="text-[10px] font-bold text-amber-600 uppercase mt-0.5">Flagged</span>
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-800">
                    <p className="font-semibold">How to read this data:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1 opacity-90">
                        <li>Each row represents the travel between two consecutive fuel station visits.</li>
                        <li><strong>GAP</strong> highlights distance traveled that was NOT logged as a Trip or Adjustment.</li>
                        <li><strong>Variance</strong> compares the fuel added at the end of the bucket against what the vehicle <em>should</em> have used based on its profile.</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
