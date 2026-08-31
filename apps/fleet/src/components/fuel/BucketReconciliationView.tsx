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
    RotateCcw,
    ScanLine,
} from "lucide-react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import { toast } from "sonner";

import { api } from '../../services/api';
import { Vehicle } from '../../types/vehicle';
import { Trip, FinancialTransaction } from '../../types/data';
import { FuelEntry, MileageAdjustment, OdometerBucket } from '../../types/fuel';
import { FuelCalculationService, FALLBACK_EFFICIENCY_KM_L } from '../../services/fuelCalculationService';
import { settlementService } from '../../services/settlementService';
import { odometerService } from '../../services/odometerService';
import { MasterLogTimeline } from '../vehicles/odometer/MasterLogTimeline';
import { bucketClosesInFuelWeek, toEntryYmd } from '../../utils/fuelWeekPeriod';
import { ymdToLocalDate } from '../../utils/timezoneDisplay';
import { getVehicleWeekFuelKpis } from '../../utils/fuelAnalyticsAggregates';

/** Calendar day label without UTC date-only shift (yyyy-MM-dd must not parse as UTC midnight). */
function formatBucketDay(value: string): string {
    const ymd = toEntryYmd(value);
    const d = ymdToLocalDate(ymd);
    if (Number.isNaN(d.getTime())) return '';
    return format(d, 'MMM d');
}

interface BucketReconciliationViewProps {
    vehicle: Vehicle;
    trips: Trip[];
    fuelEntries: FuelEntry[];
    transactions?: FinancialTransaction[];
    adjustments?: MileageAdjustment[];
    dateRange?: DateRange;
    onClose?: () => void;
    onRefresh?: () => void;
    /** When period is Locked, Charge Gap is read-only. */
    periodLocked?: boolean;
}

export function BucketReconciliationView({ 
    vehicle, 
    trips, 
    fuelEntries, 
    transactions = [],
    adjustments = [],
    dateRange,
    onRefresh,
    periodLocked = false,
}: BucketReconciliationViewProps) {
    const [isPosting, setIsPosting] = React.useState<string | null>(null);
    const [unifiedAnchors, setUnifiedAnchors] = React.useState<{ id: string; date: string; odometer: number }[] | null>(null);
    const [bucketTrips, setBucketTrips] = React.useState<Trip[] | null>(null);
    // Explain-gap Timeline: one bucket window, or the recon week's calendar dates (not overlapping-bucket span)
    const [timelineScope, setTimelineScope] = React.useState<{
        from: string;
        to: string;
        label: string;
    } | null>(null);

    const weekTimelineRange = React.useMemo(() => {
        if (!dateRange?.from) return null;
        return {
            from: toEntryYmd(dateRange.from),
            to: toEntryYmd(dateRange.to ?? dateRange.from),
        };
    }, [dateRange?.from, dateRange?.to]);

    const periodYmd = weekTimelineRange;

    const openBucketTimeline = (bucket: OdometerBucket) => {
        setTimelineScope({
            from: toEntryYmd(bucket.startDate),
            to: toEntryYmd(bucket.endDate),
            label: `${bucket.startOdometer.toLocaleString()} → ${bucket.endOdometer.toLocaleString()} km`,
        });
    };

    const openWeekTimeline = () => {
        if (!weekTimelineRange) return;
        setTimelineScope({
            ...weekTimelineRange,
            label: 'This recon week',
        });
    };

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

    // Only buckets whose closing fill is in the selected week. Full history is still used to build the chain.
    const filteredBuckets = useMemo(() => {
        if (!periodYmd) return buckets;
        return buckets.filter((bucket) =>
            bucketClosesInFuelWeek(bucket, periodYmd.from, periodYmd.to)
        );
    }, [buckets, periodYmd]);

    const periodStats = useMemo(() => {
        if (!periodYmd) {
            return {
                distanceKm: 0,
                liters: 0,
                cost: 0,
                kmL: 0,
                l100km: 0,
                source: 'default' as const,
                fillCount: 0,
            };
        }
        const kpis = getVehicleWeekFuelKpis(
            fuelEntries,
            vehicle,
            periodYmd.from,
            periodYmd.to,
        );
        let kmL = 0;
        let source: 'period' | 'configured' | 'default' = 'default';
        if (kpis.efficiencyKmL != null && kpis.efficiencyKmL > 0) {
            kmL = kpis.efficiencyKmL;
            source = 'period';
        } else {
            const cityEff = vehicle.fuelSettings?.efficiencyCity;
            if (cityEff && cityEff > 0) {
                kmL = 100 / cityEff;
                source = 'configured';
            } else {
                kmL = FALLBACK_EFFICIENCY_KM_L;
                source = 'default';
            }
        }
        return {
            distanceKm: kpis.distanceKm,
            liters: kpis.liters,
            cost: kpis.cost,
            kmL: Number(kmL.toFixed(2)),
            l100km: kmL > 0 ? Number((100 / kmL).toFixed(1)) : 0,
            source,
            fillCount: kpis.refuelCount,
        };
    }, [fuelEntries, vehicle, periodYmd]);

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
                <h3 className="text-lg font-medium text-slate-900">No fills in this week</h3>
                <p className="text-sm text-slate-500 max-w-xs mt-2">
                    No stop-to-stop fills closed in the selected week. Try another week.
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
                            <span className="text-sm font-medium text-slate-500">This week’s efficiency</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">
                            {periodStats.kmL} <span className="text-sm font-normal text-slate-500">km/L</span>
                            <span className="text-sm font-normal text-slate-400 ml-1">({periodStats.l100km} L/100km)</span>
                        </p>
                        <p className="text-xs mt-1">
                            {periodStats.source === 'period' ? (
                                <span className="text-emerald-600 font-medium">● From {periodStats.fillCount} ops fill{periodStats.fillCount !== 1 ? 's' : ''} in this week</span>
                            ) : periodStats.source === 'configured' ? (
                                <span className="text-amber-600 font-medium">● Vehicle baseline (no ops fills this week)</span>
                            ) : (
                                <span className="text-red-600 font-medium">● System default (no config or fills this week)</span>
                            )}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Same as Fuel Analytics: odo span ÷ all ops litres this week.
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-50/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                            <Navigation className="h-4 w-4 text-indigo-500" />
                            <span className="text-sm font-medium text-slate-500">This week’s distance</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">
                            {periodStats.distanceKm.toLocaleString()} <span className="text-sm font-normal text-slate-500">km</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            Odo span from ops fills in this week
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-50/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                            <Fuel className="h-4 w-4 text-emerald-500" />
                            <span className="text-sm font-medium text-slate-500">This week’s fuel</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">
                            {periodStats.liters.toFixed(1)} <span className="text-sm font-normal text-slate-500">L</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            Cost: {formatCurrency(periodStats.cost)} — all ops fills this week
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <CardTitle className="text-lg">Stop-to-Stop Buckets</CardTitle>
                            <CardDescription>
                                Fills that closed in this week only. Next week’s fills are not included.
                            </CardDescription>
                        </div>
                        {weekTimelineRange && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="shrink-0 gap-1.5"
                                onClick={openWeekTimeline}
                            >
                                <ScanLine className="h-3.5 w-3.5" />
                                View week timeline
                            </Button>
                        )}
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
                                <TableHead className="w-[100px] text-center">Audit</TableHead>
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
                                                Fill {formatBucketDay(bucket.endDate)}
                                                {toEntryYmd(bucket.startDate) !== toEntryYmd(bucket.endDate)
                                                    ? ` · from ${formatBucketDay(bucket.startDate)}`
                                                    : ''}
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
                                                        {!periodLocked && (
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
                                                        )}
                                                        {periodLocked && (
                                                          <span className="text-[10px] text-slate-400">Locked</span>
                                                        )}
                                                    </div>
                                                ) : periodLocked ? (
                                                    <span className="text-[10px] text-slate-400">Read-only</span>
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
                                            Math.abs(bucket.variancePercent) > 20 ? (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="flex flex-col items-center cursor-help">
                                                                <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                                                                <span className="text-[9px] text-slate-400 mt-0.5">Variance info</span>
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent className="max-w-[200px]">
                                                            <p className="text-xs">Fuel variance is informational for top-ups. Flags only for GAP or tank overflow.</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            ) : (
                                                <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                                            )
                                        ) : (
                                            <div className="flex flex-col items-center">
                                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                                                <span className="text-[10px] font-bold text-amber-600 uppercase mt-0.5">Flagged</span>
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2 text-[11px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 gap-1"
                                            onClick={() => openBucketTimeline(bucket)}
                                        >
                                            <ScanLine className="h-3 w-3" />
                                            Explain gap
                                        </Button>
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
                        <li><strong>Variance</strong> compares the fuel added at the end of the bucket against what the vehicle <em>should</em> have used based on its profile (info only for top-ups).</li>
                        <li><strong>Flagged</strong> means GAP or tank overflow — not normal top-up variance.</li>
                        <li><strong>Explain gap</strong> opens the Unified Timeline for that stop-to-stop window (anchors, trips, personal km).</li>
                        <li>Cards, table, and week timeline all use this week’s fills only.</li>
                    </ul>
                </div>
            </div>

            <Dialog open={!!timelineScope} onOpenChange={(open) => !open && setTimelineScope(null)}>
                <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-[1100px] w-[95vw] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ScanLine className="h-5 w-5 text-indigo-600" />
                            Gap Timeline — {vehicle.licensePlate || vehicle.id}
                        </DialogTitle>
                        <DialogDescription>
                            {timelineScope?.label}
                            {timelineScope?.from && timelineScope?.to
                                ? ` · ${timelineScope.from} → ${timelineScope.to}`
                                : ''}
                            . Matching anchors to trips to show how fuel distance was used.
                        </DialogDescription>
                    </DialogHeader>
                    {timelineScope && (
                        <MasterLogTimeline
                            vehicleId={vehicle.id}
                            embedded
                            initialDateRange={{ from: timelineScope.from, to: timelineScope.to }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}