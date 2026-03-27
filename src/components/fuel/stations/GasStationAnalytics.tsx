import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FuelEntry } from '../../../types/fuel';
import { StationProfile, StationOverride } from '../../../types/station';
import { aggregateStations, calculateRegionalStats, calculateDistance, generateStationId, normalizeStationName } from '../../../utils/stationUtils';

/** Shortest distance to station primary + gpsAliases (parity with server geo_matcher). */
function shortestDistanceMeters(lat: number, lng: number, station: StationProfile): number {
  let d = calculateDistance(lat, lng, station.location.lat, station.location.lng);
  const aliases = (station as any).gpsAliases;
  if (Array.isArray(aliases)) {
    for (const a of aliases) {
      if (a?.lat != null && a?.lng != null) {
        const ad = calculateDistance(lat, lng, a.lat, a.lng);
        if (ad < d) d = ad;
      }
    }
  }
  return d;
}
import { fuelService } from '../../../services/fuelService';
import { toast } from 'sonner@2.0.3';
import { StationDashboard } from './StationDashboard';
import { StationMap } from './StationMap';
import { StationList } from './StationList';
import { StationDetailView } from './StationDetailView';
import { TransactionExport } from './TransactionExport';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { Button } from '../../ui/button';
import { Loader2, Filter, X } from 'lucide-react';
import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "../../ui/date-range-picker";
import { isWithinInterval, startOfDay, endOfDay } from 'date-fns';

interface GasStationAnalyticsProps {
  logs: FuelEntry[];
  loading?: boolean;
  onRequestRefresh?: () => void;
}

export function GasStationAnalytics({ logs, loading = false, onRequestRefresh }: GasStationAnalyticsProps) {
  const [selectedStation, setSelectedStation] = useState<StationProfile | null>(null);
  const [masterStations, setMasterStations] = useState<StationProfile[]>([]);
  const [isDataSyncing, setIsDataSyncing] = useState(false);
  const [purchaseDateRange, setPurchaseDateRange] = useState<DateRange | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Phase 11: Master Ledger Sync
  // Load verified stations from the cloud to power the Evidence Bridge
  useEffect(() => {
    const syncMasterLedger = async () => {
      setIsDataSyncing(true);
      try {
        const cloudStations = await fuelService.getStations();
        setMasterStations(cloudStations);
      } catch (e) {
        console.error('Failed to sync Master Ledger for analytics', e);
        toast.error("Analytics sync warning: Master Ledger unavailable.");
      } finally {
        setIsDataSyncing(false);
      }
    };
    syncMasterLedger();
  }, [refreshKey]);

  // Helper to generate context from logs with Evidence Bridge resolution
  const buildContext = useCallback((inputLogs: FuelEntry[]) => {
    // Build a lookup map for master stations by ID
    const masterById = new Map(masterStations.map(s => [s.id, s]));

    // 1. Evidence Bridge: Resolve logs to Verified Stations
    // Priority: matchedStationId (server-side link) > geofence-aware GPS bridge > vendor name as-is
    const resolvedLogs = inputLogs.map(log => {
      // Phase 11: First check if the log already has a server-side station match.
      // This covers transactions matched by the reconciler, sync-orphans, or auto-cleanup.
      const linkedStationId = log.matchedStationId || log.metadata?.matchedStationId;
      if (linkedStationId) {
        const master = masterById.get(linkedStationId);
        if (master) {
          return {
            ...log,
            location: master.name,
            stationAddress: master.address || log.stationAddress,
            matchedStationId: linkedStationId,
            metadata: {
              ...log.metadata,
              bridgedStationId: linkedStationId,
              bridgeSource: 'server_matched',
            }
          };
        }
        // Station ID exists but not in master list — keep the matchedStationId 
        // so aggregation still groups correctly
        return log;
      }

      // If the log has a known location (not Unknown), keep as-is
      if (log.location && log.location !== 'Unknown' && log.location !== 'Manual Entry' && !log.location.includes('Unknown')) {
        return log;
      }

      // Client-only bridge: same rule as server smart match — within per-station geofence (+ GPS accuracy).
      // Do not use a flat 600m radius; that over-attached logs outside Regional Efficiency.
      const lat = log.locationMetadata?.lat || log.metadata?.location?.lat;
      const lng = log.locationMetadata?.lng || log.metadata?.location?.lng;

      if (lat && lng) {
        const gpsAcc =
          Number(log.locationMetadata?.accuracy ?? log.metadata?.locationMetadata?.accuracy ?? (log as any).geofenceMetadata?.accuracy ?? 0) || 0;

        let closestStation: StationProfile | null = null;
        let minDistance = Infinity;

        for (const station of masterStations.filter((s) => s.status === 'verified')) {
          const dist = shortestDistanceMeters(lat, lng, station);
          const R = station.geofenceRadius ?? 150;
          if (dist <= R + gpsAcc && dist < minDistance) {
            minDistance = dist;
            closestStation = station;
          }
        }

        if (closestStation) {
          return {
            ...log,
            location: closestStation.name,
            stationAddress: closestStation.address,
            matchedStationId: closestStation.id,
            metadata: {
              ...log.metadata,
              bridgedStationId: closestStation.id,
              bridgeDistance: minDistance,
              bridgeSource: 'gps_proximity_geofence',
            },
          };
        }
      }
      return log;
    });

    // 2. Aggregate resolved logs (now groups by matchedStationId when present)
    const rawStations = aggregateStations(resolvedLogs);
    const stationMap = new Map(rawStations.map(s => [s.id, s]));

    // 3. Apply Master Metadata Overrides
    // Now that aggregation groups by matchedStationId (UUID), this will match correctly
    masterStations.forEach(master => {
      if (stationMap.has(master.id)) {
        const existing = stationMap.get(master.id)!;
        stationMap.set(master.id, {
           ...existing,
           name: master.name || existing.name,
           address: master.address || existing.address,
           brand: master.brand || existing.brand,
           location: master.location || existing.location,
           plusCode: master.plusCode || existing.plusCode,
           city: master.city || existing.city,
           parish: master.parish || existing.parish,
           status: master.status || existing.status,
           // Merge stats: favor the calculated aggregate for visits/prices
           stats: {
             ...existing.stats,
             rating: master.stats?.rating || 0,
           }
        });
      }
    });

    const stations = Array.from(stationMap.values());
    const regionalStats = calculateRegionalStats(stations); 
    
    return {
      stations,
      regionalStats,
      resolvedLogs,
      loading: loading || isDataSyncing,
      togglePreferred: () => {},
      updateStationDetails: () => {}
    };
  }, [loading, isDataSyncing, masterStations]);

  const context = useMemo(() => buildContext(logs), [buildContext, logs]);

  const purchaseDataLogs = useMemo(() => {
    const rLogs = context.resolvedLogs || [];
    if (!purchaseDateRange?.from) return rLogs;
    return rLogs.filter(log => {
      const logDate = new Date(log.date);
      const from = startOfDay(purchaseDateRange.from!);
      const to = purchaseDateRange.to ? endOfDay(purchaseDateRange.to) : endOfDay(purchaseDateRange.from!);
      return isWithinInterval(logDate, { start: from, end: to });
    });
  }, [context.resolvedLogs, purchaseDateRange]);

  const purchaseContext = useMemo(() => buildContext(purchaseDataLogs), [buildContext, purchaseDataLogs]);

  // Bulk Assign: Build a map of stationId -> entryIds[] for the purchase-filtered view
  const stationEntryIdsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    purchaseDataLogs.forEach(log => {
      if (!log.id) return;
      const verifiedId = log.matchedStationId || log.metadata?.matchedStationId || log.metadata?.bridgedStationId;
      const name = normalizeStationName(log.location || 'Unidentified Station');
      const address = log.stationAddress || 'Unknown Address';
      const stationId = verifiedId || generateStationId(name === 'Unknown' || !name ? 'Unidentified Station' : name, address);
      if (!map.has(stationId)) map.set(stationId, []);
      map.get(stationId)!.push(log.id);
    });
    return map;
  }, [purchaseDataLogs]);

  // Bulk Assign: Verified stations available as assignment targets
  const verifiedStations = useMemo(() =>
    masterStations.filter(s => s.status === 'verified'),
    [masterStations]
  );

  // Bulk Assign: Refresh handler — re-syncs master ledger and parent logs after successful assignment
  const handleBulkAssignComplete = useCallback(() => {
    setRefreshKey(k => k + 1);  // Re-fetch master stations
    onRequestRefresh?.();        // Re-fetch fuel entries from parent
  }, [onRequestRefresh]);

  const handleStationSelect = (stationId: string) => {
    const station = context.stations.find(s => s.id === stationId);
    if (station) {
      setSelectedStation(station);
    }
  };

  // Ensure modal gets the latest data
  const activeStation = selectedStation 
    ? context.stations.find(s => s.id === selectedStation.id) || selectedStation 
    : null;

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Dashboard - Analytics Summary */}
      <StationDashboard context={context} logs={logs} />

      {/* Main Content Area */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <Tabs defaultValue="list" className="w-full">
          <div className="border-b border-slate-200 px-4 py-3 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h3 className="font-semibold text-slate-900">Purchase Analytics</h3>
            </div>

            <TabsList>
              <TabsTrigger value="list">Fuel Purchase Data</TabsTrigger>
              <TabsTrigger value="map">Map View</TabsTrigger>
            </TabsList>
          </div>
          
          <div className="p-0">
             {/* --- Transaction History Tab --- */}
            <TabsContent value="list" className="m-0 p-0 border-0">
               <div className="border-b border-slate-100 bg-white p-3 flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center sticky top-0 z-10">
                 <div className="flex items-center gap-2 w-full sm:w-auto">
                     <Filter className="h-4 w-4 text-slate-500" />
                     <span className="text-sm font-medium text-slate-700 whitespace-nowrap">Filter Period:</span>
                     <DatePickerWithRange date={purchaseDateRange} setDate={setPurchaseDateRange} className="w-full sm:w-[260px]" />
                     {purchaseDateRange?.from && (
                         <Button variant="ghost" size="icon" onClick={() => setPurchaseDateRange(undefined)} title="Clear Filter">
                             <X className="h-4 w-4 text-slate-400 hover:text-red-500" />
                         </Button>
                     )}
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="text-xs text-slate-500 hidden sm:block">
                        Showing {purchaseContext.stations.filter(s => s.stats.totalVisits > 0).length} active stations
                    </div>
                    <TransactionExport logs={purchaseDataLogs} filename={`fuel-analytics-${new Date().toISOString().split('T')[0]}`} />
                 </div>
               </div>

               <div className="p-4">
                 <StationList 
                    context={{
                        ...purchaseContext,
                        stations: purchaseContext.stations.filter(s => s.stats.totalVisits > 0)
                    }} 
                    onSelectStation={handleStationSelect} 
                    variant="simple"
                    verifiedStations={verifiedStations}
                    stationEntryIds={stationEntryIdsMap}
                    onBulkAssignComplete={handleBulkAssignComplete}
                 />
               </div>
            </TabsContent>
            
            {/* --- Map View Tab --- */}
            <TabsContent value="map" className="m-0 p-0 border-0">
               <div className="p-4">
                 <StationMap context={context} onSelectStation={handleStationSelect} />
               </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Detail View - Read Only / Drill Down */}
      <StationDetailView 
        station={activeStation} 
        onClose={() => setSelectedStation(null)} 
        logs={context.resolvedLogs || logs}
      />
    </div>
  );
}