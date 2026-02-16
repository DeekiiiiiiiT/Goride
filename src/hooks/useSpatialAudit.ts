import { useState, useEffect, useMemo } from 'react';
import { fuelService } from '../services/fuelService';
import { StationProfile } from '../types/station';
import { FuelEntry } from '../types/fuel';
import { 
  normalizeStationFeature, 
  normalizeFuelingFeature, 
  createDriftLine, 
  MapFeature 
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
        fuelService.getFuelEntries({ limit: options?.limit || 500 })
      ]);

      setStations(stationsData as StationProfile[]);
      setRecentFueling(fuelData);
    } catch (err: any) {
      console.error("[useSpatialAudit] Failed to fetch spatial data:", err);
      setError(err.message || "Failed to load spatial integrity data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const features = useMemo(() => {
    const result: MapFeature[] = [];

    // 1. Stations & Geofences
    stations.forEach(station => {
      result.push(normalizeStationFeature(station));
    });

    // 2. Fueling Points & Drift Lines
    recentFueling.forEach(entry => {
      const fuelingFeature = normalizeFuelingFeature(entry);
      if (fuelingFeature) {
        result.push(fuelingFeature);

        // If matched to a station, create a drift line
        if (entry.matchedStationId) {
          const station = stations.find(s => s.id === entry.matchedStationId);
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
    refresh: fetchData
  };
}
