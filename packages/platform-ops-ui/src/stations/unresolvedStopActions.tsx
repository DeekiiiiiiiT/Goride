import { useCallback, useMemo, useState } from 'react';
import { api } from '../services/stationOpsApi';
import { toast } from 'sonner';
import { StationProfile } from '../types/station';
import { calculateDistance } from '../utils/stationUtils';
import type { LearntLocationDto, StationGateEvidenceRow, UnresolvedStopRow } from './resolutionQueueTypes';

export function formatQueueDate(dateStr?: string): string {
  if (!dateStr) return '—';
  if (dateStr.includes('-') && dateStr.length === 10) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString();
  }
  return new Date(dateStr).toLocaleDateString();
}

function reasonLabel(resolutionReason?: string | null): string | null {
  if (resolutionReason === 'LATE_LOG') return 'Late log';
  if (resolutionReason === 'STALE_FIX') return 'Stale fix';
  if (resolutionReason === 'LOW_ACCURACY') return 'Low accuracy';
  if (resolutionReason === 'STATEMENT_MISMATCH') return 'Statement mismatch';
  if (resolutionReason === 'STATEMENT_ALIAS') return 'Statement alias';
  if (resolutionReason === 'AMBIGUOUS_NEIGHBOURS') return 'Ambiguous';
  if (resolutionReason === 'DRIVER_CLAIM') return 'Driver claim';
  if (resolutionReason === 'DRIVER_CLAIM_CONFLICT') return 'Claim conflict';
  if (resolutionReason === 'NO_GPS') return 'No GPS';
  if (resolutionReason === 'NO_STATION_NEARBY') return 'New location';
  return null;
}

export function shortBlockedReason(row: UnresolvedStopRow): string {
  if (row.linkage === 'provisional') {
    if (row.provisional?.metadata?.handReview?.reason) return 'Hand review';
    return (
      reasonLabel(row.provisional?.metadata?.stationResolution?.reason) || 'Provisional'
    );
  }
  const e = row.evidence as
    | { gateReason?: string; holdReason?: string; metadata?: { stationResolution?: { reason?: string } } }
    | undefined;
  const fromEvidence = reasonLabel(e?.metadata?.stationResolution?.reason);
  if (fromEvidence) return fromEvidence;
  // G2: location-only rows stamp reason on learnt
  const fromLearnt = reasonLabel(row.learnt?.reason);
  if (fromLearnt) return fromLearnt;
  if (!e) return row.learnt?.gateReason || 'Location staging';
  const combined = [e.gateReason, e.holdReason].filter(Boolean).join(' ');
  if (/unverified\s+station/i.test(combined)) return 'Unverified station';
  if (/no gps/i.test(combined)) return 'No GPS';
  const beforeDash = combined.split(/\s*[—–]\s*/)[0]?.trim();
  return beforeDash || combined || '—';
}

export function fullBlockedDetail(row: UnresolvedStopRow): string {
  const e = row.evidence;
  if (!e) return row.learnt?.gateReason || 'Learnt location awaiting station match';
  const parts = [e.gateReason, e.holdReason].filter(Boolean);
  return parts.join(' · ') || '—';
}

export function rowHasGps(row: UnresolvedStopRow): boolean {
  if (row.provisional?.lat != null && row.provisional?.lng != null) return true;
  if (row.evidence?.hasGps && row.evidence.lat != null && row.evidence.lng != null) return true;
  const lat = row.learnt?.location?.lat;
  const lng = row.learnt?.location?.lng;
  return lat != null && lng != null && lat !== 0 && lng !== 0;
}

export function rowCoords(row: UnresolvedStopRow): { lat: number; lng: number; accuracy?: number } | null {
  if (row.provisional?.lat != null && row.provisional?.lng != null) {
    return {
      lat: row.provisional.lat,
      lng: row.provisional.lng,
      accuracy: row.provisional.accuracy ?? undefined,
    };
  }
  if (row.evidence?.hasGps && row.evidence.lat != null && row.evidence.lng != null) {
    return { lat: row.evidence.lat, lng: row.evidence.lng, accuracy: row.evidence.accuracy };
  }
  const lat = row.learnt?.location?.lat;
  const lng = row.learnt?.location?.lng;
  if (lat != null && lng != null) {
    return { lat, lng, accuracy: row.learnt?.location?.accuracy };
  }
  return null;
}

export function rowDisplayName(row: UnresolvedStopRow): string {
  return (
    row.provisional?.vendor ||
    row.evidence?.vendor ||
    row.evidence?.description ||
    row.learnt?.name ||
    'Unknown Merchant'
  );
}

/** Statement / JAA merchant when known (shown alongside staging name). */
export function rowStatementMerchant(row: UnresolvedStopRow): string | null {
  const fromProv = row.provisional?.metadata?.statementMerchant || row.provisional?.metadata?.jaaStation;
  if (fromProv && String(fromProv).trim()) return String(fromProv).trim();
  const e = row.evidence as { jaaStation?: string; metadata?: Record<string, unknown> } | undefined;
  const fromEvidence =
    e?.jaaStation ||
    (typeof e?.metadata?.jaaStation === 'string' ? e.metadata.jaaStation : null) ||
    (typeof e?.metadata?.jaaVendorRaw === 'string' ? e.metadata.jaaVendorRaw : null);
  if (fromEvidence && String(fromEvidence).trim()) return String(fromEvidence).trim();
  const learntMeta = row.learnt?.statementMerchant;
  return learntMeta?.trim() || null;
}

export function rowResolutionReason(row: UnresolvedStopRow): string | null {
  return (
    row.provisional?.metadata?.stationResolution?.reason ||
    (row.evidence as { metadata?: { stationResolution?: { reason?: string } } } | undefined)?.metadata
      ?.stationResolution?.reason ||
    row.learnt?.reason ||
    null
  );
}

export function rowToLearntShape(
  row: UnresolvedStopRow,
  learntId: string,
  nearby?: { id: string; name: string; distance: number } | null,
) {
  const coords = rowCoords(row);
  return {
    id: learntId,
    name: rowDisplayName(row),
    location: {
      lat: coords?.lat ?? 0,
      lng: coords?.lng ?? 0,
      accuracy: coords?.accuracy,
    },
    timestamp: row.evidence?.date || row.learnt?.timestamp || new Date().toISOString(),
    transactionId: row.evidence?.id || row.learnt?.transactionId,
    nearbyStation: nearby || row.learnt?.nearbyStation || undefined,
  };
}

interface UseUnresolvedStopActionsOptions {
  verifiedStations: StationProfile[];
  unverifiedStations: StationProfile[];
  onRefresh: () => Promise<void>;
  onPromoted?: () => void;
  onVerifyLocation?: (learntLocation: ReturnType<typeof rowToLearntShape>) => void;
}

export function useUnresolvedStopActions({
  verifiedStations,
  unverifiedStations,
  onRefresh,
  onPromoted,
  onVerifyLocation,
}: UseUnresolvedStopActionsOptions) {
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('Incorrect GPS coordinates');
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<UnresolvedStopRow | null>(null);
  const [mergeSearch, setMergeSearch] = useState('');
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [mergingRow, setMergingRow] = useState<UnresolvedStopRow | null>(null);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkingRow, setLinkingRow] = useState<UnresolvedStopRow | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkSortBy, setLinkSortBy] = useState<'distance' | 'name'>('distance');
  const [selectedLinkStation, setSelectedLinkStation] = useState<string | null>(null);
  const [rememberMerchantName, setRememberMerchantName] = useState(true);
  const [addGpsAliasOnLink, setAddGpsAliasOnLink] = useState(false);

  // Merge/Link pickers: GOD list only — never offer CSV Unverified as merge target
  const filteredStations = verifiedStations.filter(
    (s) =>
      s.name?.toLowerCase().includes(mergeSearch.toLowerCase()) ||
      s.brand?.toLowerCase().includes(mergeSearch.toLowerCase()),
  );

  /** Suggest verified GOD stations within 1 km (late logs often land 150–1000 m away). */
  const SUGGEST_RADIUS_M = 1000;

  const nearestWithin150 = useCallback(
    (row: UnresolvedStopRow): { id: string; name: string; distance: number; status?: string } | null => {
      const coords = rowCoords(row);
      if (!coords) return null;
      if (row.learnt?.nearbyStation && row.learnt.nearbyStation.distance <= SUGGEST_RADIUS_M) {
        const nearbyId = row.learnt.nearbyStation.id;
        const fromList = verifiedStations.find((s) => s.id === nearbyId);
        // Require GOD list hit — never promote a CSV nearbyStation to verified suggestion
        if (fromList) {
          return {
            ...row.learnt.nearbyStation,
            status: fromList.status || 'verified',
          };
        }
      }
      let best: { id: string; name: string; distance: number; status?: string } | null = null;
      for (const s of verifiedStations) {
        if (!s.location?.lat || !s.location?.lng) continue;
        const d = Math.round(calculateDistance(coords.lat, coords.lng, s.location.lat, s.location.lng));
        if (d <= SUGGEST_RADIUS_M && (!best || d < best.distance)) {
          best = { id: s.id, name: s.name || s.id, distance: d, status: s.status };
        }
      }
      return best;
    },
    [verifiedStations],
  );

  const linkStationsWithDistance = useMemo(() => {
    if (!linkingRow) return [];
    // No GPS (e.g. hand-review statement row): list all GOD stations, distance unknown
    const coords = rowCoords(linkingRow);
    // GOD list only for link/merge
    const enriched = verifiedStations.map((station) => {
      const sLat = station.location?.lat ?? 0;
      const sLng = station.location?.lng ?? 0;
      const distM = coords && sLat && sLng
        ? Math.round(calculateDistance(coords.lat, coords.lng, sLat, sLng))
        : Infinity;
      return { ...station, _distance: distM };
    });
    const searchLower = linkSearch.toLowerCase();
    const filtered = searchLower
      ? enriched.filter(
          (s) =>
            s.name?.toLowerCase().includes(searchLower) ||
            s.brand?.toLowerCase().includes(searchLower) ||
            s.plusCode?.toLowerCase().includes(searchLower) ||
            s.address?.toLowerCase().includes(searchLower),
        )
      : enriched;
    if (linkSortBy === 'distance' && coords) {
      filtered.sort((a, b) => a._distance - b._distance);
    } else {
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return filtered;
  }, [linkingRow, verifiedStations, linkSearch, linkSortBy]);

  const handleDeleteCsvReference = async (stationId: string) => {
    try {
      setActionId(stationId);
      await api.deleteStation(stationId);
      toast.success('CSV reference deleted. Verify Location to add your GOD pin.');
      await onRefresh();
      onPromoted?.();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete CSV reference');
    } finally {
      setActionId(null);
    }
  };

  const resolveLearntId = async (row: UnresolvedStopRow): Promise<string> => {
    if (row.learnt?.id) return row.learnt.id;
    if (row.evidence) {
      if (row.evidence.learntLocationId) return row.evidence.learntLocationId;
      const ensured = await api.ensureLearntForGateHeldTransaction(row.evidence.id);
      return ensured.learntId;
    }
    throw new Error('No learnt staging row available');
  };

  const handlePromote = async (row: UnresolvedStopRow) => {
    const actionKey = row.evidence?.id || row.learnt?.id || '';
    try {
      setActionId(actionKey);
      const learntId = await resolveLearntId(row);
      const stationData: Partial<StationProfile> = {
        name: rowDisplayName(row) || 'New Verified Station',
        brand: 'Independent',
        address: 'Street Address Required',
        city: 'Kingston',
        parish: 'St. Andrew',
        country: 'Jamaica',
        status: 'verified',
        dataSource: 'manual',
        amenities: [],
        contactInfo: {},
        isPreferred: false,
        stats: {
          avgPrice: 0,
          lastPrice: 0,
          priceTrend: 'Stable',
          totalVisits: 1,
          rating: 0,
          lastUpdated: new Date().toISOString(),
        },
      };
      const promoteResult = await api.promoteLearntLocationToMaster({
        learntId,
        action: 'create',
        stationData,
      });
      if (promoteResult?.autoMerged) {
        const linked = promoteResult?.linkedEntries || 0;
        const mergedName = promoteResult?.data?.name || 'existing station';
        toast.success(`Duplicate detected! Auto-merged into "${mergedName}".`, {
          description: `${promoteResult.message}${linked > 0 ? ` ${linked} transaction${linked > 1 ? 's' : ''} linked.` : ''}`,
        });
      } else {
        toast.success('Location promoted to Verified Master Ledger');
      }
      await onRefresh();
      onPromoted?.();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to promote location');
    } finally {
      setActionId(null);
    }
  };

  /** Same brand within 500 m of the chosen GOD station → warn before link. */
  const warnSameBrandNearby = (targetStationId: string, coords: { lat: number; lng: number } | null) => {
    const target = verifiedStations.find((s) => s.id === targetStationId);
    const brand = String(target?.brand || '').trim().toLowerCase();
    if (!brand || !coords) return;
    const rival = verifiedStations.find((s) => {
      if (s.id === targetStationId) return false;
      if (String(s.brand || '').trim().toLowerCase() !== brand) return false;
      if (!s.location?.lat || !s.location?.lng) return false;
      const d = calculateDistance(coords.lat, coords.lng, s.location.lat, s.location.lng);
      return d <= 500;
    });
    if (rival) {
      toast.warning(`Same brand within 500 m: "${rival.name}" — confirm this is the right pin.`);
    }
  };

  /** Link fill = attach records to GOD station without adding a GPS alias (default). */
  const handleMergeToStation = async (
    row: UnresolvedStopRow,
    targetStationId: string,
    opts?: { addGpsAlias?: boolean; rememberMerchantName?: string },
  ) => {
    const actionKey = row.evidence?.id || row.learnt?.id || row.provisional?.id || '';
    try {
      setActionId(actionKey);
      warnSameBrandNearby(targetStationId, rowCoords(row));
      if (row.linkage === 'provisional' && row.provisional) {
        await api.confirmProvisionalFill(row.provisional.id, targetStationId);
        toast.success('Provisional fill confirmed → verified station');
      } else if (row.evidence && (row.linkage === 'linked' || row.linkage === 'payment_only')) {
        await api.mergeGateHeldTransactionToStation(row.evidence.id, targetStationId, {
          addGpsAlias: opts?.addGpsAlias,
        });
        toast.success(
          opts?.addGpsAlias
            ? 'Merged into station with GPS alias — gate released.'
            : 'Fill linked to station — gate-held transaction released (no GPS alias).',
        );
      } else if (row.learnt) {
        await api.promoteLearntLocationToMaster({
          learntId: row.learnt.id,
          action: 'merge',
          targetStationId,
          addGpsAlias: opts?.addGpsAlias,
          rememberMerchantName: opts?.rememberMerchantName,
        });
        toast.success(
          opts?.addGpsAlias ? 'Location merged with GPS alias' : 'Fill linked to station (no GPS alias)',
        );
      }
      await onRefresh();
      onPromoted?.();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to link fill');
    } finally {
      setActionId(null);
    }
  };

  /** Confirm provisional using its matchedStationId (GPS near-miss). */
  const handleConfirmProvisional = async (row: UnresolvedStopRow) => {
    const stationId = row.provisional?.matchedStationId;
    if (!row.provisional || !stationId) {
      toast.error('No suggested station on this provisional fill — use Link.');
      return;
    }
    await handleMergeToStation(row, stationId);
  };

  /** Hand review: admin checked the pair and keeps the row as it is (clears the stamp). */
  const handleDismissHandReview = async (row: UnresolvedStopRow) => {
    if (!row.provisional?.id) return;
    const actionKey = row.provisional.id;
    try {
      setActionId(actionKey);
      await api.dismissHandReview(row.provisional.id);
      toast.success('Hand review cleared — row kept as is');
      await onRefresh();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to clear hand review');
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async () => {
    if (!selectedRow) return;
    const actionKey = selectedRow.evidence?.id || selectedRow.learnt?.id || '';
    try {
      setActionId(actionKey);
      const learntId = await resolveLearntId(selectedRow);
      await api.rejectLearntLocation(learntId, rejectReason);
      toast.success('Location flagged as anomaly');
      setIsRejectDialogOpen(false);
      await onRefresh();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to reject');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedRow) return;
    const actionKey = selectedRow.evidence?.id || selectedRow.learnt?.id || '';
    try {
      setActionId(actionKey);
      if (selectedRow.evidence && (selectedRow.linkage === 'linked' || selectedRow.linkage === 'payment_only')) {
        const result = await api.deleteGateHeldEvidence(selectedRow.evidence.id);
        toast.success(
          result.learntDeleted
            ? 'Gate-held transaction and learnt staging permanently deleted'
            : 'Gate-held transaction permanently deleted',
        );
      } else if (selectedRow.learnt) {
        const result = await api.deleteLearntLocation(selectedRow.learnt.id);
        toast.success(
          result.transactionDeleted
            ? 'Location and linked transaction permanently deleted'
            : 'Location permanently deleted',
        );
      }
      setIsDeleteDialogOpen(false);
      setSelectedRow(null);
      await onRefresh();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete');
    } finally {
      setActionId(null);
    }
  };

  const handleLinkConfirm = async () => {
    if (!linkingRow || !selectedLinkStation) return;
    const actionKey = linkingRow.evidence?.id || linkingRow.learnt?.id || '';
    try {
      setActionId(actionKey);
      const statementName = rowStatementMerchant(linkingRow);
      await handleMergeToStation(linkingRow, selectedLinkStation, {
        addGpsAlias: addGpsAliasOnLink,
        rememberMerchantName:
          rememberMerchantName && statementName ? statementName : undefined,
      });
      setIsLinkDialogOpen(false);
      setLinkingRow(null);
      setSelectedLinkStation(null);
      setLinkSearch('');
      setRememberMerchantName(true);
      setAddGpsAliasOnLink(false);
    } catch {
      /* handleMergeToStation already toasts */
    } finally {
      setActionId(null);
    }
  };

  /** Open Link dialog with remember-name defaulted from statement merchant. */
  const openLinkDialog = (row: UnresolvedStopRow) => {
    setLinkingRow(row);
    setSelectedLinkStation(null);
    setLinkSearch('');
    // Suspicious hand-review pairs must not teach the alias registry by default
    setRememberMerchantName(
      !!rowStatementMerchant(row) && !row.provisional?.metadata?.handReview?.reason,
    );
    setAddGpsAliasOnLink(false);
    setIsLinkDialogOpen(true);
  };

  const openVerifyFlow = async (row: UnresolvedStopRow) => {
    if (!onVerifyLocation) return;
    const actionKey = row.evidence?.id || row.learnt?.id || '';
    try {
      setActionId(actionKey);
      const learntId = await resolveLearntId(row);
      const nearby = nearestWithin150(row);
      onVerifyLocation(rowToLearntShape(row, learntId, nearby));
    } catch (e: any) {
      toast.error(e?.message || 'Cannot open verify flow — missing GPS or staging.');
    } finally {
      setActionId(null);
    }
  };

  const formatDistance = (m: number): string => {
    if (m === Infinity) return '—';
    if (m < 1000) return `${m}m`;
    return `${(m / 1000).toFixed(1)}km`;
  };

  const distanceColor = (m: number): string => {
    if (m <= 150) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (m <= 500) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-red-50 text-red-700 border-red-200';
  };

  return {
    actionId,
    rejectReason,
    setRejectReason,
    isRejectDialogOpen,
    setIsRejectDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    selectedRow,
    setSelectedRow,
    mergeSearch,
    setMergeSearch,
    isMergeDialogOpen,
    setIsMergeDialogOpen,
    mergingRow,
    setMergingRow,
    isLinkDialogOpen,
    setIsLinkDialogOpen,
    linkingRow,
    setLinkingRow,
    linkSearch,
    setLinkSearch,
    linkSortBy,
    setLinkSortBy,
    selectedLinkStation,
    setSelectedLinkStation,
    rememberMerchantName,
    setRememberMerchantName,
    addGpsAliasOnLink,
    setAddGpsAliasOnLink,
    filteredStations,
    linkStationsWithDistance,
    nearestWithin150,
    formatDistance,
    distanceColor,
    handlePromote,
    handleMergeToStation,
    handleConfirmProvisional,
    handleDismissHandReview,
    handleDeleteCsvReference,
    handleReject,
    handleDelete,
    handleLinkConfirm,
    openLinkDialog,
    openVerifyFlow,
  };
}
