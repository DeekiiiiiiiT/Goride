import React, { useCallback, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { StationOverride, StationProfile } from '../types/station';
import { generateStationId, normalizeStationName } from '../utils/stationUtils';
import { api } from '../services/stationOpsApi';
import { fuelService } from '../services/stationFuelService';
import type { DuplicateStationInfo } from './AddStationModal';

export type UseLearntVerifyModalOptions = {
  onAfterSuccess: () => void | Promise<void>;
  getStationOverride?: (stationId: string) => StationOverride | null | undefined;
};

export function useLearntVerifyModal({ onAfterSuccess, getStationOverride }: UseLearntVerifyModalOptions) {
  const [verifyingLearntId, setVerifyingLearntId] = useState<string | null>(null);
  const [verifyingNearbyStation, setVerifyingNearbyStation] = useState<DuplicateStationInfo | null>(null);
  const [pseudoStation, setPseudoStation] = useState<StationProfile | null>(null);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);

  const closeVerify = useCallback(() => {
    setVerifyingLearntId(null);
    setVerifyingNearbyStation(null);
    setPseudoStation(null);
    setIsVerifyOpen(false);
  }, []);

  const handleVerifyLearntLocation = useCallback(
    (learntLoc: unknown) => {
      const raw = (learntLoc && typeof learntLoc === 'object' ? learntLoc : {}) as Record<string, unknown>;
      const loc = raw.location as { lat?: number; lng?: number } | undefined;
      const nextPseudo: StationProfile = {
        id: generateStationId(
          normalizeStationName(String(raw.name || 'Unknown Station')),
          String(raw.address || `${loc?.lat ?? 0},${loc?.lng ?? 0}`),
        ),
        name: String(raw.name || 'Unknown Station'),
        brand: String(raw.brand || 'Independent'),
        address: String(raw.address || ''),
        city: String(raw.city || ''),
        parish: String(raw.parish || ''),
        country: String(raw.country || 'Jamaica'),
        plusCode: String(raw.plusCode || ''),
        location: {
          lat: loc?.lat ?? 0,
          lng: loc?.lng ?? 0,
        },
        isPreferred: false,
        stats: {
          avgPrice: 0,
          lastPrice: 0,
          priceTrend: 'Stable',
          totalVisits: 1,
          rating: 0,
          lastUpdated: String(raw.timestamp || new Date().toISOString()),
        },
        amenities: [],
        dataSource: 'manual',
        contactInfo: {},
        status: 'unverified',
        operationalStatus: 'active',
        category: 'fuel',
      } as StationProfile;

      setPseudoStation(nextPseudo);
      setVerifyingLearntId(String(raw.id));

      const nearby = (raw.nearbyStation || null) as Record<string, unknown> | null;
      if (nearby?.id) {
        const fromStore = getStationOverride?.(String(nearby.id));
        setVerifyingNearbyStation({
          id: String(nearby.id),
          name: String(nearby.name || ''),
          status: String(fromStore?.status || nearby.status || 'unverified'),
          brand: String(fromStore?.brand || nearby.brand || ''),
          address: String(fromStore?.address || nearby.address || ''),
          plusCode: String(fromStore?.plusCode || nearby.plusCode || ''),
          geofenceRadius: fromStore?.geofenceRadius ?? (nearby.geofenceRadius as number | undefined),
          distance: Number(nearby.distance) || 0,
          matchType: (nearby.matchType === 'pluscode' ? 'pluscode' : 'geofence') as 'pluscode' | 'geofence',
        });
      } else {
        setVerifyingNearbyStation(null);
      }
      setIsVerifyOpen(true);
    },
    [getStationOverride],
  );

  const onDeleteCsvReference = useCallback(
    async (stationId: string) => {
      await fuelService.deleteStation(stationId);
      await onAfterSuccess();
    },
    [onAfterSuccess],
  );

  const onMergeIntoExisting = useCallback(
    async (existingStationId: string) => {
      if (!verifyingLearntId) {
        toast.info('Station already exists on the GOD list. No new station was created.');
        return;
      }
      const promoteResult = await api.promoteLearntLocationToMaster({
        learntId: verifyingLearntId,
        action: 'merge',
        targetStationId: existingStationId,
      });
      const linked = promoteResult?.linkedEntries || 0;
      toast.success('Merged into Verified GOD station.', {
        description:
          linked > 0
            ? `${linked} fuel transaction${linked > 1 ? 's' : ''} linked.`
            : 'Learnt staging cleared.',
        icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
      });
      closeVerify();
      await onAfterSuccess();
    },
    [verifyingLearntId, closeVerify, onAfterSuccess],
  );

  const onVerifyUpdate = useCallback(
    async (_id: string, stationData: StationOverride) => {
      if (!verifyingLearntId) return;
      try {
        const promoteResult = await api.promoteLearntLocationToMaster({
          learntId: verifyingLearntId,
          action: 'create',
          stationData: {
            ...stationData,
            status: 'verified',
            dataSource: 'manual',
          },
        });

        if (promoteResult?.autoMerged) {
          const linked = promoteResult?.linkedEntries || 0;
          const mergedName = promoteResult?.data?.name || 'existing GOD station';
          toast.success(`Matched existing GOD station "${mergedName}".`, {
            description: `${promoteResult.message || ''}${linked > 0 ? ` ${linked} transaction${linked > 1 ? 's' : ''} linked.` : ''}`,
            icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
          });
        } else {
          const linked = promoteResult?.linkedEntries || 0;
          toast.success('Saved to Verified GOD list from your location.', {
            description:
              linked > 0
                ? `${linked} fuel transaction${linked > 1 ? 's' : ''} linked.`
                : 'Payment holds for this stop will clear when matching picks up your pin.',
            icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
          });
        }
        closeVerify();
        await onAfterSuccess();
      } catch (promoteErr: unknown) {
        console.error('[Verify Learnt] Failed to promote:', promoteErr);
        const message = promoteErr instanceof Error ? promoteErr.message : 'Failed to save Verified GOD station.';
        toast.error(message);
        throw promoteErr;
      }
    },
    [verifyingLearntId, closeVerify, onAfterSuccess],
  );

  const onAddForModal = useCallback(
    async (station: StationOverride) => {
      await fuelService.saveStation(station);
      await onAfterSuccess();
    },
    [onAfterSuccess],
  );

  const verifyModalProps = {
    isOpen: isVerifyOpen,
    onClose: closeVerify,
    editStation: pseudoStation,
    verifyAsGodList: !!verifyingLearntId,
    initialNearbyStation: verifyingNearbyStation,
    onDeleteCsvReference,
    onMergeIntoExisting,
    onUpdate: onVerifyUpdate,
  };

  return {
    verifyingLearntId,
    verifyingNearbyStation,
    pseudoStation,
    isVerifyOpen,
    handleVerifyLearntLocation,
    closeVerify,
    onDeleteCsvReference,
    onMergeIntoExisting,
    onVerifyUpdate,
    onAddForModal,
    verifyModalProps,
  };
}