import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from "../ui/table";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { FinancialTransaction } from '../../types/data';
import { Check, X, Eye, FileText, Calendar, User, Truck, DollarSign, Pencil, Trash2, Loader2, Camera, AlertTriangle, MapPin } from "lucide-react";
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { EvidenceFromRecord } from '../evidence/EvidenceFromRecord';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../ui/utils";
import { FuelEntry } from '../../types/fuel';

import { usePermissions } from '../../hooks/usePermissions';
import { fuelService } from '../../services/fuelService';
import { StationProfile } from '../../types/station';
import {
    isLogReviewEligible,
    isPendingFuelQueueRow,
    isPendingReadyForReview,
    isStationGateHeld,
    isUnresolvedSplitVariance,
    isAwaitingCashTx,
    isStaleAwaitingCash,
    daysAwaitingCash,
    describeSplitCashRehome,
    describeSplitCashRehomeBlocked,
    metaFlagOn,
    splitReconTolerance,
} from '@roam/fuel-core';
import { formatFuelMoney } from '../../utils/formatFuelMoney';
import { fuelEntryMatchesLineFilter } from '../../utils/fuelServiceLineFilter';
import { fuelServiceLineUiLabel } from '../../utils/vocabulary';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import {
    SplitCashResolveDialog,
    type SplitCashResolveChoice,
} from './SplitCashResolveDialog';

const BULK_SET_SERVICE_LINE_MAX = 200;

function resolveFuelEntryIdForTx(
    tx: FinancialTransaction,
    logs: FuelEntry[],
): string | null {
    const meta = tx.metadata as Record<string, unknown> | undefined;
    const fromMeta = meta?.fuelEntryId ?? meta?.sourceId;
    if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();
    const linked = logs.find(
        (l) => l.transactionId === tx.id || l.id === meta?.sourceId,
    );
    return linked?.id ? String(linked.id) : null;
}
/** Liters from stored quantity/fuelVolume, or amount ÷ price/L (same as manual log). */
function computeResolvedFuelLiters(tx: FinancialTransaction): number | null {
    const q = Number(tx.quantity) || Number(tx.metadata?.fuelVolume);
    if (Number.isFinite(q) && q > 0) return q;
    const amount = Math.abs(Number(tx.amount) || Number(tx.metadata?.totalCost) || 0);
    const ppl = Number(tx.metadata?.pricePerLiter);
    if (amount > 0 && ppl > 0) return Number((amount / ppl).toFixed(2));
    return null;
}

function readMetaNum(v: unknown): number | undefined {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
}

/** Best-effort GPS from transaction metadata (driver portal / geo pipeline shapes vary). */
function pickTransactionCoords(tx: FinancialTransaction): { lat: number; lng: number; accuracy?: number } | null {
    const m = tx.metadata as Record<string, unknown> | undefined;
    const lm = (m?.locationMetadata || m?.location) as Record<string, unknown> | undefined;
    const gf = m?.geofenceMetadata as Record<string, unknown> | undefined;
    const lat =
        readMetaNum(lm?.lat) ??
        readMetaNum(gf?.lat) ??
        readMetaNum(m?.lat);
    const lng =
        readMetaNum(lm?.lng) ??
        readMetaNum(gf?.lng) ??
        readMetaNum(m?.lng);
    if (lat == null || lng == null) return null;
    const accuracy =
        readMetaNum(lm?.accuracy) ??
        readMetaNum(gf?.accuracy) ??
        readMetaNum(m?.accuracy);
    return {
        lat,
        lng,
        ...(accuracy != null ? { accuracy } : {}),
    };
}

function isGenericFuelVendor(vendor?: string): boolean {
    const v = (vendor || '').trim();
    if (!v) return true;
    return /unspecified|unknown/i.test(v) || v === 'Unspecified Vendor';
}

/** Plain-language checklist for station-gate rows (shown in detail overlay). */
function buildStationHoldDiagnostics(tx: FinancialTransaction): string[] {
    const m = tx.metadata as Record<string, unknown> | undefined;
    const lines: string[] = [];
    const coords = pickTransactionCoords(tx);
    const gateReason = typeof m?.gateReason === 'string' ? m.gateReason.trim() : '';
    const holdReason = typeof m?.holdReason === 'string' ? m.holdReason.trim() : '';
    const locationStatus =
        typeof m?.locationStatus === 'string' ? m.locationStatus.trim() : '';
    const learntRaw = m?.learntLocationId;
    const learntId = typeof learntRaw === 'string' ? learntRaw.trim() : '';
    const matchedId =
        (typeof m?.matchedStationId === 'string' && m.matchedStationId) ||
        (typeof (tx as FinancialTransaction & { matchedStationId?: string }).matchedStationId === 'string'
            ? (tx as FinancialTransaction & { matchedStationId?: string }).matchedStationId
            : '') ||
        '';

    if (coords) {
        const acc =
            coords.accuracy != null && Number.isFinite(coords.accuracy)
                ? ` · GPS accuracy about ±${Math.round(coords.accuracy)} m`
                : '';
        lines.push(
            `GPS saved (${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)})${acc}.`
        );
    } else {
        lines.push(
            'No GPS coordinates on this expense — the system cannot place this fill-up on the map or match it to a station.'
        );
    }

    if (gateReason) {
        lines.push(`Detail: ${gateReason}`);
    } else if (holdReason) {
        lines.push(`Detail: ${holdReason}`);
    }

    if (locationStatus && locationStatus !== 'verified') {
        lines.push(`Station link state: ${locationStatus}.`);
    }

    if (!matchedId) {
        lines.push('Not linked to a verified station in the master station list yet.');
    }

    if (learntId) {
        const short = learntId.length > 14 ? `${learntId.slice(0, 8)}…${learntId.slice(-4)}` : learntId;
        lines.push(
            `Staging reference: ${short} — Roam ops will match this to a verified station.`
        );
    } else {
        lines.push(
            'No staging record is attached yet — Roam ops will resolve the station match.'
        );
    }

    const vendorLabel =
        (tx.vendor && tx.vendor.trim()) ||
        (typeof m?.originalVendor === 'string' ? m.originalVendor.trim() : '');
    if (isGenericFuelVendor(vendorLabel)) {
        lines.push(
            'Vendor / station name is missing or generic — add the real station when you edit, if you know it.'
        );
    }

    return lines;
}

interface FuelReimbursementTableProps {
    transactions: FinancialTransaction[];
    logs?: FuelEntry[];
    onApprove: (
      id: string,
      notes?: string,
      stationOpts?: { matchedStationId?: string; stationLocation?: string },
      serviceLine?: 'rideshare' | 'rush_delivery',
    ) => void;
    onReject: (id: string, reason?: string) => void;
    onEdit?: (transaction: FinancialTransaction) => void;
    onDelete?: (id: string) => void;
    onViewDriverLedger?: (driverId: string) => void;
    onApproveLogReview?: (id: string, odometer: number, notes?: string) => void;
    /** Resolve split cash money — accept derived / enter cash / void (C2). */
    onResolveSplitCash?: (args: {
        tx: FinancialTransaction;
        action: SplitCashResolveChoice;
        cashAmount?: number;
        reason?: string;
    }) => Promise<void> | void;
    isRefreshing?: boolean;
    /** Jump to Transaction Logs for a posted fuel entry */
    onViewInTransactionLogs?: (opts: { fuelEntryId?: string; date?: string; vehicleId?: string }) => void;
    /** Dual-line org: show Unattributed chip + approve service-line control */
    showServiceLineControls?: boolean;
    lineFilter?: 'all' | 'rideshare' | 'rush_delivery' | 'unattributed';
    onLineFilterChange?: (v: 'all' | 'rideshare' | 'rush_delivery' | 'unattributed') => void;
    unattributedCount?: number;
    onBulkSetServiceLine?: (fuelEntryIds: string[], line: 'rideshare' | 'rush_delivery') => Promise<void> | void;
}

export function FuelReimbursementTable({ 
    transactions, 
    logs = [],
    onApprove, 
    onReject, 
    onEdit, 
    onDelete,
    onViewDriverLedger,
    onApproveLogReview,
    onResolveSplitCash,
    isRefreshing = false,
    onViewInTransactionLogs,
    showServiceLineControls = false,
    lineFilter = 'all',
    onLineFilterChange,
    unattributedCount = 0,
    onBulkSetServiceLine,
}: FuelReimbursementTableProps) {
    const { can } = usePermissions();
    const [selectedTx, setSelectedTx] = useState<FinancialTransaction | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [notes, setNotes] = useState('');
    const [action, setAction] = useState<'approve' | 'reject' | null>(null);
    const [approveServiceLine, setApproveServiceLine] = useState<'rideshare' | 'rush_delivery'>('rideshare');

    // Phase 6: Log Review Dialog state
    const [logReviewTx, setLogReviewTx] = useState<FinancialTransaction | null>(null);
    const [isLogReviewOpen, setIsLogReviewOpen] = useState(false);
    const [adminOdometer, setAdminOdometer] = useState('');
    const [adminNotes, setAdminNotes] = useState('');
    const [isLogReviewSubmitting, setIsLogReviewSubmitting] = useState(false);
    const [odometerError, setOdometerError] = useState('');

    const [verifiedStations, setVerifiedStations] = useState<StationProfile[]>([]);
    const [stationsLoading, setStationsLoading] = useState(false);
    const [approvalBrand, setApprovalBrand] = useState('');
    const [approvalMatchedStationId, setApprovalMatchedStationId] = useState('');
    const [approvalStationLocation, setApprovalStationLocation] = useState('');
    const [splitResolveTx, setSplitResolveTx] = useState<FinancialTransaction | null>(null);
    const [isResolvingSplit, setIsResolvingSplit] = useState(false);
    const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(() => new Set());
    const [bulkSetBusy, setBulkSetBusy] = useState(false);

    const bulkSelectEnabled = Boolean(showServiceLineControls && onBulkSetServiceLine);

    useEffect(() => {
        if (!isDetailsOpen) return;
        let cancelled = false;
        setStationsLoading(true);
        fuelService
            .getStations()
            .then((all) => {
                if (cancelled) return;
                setVerifiedStations((all || []).filter((s: StationProfile) => s.status === 'verified'));
            })
            .catch(() => {
                if (!cancelled) setVerifiedStations([]);
            })
            .finally(() => {
                if (!cancelled) setStationsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isDetailsOpen]);

    useEffect(() => {
        if (!selectedTx || !isDetailsOpen) return;
        const mid =
            selectedTx.matchedStationId ||
            selectedTx.metadata?.matchedStationId ||
            (selectedTx.metadata?.suggestedStationId as string | undefined) ||
            '';
        if (mid && verifiedStations.length > 0) {
            const st = verifiedStations.find((s) => s.id === mid);
            if (st) {
                setApprovalBrand(st.brand || '');
                setApprovalMatchedStationId(st.id);
                setApprovalStationLocation(
                    st.address || (typeof selectedTx.metadata?.stationLocation === 'string' ? selectedTx.metadata.stationLocation : '') || ''
                );
                return;
            }
        }
        setApprovalBrand('');
        setApprovalMatchedStationId('');
        setApprovalStationLocation('');
    }, [selectedTx?.id, isDetailsOpen, verifiedStations]);

    const brandOptions = useMemo(() => {
        const set = new Set<string>();
        verifiedStations.forEach((s) => {
            if (s.brand) set.add(s.brand);
        });
        return Array.from(set).sort();
    }, [verifiedStations]);

    const getStationsForBrand = useCallback(
        (brand: string): StationProfile[] => {
            if (!brand) return [];
            return verifiedStations.filter((s) => s.brand === brand).sort((a, b) => a.name.localeCompare(b.name));
        },
        [verifiedStations]
    );

    const handleApprovalBrandChange = (brand: string) => {
        if (brand === '__other_brand__') {
            setApprovalBrand('');
            setApprovalMatchedStationId('');
            setApprovalStationLocation('');
            return;
        }
        setApprovalBrand(brand);
        setApprovalMatchedStationId('');
        setApprovalStationLocation('');
    };

    const handleApprovalVerifiedStationSelect = (stationId: string) => {
        if (stationId === '__custom__') {
            setApprovalMatchedStationId('');
            setApprovalStationLocation('');
            return;
        }
        const st = verifiedStations.find((s) => s.id === stationId);
        if (st) {
            setApprovalMatchedStationId(st.id);
            setApprovalStationLocation(st.address || '');
        }
    };

    // Find the settlement transaction for a given source ID
    const findSettlementTx = (sourceId: string) => {
        // Check for automated RideShare settlement
        const autoSettlement = transactions.find(t => 
            t.metadata?.sourceId === sourceId && 
            t.metadata?.settlementType === 'RideShare_Cash_Offset'
        );
        if (autoSettlement) return autoSettlement;
        
        // Check for Cash Wallet credit (from Phase 4)
        const walletCredit = transactions.find(t => 
            t.metadata?.fuelCreditSourceId === sourceId &&
            t.category === 'Fuel Reimbursement Credit'
        );
        return walletCredit || null;
    };

    // Line lens must filter queue rows (chips alone were cosmetic).
    const scopedTransactions = useMemo(() => {
        if (lineFilter === 'all') return transactions;
        return transactions.filter((t) => {
            const linkedLog = logs.find(
                (l) => l.transactionId === t.id || l.id === t.metadata?.sourceId,
            );
            if (!linkedLog) return lineFilter === 'unattributed';
            return fuelEntryMatchesLineFilter(linkedLog, lineFilter);
        });
    }, [transactions, logs, lineFilter]);

    // Clear stale selection when the lens or queue data changes.
    useEffect(() => {
        setSelectedTxIds(new Set());
    }, [lineFilter, transactions]);

    const pendingAll = scopedTransactions.filter((t) => isPendingFuelQueueRow(t));
    const pendingStationHoldCount = pendingAll.filter((t) => isStationGateHeld(t)).length;
    const pendingReadyForReview = pendingAll.filter((t) => isPendingReadyForReview(t));

    const logReview = scopedTransactions.filter((t) => isLogReviewEligible(t));
    const splitMismatchTxs = useMemo(
        () => scopedTransactions.filter((t) => isUnresolvedSplitVariance(t)),
        [scopedTransactions],
    );
    const awaitingCashTxs = useMemo(
        () => scopedTransactions.filter((t) => isAwaitingCashTx(t)),
        [scopedTransactions],
    );
    const staleAwaitingCount = useMemo(
        () => awaitingCashTxs.filter((t) => isStaleAwaitingCash(t)).length,
        [awaitingCashTxs],
    );
    const blockedRehomeCount = useMemo(
        () =>
            awaitingCashTxs.filter((t) =>
                metaFlagOn((t.metadata as Record<string, unknown> | undefined)?.splitCashRehomeBlocked),
            ).length,
        [awaitingCashTxs],
    );

    const confirmResolveSplit = async (args: {
        tx: FinancialTransaction;
        action: SplitCashResolveChoice;
        cashAmount?: number;
        reason?: string;
    }) => {
        if (!onResolveSplitCash) return;
        setIsResolvingSplit(true);
        try {
            await onResolveSplitCash(args);
            setSplitResolveTx(null);
        } catch (e) {
            console.error('[SplitCash] Resolve failed:', e);
        } finally {
            setIsResolvingSplit(false);
        }
    };

    const handleAction = (type: 'approve' | 'reject') => {
        setAction(type);
        setNotes('');
    };

    const confirmAction = () => {
        if (!selectedTx || !action) return;
        if (isStationGateHeld(selectedTx)) return;
        if (action === 'approve') {
            onApprove(selectedTx.id, notes, {
                matchedStationId: approvalMatchedStationId || undefined,
                stationLocation: approvalStationLocation || undefined,
            }, showServiceLineControls ? approveServiceLine : undefined);
        } else {
            onReject(selectedTx.id, notes);
        }
        setIsDetailsOpen(false);
        setAction(null);
        setSelectedTx(null);
    };

    // Phase 6: Open Log Review dialog
    const openLogReview = (tx: FinancialTransaction) => {
        setLogReviewTx(tx);
        setAdminOdometer('');
        setAdminNotes('');
        setOdometerError('');
        setIsLogReviewOpen(true);
    };

    // Phase 6: Confirm & Approve log review
    const confirmLogReview = async () => {
        if (!logReviewTx || !onApproveLogReview) return;

        const odoValue = Number(adminOdometer);
        if (!adminOdometer || isNaN(odoValue) || odoValue <= 0) {
            setOdometerError('Please enter a valid odometer reading greater than 0.');
            return;
        }

        setOdometerError('');
        setIsLogReviewSubmitting(true);
        try {
            await onApproveLogReview(logReviewTx.id, odoValue, adminNotes || undefined);
            setIsLogReviewOpen(false);
            setLogReviewTx(null);
        } catch (e) {
            // Error handling is in the parent handler
            console.error('[LogReview] Approval failed:', e);
        } finally {
            setIsLogReviewSubmitting(false);
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        // Fix for timezone issue: 'YYYY-MM-DD' parses as UTC, causing shift in Western timezones.
        // We parse it manually to ensure it's treated as local date.
        if (dateString.includes('-') && dateString.length === 10) {
            const parts = dateString.split('-');
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const day = parseInt(parts[2]);
            return new Date(year, month, day).toLocaleDateString();
        }
        return new Date(dateString).toLocaleDateString();
    };

    const getStatusBadge = (status: string) => {
        switch(status) {
            case 'Pending': return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Pending</Badge>;
            case 'Approved': return <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">Approved</Badge>;
            case 'Rejected': return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">Rejected</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    // Phase 6: Helper to get a human-readable odometer method label
    const getOdometerMethodLabel = (method?: string) => {
        switch (method) {
            case 'ai_verified': return 'AI Verified';
            case 'manual_override': return 'Manual Override';
            case 'photo_review': return 'Photo Review';
            case 'manual_entry': return 'Manual Entry';
            case 'Admin Photo Upload': return 'Admin Photo Upload';
            case 'Direct Entry': return 'Direct Entry';
            default: return method || 'Unknown';
        }
    };

    /** Odometer uploads are saved on metadata.odometerProofUrl (admin manual); also check legacy/top-level fields. */
    const resolveOdometerProofUrl = (tx: FinancialTransaction): string | undefined => {
        const m = tx.metadata as Record<string, unknown> | undefined;
        const top = tx as FinancialTransaction & { odometerImageUrl?: string };
        const raw =
            tx.odometerProofUrl ||
            (typeof m?.odometerProofUrl === 'string' ? m.odometerProofUrl : undefined) ||
            (typeof m?.odometerImageUrl === 'string' ? m.odometerImageUrl : undefined) ||
            top.odometerImageUrl;
        const s = typeof raw === 'string' ? raw.trim() : '';
        return s || undefined;
    };

    const renderPendingQueueBadges = (tx: FinancialTransaction) => {
        const badges = (
            <>
                {isStationGateHeld(tx) && (
                    <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-normal bg-sky-50 text-sky-800 border-sky-200">
                        Station hold
                    </Badge>
                )}
                {metaFlagOn(tx.metadata?.automated) && (
                    <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-normal bg-slate-50 text-slate-600 border-slate-200">
                        Automated
                    </Badge>
                )}
                {isLogReviewEligible(tx) && (
                    <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-normal bg-amber-50 text-amber-800 border-amber-200">
                        Odometer review
                    </Badge>
                )}
                {isUnresolvedSplitVariance(tx) && (
                    <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-normal bg-rose-50 text-rose-800 border-rose-200">
                        Split amount mismatch
                    </Badge>
                )}
            </>
        );
        const hasAny =
            isStationGateHeld(tx) ||
            metaFlagOn(tx.metadata?.automated) ||
            isLogReviewEligible(tx) ||
            isUnresolvedSplitVariance(tx);
        return (
            <div className="flex flex-wrap gap-1 items-center min-h-[1.25rem]">
                {hasAny ? badges : <span className="text-xs text-slate-300">—</span>}
            </div>
        );
    };

    // Phase 6: Helper to resolve station name for log review
    const resolveStationName = (tx: FinancialTransaction) => {
        if (tx.vendor && !tx.vendor.toLowerCase().includes('unknown')) return tx.vendor;
        if ((tx as any).merchant && !(tx as any).merchant.toLowerCase().includes('unknown')) return (tx as any).merchant;
        if (tx.metadata?.parentCompany) return tx.metadata.parentCompany;
        const linkedLog = logs.find(l => l.transactionId === tx.id || l.id === tx.metadata?.sourceId);
        if (linkedLog) {
            const name = linkedLog.vendor || linkedLog.location || linkedLog.stationName;
            if (name && !name.toLowerCase().includes('unknown')) return name;
        }
        return 'Unverified Station';
    };

    const toggleSelectTx = (txId: string, checked: boolean) => {
        setSelectedTxIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(txId);
            else next.delete(txId);
            return next;
        });
    };

    const toggleSelectAllInData = (data: FinancialTransaction[], checked: boolean) => {
        setSelectedTxIds((prev) => {
            const next = new Set(prev);
            for (const tx of data) {
                if (checked) next.add(tx.id);
                else next.delete(tx.id);
            }
            return next;
        });
    };

    const runBulkSetServiceLine = async (line: 'rideshare' | 'rush_delivery') => {
        if (!onBulkSetServiceLine) return;
        const ids: string[] = [];
        for (const txId of selectedTxIds) {
            const tx = transactions.find((t) => t.id === txId);
            if (!tx) continue;
            const entryId = resolveFuelEntryIdForTx(tx, logs);
            if (entryId) ids.push(entryId);
        }
        const unique = [...new Set(ids)];
        if (unique.length === 0) {
            toast.error('No linked fuel fills on the selected rows');
            return;
        }
        if (unique.length > BULK_SET_SERVICE_LINE_MAX) {
            toast.error(`Select at most ${BULK_SET_SERVICE_LINE_MAX} fills at once`);
            return;
        }
        setBulkSetBusy(true);
        try {
            await onBulkSetServiceLine(unique, line);
            setSelectedTxIds(new Set());
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to set service line');
        } finally {
            setBulkSetBusy(false);
        }
    };

    const renderTable = (
        data: FinancialTransaction[],
        showActions = false,
        pendingQueueMode = false,
        allowFinalizePendingActions = true
    ) => {
        // Helper: resolve a display-friendly description, falling back to vendor or linked log data
        const resolveDescription = (tx: FinancialTransaction) => {
            const desc = tx.description || '';
            // If the stored description doesn't contain "Unknown", use it as-is
            if (desc && !desc.toLowerCase().includes('unknown')) return desc;
            // Try vendor field
            if (tx.vendor && !tx.vendor.toLowerCase().includes('unknown')) {
                return `${tx.category || 'Fuel'} Expense - ${tx.vendor}`;
            }
            // Try merchant field
            if ((tx as any).merchant && !(tx as any).merchant.toLowerCase().includes('unknown')) {
                return `${tx.category || 'Fuel'} Expense - ${(tx as any).merchant}`;
            }
            // Try metadata parentCompany
            if (tx.metadata?.parentCompany) {
                return `${tx.category || 'Fuel'} Expense - ${tx.metadata.parentCompany}`;
            }
            // Try linked fuel log
            const linkedLog = logs.find(l => l.transactionId === tx.id || l.id === tx.metadata?.sourceId);
            if (linkedLog) {
                const name = linkedLog.vendor || linkedLog.location || linkedLog.stationName;
                if (name && !name.toLowerCase().includes('unknown')) {
                    return `${tx.category || 'Fuel'} Expense - ${name}`;
                }
            }
            // Last resort -- show a cleaner label than "Unknown"
            return `${tx.category || 'Fuel'} Expense - Unverified Station`;
        };

        return (
            <div className="rounded-md border bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {bulkSelectEnabled ? (
                                <TableHead className="w-10">
                                    <Checkbox
                                        checked={
                                            data.length > 0 && data.every((t) => selectedTxIds.has(t.id))
                                                ? true
                                                : data.some((t) => selectedTxIds.has(t.id))
                                                  ? 'indeterminate'
                                                  : false
                                        }
                                        onCheckedChange={(v) => toggleSelectAllInData(data, v === true)}
                                        aria-label="Select all rows"
                                    />
                                </TableHead>
                            ) : null}
                            <TableHead>Date</TableHead>
                            <TableHead>Driver</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Settled</TableHead>
                            <TableHead>Details</TableHead>
                            <TableHead>Receipt</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={bulkSelectEnabled ? 9 : 8} className="h-24 text-center text-slate-500">
                                    No records found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.map((tx) => {
                                const vol = computeResolvedFuelLiters(tx);
                                return (
                                <TableRow key={tx.id}>
                                    {bulkSelectEnabled ? (
                                        <TableCell className="w-10">
                                            <Checkbox
                                                checked={selectedTxIds.has(tx.id)}
                                                onCheckedChange={(v) => toggleSelectTx(tx.id, v === true)}
                                                aria-label={`Select ${tx.driverName || 'row'}`}
                                                disabled={!resolveFuelEntryIdForTx(tx, logs)}
                                            />
                                        </TableCell>
                                    ) : null}
                                    <TableCell className="font-medium">
                                        {formatDate(tx.date)}
                                        <div className="text-xs text-slate-500">{tx.time}</div>
                                        {(() => {
                                            const rehome = describeSplitCashRehome(
                                                tx.metadata as Record<string, unknown>,
                                            );
                                            return rehome ? (
                                                <div className="mt-0.5 text-[10px] font-normal text-slate-500">
                                                    {rehome}
                                                </div>
                                            ) : null;
                                        })()}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium">
                                                {tx.driverName?.charAt(0) || 'D'}
                                            </div>
                                            <span>{tx.driverName || 'Unknown'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-semibold text-slate-900">
                                        <div className="flex flex-col">
                                            <span>${Math.abs(Number(tx.amount) || Number(tx.metadata?.totalCost) || 0).toFixed(2)}</span>
                                            {tx.metadata?.paymentSource && tx.metadata.paymentSource !== 'driver_cash' && (
                                                <span className="text-[9px] font-normal text-slate-400 uppercase">{tx.metadata.paymentSource === 'rideshare_cash' ? 'RideShare' : tx.metadata.paymentSource === 'company_card' ? 'Gas Card' : tx.metadata.paymentSource === 'petty_cash' ? 'Petty Cash' : tx.metadata.paymentSource}</span>
                                            )}
                                            {(() => {
                                                const linkedLog = logs.find(l => l.transactionId === tx.id || l.id === tx.metadata?.sourceId);
                                                if (!linkedLog) return null;

                                                const displayAmount = Math.abs(Number(tx.amount) || Number(tx.metadata?.totalCost) || 0);
                                                const amountMismatch = Math.abs(displayAmount - linkedLog.amount) > 0.01;

                                                return (
                                                    <div className="flex items-center gap-1 mt-1">
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Badge variant="outline" className={cn(
                                                                    "text-[8px] h-3.5 px-1 font-bold tracking-tighter uppercase",
                                                                    amountMismatch ? "border-amber-500 text-amber-600 bg-amber-50" : "border-slate-200 text-slate-400"
                                                                )}>
                                                                    {amountMismatch ? "Mismatch" : "Linked"}
                                                                </Badge>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                {amountMismatch ? (
                                                                    <div className="space-y-1">
                                                                        <p className="font-bold text-amber-600">Log Mismatch Detected</p>
                                                                        <p className="text-xs text-slate-500">Ledger: ${Math.abs(tx.amount).toFixed(2)}</p>
                                                                        <p className="text-xs text-slate-500">Log: ${linkedLog.amount.toFixed(2)}</p>
                                                                        <p className="text-[10px] text-slate-400 mt-1 italic">Synchronization may be pending.</p>
                                                                    </div>
                                                                ) : (
                                                                    <p className="text-xs">Synchronized with Fuel Log</p>
                                                                )}
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {tx.status === 'Approved' ? (
                                            (() => {
                                                const settlement = findSettlementTx(tx.id);
                                                return settlement ? (
                                                    <div className="flex flex-col">
                                                        <span className="text-emerald-600 font-semibold">${settlement.amount.toFixed(2)}</span>
                                                        <span className="text-[10px] text-slate-400">
                                                            {settlement.category === 'Fuel Reimbursement Credit' ? 'Wallet Credit: OK' : 'Ledger Sync: OK'}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 text-xs italic">Pending sync</span>
                                                );
                                            })()
                                        ) : (
                                            <span className="text-slate-300">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col max-w-[200px]">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <span className="truncate text-sm font-medium">{resolveDescription(tx)}</span>
                                                {tx.metadata?.source && (
                                                    <Badge variant="secondary" className={cn(
                                                        "text-[10px] h-5 px-1.5 font-normal border hover:bg-slate-200 transition-colors",
                                                        tx.metadata.source === 'Fuel Log' || tx.metadata.source === 'Bulk Log' 
                                                            ? "bg-blue-50 text-blue-700 border-blue-200" 
                                                            : "bg-slate-100 text-slate-600 border-slate-200"
                                                    )}>
                                                        {tx.metadata.source}
                                                    </Badge>
                                                )}
                                            </div>
                                            {tx.odometer && <span className="text-xs text-slate-500">Odo: {tx.odometer} km</span>}
                                            <div className="flex gap-2">
                                                {vol != null && <span className="text-xs text-slate-500">Vol: {vol} L</span>}
                                                {(tx.metadata?.pricePerLiter || (vol != null && tx.amount)) && (
                                                    <span className="text-xs text-slate-400">
                                                        @{tx.metadata?.pricePerLiter 
                                                            ? Number(tx.metadata.pricePerLiter).toFixed(3) 
                                                            : (vol != null ? (Math.abs(Number(tx.amount)) / vol).toFixed(2) : '-')}/L
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div
                                            className="cursor-pointer"
                                            onClick={() => { setSelectedTx(tx); setIsDetailsOpen(true); }}
                                        >
                                            <EvidenceFromRecord
                                                record={tx}
                                                label="Fuel receipt"
                                                compact
                                                className="w-24"
                                            />
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {pendingQueueMode && tx.status === 'Pending'
                                            ? renderPendingQueueBadges(tx)
                                            : getStatusBadge(tx.status)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end flex-wrap gap-2">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button size="sm" variant="outline" onClick={() => { setSelectedTx(tx); setIsDetailsOpen(true); }}>
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" sideOffset={6}>View details</TooltipContent>
                                            </Tooltip>

                                            {pendingQueueMode && showActions && allowFinalizePendingActions && isLogReviewEligible(tx) && onApproveLogReview && (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            size="sm"
                                                            className="bg-amber-600 hover:bg-amber-700 text-white"
                                                            onClick={() => openLogReview(tx)}
                                                        >
                                                            <Eye className="h-4 w-4 mr-1" />
                                                            Review
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" sideOffset={6}>Confirm odometer to approve</TooltipContent>
                                                </Tooltip>
                                            )}

                                            {/* Edit — not on Awaiting station (station hold); fleet waits on master station verification */}
                                            {onEdit && allowFinalizePendingActions && (
                                                tx.metadata?.source === 'Manual' || 
                                                tx.metadata?.source === 'Bulk Manual' || 
                                                tx.metadata?.source === 'Manual Request' ||
                                                !tx.metadata?.source
                                            ) && (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button 
                                                            size="sm" 
                                                            variant="outline" 
                                                            onClick={() => onEdit(tx)} 
                                                            className="hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                                                        >
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" sideOffset={6}>Edit transaction</TooltipContent>
                                                </Tooltip>
                                            )}
                                            
                                            {showActions && allowFinalizePendingActions && tx.status === 'Pending' && (tx.metadata?.source === 'Manual' || !tx.metadata?.source) && (
                                                <>
                                                    {onDelete && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => onDelete(tx.id)}>
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top" sideOffset={6}>Delete — removes from ledger</TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                </>
                                            )}

                                            {showActions && allowFinalizePendingActions && (
                                                <>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setSelectedTx(tx); setIsDetailsOpen(true); setAction('approve'); }}>
                                                                <Check className="h-4 w-4" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top" sideOffset={6}>Approve reimbursement</TooltipContent>
                                                    </Tooltip>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button size="sm" variant="destructive" onClick={() => { setSelectedTx(tx); setIsDetailsOpen(true); setAction('reject'); }}>
                                                                <X className="h-4 w-4" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top" sideOffset={6}>Reject — saved as denied</TooltipContent>
                                                    </Tooltip>
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );})
                        )}
                    </TableBody>
                </Table>
            </div>
        );
    };

    // Phase 6: Dedicated Log Review table
    const renderLogReviewTable = (data: FinancialTransaction[]) => {
        return (
            <div className="rounded-md border bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Driver</TableHead>
                            <TableHead>Vehicle</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Volume</TableHead>
                            <TableHead>Station</TableHead>
                            <TableHead>Capture Method</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((tx) => {
                            const method = tx.metadata?.odometerMethod;
                            const reason = tx.metadata?.logReviewReason || tx.metadata?.odometerManualReason || '';
                            const resolvedVol = computeResolvedFuelLiters(tx);
                            return (
                                <TableRow key={tx.id} className="hover:bg-amber-50/30">
                                    <TableCell className="font-medium">
                                        {formatDate(tx.date)}
                                        <div className="text-xs text-slate-500">{tx.time}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium">
                                                {tx.driverName?.charAt(0) || 'D'}
                                            </div>
                                            <span className="font-medium">{tx.driverName || 'Unknown'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5 text-sm">
                                            <Truck className="h-3.5 w-3.5 text-slate-400" />
                                            <span>{tx.vehicleId ? (tx.metadata?.vehiclePlate || tx.vehicleId.substring(0, 8)) : '-'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-semibold text-slate-900">
                                        ${Math.abs(Number(tx.amount) || Number(tx.metadata?.totalCost) || 0).toFixed(2)}
                                    </TableCell>
                                    <TableCell>
                                        {resolvedVol != null ? `${resolvedVol} L` : '-'}
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm truncate max-w-[140px] block">{resolveStationName(tx)}</span>
                                    </TableCell>
                                    <TableCell>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Badge variant="outline" className={cn(
                                                    "text-[10px] px-2 py-0.5",
                                                    method === 'photo_review' 
                                                        ? "bg-purple-50 text-purple-700 border-purple-200" 
                                                        : method === 'manual_override'
                                                        ? "bg-blue-50 text-blue-700 border-blue-200"
                                                        : "bg-slate-50 text-slate-600 border-slate-200"
                                                )}>
                                                    {getOdometerMethodLabel(method)}
                                                </Badge>
                                            </TooltipTrigger>
                                            {reason && (
                                                <TooltipContent>
                                                    <p className="text-xs max-w-[200px]">{reason}</p>
                                                </TooltipContent>
                                            )}
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                                            Needs Review
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button 
                                                    size="sm" 
                                                    className="bg-amber-600 hover:bg-amber-700 text-white"
                                                    onClick={() => openLogReview(tx)}
                                                >
                                                    <Eye className="h-4 w-4 mr-1.5" />
                                                    Review
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" sideOffset={6}>Confirm odometer to approve</TooltipContent>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {showServiceLineControls && onLineFilterChange ? (
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ['all', fuelServiceLineUiLabel('all')],
                    ['rideshare', fuelServiceLineUiLabel('rideshare')],
                    ['rush_delivery', fuelServiceLineUiLabel('rush_delivery')],
                    ['unattributed', `${fuelServiceLineUiLabel('unattributed')} (${unattributedCount})`],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onLineFilterChange(value)}
                    className={
                      lineFilter === value
                        ? 'rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white'
                        : 'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50'
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {bulkSelectEnabled && selectedTxIds.size > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-medium text-slate-700">
                  {selectedTxIds.size} selected
                  {selectedTxIds.size > BULK_SET_SERVICE_LINE_MAX
                    ? ` (max ${BULK_SET_SERVICE_LINE_MAX})`
                    : ''}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={bulkSetBusy || selectedTxIds.size > BULK_SET_SERVICE_LINE_MAX}
                  onClick={() => void runBulkSetServiceLine('rideshare')}
                >
                  {bulkSetBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Set                                     Rideshare
                                  </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={bulkSetBusy || selectedTxIds.size > BULK_SET_SERVICE_LINE_MAX}
                  onClick={() => void runBulkSetServiceLine('rush_delivery')}
                >
                  Set {fuelServiceLineUiLabel('rush_delivery')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={bulkSetBusy}
                  onClick={() => setSelectedTxIds(new Set())}
                >
                  Clear
                </Button>
              </div>
            ) : null}
            <Tabs defaultValue="pending" className="w-full">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <TabsList>
                        <TabsTrigger value="log-review">
                            Log Review
                            {logReview.length > 0 && (
                                <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0">
                                    {logReview.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="pending">
                            Pending
                            {pendingReadyForReview.length > 0 && (
                                <Badge variant="secondary" className="ml-2 bg-orange-100 text-orange-700 hover:bg-orange-200">
                                    {pendingReadyForReview.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="split-mismatches">
                            Split mismatches
                            {splitMismatchTxs.length > 0 && (
                                <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0">
                                    {splitMismatchTxs.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="awaiting-statement">
                            Awaiting statement
                            {awaitingCashTxs.length > 0 && (
                                <Badge
                                    variant="secondary"
                                    className={cn(
                                        'ml-1.5 text-[10px] px-1.5 py-0',
                                        staleAwaitingCount > 0
                                            ? 'bg-amber-100 text-amber-900'
                                            : 'bg-slate-100 text-slate-700',
                                    )}
                                >
                                    {awaitingCashTxs.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>
                    {pendingStationHoldCount > 0 && (
                        <div className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-900">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            {pendingStationHoldCount} station hold
                            {pendingStationHoldCount === 1 ? '' : 's'} — resolve in Station Database
                        </div>
                    )}
                </div>

                <TabsContent value="log-review" className="space-y-4">
                    {logReview.length === 0 ? (
                        <div className="rounded-md border bg-white p-8 text-center text-slate-500">
                            <p className="text-sm">No fuel submissions awaiting odometer review.</p>
                            <p className="text-xs text-slate-400 mt-1">Items appear here when the AI scanner fails and the driver submits an odometer photo for admin review.</p>
                        </div>
                    ) : (
                        renderLogReviewTable(logReview)
                    )}
                </TabsContent>

                <TabsContent value="pending" className="space-y-4">
                    {isRefreshing && (
                        <div className="flex items-center gap-2 text-xs font-medium text-blue-600 bg-blue-50/50 p-2 rounded-md border border-blue-100 animate-pulse">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Synchronizing ledger and verifying manual entries...
                        </div>
                    )}
                    {pendingReadyForReview.length === 0 ? (
                        <div className="rounded-md border border-slate-200 bg-white p-8 text-center space-y-2">
                            <p className="text-sm text-slate-600">No fuel items need your action.</p>
                            <p className="text-xs text-slate-400 max-w-md mx-auto">
                                Posted fill-ups are in <span className="font-medium text-slate-600">Transaction Logs</span>.
                                Accounting history is under <span className="font-medium text-slate-600">Ledgers › Fuel Expenses</span>.
                            </p>
                        </div>
                    ) : (
                        renderTable(pendingReadyForReview, true, true, true)
                    )}
                </TabsContent>

                <TabsContent value="split-mismatches" className="space-y-4">
                    {splitMismatchTxs.length === 0 ? (
                        <div className="rounded-md border bg-white p-8 text-center text-slate-500">
                            <p className="text-sm">No statement vs pump disagreements.</p>
                            <p className="text-xs text-slate-400 mt-1">
                              When a Dominion card charge exceeds the pump total (can&apos;t derive cash), it appears here.
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-md border bg-white overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Driver</TableHead>
                                        <TableHead>Pump / Cash / Card</TableHead>
                                        <TableHead>Delta</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {splitMismatchTxs.map((tx) => {
                                        const m = (tx.metadata || {}) as Record<string, unknown>;
                                        const pump = Number(m.splitPumpTotal) || 0;
                                        const statement = Number(m.splitStatementAmount);
                                        const derived = Number(m.splitDerivedCashAmount);
                                        const delta = Number(m.splitVarianceDelta);
                                        const tol = splitReconTolerance(pump);
                                        return (
                                            <TableRow key={tx.id}>
                                                <TableCell className="text-xs">
                                                    {tx.date}
                                                    {(() => {
                                                        const rehome = describeSplitCashRehome(m);
                                                        const blocked = describeSplitCashRehomeBlocked(m);
                                                        return (
                                                            <>
                                                                {rehome && (
                                                                    <div className="mt-0.5 text-[10px] text-slate-500">
                                                                        {rehome}
                                                                    </div>
                                                                )}
                                                                {blocked && (
                                                                    <div className="mt-0.5 text-[10px] text-amber-800">
                                                                        {blocked}
                                                                    </div>
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {tx.driverName || tx.driverId || '—'}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span>Pump {formatFuelMoney(pump)}</span>
                                                        <span className="text-slate-500">
                                                            {Number.isFinite(statement)
                                                                ? `Statement card ${formatFuelMoney(statement)}`
                                                                : 'Statement card —'}
                                                            {Number.isFinite(derived)
                                                                ? ` · Derived cash ${formatFuelMoney(derived)}`
                                                                : ''}
                                                        </span>
                                                        {m.splitPumpPriceOutlier === true && (
                                                            <span className="text-amber-700">Price band flag</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    <Badge
                                                        variant="outline"
                                                        className="border-rose-200 bg-rose-50 text-rose-800"
                                                    >
                                                        {Number.isFinite(delta)
                                                            ? `Δ ${formatFuelMoney(Math.abs(delta))}`
                                                            : 'Mismatch'}
                                                    </Badge>
                                                    <div className="mt-0.5 text-[10px] text-slate-400">
                                                        Tol {formatFuelMoney(tol)}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {can('fuel.approve') && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 text-xs"
                                                        onClick={() => setSplitResolveTx(tx)}
                                                    >
                                                        Decide pay
                                                    </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="awaiting-statement" className="space-y-4">
                    {awaitingCashTxs.length === 0 ? (
                        <div className="rounded-md border bg-white p-8 text-center text-slate-500">
                            <p className="text-sm">All split cash is matched or resolved.</p>
                            <p className="text-xs text-slate-400 mt-1">
                                Rows appear here after a split fill until the Dominion statement derives the cash amount.
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-md border bg-white overflow-hidden">
                            {staleAwaitingCount > 0 && (
                                <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                    {staleAwaitingCount} fill{staleAwaitingCount === 1 ? '' : 's'} waiting 14+ days — chase the statement or enter cash / void.
                                </div>
                            )}
                            {blockedRehomeCount > 0 && (
                                <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                    {blockedRehomeCount} fill{blockedRehomeCount === 1 ? '' : 's'} cannot post into an open week — reopen or create a later fuel period (or fix missing driver).
                                </div>
                            )}
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Driver</TableHead>
                                        <TableHead>Age</TableHead>
                                        <TableHead>Pump</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {awaitingCashTxs.map((tx) => {
                                        const m = (tx.metadata || {}) as Record<string, unknown>;
                                        const pump = Number(m.splitPumpTotal) || 0;
                                        const days = daysAwaitingCash(tx);
                                        const stale = isStaleAwaitingCash(tx);
                                        const rehome = describeSplitCashRehome(m);
                                        const blocked = describeSplitCashRehomeBlocked(m);
                                        return (
                                            <TableRow
                                                key={tx.id}
                                                className={stale || blocked ? 'bg-amber-50/60' : undefined}
                                            >
                                                <TableCell className="text-xs">
                                                    {tx.date}
                                                    {rehome && (
                                                        <div className="mt-0.5 text-[10px] text-slate-500">{rehome}</div>
                                                    )}
                                                    {blocked && (
                                                        <div className="mt-0.5 text-[10px] text-amber-800">{blocked}</div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {tx.driverName || tx.driverId || '—'}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {days != null ? (
                                                        <span className={stale ? 'font-medium text-amber-900' : 'text-slate-600'}>
                                                            {days}d waiting
                                                        </span>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {formatFuelMoney(pump)}
                                                    {m.splitPumpPriceOutlier === true && (
                                                        <div className="text-[10px] text-amber-700">Price band flag</div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {can('fuel.approve') && onResolveSplitCash && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 text-xs"
                                                        onClick={() => setSplitResolveTx(tx)}
                                                    >
                                                        Resolve
                                                    </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            <SplitCashResolveDialog
                open={!!splitResolveTx}
                tx={splitResolveTx}
                busy={isResolvingSplit}
                onOpenChange={(open) => {
                    if (!open) setSplitResolveTx(null);
                }}
                onResolve={confirmResolveSplit}
            />

            {/* Details Modal (existing Pending detail view) */}
            <Dialog open={isDetailsOpen} onOpenChange={(open) => { if(!open) { setIsDetailsOpen(false); setAction(null); } }}>
                <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Reimbursement Request</DialogTitle>
                        <DialogDescription>
                            Review the details of this transaction.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedTx && isStationGateHeld(selectedTx) && (
                        <div className="space-y-3">
                            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900 flex gap-2 items-start">
                                <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-sky-700" />
                                <span>
                                    This fuel stop is not linked to a verified station yet. Approve and reject stay disabled until station verification completes in the station database.
                                </span>
                            </div>
                            <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-3 text-sm text-amber-950">
                                <div className="flex items-center gap-2 font-semibold text-amber-900 mb-2">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    What&apos;s missing / why it&apos;s stuck
                                </div>
                                <ul className="list-disc pl-5 space-y-1.5 text-amber-950/95 leading-snug">
                                    {buildStationHoldDiagnostics(selectedTx).map((line, i) => (
                                        <li key={i}>{line}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}

                    {selectedTx && (() => {
                        const odometerPhotoUrl = resolveOdometerProofUrl(selectedTx);
                        const resolvedLiters = computeResolvedFuelLiters(selectedTx);
                        const matchingStations = approvalBrand ? getStationsForBrand(approvalBrand) : [];
                        const hasVerifiedStations = matchingStations.length > 0;
                        const showFuelStationPicker =
                            selectedTx.status === 'Pending' &&
                            (selectedTx.category === 'Fuel' || selectedTx.category === 'Fuel Reimbursement') &&
                            !isStationGateHeld(selectedTx);
                        return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <Label className="text-slate-500 text-xs uppercase tracking-wider">Driver</Label>
                                    <div className="flex items-center gap-2 font-medium">
                                        <User className="h-4 w-4 text-slate-400" />
                                        {selectedTx.driverName}
                                    </div>
                                </div>
                                
                                <div className="space-y-1">
                                    <Label className="text-slate-500 text-xs uppercase tracking-wider">Date & Time</Label>
                                    <div className="flex items-center gap-2 font-medium">
                                        <Calendar className="h-4 w-4 text-slate-400" />
                                        {formatDate(selectedTx.date)} at {selectedTx.time}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-slate-500 text-xs uppercase tracking-wider">Amount Claimed</Label>
                                    <div className="flex items-center gap-2 font-bold text-lg text-emerald-600">
                                        <DollarSign className="h-5 w-5" />
                                        {Math.abs(Number(selectedTx.amount) || Number(selectedTx.metadata?.totalCost) || 0).toFixed(2)}
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-50 rounded-lg space-y-2 border border-slate-100">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Odometer:</span>
                                        <span className="font-mono">{selectedTx.odometer ? `${selectedTx.odometer} km` : '-'}</span>
                                    </div>
                                    <div className="flex justify-between text-sm items-start gap-2">
                                        <span className="text-slate-500 shrink-0">Volume:</span>
                                        <div className="text-right">
                                            <span className="font-mono">{resolvedLiters != null ? `${resolvedLiters} L` : '-'}</span>
                                            {resolvedLiters != null &&
                                                !Number(selectedTx.quantity) &&
                                                !Number(selectedTx.metadata?.fuelVolume) && (
                                                    <p className="text-[10px] text-slate-400 mt-0.5">From amount ÷ rate</p>
                                                )}
                                        </div>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Rate:</span>
                                        <span className="font-mono">
                                            {selectedTx.metadata?.pricePerLiter 
                                                ? `$${Number(selectedTx.metadata.pricePerLiter).toFixed(3)}/L` 
                                                : (resolvedLiters && resolvedLiters > 0 && selectedTx.amount 
                                                    ? `$${(Math.abs(Number(selectedTx.amount)) / resolvedLiters).toFixed(3)}/L` 
                                                    : '-')}
                                        </span>
                                    </div>
                                </div>

                                {showFuelStationPicker && (
                                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                                        <div>
                                            <Label className="text-slate-600 text-xs font-semibold">Station</Label>
                                            <p className="text-[11px] text-slate-500 mt-0.5">
                                                Optional — choose a verified site if GPS did not match. Same as manual log entry.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <Label className="text-slate-500 text-[10px] uppercase tracking-wider">Brand</Label>
                                                <Select value={approvalBrand} onValueChange={handleApprovalBrandChange}>
                                                    <SelectTrigger className="h-9">
                                                        <SelectValue placeholder="Select brand" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {brandOptions.map((b) => (
                                                            <SelectItem key={b} value={b}>
                                                                <span className="flex items-center gap-2">
                                                                    {b}
                                                                    {getStationsForBrand(b).length > 0 && (
                                                                        <span className="text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 py-0 rounded-full">
                                                                            {getStationsForBrand(b).length} verified
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </SelectItem>
                                                        ))}
                                                        <SelectItem value="__other_brand__">
                                                            <span className="text-slate-500 italic">Other / Unlisted</span>
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    <Label className="text-slate-500 text-[10px] uppercase tracking-wider">Location</Label>
                                                    {approvalMatchedStationId && (
                                                        <span className="text-[9px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0 rounded-full flex items-center gap-0.5">
                                                            <MapPin className="w-2.5 h-2.5" /> Verified
                                                        </span>
                                                    )}
                                                    {stationsLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                                                </div>
                                                {hasVerifiedStations ? (
                                                    <>
                                                        <Select
                                                            value={approvalMatchedStationId || ''}
                                                            onValueChange={(val) => {
                                                                if (val === '__custom__') {
                                                                    setApprovalMatchedStationId('');
                                                                    setApprovalStationLocation('');
                                                                } else {
                                                                    handleApprovalVerifiedStationSelect(val);
                                                                }
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-9">
                                                                <SelectValue placeholder="Select verified station" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {matchingStations.map((s) => (
                                                                    <SelectItem key={s.id} value={s.id}>
                                                                        <span className="flex flex-col text-left">
                                                                            <span className="font-medium text-sm">{s.name}</span>
                                                                            {s.address && (
                                                                                <span className="text-[10px] text-slate-400 truncate max-w-[220px]">
                                                                                    {s.address}
                                                                                </span>
                                                                            )}
                                                                        </span>
                                                                    </SelectItem>
                                                                ))}
                                                                <SelectItem value="__custom__">
                                                                    <span className="text-slate-500 italic text-xs">Type address manually…</span>
                                                                </SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        {approvalMatchedStationId && approvalStationLocation && (
                                                            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50/50 border border-emerald-100 rounded text-[10px] text-slate-600">
                                                                <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                                                                <span className="truncate">{approvalStationLocation}</span>
                                                            </div>
                                                        )}
                                                        {hasVerifiedStations && !approvalMatchedStationId && (
                                                            <Input
                                                                className="h-8 text-sm"
                                                                value={approvalStationLocation}
                                                                onChange={(e) => setApprovalStationLocation(e.target.value)}
                                                                placeholder="Type address manually"
                                                            />
                                                        )}
                                                    </>
                                                ) : (
                                                    <Input
                                                        value={approvalStationLocation}
                                                        onChange={(e) => setApprovalStationLocation(e.target.value)}
                                                        placeholder={approvalBrand ? 'Type address or location' : 'Select a brand first'}
                                                        className="h-9"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                {selectedTx.description && (
                                    <div className="space-y-1">
                                        <Label className="text-slate-500 text-xs uppercase tracking-wider">Notes</Label>
                                        <p className="text-sm text-slate-700 bg-slate-50 p-2 rounded">{selectedTx.description}</p>
                                    </div>
                                )}

                                {/* Fuel Posted vs reimbursement settlement (separate concerns) */}
                                {selectedTx.status === 'Approved' && (
                                    <div className="mt-4 space-y-3">
                                        <div className="p-4 border border-emerald-100 bg-emerald-50/50 rounded-xl space-y-2">
                                            <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                                                <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center">
                                                    <Check className="h-3 w-3" />
                                                </div>
                                                Fuel status: Posted
                                            </div>
                                            <p className="text-xs text-slate-600">
                                                This fill-up is approved and should appear in Transaction Logs
                                                {selectedTx.metadata?.decisionReason
                                                    ? ` (${String(selectedTx.metadata.decisionReason).replace(/_/g, ' ')})`
                                                    : ''}.
                                            </p>
                                            {onViewInTransactionLogs && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full mt-1 text-xs h-8 bg-white"
                                                    onClick={() => {
                                                        setIsDetailsOpen(false);
                                                        onViewInTransactionLogs({
                                                            fuelEntryId: selectedTx.metadata?.fuelEntryId as string | undefined,
                                                            date: selectedTx.date,
                                                            vehicleId: selectedTx.vehicleId,
                                                        });
                                                    }}
                                                >
                                                    View in Transaction Logs
                                                </Button>
                                            )}
                                        </div>
                                        <div className="p-4 border border-slate-200 bg-slate-50/80 rounded-xl space-y-3">
                                        {(() => {
                                            const settlement = findSettlementTx(selectedTx.id);
                                            const isWalletCredit = settlement?.category === 'Fuel Reimbursement Credit';
                                            return (
                                                <>
                                                    <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
                                                        Reimbursement settlement:{' '}
                                                        {settlement ? (isWalletCredit ? 'Settled (wallet)' : 'Settled') : 'Not settled'}
                                                    </div>
                                                    
                                                    {!settlement ? (
                                                        <p className="text-xs text-slate-500">
                                                            Money settles when the weekly statement is finalized — not when the fuel log is posted.
                                                        </p>
                                                    ) : (
                                                        <>
                                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                                <div className="text-slate-500">{isWalletCredit ? 'Method:' : 'Coverage Applied:'}</div>
                                                                <div className="font-medium text-right">
                                                                    {isWalletCredit ? 'Cash Wallet Credit' : `${settlement.metadata?.coveragePercent?.toFixed(0)}%`}
                                                                </div>
                                                                <div className="text-slate-500">{isWalletCredit ? 'Credit Amount:' : 'Auto-Credit Amount:'}</div>
                                                                <div className="font-bold text-right text-emerald-600">${settlement.amount.toFixed(2)}</div>
                                                                <div className="text-slate-500">Ledger Entry:</div>
                                                                <div className="font-mono text-right truncate">{settlement.id.split('-')[0]}...</div>
                                                            </div>
                                                            
                                                            {onViewDriverLedger && (
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    className="w-full mt-2 text-xs h-8 bg-white"
                                                                    onClick={() => onViewDriverLedger(selectedTx.driverId!)}
                                                                >
                                                                    View Driver Ledger
                                                                </Button>
                                                            )}
                                                        </>
                                                    )}
                                                </>
                                            );
                                        })()}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <EvidenceFromRecord
                                        record={selectedTx}
                                        label="Fuel receipt"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <EvidenceFromRecord
                                        record={{ ...selectedTx, odometerProofUrl: odometerPhotoUrl }}
                                        urlField="odometerProofUrl"
                                        label="Odometer photo"
                                    />
                                </div>
                            </div>
                        </div>
                        );
                    })()}

                    {/* Action Area */}
                    {action && (
                        <div className="pt-4 border-t">
                            {action === 'approve' && showServiceLineControls ? (
                              <div className="mb-4 space-y-2">
                                <Label className="mb-1 block">Service line</Label>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={approveServiceLine === 'rideshare' ? 'default' : 'outline'}
                                    onClick={() => setApproveServiceLine('rideshare')}
                                  >
                                    {fuelServiceLineUiLabel('rideshare')}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={approveServiceLine === 'rush_delivery' ? 'default' : 'outline'}
                                    onClick={() => setApproveServiceLine('rush_delivery')}
                                  >
                                    {fuelServiceLineUiLabel('rush_delivery')}
                                  </Button>
                                </div>
                                <p className="text-[11px] text-slate-500">
                                  Sets an explicit line on the posted fill (sticky — not overwritten by re-resolve).
                                </p>
                              </div>
                            ) : null}
                            <Label htmlFor="action-notes" className="mb-2 block">
                                {action === 'approve' ? 'Approval Notes (Optional)' : 'Rejection Reason (Required)'}
                            </Label>
                            <Textarea 
                                id="action-notes"
                                value={notes} 
                                onChange={(e) => setNotes(e.target.value)} 
                                placeholder={action === 'approve' ? "E.g. Verified odometer reading." : "E.g. Receipt is blurry, please re-upload."}
                                className="mb-4"
                            />
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setAction(null)}>Back</Button>
                                <Button 
                                    className={action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
                                    disabled={action === 'reject' && !notes.trim()}
                                    onClick={confirmAction}
                                >
                                    Confirm {action === 'approve' ? 'Approval' : 'Rejection'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {!action && selectedTx?.status === 'Pending' && (
                        <DialogFooter className="gap-2 sm:gap-0">
                            <div className="flex gap-2 w-full sm:w-auto mr-auto">
                                {onEdit && !isStationGateHeld(selectedTx) && (
                                    selectedTx.metadata?.source === 'Manual' || 
                                    selectedTx.metadata?.source === 'Bulk Manual' || 
                                    selectedTx.metadata?.source === 'Manual Request' ||
                                    !selectedTx.metadata?.source
                                ) && (
                                    <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => { setIsDetailsOpen(false); onEdit(selectedTx); }}>
                                        <Pencil className="h-4 w-4 mr-2" />
                                        Edit
                                    </Button>
                                )}
                                <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setIsDetailsOpen(false)}>Close</Button>
                            </div>
                            {!isStationGateHeld(selectedTx) && (
                                <div className="flex gap-2 w-full sm:w-auto">
                                    {can('fuel.reject') && <Button variant="destructive" className="flex-1 sm:flex-none" onClick={() => setAction('reject')}>Reject</Button>}
                                    {can('fuel.approve') && <Button className="bg-emerald-600 hover:bg-emerald-700 flex-1 sm:flex-none" onClick={() => setAction('approve')}>Approve</Button>}
                                </div>
                            )}
                        </DialogFooter>
                    )}
                    
                    {!action && selectedTx?.status !== 'Pending' && (
                         <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Close</Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>

            {/* Phase 6: Log Review Detail Dialog */}
            <Dialog open={isLogReviewOpen} onOpenChange={(open) => { if (!open && !isLogReviewSubmitting) { setIsLogReviewOpen(false); setLogReviewTx(null); } }}>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Camera className="h-5 w-5 text-amber-600" />
                            Review Fuel Log {logReviewTx?.driverName ? `\u2014 ${logReviewTx.driverName}` : ''}
                        </DialogTitle>
                        <DialogDescription>
                            The AI odometer scanner was unable to read this submission. Review the photo and enter the correct odometer reading to approve.
                        </DialogDescription>
                    </DialogHeader>

                    {logReviewTx && (
                        <div className="space-y-6 py-2">
                            {/* Odometer Photo Section */}
                            <div className="space-y-2">
                                <Label className="text-slate-500 text-xs uppercase tracking-wider">Odometer Photo</Label>
                                {logReviewTx.metadata?.odometerProofUrl ? (
                                    <div className="relative rounded-lg border-2 border-amber-200 bg-amber-50/30 overflow-hidden">
                                        <a href={logReviewTx.metadata.odometerProofUrl} target="_blank" rel="noopener noreferrer" className="block">
                                            <ImageWithFallback 
                                                src={logReviewTx.metadata.odometerProofUrl} 
                                                alt="Odometer Photo" 
                                                className="w-full max-h-[300px] object-contain bg-black/5" 
                                            />
                                        </a>
                                        <div className="absolute top-2 right-2">
                                            <Badge className="bg-amber-600 text-white text-[10px]">
                                                Click to enlarge
                                            </Badge>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-40 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 text-slate-400">
                                        <Camera className="h-10 w-10 mb-2 opacity-40" />
                                        <span className="text-sm font-medium">No odometer photo available</span>
                                        <span className="text-xs mt-1">The driver may not have submitted a photo for this entry.</span>
                                    </div>
                                )}
                            </div>

                            {/* Receipt Photo (if available) */}
                            {logReviewTx.receiptUrl && (
                                <div className="space-y-2">
                                    <Label className="text-slate-500 text-xs uppercase tracking-wider">Receipt Photo</Label>
                                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                                        <a href={logReviewTx.receiptUrl} target="_blank" rel="noopener noreferrer" className="block">
                                            <ImageWithFallback 
                                                src={logReviewTx.receiptUrl} 
                                                alt="Receipt" 
                                                className="w-full max-h-[200px] object-contain bg-black/5" 
                                            />
                                        </a>
                                    </div>
                                </div>
                            )}

                            {/* Transaction Info Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <Label className="text-slate-400 text-[10px] uppercase tracking-wider block mb-1">Date</Label>
                                    <div className="flex items-center gap-1.5 text-sm font-medium">
                                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                        {formatDate(logReviewTx.date)}
                                    </div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <Label className="text-slate-400 text-[10px] uppercase tracking-wider block mb-1">Amount</Label>
                                    <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-600">
                                        <DollarSign className="h-3.5 w-3.5" />
                                        {Math.abs(Number(logReviewTx.amount) || Number(logReviewTx.metadata?.totalCost) || 0).toFixed(2)}
                                    </div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <Label className="text-slate-400 text-[10px] uppercase tracking-wider block mb-1">Volume</Label>
                                    <span className="text-sm font-medium font-mono">
                                        {(() => {
                                            const v = computeResolvedFuelLiters(logReviewTx);
                                            return v != null ? `${v} L` : '-';
                                        })()}
                                    </span>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <Label className="text-slate-400 text-[10px] uppercase tracking-wider block mb-1">Station</Label>
                                    <span className="text-sm font-medium truncate block">{resolveStationName(logReviewTx)}</span>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <Label className="text-slate-400 text-[10px] uppercase tracking-wider block mb-1">Vehicle</Label>
                                    <div className="flex items-center gap-1.5 text-sm font-medium">
                                        <Truck className="h-3.5 w-3.5 text-slate-400" />
                                        {logReviewTx.metadata?.vehiclePlate || logReviewTx.vehicleId?.substring(0, 8) || '-'}
                                    </div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <Label className="text-slate-400 text-[10px] uppercase tracking-wider block mb-1">Payment</Label>
                                    <span className="text-sm font-medium">
                                        {logReviewTx.paymentMethod || logReviewTx.metadata?.paymentSource || 'Cash'}
                                    </span>
                                </div>
                            </div>

                            {/* Capture Method Badge */}
                            {logReviewTx.metadata?.odometerMethod && (
                                <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-100">
                                    <AlertTriangle className="h-4 w-4 text-purple-600 shrink-0" />
                                    <div>
                                        <span className="text-xs font-semibold text-purple-700">
                                            Capture Method: {getOdometerMethodLabel(logReviewTx.metadata.odometerMethod)}
                                        </span>
                                        {(logReviewTx.metadata?.logReviewReason || logReviewTx.metadata?.odometerManualReason) && (
                                            <p className="text-xs text-purple-600 mt-0.5">
                                                Reason: {logReviewTx.metadata.logReviewReason || logReviewTx.metadata.odometerManualReason}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Admin Odometer Input */}
                            <div className="space-y-2 p-4 bg-amber-50/50 rounded-lg border-2 border-amber-200">
                                <Label htmlFor="admin-odometer" className="text-sm font-semibold text-amber-900">
                                    Enter Odometer Reading (km) <span className="text-red-500">*</span>
                                </Label>
                                <p className="text-xs text-amber-700 mb-2">
                                    Read the odometer value from the photo above and enter it here. This will be recorded as the official reading.
                                </p>
                                <Input 
                                    id="admin-odometer"
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={adminOdometer}
                                    onChange={(e) => { setAdminOdometer(e.target.value); setOdometerError(''); }}
                                    placeholder="e.g. 145320"
                                    className={cn(
                                        "font-mono text-lg h-12 bg-white",
                                        odometerError && "border-red-500 focus-visible:ring-red-500"
                                    )}
                                />
                                {odometerError && (
                                    <p className="text-xs text-red-600 flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        {odometerError}
                                    </p>
                                )}

                                {/* Warning if entered value seems low compared to existing odometer on tx */}
                                {adminOdometer && Number(adminOdometer) > 0 && logReviewTx.odometer && Number(adminOdometer) < logReviewTx.odometer && (
                                    <p className="text-xs text-amber-700 flex items-center gap-1 mt-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        This reading ({adminOdometer} km) is lower than the existing odometer ({logReviewTx.odometer} km). Please double-check.
                                    </p>
                                )}
                            </div>

                            {/* Admin Notes */}
                            <div className="space-y-2">
                                <Label htmlFor="admin-log-notes" className="text-sm font-medium text-slate-700">
                                    Admin Notes (Optional)
                                </Label>
                                <Textarea 
                                    id="admin-log-notes"
                                    value={adminNotes}
                                    onChange={(e) => setAdminNotes(e.target.value)}
                                    placeholder="E.g. Photo slightly blurry but reading is clearly 145,320 km."
                                    rows={2}
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
                        <Button 
                            variant="outline" 
                            onClick={() => { setIsLogReviewOpen(false); setLogReviewTx(null); }}
                            disabled={isLogReviewSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button 
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={confirmLogReview}
                            disabled={isLogReviewSubmitting || !adminOdometer}
                        >
                            {isLogReviewSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Approving...
                                </>
                            ) : (
                                <>
                                    <Check className="h-4 w-4 mr-2" />
                                    Confirm & Approve
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
