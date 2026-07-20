import { useCallback, useMemo, useState } from 'react';
import { api } from '../../../services/api';
import { toast } from 'sonner@2.0.3';
import { StationProfile } from '../../../types/station';
import { calculateDistance } from '../../../utils/stationUtils';
import type { LearntLocationDto, StationGateEvidenceRow, UnresolvedStopRow } from './resolutionQueueTypes';

export function formatQueueDate(dateStr?: string): string {
  if (!dateStr) return '—';
  if (dateStr.includes('-') && dateStr.length === 10) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString();
  }
  return new Date(dateStr).toLocaleDateString();
}

export function shortBlockedReason(row: UnresolvedStopRow): string {
  const e = row.evidence;
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
  if (row.evidence?.hasGps && row.evidence.lat != null && row.evidence.lng != null) return true;
  const lat = row.learnt?.location?.lat;
  const lng = row.learnt?.location?.lng;
  return lat != null && lng != null && lat !== 0 && lng !== 0;
}

export function rowCoords(row: UnresolvedStopRow): { lat: number; lng: number; accuracy?: number } | null {
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
    row.evidence?.vendor ||
    row.evidence?.description ||
    row.learnt?.name ||
    'Unknown Merchant'
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

  const allStations = useMemo(
    () => [...verifiedStations, ...unverifiedStations],
    [verifiedStations, unverifiedStations],
  );

  // Merge/Link pickers: GOD list only — never offer CSV Unverified as merge target
  const filteredStations = verifiedStations.filter(
    (s) =>
      s.name?.toLowerCase().includes(mergeSearch.toLowerCase()) ||
      s.brand?.toLowerCase().includes(mergeSearch.toLowerCase()),
  );

  const nearestWithin150 = useCallback(
    (row: UnresolvedStopRow): { id: string; name: string; distance: number; status?: string } | null => {
      const coords = rowCoords(row);
      if (!coords) return null;
      if (row.learnt?.nearbyStation && row.learnt.nearbyStation.distance <= 150) {
        const nearbyId = row.learnt.nearbyStation.id;
        const fromList = allStations.find((s) => s.id === nearbyId);
        return {
          ...row.learnt.nearbyStation,
          status: fromList?.status || 'unverified',
        };
      }
      let best: { id: string; name: string; distance: number; status?: string } | null = null;
      for (const s of allStations) {
        if (!s.location?.lat || !s.location?.lng) continue;
        const d = Math.round(calculateDistance(coords.lat, coords.lng, s.location.lat, s.location.lng));
        if (d <= 150 && (!best || d < best.distance)) {
          best = { id: s.id, name: s.name || s.id, distance: d, status: s.status };
        }
      }
      return best;
    },
    [allStations],
  );

  const linkStationsWithDistance = useMemo(() => {
    if (!linkingRow) return [];
    const coords = rowCoords(linkingRow);
    if (!coords) return [];
    // GOD list only for link/merge
    const enriched = verifiedStations.map((station) => {
      const sLat = station.location?.lat ?? 0;
      const sLng = station.location?.lng ?? 0;
      const distM = sLat && sLng ? Math.round(calculateDistance(coords.lat, coords.lng, sLat, sLng)) : Infinity;
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
    if (linkSortBy === 'distance') {
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

  const handleMergeToStation = async (row: UnresolvedStopRow, targetStationId: string) => {
    const actionKey = row.evidence?.id || row.learnt?.id || '';
    try {
      setActionId(actionKey);
      if (row.evidence && (row.linkage === 'linked' || row.linkage === 'payment_only')) {
        await api.mergeGateHeldTransactionToStation(row.evidence.id, targetStationId);
        toast.success('Merged into station — gate-held transaction released.');
      } else if (row.learnt) {
        await api.promoteLearntLocationToMaster({
          learntId: row.learnt.id,
          action: 'merge',
          targetStationId,
        });
        toast.success('Location merged into Master Ledger');
      }
      await onRefresh();
      onPromoted?.();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to merge');
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
      await handleMergeToStation(linkingRow, selectedLinkStation);
      setIsLinkDialogOpen(false);
      setLinkingRow(null);
      setSelectedLinkStation(null);
      setLinkSearch('');
    } catch {
      /* handleMergeToStation already toasts */
    } finally {
      setActionId(null);
    }
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
    filteredStations,
    linkStationsWithDistance,
    nearestWithin150,
    formatDistance,
    distanceColor,
    handlePromote,
    handleMergeToStation,
    handleDeleteCsvReference,
    handleReject,
    handleDelete,
    handleLinkConfirm,
    openVerifyFlow,
  };
}
