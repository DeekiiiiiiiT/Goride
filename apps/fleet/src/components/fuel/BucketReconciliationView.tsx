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
    Loader2,
    ScanLine,
    Banknote,
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
import {
  recommendGapCharge,
  approveGapCharge,
  listGapCharges,
  gapChargeErrorMessage,
} from '../../services/stopToStopGapChargeService';
import { odometerService } from '../../services/odometerService';
import { MasterLogTimeline } from '../vehicles/odometer/MasterLogTimeline';
import { bucketClosesInFuelWeek, toEntryYmd } from '../../utils/fuelWeekPeriod';
import { ymdToLocalDate } from '../../utils/timezoneDisplay';
import { getVehicleWeekFuelKpis } from '../../utils/fuelAnalyticsAggregates';
import { formatFuelMoney } from '../../utils/formatFuelMoney';
import {
  evaluateStopToStopConservation,
  stopToStopIsReconciled,
  sumBucketDistanceKm,
  chainSpanKm,
  type GapChargeRecommendation,
} from '@roam/fuel-core';
import { useAuth } from '../auth/AuthContext';

/** Charge Gap on — Recommend then distinct Approve → Pending (Rev 8 / Q-3). */
export const STOP_TO_STOP_CHARGES_ENABLED = true;

type PendingRecSummary = Pick<
  GapChargeRecommendation,
  'bucketId' | 'vehicleId' | 'amount' | 'status' | 'recommendedBy'
>;

/** Calendar day label without UTC date-only shift (yyyy-MM-dd must not parse as UTC midnight). */
function formatBucketDay(value: string): string {
    const ymd = toEntryYmd(value);
    const d = ymdToLocalDate(ymd);
    if (Number.isNaN(d.getTime())) return '';
    return format(d, 'MMM d');
}

function boundaryLabel(source?: OdometerBucket['closingBoundarySource']): string {
    switch (source) {
        case 'fuel': return 'Fill';
        case 'checkin': return 'Check-in';
        case 'service': return 'Service';
        case 'manual': return 'Manual';
        default: return 'Boundary';
    }
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

type UnifiedAnchor = {
    id: string;
    date: string;
    odometer: number;
    referenceId?: string;
    source?: string;
};

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
    const { organizationId, user } = useAuth();
    const actorId = user?.id || null;
    const [isPosting, setIsPosting] = React.useState<string | null>(null);
    /** Pending recommendations hydrated from GET …/gap-charges (Q-3). */
    const [pendingRecs, setPendingRecs] = React.useState<Map<string, PendingRecSummary>>(
        () => new Map(),
    );
    const [periodPending, setPeriodPending] = React.useState<PendingRecSummary[]>([]);
    const [unifiedAnchors, setUnifiedAnchors] = React.useState<UnifiedAnchor[] | null>(null);
    const [bucketTrips, setBucketTrips] = React.useState<Trip[] | null>(null);
    const [tripsTruncated, setTripsTruncated] = React.useState(false);
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
                const history = await odometerService.getLedger(vehicle.id, { limit: 5000 });
                const anchors: UnifiedAnchor[] = history.data
                    .filter(h => h.isVerified && h.isAnchorPoint)
                    .map(h => ({
                        id: h.id,
                        date: toEntryYmd(h.date),
                        odometer: h.value,
                        referenceId: h.referenceId,
                        source: h.source,
                    }));
                setUnifiedAnchors(anchors);

                if (anchors.length >= 2) {
                    const sorted = [...anchors].sort((a, b) => a.date.localeCompare(b.date));
                    const startDate = sorted[0].date;
                    const endDate = sorted[sorted.length - 1].date;
                    const tripLimit = 5000;
                    try {
                        const response = await api.getTripsFiltered({
                            startDate,
                            endDate,
                            vehicleId: vehicle.id,
                            limit: tripLimit,
                        });
                        const vehicleTrips = response.data || [];
                        setBucketTrips(vehicleTrips);
                        setTripsTruncated((response.total ?? vehicleTrips.length) > tripLimit || vehicleTrips.length >= tripLimit);
                    } catch (tripErr) {
                        console.error("Failed to fetch trips for bucket date range:", tripErr);
                        setBucketTrips(null);
                        setTripsTruncated(false);
                    }
                }
            } catch (err) {
                console.error("Failed to load unified anchors for bucket view:", err);
                setUnifiedAnchors(null);
            }
        };
        loadAnchors();
    }, [vehicle.id]);

    // Q-3: hydrate pending recommendations from server (not session-local state).
    React.useEffect(() => {
        if (!STOP_TO_STOP_CHARGES_ENABLED || !organizationId || !periodYmd) {
            setPendingRecs(new Map());
            setPeriodPending([]);
            return;
        }
        let cancelled = false;
        const loadPending = async () => {
            try {
                const periodId = `week_${periodYmd.from}_${periodYmd.to}`;
                const rows = await listGapCharges({
                    periodId,
                    weekStart: periodYmd.from,
                    weekEnd: periodYmd.to,
                    status: 'recommended',
                });
                if (cancelled) return;
                const summaries: PendingRecSummary[] = rows
                    .filter((r) => r.status === 'recommended' && r.bucketId)
                    .map((r) => ({
                        bucketId: r.bucketId,
                        vehicleId: r.vehicleId,
                        amount: Number(r.amount) || 0,
                        status: r.status,
                        recommendedBy: r.recommendedBy,
                    }));
                setPeriodPending(summaries);
                const byBucket = new Map<string, PendingRecSummary>();
                for (const s of summaries) byBucket.set(s.bucketId, s);
                setPendingRecs(byBucket);
            } catch (err) {
                console.error('Failed to load pending gap charges:', err);
                if (!cancelled) {
                    setPendingRecs(new Map());
                    setPeriodPending([]);
                }
            }
        };
        loadPending();
        return () => {
            cancelled = true;
        };
    }, [organizationId, periodYmd?.from, periodYmd?.to]);
    
    const effectiveTrips = bucketTrips ?? trips;

    const buckets = useMemo(() => {
        const rawBuckets = FuelCalculationService.calculateOdometerBuckets(
            vehicle,
            fuelEntries,
            effectiveTrips,
            adjustments,
            unifiedAnchors || undefined
        );

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

    const conservation = useMemo(() => {
        // R-2: independent reference is first→last chain span — never sum of bucket distances.
        return evaluateStopToStopConservation({
            buckets: filteredBuckets,
            weekOpsLiters: periodStats.liters,
            chainDistanceKm: chainSpanKm(filteredBuckets),
        });
    }, [filteredBuckets, periodStats.liters]);

    const panelReconciled = stopToStopIsReconciled(conservation) && !tripsTruncated;

    const tableModeledKmL = useMemo(() => {
        const dist = sumBucketDistanceKm(filteredBuckets);
        const expected = filteredBuckets.reduce((s, b) => s + (b.expectedFuelLiters || 0), 0);
        return expected > 0 ? Number((dist / expected).toFixed(2)) : 0;
    }, [filteredBuckets]);

    const handlePostDeduction = async (bucket: OdometerBucket) => {
        if (!STOP_TO_STOP_CHARGES_ENABLED) {
            toast.error('Stop-to-stop charges are disabled');
            return;
        }
        if (!panelReconciled) {
            toast.error('Panel not reconciled — fix litres/distance before charging');
            return;
        }
        if (bucket.confidenceTier !== 'exact') {
            toast.error('Only exact-tier buckets can be charged');
            return;
        }
        if (!organizationId) {
            toast.error('Organization required to post a charge');
            return;
        }
        setIsPosting(bucket.id);
        try {
            const periodId = periodYmd
                ? `week_${periodYmd.from}_${periodYmd.to}`
                : 'adhoc';
            const result = await recommendGapCharge({
                orgId: organizationId,
                periodId,
                weekStart: periodYmd?.from,
                weekEnd: periodYmd?.to,
                bucket,
                // Solo-owner ops: recommend + approve in one step. Multi-user dual control deferred.
                autoApprove: true,
            });
            if (result.status === 'blocked') {
                toast.error(result.blockReason || 'Charge blocked');
                return;
            }
            if (result.status === 'approved' || result.transactionId) {
                setPendingRecs((prev) => {
                    const next = new Map(prev);
                    next.delete(bucket.id);
                    return next;
                });
                setPeriodPending((prev) => prev.filter((p) => p.bucketId !== bucket.id));
                toast.success(
                    result.transactionId
                        ? `Gap charge saved (Pending) for driver ${result.resolvedDriverId || '—'}`
                        : 'Gap charge saved (Pending)',
                );
            } else if (result.needsSecondApprove) {
                const summary: PendingRecSummary = {
                    bucketId: bucket.id,
                    vehicleId: bucket.vehicleId,
                    amount: Number(result.amount) || Number(bucket.deductionRecommendation) || 0,
                    status: 'recommended',
                    recommendedBy: result.recommendedBy || actorId || undefined,
                };
                setPendingRecs((prev) => new Map(prev).set(bucket.id, summary));
                setPeriodPending((prev) => {
                    const without = prev.filter((p) => p.bucketId !== bucket.id);
                    return [...without, summary];
                });
                toast.message(
                    'Gap charge recommended — approve to post Pending (or use a second team login when dual control is on).',
                );
            } else {
                toast.message('Gap charge recommended.');
            }
            if (onRefresh) onRefresh();
        } catch (e: any) {
            console.error(e);
            toast.error(gapChargeErrorMessage(e?.body || e?.message, 'Failed to post gap charge'));
        } finally {
            setIsPosting(null);
        }
    };

    const handleApproveDeduction = async (bucket: OdometerBucket) => {
        if (!STOP_TO_STOP_CHARGES_ENABLED) {
            toast.error('Stop-to-stop charges are disabled');
            return;
        }
        if (!panelReconciled) {
            toast.error('Panel not reconciled — fix litres/distance before charging');
            return;
        }
        if (bucket.confidenceTier !== 'exact') {
            toast.error('Only exact-tier buckets can be charged');
            return;
        }
        setIsPosting(`approve_${bucket.id}`);
        try {
            const periodId = periodYmd
                ? `week_${periodYmd.from}_${periodYmd.to}`
                : 'adhoc';
            const result = await approveGapCharge({
                periodId,
                weekStart: periodYmd?.from,
                weekEnd: periodYmd?.to,
                bucketId: bucket.id,
            });
            if (result.sameActor || result.status === 'blocked') {
                toast.error(result.blockReason || 'A different person must approve this gap charge.');
                return;
            }
            setPendingRecs((prev) => {
                const next = new Map(prev);
                next.delete(bucket.id);
                return next;
            });
            setPeriodPending((prev) => prev.filter((p) => p.bucketId !== bucket.id));
            toast.success(
                result.transactionId
                    ? `Gap charge saved (Pending) for driver ${result.resolvedDriverId || '—'}`
                    : 'Gap charge approved (Pending)',
            );
            if (onRefresh) onRefresh();
        } catch (e: any) {
            console.error(e);
            toast.error(gapChargeErrorMessage(e?.body || e?.message, 'Failed to approve gap charge'));
        } finally {
            setIsPosting(null);
        }
    };

    const formatCurrency = (val: number) => formatFuelMoney(val);

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
            {STOP_TO_STOP_CHARGES_ENABLED && !periodLocked && periodPending.length > 0 && (
                <div className="flex items-start gap-3 p-3 bg-indigo-50 rounded-lg border border-indigo-200 text-sm text-indigo-950">
                    <Banknote className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                        <p className="font-semibold">
                            {periodPending.length} gap charge{periodPending.length !== 1 ? 's' : ''} awaiting finish
                        </p>
                        <p className="text-xs mt-0.5 opacity-90">
                            {(() => {
                                const onVehicle = periodPending.filter((p) => p.vehicleId === vehicle.id);
                                const elsewhere = periodPending.length - onVehicle.length;
                                const totalAmt = onVehicle.reduce((s, p) => s + (p.amount || 0), 0);
                                const parts: string[] = [];
                                if (onVehicle.length) {
                                    parts.push(
                                        `${onVehicle.length} on this vehicle (${formatCurrency(totalAmt)})`,
                                    );
                                }
                                if (elsewhere > 0) {
                                    parts.push(`${elsewhere} on other vehicles this week`);
                                }
                                return parts.join(' · ');
                            })()}
                            {' — '}use Approve on the row to post Pending.
                        </p>
                    </div>
                </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
                <p className="font-semibold text-slate-800 mb-1">Reconciling totals (this week’s buckets)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                    <div>
                        Litres: buckets {conservation.bucketLiters.toFixed(1)} L vs week ops {conservation.weekOpsLiters.toFixed(1)} L
                        <span className={Math.abs(conservation.volumeDeltaLiters) > 0.5 ? ' text-red-600 font-medium' : ' text-emerald-700'}>
                            {' '}(Δ {conservation.volumeDeltaLiters > 0 ? '+' : ''}{conservation.volumeDeltaLiters.toFixed(1)} L)
                        </span>
                    </div>
                    <div>
                        Distance: buckets {conservation.bucketDistanceKm.toLocaleString()} km
                        {' '}· week card {periodStats.distanceKm.toLocaleString()} km
                    </div>
                </div>
            </div>

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
                                <span className="text-emerald-600 font-medium">● Card: odo span ÷ all ops litres this week</span>
                            ) : periodStats.source === 'configured' ? (
                                <span className="text-amber-600 font-medium">● Vehicle baseline (no ops fills this week)</span>
                            ) : (
                                <span className="text-red-600 font-medium">● System default (no config or fills this week)</span>
                            )}
                        </p>
                        {tableModeledKmL > 0 && (
                            <p className="text-xs text-slate-500 mt-0.5">
                                Table modeled burn uses {tableModeledKmL} km/L (fill-to-fill, excludes first fill) — not the same as the card.
                            </p>
                        )}
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
                                Fill-to-fill windows only. Charge Gap posts Pending over-log deductions on exact-tier rows when the panel reconciles.
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
                                <TableHead>Fuel Usage (Actual vs Modeled)</TableHead>
                                <TableHead className="text-right">Variance</TableHead>
                                <TableHead className="text-right">Attribution (km)</TableHead>
                                <TableHead className="w-[120px] text-right">Deduction</TableHead>
                                <TableHead className="w-[100px] text-center">Status</TableHead>
                                <TableHead className="w-[100px] text-center">Audit</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredBuckets.map((bucket) => {
                                const indeterminate = bucket.confidenceTier === 'indeterminate' || tripsTruncated;
                                const progressPct =
                                    bucket.expectedFuelLiters > 0
                                        ? Math.min(100, (bucket.actualFuelLiters / bucket.expectedFuelLiters) * 50)
                                        : 0;
                                return (
                                <TableRow key={bucket.id} className={bucket.status === 'Anomaly' ? "bg-amber-50/30" : ""}>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-1 text-sm font-medium">
                                                <span>{bucket.startOdometer.toLocaleString()}</span>
                                                <ArrowRight className="h-3 w-3 text-slate-400" />
                                                <span>{bucket.endOdometer.toLocaleString()}</span>
                                            </div>
                                            <span className="text-[10px] text-slate-500 uppercase mt-0.5">
                                                {boundaryLabel(bucket.closingBoundarySource)} {formatBucketDay(bucket.endDate)}
                                                {toEntryYmd(bucket.startDate) !== toEntryYmd(bucket.endDate)
                                                    ? ` · from ${formatBucketDay(bucket.startDate)}`
                                                    : ''}
                                            </span>
                                            {bucket.confidenceTier && (
                                                <Badge variant="outline" className="w-fit mt-1 text-[9px] uppercase">
                                                    {bucket.confidenceTier}
                                                </Badge>
                                            )}
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
                                                    style={{ width: `${progressPct}%` }}
                                                />
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {indeterminate ? (
                                            <div className="text-xs text-slate-500 max-w-[120px] ml-auto">
                                                {bucket.confidenceReason || 'Indeterminate — no variance'}
                                            </div>
                                        ) : (
                                            <>
                                                <div className={`text-sm font-bold ${getVarianceColor(bucket.variancePercent)}`}>
                                                    {bucket.variancePercent > 0 ? '+' : ''}{bucket.variancePercent.toFixed(1)}%
                                                </div>
                                                <div className="text-[10px] text-slate-400">
                                                    {bucket.varianceLiters > 0 ? '+' : ''}{bucket.varianceLiters.toFixed(1)} L
                                                </div>
                                            </>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="flex gap-1.5 flex-wrap justify-end">
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
                                                        <TooltipContent>Evidenced Personal only</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                                {(bucket.unexplainedDistance || 0) > 0 && (
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <div className="flex items-center gap-0.5 text-[10px] px-1 bg-slate-100 text-slate-700 rounded border border-slate-200">
                                                                    U: {bucket.unexplainedDistance!.toFixed(2)}
                                                                </div>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Unexplained (non-chargeable)</TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                )}
                                            </div>
                                            {bucket.unaccountedDistance > 0 && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="flex items-center gap-0.5 text-[10px] px-1 bg-red-50 text-red-700 rounded border border-red-200 font-bold">
                                                                OVER-LOG: {bucket.unaccountedDistance.toLocaleString()}
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            Trip/adjustment km exceed odometer movement (over-logged)
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex flex-col items-end gap-1">
                                            {(() => {
                                                const pending = pendingRecs.get(bucket.id);

                                                if (bucket.isDeductionPosted) {
                                                    return (
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-100 uppercase font-bold">
                                                            Pending
                                                        </Badge>
                                                    );
                                                }
                                                if (pending) {
                                                    return (
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-800 border-amber-200 uppercase font-bold">
                                                            Recommended
                                                        </Badge>
                                                    );
                                                }
                                                if (bucket.deductionRecommendation) {
                                                    return (
                                                        <div className="text-sm font-bold text-red-600">
                                                            {formatCurrency(bucket.deductionRecommendation)}
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <span className="text-xs text-slate-400">No recommendation</span>
                                                );
                                            })()}
                                            {STOP_TO_STOP_CHARGES_ENABLED &&
                                            !periodLocked &&
                                            !bucket.isDeductionPosted &&
                                            bucket.deductionRecommendation &&
                                            bucket.confidenceTier === 'exact' &&
                                            panelReconciled ? (
                                                <div className="flex flex-col items-end gap-0.5">
                                                    {(() => {
                                                        const pending = pendingRecs.get(bucket.id);
                                                        if (!pending) {
                                                            return (
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-6 px-1.5 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center gap-1"
                                                                    onClick={() => handlePostDeduction(bucket)}
                                                                    disabled={isPosting === bucket.id || indeterminate}
                                                                >
                                                                    {isPosting === bucket.id ? (
                                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                                    ) : (
                                                                        <>
                                                                            <Banknote className="h-3 w-3" />
                                                                            Post charge (Pending)
                                                                        </>
                                                                    )}
                                                                </Button>
                                                            );
                                                        }
                                                        // Solo-owner: same person can finish approve if auto-approve fell through.
                                                        return (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-6 px-1.5 text-[10px] text-indigo-700 hover:text-indigo-800 hover:bg-indigo-50 flex items-center gap-1"
                                                                onClick={() => handleApproveDeduction(bucket)}
                                                                disabled={isPosting === `approve_${bucket.id}` || indeterminate}
                                                            >
                                                                {isPosting === `approve_${bucket.id}` ? (
                                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <Banknote className="h-3 w-3" />
                                                                        Approve charge (Pending)
                                                                    </>
                                                                )}
                                                            </Button>
                                                        );
                                                    })()}
                                                </div>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {indeterminate ? (
                                            <div className="flex flex-col items-center">
                                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                                                <span className="text-[10px] font-bold text-amber-600 uppercase mt-0.5">
                                                    Indet.
                                                </span>
                                            </div>
                                        ) : bucket.status === 'Complete' ? (
                                            <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                                        ) : bucket.status === 'Partial' ? (
                                            <div className="flex flex-col items-center">
                                                <Badge variant="outline" className="text-[9px] uppercase text-slate-600 border-slate-300">
                                                    Top-up
                                                </Badge>
                                                <span className="text-[9px] text-slate-400 mt-0.5">Partial</span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center">
                                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                                                <span className="text-[10px] font-bold text-amber-600 uppercase mt-0.5">
                                                    Flagged
                                                </span>
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
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-800">
                    <p className="font-semibold">How to read this data:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1 opacity-90">
                        <li>Each row is travel between two consecutive <em>fuel fills</em> (check-ins do not split rows).</li>
                        <li><strong>OVER-LOG</strong> means logged trip/adjustment km exceed odometer movement — not “unlogged km”.</li>
                        <li><strong>U (Unexplained)</strong> is odometer km without evidenced category — diagnostic only, not chargeable.</li>
                        <li><strong>Modeled Exp</strong> is circular fill-to-fill burn — use reconciling totals as the real control.</li>
                        <li><strong>Charge Gap</strong> posts a Pending driver deduction (window-assigned driver, one charge per bucket). Exact-tier + reconciled panel only.</li>
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
