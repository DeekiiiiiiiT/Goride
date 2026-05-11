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
import { DateRange } from "react-day-picker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import { toast } from "sonner@2.0.3";

import { api } from '../../services/api';
import { Vehicle } from '../../types/vehicle';
import { Trip, FinancialTransaction } from '../../types/data';
import { FuelEntry, MileageAdjustment, OdometerBucket } from '../../types/fuel';
import { FuelCalculationService } from '../../services/fuelCalculationService';
import { settlementService } from '../../services/settlementService';
import { odometerService } from '../../services/odometerService';

interface BucketReconciliationViewProps {
    vehicle: Vehicle;
    trips: Trip[];
    fuelEntries: FuelEntry[];
    transactions?: FinancialTransaction[];
    adjustments?: MileageAdjustment[];
    dateRange?: DateRange;
    onClose?: () => void;
    onRefresh?: () => void;
}

export function BucketReconciliationView({ 
    vehicle, 
    trips, 
    fuelEntries, 
    transactions = [],
    adjustments = [],
    dateRange,
    onRefresh
}: BucketReconciliationViewProps) {
    const [isPosting, setIsPosting] = React.useState<string | null>(null);
    const [unifiedAnchors, setUnifiedAnchors] = React.useState<{ id: string; date: string; odometer: number }[] | null>(null);
    const [bucketTrips, setBucketTrips] = React.useState<Trip[] | null>(null);

    React.useEffect(() => {
        const loadAnchors = async () => {
            try {
                const history = await odometerService.getUnifiedHistory(vehicle.id);
                // Filter to verified anchors only and map to minimal shape
                const anchors = history
                    .filter(h => h.isVerified && h.isAnchorPoint)
                    .map(h => ({ id: h.id, date: h.date, odometer: h.value }));
                setUnifiedAnchors(anchors);

                // Fetch trips for the FULL anchor date range, not just the week
                if (anchors.length >= 2) {
                    const sorted = [...anchors].sort((a, b) => a.date.localeCompare(b.date));
                    const startDate = sorted[0].date;
                    const endDate = sorted[sorted.length - 1].date;
                    try {
                        const response = await api.getTripsFiltered({
                            startDate,
                            endDate,
                            limit: 5000
                        });
                        // Filter to this vehicle only
                        const vehicleTrips = (response.data || []).filter(t => t.vehicleId === vehicle.id);
                        setBucketTrips(vehicleTrips);
                    } catch (tripErr) {
                        console.error("Failed to fetch trips for bucket date range:", tripErr);
                        // Fall back to the parent-provided trips
                        setBucketTrips(null);
                    }
                }
            } catch (err) {
                console.error("Failed to load unified anchors for bucket view:", err);
                // Fall back to fuel-entry-only anchors (null means "use default")
                setUnifiedAnchors(null);
            }
        };
        loadAnchors();
    }, [vehicle.id]);
    
    // Use locally-fetched trips (full anchor range) if available, otherwise fall back to parent trips
    const effectiveTrips = bucketTrips ?? trips;

    // Compute the ACTUAL efficiency being used by buildOdometerBuckets — same 3-tier fallback chain
    const liveEfficiency = useMemo(() => {
        const allVehicleEntries = fuelEntries.filter(e => e.vehicleId === vehicle.id);
        const odoEntries = allVehicleEntries
            .filter(e => e.odometer !== undefined && e.odometer !== null && e.odometer > 0 && (e.liters || 0) > 0)
            .sort((a, b) => (a.odometer || 0) - (b.odometer || 0));

        const efficiencyFuel = odoEntries.length >= 2
            ? odoEntries.slice(1).reduce((sum, e) => sum + (e.liters || 0), 0)
            : 0;

        let kmL = 0;
        let source: 'odometer' | 'configured' | 'default' = 'default';

        if (odoEntries.length >= 3 && efficiencyFuel > 0) {
            const odoSpan = (odoEntries[odoEntries.length - 1].odometer || 0) - (odoEntries[0].odometer || 0);
            if (odoSpan > 0) {
                kmL = odoSpan / efficiencyFuel;
                source = 'odometer';
            }
        }
        if (kmL <= 0) {
            const cityEff = vehicle.fuelSettings?.efficiencyCity;
            if (cityEff && cityEff > 0) {
                kmL = 100 / cityEff;
                source = 'configured';
            } else {
                kmL = 10;
                source = 'default';
            }
        }

        const l100km = kmL > 0 ? Number((100 / kmL).toFixed(1)) : 0;
        return { kmL: Number(kmL.toFixed(2)), l100km, source, odoEntries: odoEntries.length };
    }, [vehicle, fuelEntries]);

    const buckets = useMemo(() => {
        const rawBuckets = FuelCalculationService.calculateOdometerBuckets(
            vehicle,
            fuelEntries,
            effectiveTrips,
            adjustments,
            unifiedAnchors || undefined
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
    }, [vehicle, fuelEntries, effectiveTrips, adjustments, transactions, unifiedAnchors]);

    // Filter buckets by date range for display (calculation uses full history for accuracy)
    const filteredBuckets = useMemo(() => {
        if (!dateRange?.from) return buckets;
        
        return buckets.filter(bucket => {
            // A bucket overlaps the date range if its endDate >= range.from AND startDate <= range.to
            const bucketStart = new Date(bucket.startDate);
            const bucketEnd = new Date(bucket.endDate);
            bucketStart.setHours(0, 0, 0, 0);
            bucketEnd.setHours(0, 0, 0, 0);
            
            const rangeFrom = new Date(dateRange.from!);
            rangeFrom.setHours(0, 0, 0, 0);
            
            const rangeTo = dateRange.to ? new Date(dateRange.to) : rangeFrom;
            rangeTo.setHours(0, 0, 0, 0);
            
            return bucketEnd >= rangeFrom && bucketStart <= rangeTo;
        });
    }, [buckets, dateRange]);

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

    if (filteredBuckets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
                <History className="h-12 w-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-900">No Buckets in Selected Period</h3>
                <p className="text-sm text-slate-500 max-w-xs mt-2">
                    No stop-to-stop buckets overlap with the selected date range. Try expanding the calendar filter.
                </p>
                <p className="text-xs text-slate-400 mt-2">{buckets.length} total bucket{buckets.length !== 1 ? 's' : ''} exist across all time.</p>
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
                            {liveEfficiency.kmL} <span className="text-sm font-normal text-slate-500">km/L</span>
                            <span className="text-sm font-normal text-slate-400 ml-1">({liveEfficiency.l100km} L/100km)</span>
                        </p>
                        <p className="text-xs mt-1">
                            {liveEfficiency.source === 'odometer' ? (
                                <span className="text-emerald-600 font-medium">● Live from {liveEfficiency.odoEntries} odometer entries</span>
                            ) : liveEfficiency.source === 'configured' ? (
                                <span className="text-amber-600 font-medium">● Configured baseline (insufficient odo data)</span>
                            ) : (
                                <span className="text-red-600 font-medium">● System default (no config or odo data)</span>
                            )}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {unifiedAnchors ? `${unifiedAnchors.length} unified anchors` : 'Fuel entries only'}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-50/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                            <Navigation className="h-4 w-4 text-indigo-500" />
                            <span className="text-sm font-medium text-slate-500">Total Distance</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">
                            {(filteredBuckets[filteredBuckets.length - 1].endOdometer - filteredBuckets[0].startOdometer).toLocaleString()} <span className="text-sm font-normal text-slate-500">km</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Spanning {filteredBuckets.length} bucket{filteredBuckets.length !== 1 ? 's' : ''}{dateRange?.from ? ' in period' : ''}</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-50/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                            <Fuel className="h-4 w-4 text-emerald-500" />
                            <span className="text-sm font-medium text-slate-500">Total Fuel</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">
                            {filteredBuckets.reduce((sum, b) => sum + b.actualFuelLiters, 0).toFixed(1)} <span className="text-sm font-normal text-slate-500">L</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Cost: {formatCurrency(filteredBuckets.reduce((sum, b) => sum + b.actualFuelCost, 0))}</p>
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
                            {filteredBuckets.map((bucket, idx) => (
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
                                                                RS: {typeof bucket.rideShareDistance === 'number' ? bucket.rideShareDistance.toFixed(2) : bucket.rideShareDistance}
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>RideShare Distance</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="flex items-center gap-0.5 text-[10px] px-1 bg-purple-50 text-purple-700 rounded border border-purple-100">
                                                                P: {typeof bucket.personalDistance === 'number' ? bucket.personalDistance.toFixed(2) : bucket.personalDistance}
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