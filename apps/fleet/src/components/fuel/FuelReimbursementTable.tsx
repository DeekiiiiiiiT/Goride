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
import { Check, X, Eye, FileText, Calendar, User, DollarSign, Pencil, Trash2, Loader2, AlertTriangle, MapPin } from "lucide-react";
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { EvidenceFromRecord } from '../evidence/EvidenceFromRecord';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
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
    isPendingTabRow,
    isStationHeldQueueRow,
    isStationGateHeld,
    isUnresolvedSplitVariance,
    isAwaitingCashTx,
    isStaleAwaitingCash,
    describeSplitCashRehome,
    metaFlagOn,
} from '@roam/fuel-core';
import { formatFuelMoney } from '../../utils/formatFuelMoney';
import { fuelEntryMatchesLineFilter } from '../../utils/fuelServiceLineFilter';
import { fuelServiceLineUiLabel } from '../../utils/vocabulary';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import { ViewablePhoto } from './phone-fills/FuelPhotoViewer';
import { when as fillWhen, type VehicleLite } from './phone-fills/FuelNeedsLookPanel';

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
    /** Split mismatches + waits live in Transaction Logs › Awaiting statement; this opens it. */
    onOpenAwaitingStatement?: () => void;
    /** Plate + car by vehicle id (same map the Needs a look cards use). */
    vehicles?: Record<string, VehicleLite>;
    isRefreshing?: boolean;
    /** Jump to Transaction Logs for a posted fuel entry */
    onViewInTransactionLogs?: (opts: { fuelEntryId?: string; date?: string; vehicleId?: string }) => void;
    /** Dual-line org: bulk set + approve service-line control */
    showServiceLineControls?: boolean;
    /** Set by the page's All / Rideshare / Delivery tabs. */
    lineFilter?: 'all' | 'rideshare' | 'rush_delivery';
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
    onOpenAwaitingStatement,
    vehicles = {},
    isRefreshing = false,
    onViewInTransactionLogs,
    showServiceLineControls = false,
    lineFilter = 'all',
    onBulkSetServiceLine,
}: FuelReimbursementTableProps) {
    const { can } = usePermissions();
    const [selectedTx, setSelectedTx] = useState<FinancialTransaction | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [notes, setNotes] = useState('');
    const [action, setAction] = useState<'approve' | 'reject' | null>(null);
    const [approveServiceLine, setApproveServiceLine] = useState<'rideshare' | 'rush_delivery'>('rideshare');

    const [verifiedStations, setVerifiedStations] = useState<StationProfile[]>([]);
    const [stationsLoading, setStationsLoading] = useState(false);
    const [approvalBrand, setApprovalBrand] = useState('');
    const [approvalMatchedStationId, setApprovalMatchedStationId] = useState('');
    const [approvalStationLocation, setApprovalStationLocation] = useState('');
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
            if (!linkedLog) return false;
            return fuelEntryMatchesLineFilter(linkedLog, lineFilter);
        });
    }, [transactions, logs, lineFilter]);

    // Clear stale selection when the lens or queue data changes.
    useEffect(() => {
        setSelectedTxIds(new Set());
    }, [lineFilter, transactions]);

    const pendingAll = scopedTransactions.filter((t) => isPendingFuelQueueRow(t));
    const pendingStationHoldCount = pendingAll.filter((t) => isStationGateHeld(t)).length;
    // RQ-04: odometer-check fills live in Log Review only. RQ-05: station-held fills listed, View only.
    const pendingReadyForReview = pendingAll.filter((t) => isPendingTabRow(t));
    const stationHeldRows = scopedTransactions.filter((t) => isStationHeldQueueRow(t));

    const splitMismatchTxs = useMemo(
        () => scopedTransactions.filter((t) => isUnresolvedSplitVariance(t)),
        [scopedTransactions],
    );
    const awaitingCashTxs = useMemo(
        () => scopedTransactions.filter((t) => isAwaitingCashTx(t) && !isUnresolvedSplitVariance(t)),
        [scopedTransactions],
    );
    const staleAwaitingCount = useMemo(
        () => awaitingCashTxs.filter((t) => isStaleAwaitingCash(t)).length,
        [awaitingCashTxs],
    );
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
        return `${tx.category || 'Fuel'} — station not known`;
    };

    // Stitch: docs/stitch/fuel-review-and-logs-fleet/review_queue_* — one card per fill, same family as Needs a look.
    const renderReadyCards = (data: FinancialTransaction[]) => {
        const chip = 'rounded-full px-3 py-1 bg-[#e6eeff] text-[#47464c] text-[12px] font-semibold dark:bg-zinc-800 dark:text-zinc-300';
        const label = 'text-[12px] font-semibold uppercase tracking-wider text-[#47464c] dark:text-zinc-400 mb-0.5';
        const btn = 'min-h-[44px] px-5 rounded-xl bg-white text-[13px] font-medium shadow-sm ring-1 ring-[#c9c5cd] transition-colors dark:bg-zinc-900';
        const readChip = (
            <span className="self-start rounded-full bg-[#82f5c1] px-2.5 py-0.5 text-[12px] font-semibold text-[#00714e] flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">check</span> Read clearly
            </span>
        );
        return (
            <div className="flex flex-col gap-4">
                {data.map((tx) => {
                    const m = (tx.metadata || {}) as Record<string, unknown>;
                    const held = isStationGateHeld(tx);
                    const rowActions = !held;
                    const amount = Math.abs(Number(tx.amount) || Number(m.totalCost) || 0);
                    const vol = computeResolvedFuelLiters(tx);
                    const ppl = Number(m.pricePerLiter) || (vol && amount ? amount / vol : 0);
                    const odo = Number(tx.odometer) || 0;
                    const vehicle = tx.vehicleId ? vehicles[tx.vehicleId] : undefined;
                    const plate = vehicle?.plate || (typeof m.vehiclePlate === 'string' ? m.vehiclePlate : '');
                    const isCard = String(tx.paymentMethod || m.paymentSource || '').toLowerCase().includes('card');
                    const source = String(m.source || '');
                    const typedInFleet = source === 'Manual' || source === 'Bulk Manual' || m.entrySource === 'admin-manual' || m.entrySource === 'bulk-import';
                    const fromPhone = !typedInFleet && (typeof m.captureId === 'string' || source === 'Fuel Log' || m.entrySource === 'driver-portal');
                    const fromPhoto = Array.isArray(m.readFromPhoto) ? (m.readFromPhoto as string[]) : [];
                    const odoMethod = String(m.odometerMethod || '');
                    const odoRead = fromPhoto.includes('odometer') || odoMethod === 'ai_verified' || odoMethod === 'photo_read';
                    const pumpRead = fromPhoto.includes('amount');
                    const linkedLog = logs.find((l) => l.transactionId === tx.id || l.id === m.sourceId);
                    const line = linkedLog ? String((linkedLog as { serviceLine?: string }).serviceLine || '') : '';
                    const station = resolveDescription(tx);
                    const rehome = describeSplitCashRehome(m);
                    const canEditRow =
                        Boolean(onEdit) && rowActions && (source === 'Manual' || source === 'Bulk Manual' || source === 'Manual Request' || !source);
                    const canDeleteRow = Boolean(onDelete) && rowActions && tx.status === 'Pending' && (source === 'Manual' || !source);
                    const entryId = bulkSelectEnabled ? resolveFuelEntryIdForTx(tx, logs) : null;
                    const selected = selectedTxIds.has(tx.id);
                    const open = (a: 'approve' | 'reject' | null) => {
                        setSelectedTx(tx);
                        setIsDetailsOpen(true);
                        setAction(a);
                    };
                    return (
                        <div
                            key={tx.id}
                            className={cn(
                                'flex flex-col gap-4 rounded-2xl bg-white p-4 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)] dark:bg-[#2a2a2d]',
                                held && 'opacity-90',
                            )}
                        >
                            {/* Line 1 — date · driver · plate · car */}
                            <div className="flex flex-wrap items-center gap-3">
                                {bulkSelectEnabled ? (
                                    <button
                                        type="button"
                                        role="checkbox"
                                        aria-checked={selected}
                                        aria-label={`Select ${tx.driverName || 'fill'}`}
                                        disabled={!entryId}
                                        onClick={() => toggleSelectTx(tx.id, !selected)}
                                        className={cn(
                                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full disabled:opacity-30',
                                            selected ? 'bg-black text-white' : 'bg-[#e6eeff] text-transparent',
                                        )}
                                    >
                                        <span className="material-symbols-outlined text-[18px]">check</span>
                                    </button>
                                ) : null}
                                <span className="text-[15px] tabular-nums text-[#47464c] dark:text-zinc-400">{fillWhen(tx)}</span>
                                <span className="text-[#c9c5cd]">·</span>
                                <span className="text-[17px] font-semibold text-[#0d1c2e] dark:text-zinc-50">{tx.driverName || 'Unknown driver'}</span>
                                {plate ? (
                                    <>
                                        <span className="text-[#c9c5cd]">·</span>
                                        <span className="rounded-md bg-[#e6eeff] px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider text-[#0d1c2e] dark:bg-zinc-800 dark:text-zinc-100">{plate}</span>
                                    </>
                                ) : null}
                                {vehicle?.car ? <span className="text-[15px] text-[#47464c] dark:text-zinc-400">{vehicle.car}</span> : null}
                            </div>

                            {/* Line 2 — soft blue strip with numbers + chips */}
                            <div className="flex flex-col gap-4 rounded-xl bg-[#eff4ff] p-4 lg:flex-row lg:items-center lg:justify-between dark:bg-zinc-900/50">
                                <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
                                    <div>
                                        <div className={label}>Total amount</div>
                                        <div className="text-[24px] font-bold tabular-nums text-[#0d1c2e] dark:text-zinc-50">{amount ? formatFuelMoney(amount) : '—'}</div>
                                    </div>
                                    <div>
                                        <div className={label}>Volume (litres)</div>
                                        <div className="text-[17px] font-semibold tabular-nums text-[#0d1c2e] dark:text-zinc-50">{vol != null ? `${vol} L` : '—'}</div>
                                    </div>
                                    <div>
                                        <div className={label}>Odometer</div>
                                        <div className="text-[17px] font-semibold tabular-nums text-[#0d1c2e] dark:text-zinc-50">{odo ? `${odo.toLocaleString('en-US')} km` : '—'}</div>
                                    </div>
                                    {ppl ? (
                                        <div>
                                            <div className={label}>Rate</div>
                                            <div className="text-[15px] tabular-nums text-[#47464c] dark:text-zinc-400">{formatFuelMoney(ppl)} a litre</div>
                                        </div>
                                    ) : null}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={chip}>{isCard ? 'Gas Card' : 'Cash'}</span>
                                    {station && !/station not known/i.test(station) ? (
                                        <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[#0d1c2e] shadow-sm dark:bg-zinc-800 dark:text-zinc-100">
                                            <span className="material-symbols-outlined text-[14px] text-[#47464c]">location_on</span>
                                            {station.replace(/^Fuel( Reimbursement)? Expense - /, '')}
                                        </span>
                                    ) : null}
                                    {fromPhone ? <span className={chip}>From driver&apos;s phone</span> : null}
                                    {typedInFleet ? (
                                        <span className="rounded-full bg-[#fffbeb] px-3 py-1 text-[12px] font-semibold text-[#b45309] ring-1 ring-[#fde68a]">Typed in Fleet</span>
                                    ) : null}
                                    {showServiceLineControls ? (
                                        line ? (
                                            <span className={chip}>{fuelServiceLineUiLabel(line as 'rideshare' | 'rush_delivery')}</span>
                                        ) : (
                                            <span className="flex items-center gap-1 rounded-full bg-[#fffbeb] px-3 py-1 text-[12px] font-semibold text-[#b45309]">
                                                <span className="h-1.5 w-1.5 rounded-full bg-[#b45309]" /> No service line yet
                                            </span>
                                        )
                                    ) : null}
                                    {held ? (
                                        <span className="flex items-center gap-1 rounded-full bg-[#e0f2fe] px-3 py-1 text-[12px] font-semibold text-[#0c4a6e]">
                                            <span className="material-symbols-outlined text-[14px]">sync</span> Waiting for station check
                                        </span>
                                    ) : null}
                                    {metaFlagOn(m.automated) ? <span className={chip}>Added automatically</span> : null}
                                    {isUnresolvedSplitVariance(tx) ? (
                                        <span className="rounded-full bg-[#ffdad6] px-3 py-1 text-[12px] font-semibold text-[#ba1a1a]">Card and pump don&apos;t agree</span>
                                    ) : null}
                                </div>
                            </div>

                            {/* Line 3 — photos + buttons */}
                            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                                {held ? (
                                    <div className="flex items-center gap-2 text-[15px] text-[#47464c] dark:text-zinc-400">
                                        <span className="material-symbols-outlined text-[18px]">info</span>
                                        Roam is checking this station. You can approve it once the check is done.
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-start gap-4">
                                            <div className="flex flex-col gap-2">
                                                <ViewablePhoto url={resolveOdometerProofUrl(tx)} label="Odometer photo" className="h-[78px] w-[116px]" />
                                                {odoRead ? readChip : null}
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                {tx.receiptUrl ? (
                                                    <ViewablePhoto url={tx.receiptUrl} label="Pump photo" className="h-[78px] w-[116px]" />
                                                ) : (
                                                    <button type="button" className="w-[116px]" onClick={() => open(null)}>
                                                        <EvidenceFromRecord record={tx} label="Fuel receipt" compact className="w-[116px]" />
                                                    </button>
                                                )}
                                                {pumpRead ? readChip : null}
                                            </div>
                                        </div>
                                        {rehome ? <p className="text-[13px] text-[#47464c] dark:text-zinc-400">{rehome}</p> : null}
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    {rowActions && can('fuel.reject') ? (
                                        <button type="button" className={`${btn} text-[#ba1a1a] ring-[#ffdad6] hover:bg-[#ffdad6]`} onClick={() => open('reject')}>
                                            Reject
                                        </button>
                                    ) : null}
                                    {canEditRow && onEdit ? (
                                        <button type="button" className={`${btn} flex items-center gap-1.5 text-[#0d1c2e] hover:bg-[#e6eeff] dark:text-zinc-100`} onClick={() => onEdit(tx)}>
                                            <span className="material-symbols-outlined text-[16px]">edit</span> Edit
                                        </button>
                                    ) : null}
                                    {canDeleteRow && onDelete ? (
                                        <button type="button" className={`${btn} flex items-center gap-1.5 text-[#ba1a1a] hover:bg-[#ffdad6]`} onClick={() => onDelete(tx.id)}>
                                            <span className="material-symbols-outlined text-[16px]">delete</span> Delete
                                        </button>
                                    ) : null}
                                    <button type="button" className={`${btn} text-[#0d1c2e] hover:bg-[#e6eeff] dark:text-zinc-100`} onClick={() => open(null)}>
                                        View
                                    </button>
                                    {rowActions && can('fuel.approve') ? (
                                        <button
                                            type="button"
                                            className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-black px-6 text-[13px] font-medium text-white shadow-md hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900"
                                            onClick={() => open('approve')}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">done</span> Approve
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {bulkSelectEnabled && selectedTxIds.size > 0 ? (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#1b192e] px-5 py-4 text-white shadow-lg">
                <span className="flex items-center gap-2 text-[17px] font-semibold">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#82f5c1] text-[12px] font-bold text-[#00714e]">{selectedTxIds.size}</span>
                  selected
                  {selectedTxIds.size > BULK_SET_SERVICE_LINE_MAX ? <span className="text-[13px] font-normal text-white/70">(max {BULK_SET_SERVICE_LINE_MAX})</span> : null}
                </span>
                <span className="hidden h-6 w-px bg-white/20 sm:block" />
                <button
                  type="button"
                  disabled={bulkSetBusy || selectedTxIds.size > BULK_SET_SERVICE_LINE_MAX}
                  onClick={() => void runBulkSetServiceLine('rideshare')}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-[13px] font-semibold hover:bg-white/10 disabled:opacity-40"
                >
                  {bulkSetBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[18px]">directions_car</span>}
                  Set {fuelServiceLineUiLabel('rideshare')}
                </button>
                <button
                  type="button"
                  disabled={bulkSetBusy || selectedTxIds.size > BULK_SET_SERVICE_LINE_MAX}
                  onClick={() => void runBulkSetServiceLine('rush_delivery')}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-[13px] font-semibold hover:bg-white/10 disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                  Set {fuelServiceLineUiLabel('rush_delivery')}
                </button>
                <button
                  type="button"
                  disabled={bulkSetBusy}
                  onClick={() => setSelectedTxIds(new Set())}
                  className="ml-auto min-h-[44px] rounded-xl bg-white px-5 text-[13px] font-medium text-[#0d1c2e] shadow-sm"
                >
                  Clear selection
                </button>
              </div>
            ) : null}
                {/* Split mismatches + 14-day waits moved to Transaction Logs › Awaiting statement — keep them visible here. */}
                {(splitMismatchTxs.length > 0 || staleAwaitingCount > 0) && onOpenAwaitingStatement ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#ffdad6] px-5 py-4 dark:bg-[#450a0a]">
                        <p className="flex items-center gap-3 text-[17px] font-medium text-[#ba1a1a] dark:text-[#f87171]">
                            <span className="material-symbols-outlined flex h-8 w-8 items-center justify-center rounded-full bg-white text-[18px]">credit_card_off</span>
                            {[
                                splitMismatchTxs.length > 0
                                    ? `${splitMismatchTxs.length} card and pump mismatch${splitMismatchTxs.length === 1 ? '' : 'es'} need${splitMismatchTxs.length === 1 ? 's' : ''} a pay decision`
                                    : '',
                                staleAwaitingCount > 0
                                    ? `${staleAwaitingCount} fill${staleAwaitingCount === 1 ? ' has' : 's have'} waited 14+ days for the statement`
                                    : '',
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                        <button
                            type="button"
                            onClick={onOpenAwaitingStatement}
                            className="h-11 rounded-xl bg-white px-4 text-[13px] font-medium text-[#0d1c2e] shadow-sm ring-1 ring-[#c9c5cd] hover:bg-[#e6eeff]"
                        >
                            Open Awaiting statement
                        </button>
                    </div>
                ) : null}

            {/* The tile above already says when nothing is ready — the list only shows when it has fills. */}
            {pendingReadyForReview.length > 0 || stationHeldRows.length > 0 ? (
            <section className="flex flex-col gap-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 className="text-[17px] font-semibold leading-6 tracking-tight text-[#0d1c2e] dark:text-zinc-50">
                            Ready to approve ({pendingReadyForReview.length})
                        </h2>
                        <p className="text-[15px] text-[#47464c] dark:text-zinc-400">Check each fill, then approve or reject it.</p>
                    </div>
                    {pendingStationHoldCount > 0 && (
                        <div className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-900">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            {pendingStationHoldCount} station hold
                            {pendingStationHoldCount === 1 ? '' : 's'} — listed at the bottom
                        </div>
                    )}
                </div>

                {isRefreshing && (
                    <div className="flex items-center gap-2 text-xs font-medium text-blue-600 bg-blue-50/50 p-2 rounded-md border border-blue-100 animate-pulse">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Refreshing…
                    </div>
                )}
                {/* RQ-05: held fills sit at the bottom with View only (rowActions is false for them). */}
                {renderReadyCards([...pendingReadyForReview, ...stationHeldRows])}
            </section>
            ) : null}

            {/* Fill window — Stitch docs/stitch/fuel-review-and-logs-fleet/check_a_fill_* (approve, reject, station check). */}
            <Dialog open={isDetailsOpen} onOpenChange={(open) => { if(!open) { setIsDetailsOpen(false); setAction(null); } }}>
                <DialogContent hideCloseButton className="sm:max-w-[960px] max-h-[92vh] overflow-y-auto rounded-2xl border-0 p-0 gap-0 bg-white dark:bg-[#2a2a2d]">
                    {selectedTx && (() => {
                        const tx = selectedTx;
                        const m = (tx.metadata || {}) as Record<string, unknown>;
                        const held = isStationGateHeld(tx);
                        const pending = tx.status === 'Pending';
                        const amount = Math.abs(Number(tx.amount) || Number(m.totalCost) || 0);
                        const resolvedLiters = computeResolvedFuelLiters(tx);
                        const litersDerived = resolvedLiters != null && !Number(tx.quantity) && !Number(m.fuelVolume);
                        const ppl = Number(m.pricePerLiter) || (resolvedLiters && amount ? amount / resolvedLiters : 0);
                        const odo = Number(tx.odometer) || 0;
                        const vehicle = tx.vehicleId ? vehicles[tx.vehicleId] : undefined;
                        const plate = vehicle?.plate || (typeof m.vehiclePlate === 'string' ? m.vehiclePlate : '');
                        const isCard = String(tx.paymentMethod || m.paymentSource || '').toLowerCase().includes('card');
                        const fromPhoto = Array.isArray(m.readFromPhoto) ? (m.readFromPhoto as string[]) : [];
                        const odoMethod = String(m.odometerMethod || '');
                        const odoRead = fromPhoto.includes('odometer') || odoMethod === 'ai_verified' || odoMethod === 'photo_read';
                        const pumpRead = fromPhoto.includes('amount');
                        const odometerPhotoUrl = resolveOdometerProofUrl(tx);
                        const station = resolveDescription(tx).replace(/^Fuel( Reimbursement)? Expense - /, '');
                        const matchingStations = approvalBrand ? getStationsForBrand(approvalBrand) : [];
                        const hasVerifiedStations = matchingStations.length > 0;
                        const showFuelStationPicker =
                            pending && (tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement') && !held && action !== 'reject';
                        const source = String(m.source || '');
                        const canEditHere =
                            Boolean(onEdit) && pending && !held && (source === 'Manual' || source === 'Bulk Manual' || source === 'Manual Request' || !source);
                        const coords = pickTransactionCoords(tx);
                        const row = 'flex items-center justify-between gap-4 py-2';
                        const rowLabel = 'text-[15px] text-[#47464c] dark:text-zinc-400';
                        const rowValue = 'text-right text-[15px] font-medium tabular-nums text-[#0d1c2e] dark:text-zinc-50';
                        const secondaryBtn = 'min-h-[44px] rounded-xl bg-white px-5 text-[13px] font-medium text-[#0d1c2e] shadow-sm ring-1 ring-[#c9c5cd] hover:bg-[#e6eeff] dark:bg-zinc-900 dark:text-zinc-100';
                        const photo = (url: string | undefined, labelText: string, icon: string, read: boolean, fallback: React.ReactNode) => (
                            <div className="relative">
                                {url ? <ViewablePhoto url={url} label={`${labelText} photo`} className="h-[260px] w-full" /> : fallback}
                                <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[13px] font-semibold text-[#0d1c2e] shadow-sm">
                                    <span className="material-symbols-outlined text-[16px]">{icon}</span> {labelText}
                                </span>
                                {read ? (
                                    <span className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-[#82f5c1] px-2.5 py-1 text-[12px] font-semibold text-[#00714e]">
                                        <span className="material-symbols-outlined text-[14px]">check_circle</span> Read clearly
                                    </span>
                                ) : null}
                            </div>
                        );
                        return (
                            <>
                                {/* Header */}
                                <div className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-8">
                                    <div>
                                        <DialogTitle className="flex items-center gap-2.5 text-[24px] font-semibold tracking-tight text-[#0d1c2e] dark:text-zinc-50">
                                            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', held ? 'bg-sky-500' : action === 'reject' ? 'bg-[#ba1a1a]' : 'bg-[#069669]')} />
                                            {fillWhen(tx)} · {tx.driverName || 'Unknown driver'}
                                        </DialogTitle>
                                        <DialogDescription className="mt-1 text-[15px] text-[#47464c] dark:text-zinc-400">
                                            {held
                                                ? "This fill can't be approved yet."
                                                : !pending
                                                  ? 'This fill is already done.'
                                                  : action === 'reject'
                                                    ? 'Tell the driver why, then reject.'
                                                    : 'Check the photos and numbers, then approve.'}
                                        </DialogDescription>
                                    </div>
                                    <button type="button" className={`${secondaryBtn} flex items-center gap-1.5`} onClick={() => { setIsDetailsOpen(false); setAction(null); }}>
                                        Close <span className="material-symbols-outlined text-[18px]">close</span>
                                    </button>
                                </div>

                                <div className="flex flex-col gap-5 px-6 py-6 sm:px-8">
                                    {held ? (
                                        <>
                                            <div className="flex items-center gap-3 rounded-xl bg-[#e0f2fe] p-3.5 text-[15px] text-[#0c4a6e]">
                                                <span className="material-symbols-outlined flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-200/70 text-[19px] text-sky-800">near_me</span>
                                                Roam is checking where this fill was. Approve and reject come back once the station is confirmed.
                                            </div>
                                            <div className="rounded-xl bg-[#fffbeb] p-4">
                                                <div className="mb-2 flex items-center gap-2 text-[17px] font-semibold text-amber-950">
                                                    <span className="material-symbols-outlined text-[18px] text-amber-700">help_center</span>
                                                    What&apos;s missing
                                                </div>
                                                <ul className="space-y-1.5 pl-1 text-[15px] leading-relaxed text-amber-900">
                                                    {buildStationHoldDiagnostics(tx).map((line, i) => (
                                                        <li key={i} className="flex items-start gap-2">
                                                            <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                                            {line}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </>
                                    ) : null}

                                    <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                                        {/* Photos */}
                                        <div className="flex flex-col gap-4">
                                            {photo(
                                                odometerPhotoUrl,
                                                'Odometer',
                                                'speed',
                                                odoRead,
                                                <EvidenceFromRecord record={{ ...tx, odometerProofUrl: odometerPhotoUrl }} urlField="odometerProofUrl" label="Odometer photo" />,
                                            )}
                                            {photo(
                                                tx.receiptUrl || undefined,
                                                'Pump',
                                                'local_gas_station',
                                                pumpRead,
                                                <EvidenceFromRecord record={tx} label="Fuel receipt" />,
                                            )}
                                        </div>

                                        {/* Values + choices */}
                                        <div className="flex flex-col gap-4">
                                            <div className="rounded-xl bg-[#eff4ff] px-5 py-3 dark:bg-zinc-900/50">
                                                <div className={row}>
                                                    <span className={rowLabel}>Driver</span>
                                                    <span className={rowValue}>{tx.driverName || 'Unknown driver'}</span>
                                                </div>
                                                {plate || vehicle?.car ? (
                                                    <div className={row}>
                                                        <span className={rowLabel}>Car</span>
                                                        <span className={`${rowValue} flex items-center gap-2`}>
                                                            {plate ? <span className="rounded-md bg-[#e6eeff] px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider dark:bg-zinc-800">{plate}</span> : null}
                                                            {vehicle?.car}
                                                        </span>
                                                    </div>
                                                ) : null}
                                                <div className={row}>
                                                    <span className={rowLabel}>Date</span>
                                                    <span className={rowValue}>{fillWhen(tx)}</span>
                                                </div>
                                                <div className={row}>
                                                    <span className={rowLabel}>Total</span>
                                                    <span className="text-right text-[20px] font-bold tabular-nums text-[#0d1c2e] dark:text-zinc-50">{amount ? formatFuelMoney(amount) : '—'}</span>
                                                </div>
                                                <div className={row}>
                                                    <span className={rowLabel}>Litres</span>
                                                    <span className={rowValue}>
                                                        {resolvedLiters != null ? `${resolvedLiters} L` : '—'}
                                                        {litersDerived ? <span className="block text-[12px] font-normal text-[#47464c]">Worked out from total ÷ price</span> : null}
                                                    </span>
                                                </div>
                                                <div className={row}>
                                                    <span className={rowLabel}>Price</span>
                                                    <span className={rowValue}>{ppl ? `${formatFuelMoney(ppl)} a litre` : '—'}</span>
                                                </div>
                                                <div className={row}>
                                                    <span className={rowLabel}>Odometer</span>
                                                    <span className={rowValue}>{odo ? `${odo.toLocaleString('en-US')} km` : '—'}</span>
                                                </div>
                                                <div className={row}>
                                                    <span className={rowLabel}>Paid with</span>
                                                    <span className="flex items-center gap-1 rounded-full bg-[#e6eeff] px-3 py-1 text-[13px] font-semibold text-[#0d1c2e] dark:bg-zinc-800 dark:text-zinc-100">
                                                        <span className="material-symbols-outlined text-[16px]">{isCard ? 'credit_card' : 'payments'}</span>
                                                        {isCard ? 'Gas Card' : 'Cash'}
                                                    </span>
                                                </div>
                                                {!showFuelStationPicker ? (
                                                    <div className={row}>
                                                        <span className={rowLabel}>{held ? 'Location' : 'Station'}</span>
                                                        <span className={rowValue}>
                                                            {held && coords
                                                                ? String(m.stationLocation || m.locationAddress || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`)
                                                                : /station not known/i.test(station) ? '—' : station}
                                                        </span>
                                                    </div>
                                                ) : null}
                                            </div>

                                            {tx.description && !/^Fuel( Reimbursement)? Expense/.test(tx.description) ? (
                                                <div className="rounded-xl bg-[#f8f9ff] p-4 text-[15px] text-[#0d1c2e] ring-1 ring-[#e6eeff] dark:bg-zinc-900 dark:text-zinc-100">
                                                    <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-[#47464c]">Driver&apos;s note</span>
                                                    {tx.description}
                                                </div>
                                            ) : null}

                                            {showFuelStationPicker ? (
                                                <div className="flex flex-col gap-3 rounded-xl bg-[#eff4ff] p-5 dark:bg-zinc-900/50">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[17px] font-semibold text-[#0d1c2e] dark:text-zinc-50">Fuel station</span>
                                                        {approvalMatchedStationId ? (
                                                            <span className="flex items-center gap-1 rounded-full bg-[#82f5c1] px-2.5 py-0.5 text-[12px] font-semibold text-[#00714e]">
                                                                <span className="material-symbols-outlined text-[14px]">verified</span> Verified station
                                                            </span>
                                                        ) : stationsLoading ? (
                                                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                                        ) : null}
                                                    </div>
                                                    <p className="-mt-2 text-[13px] text-[#47464c] dark:text-zinc-400">
                                                        Optional — pick the station if the phone&apos;s location didn&apos;t match one.
                                                    </p>
                                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[12px] font-semibold uppercase tracking-wider text-[#47464c]">Brand</span>
                                                            <Select value={approvalBrand} onValueChange={handleApprovalBrandChange}>
                                                                <SelectTrigger className="h-11 rounded-xl border-0 bg-white shadow-sm dark:bg-zinc-900">
                                                                    <SelectValue placeholder="Choose a brand" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {brandOptions.map((b) => (
                                                                        <SelectItem key={b} value={b}>
                                                                            <span className="flex items-center gap-2">
                                                                                {b}
                                                                                {getStationsForBrand(b).length > 0 && (
                                                                                    <span className="rounded-full bg-emerald-50 px-1.5 text-[10px] text-emerald-700">
                                                                                        {getStationsForBrand(b).length} verified
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                        </SelectItem>
                                                                    ))}
                                                                    <SelectItem value="__other_brand__">
                                                                        <span className="italic text-slate-500">Other / not listed</span>
                                                                    </SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[12px] font-semibold uppercase tracking-wider text-[#47464c]">Station</span>
                                                            {hasVerifiedStations ? (
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
                                                                    <SelectTrigger className="h-11 rounded-xl border-0 bg-white shadow-sm dark:bg-zinc-900">
                                                                        <SelectValue placeholder="Choose a station" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {matchingStations.map((s) => (
                                                                            <SelectItem key={s.id} value={s.id}>
                                                                                <span className="flex flex-col text-left">
                                                                                    <span className="text-sm font-medium">{s.name}</span>
                                                                                    {s.address && <span className="max-w-[220px] truncate text-[10px] text-slate-400">{s.address}</span>}
                                                                                </span>
                                                                            </SelectItem>
                                                                        ))}
                                                                        <SelectItem value="__custom__">
                                                                            <span className="text-xs italic text-slate-500">Station not listed — type the address</span>
                                                                        </SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            ) : (
                                                                <Input
                                                                    value={approvalStationLocation}
                                                                    onChange={(e) => setApprovalStationLocation(e.target.value)}
                                                                    placeholder={approvalBrand ? 'Type the address' : 'Choose a brand first'}
                                                                    className="h-11 rounded-xl border-0 bg-white shadow-sm dark:bg-zinc-900"
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                    {hasVerifiedStations && approvalMatchedStationId && approvalStationLocation ? (
                                                        <div className="flex items-center gap-1.5 text-[13px] text-[#47464c]">
                                                            <MapPin className="h-3.5 w-3.5 shrink-0 text-[#069669]" />
                                                            <span className="truncate">{approvalStationLocation}</span>
                                                        </div>
                                                    ) : null}
                                                    {hasVerifiedStations && !approvalMatchedStationId ? (
                                                        <Input
                                                            className="h-11 rounded-xl border-0 bg-white shadow-sm dark:bg-zinc-900"
                                                            value={approvalStationLocation}
                                                            onChange={(e) => setApprovalStationLocation(e.target.value)}
                                                            placeholder="Type the address"
                                                        />
                                                    ) : null}
                                                </div>
                                            ) : null}

                                            {action === 'approve' && showServiceLineControls ? (
                                                <div className="flex flex-col gap-2">
                                                    <span className="text-[17px] font-semibold text-[#0d1c2e] dark:text-zinc-50">Service line</span>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {(['rideshare', 'rush_delivery'] as const).map((l) => (
                                                            <button
                                                                key={l}
                                                                type="button"
                                                                onClick={() => setApproveServiceLine(l)}
                                                                className={cn(
                                                                    'min-h-[48px] rounded-xl text-[15px] font-semibold shadow-sm',
                                                                    approveServiceLine === l
                                                                        ? 'bg-black text-white dark:bg-zinc-50 dark:text-zinc-900'
                                                                        : 'bg-white text-[#0d1c2e] ring-1 ring-[#c9c5cd] dark:bg-zinc-900 dark:text-zinc-100',
                                                                )}
                                                            >
                                                                {fuelServiceLineUiLabel(l)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}

                                            {action === 'approve' ? (
                                                <label className="flex flex-col gap-1.5">
                                                    <span className="text-[15px] font-medium text-[#0d1c2e] dark:text-zinc-100">Note (optional)</span>
                                                    <Textarea
                                                        value={notes}
                                                        onChange={(e) => setNotes(e.target.value)}
                                                        placeholder="e.g. Checked the odometer photo."
                                                        className="min-h-[72px] rounded-xl border-0 bg-[#eff4ff] dark:bg-zinc-900"
                                                    />
                                                </label>
                                            ) : null}
                                        </div>
                                    </div>

                                    {action === 'reject' ? (
                                        <div className="flex flex-col gap-3 rounded-xl bg-[#fff1f0] p-5 dark:bg-[#450a0a]">
                                            <span className="text-[17px] font-semibold text-[#ba1a1a] dark:text-[#f87171]">Reject this fill?</span>
                                            <label className="flex flex-col gap-1.5">
                                                <span className="text-[15px] font-medium text-[#0d1c2e] dark:text-zinc-100">
                                                    Why? {tx.driverName ? tx.driverName.split(' ')[0] : 'The driver'} sees this. <span className="text-[#ba1a1a]">*</span>
                                                </span>
                                                <Textarea
                                                    value={notes}
                                                    onChange={(e) => setNotes(e.target.value)}
                                                    placeholder="e.g. The pump photo shows a different amount. Please log it again."
                                                    className="min-h-[88px] rounded-xl border-0 bg-white shadow-sm dark:bg-zinc-900"
                                                />
                                            </label>
                                            <p className="text-[13px] text-[#47464c] dark:text-zinc-400">The fill will not be paid.</p>
                                        </div>
                                    ) : null}
                                </div>

                                {/* Bottom bar */}
                                <div className="flex flex-col gap-3 border-t border-[#e6eeff] bg-[#f8f9ff] px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 dark:border-zinc-800 dark:bg-zinc-900/60">
                                    {held ? (
                                        <>
                                            <span className="flex items-center gap-2 text-[15px] text-[#47464c] dark:text-zinc-400">
                                                <span className="material-symbols-outlined text-[18px]">lock</span>
                                                Approve and reject are off until the station is confirmed.
                                            </span>
                                            <button type="button" className={secondaryBtn} onClick={() => setIsDetailsOpen(false)}>Close</button>
                                        </>
                                    ) : !pending ? (
                                        <>
                                            <span />
                                            <button type="button" className={secondaryBtn} onClick={() => setIsDetailsOpen(false)}>Close</button>
                                        </>
                                    ) : action === 'reject' ? (
                                        <>
                                            <span />
                                            <div className="flex gap-3">
                                                <button type="button" className={secondaryBtn} onClick={() => { setAction(null); setNotes(''); }}>Keep it</button>
                                                <button
                                                    type="button"
                                                    disabled={!notes.trim() || !can('fuel.reject')}
                                                    onClick={confirmAction}
                                                    className="min-h-[44px] rounded-xl bg-[#ba1a1a] px-6 text-[13px] font-medium text-white shadow-sm disabled:opacity-40"
                                                >
                                                    Reject fill
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex gap-3">
                                                {can('fuel.reject') ? (
                                                    <button
                                                        type="button"
                                                        className="min-h-[44px] rounded-xl bg-white px-5 text-[13px] font-medium text-[#ba1a1a] shadow-sm ring-1 ring-[#ffdad6] hover:bg-[#ffdad6]"
                                                        onClick={() => { setAction('reject'); setNotes(''); }}
                                                    >
                                                        Reject
                                                    </button>
                                                ) : null}
                                                {canEditHere && onEdit ? (
                                                    <button type="button" className={`${secondaryBtn} flex items-center gap-1.5`} onClick={() => { setIsDetailsOpen(false); onEdit(tx); }}>
                                                        <span className="material-symbols-outlined text-[16px]">edit</span> Edit
                                                    </button>
                                                ) : null}
                                            </div>
                                            <div className="flex gap-3">
                                                {action === 'approve' ? (
                                                    <button type="button" className={secondaryBtn} onClick={() => setAction(null)}>Back</button>
                                                ) : null}
                                                {can('fuel.approve') ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => (action === 'approve' ? confirmAction() : setAction('approve'))}
                                                        className="flex min-h-[44px] items-center gap-2 rounded-xl bg-black px-6 text-[13px] font-medium text-white shadow-md hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px] text-[#85f8c4]">check_circle</span>
                                                        {action === 'approve' ? 'Approve fill' : 'Approve'}
                                                    </button>
                                                ) : null}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>
        </div>
    );
}
