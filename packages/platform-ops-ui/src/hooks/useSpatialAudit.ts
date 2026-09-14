import { useState, useEffect, useMemo } from 'react';
import { fuelService } from '../services/stationFuelService';
import { trailingDaysWindow } from '../utils/fuelListWindow';
import type { StationProfile } from '../types/station';
import type { FuelEntry } from '../types/fuel';
import {
  normalizeStationFeature,
  normalizeFuelingFeature,
  createDriftLine,
  type MapFeature,
} from '../utils/spatialNormalization';

export interface SpatialAuditData {
  stations: StationProfile[];
  recentFueling: FuelEntry[];
  features: MapFeature[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSpatialAudit(options?: { limit?: number; days?: number }): SpatialAuditData {
  const [stations, setStations] = useState<StationProfile[]>([]);
  const [recentFueling, setRecentFueling] = useState<FuelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [stationsData, fuelData] = await Promise.all([
        fuelService.getStations(),
        fuelService.getFuelEntries({
          limit: options?.limit || 500,
          ...trailingDaysWindow(options?.days || 30),
        }),
      ]);

      setStations(stationsData as StationProfile[]);
      setRecentFueling(fuelData);
    } catch (err: unknown) {
      console.error('[useSpatialAudit] Failed to fetch spatial data:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load spatial integrity data',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load (parity with fleet)
  }, []);

  const features = useMemo(() => {
    const result: MapFeature[] = [];

    stations.forEach((station) => {
      result.push(normalizeStationFeature(station));
    });

    recentFueling.forEach((entry) => {
      const fuelingFeature = normalizeFuelingFeature(entry);
      if (fuelingFeature) {
        result.push(fuelingFeature);

        if (entry.matchedStationId) {
          const station = stations.find((s) => s.id === entry.matchedStationId);
          if (station) {
            const driftLine = createDriftLine(entry, station);
            if (driftLine) {
              result.push(driftLine);
            }
          }
        }
      }
    });

    return result;
  }, [stations, recentFueling]);

  return {
    stations,
    recentFueling,
    features,
    loading,
    error,
    refresh: fetchData,
  };
}
