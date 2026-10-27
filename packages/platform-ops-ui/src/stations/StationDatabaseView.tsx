// Stitch: dominion-redesign/f0b631aa7be947e8b0723b21450816ba
// cache-bust: v1.0.3 - Explicitly standardizing Badge import
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FuelEntry } from '../types/fuel';
import { StationProfile, StationOverride } from '../types/station';
import { aggregateStations, calculateRegionalStats, generateStationId, normalizeStationName } from '../utils/stationUtils';
import { StationDetailView } from './StationDetailView';
import { VerifiedStationsTab } from './VerifiedStationsTab';
import { ResolutionQueueTab } from './ResolutionQueueTab';
import type { ResolutionQueueSubTab } from './ResolutionQueueTab';
import { Loader2, ShieldCheck, ShieldOff, Inbox, MapPin, Search } from 'lucide-react';
import { fuelService } from '../services/stationFuelService';
import { api } from '../services/stationOpsApi';
import { toast } from 'sonner';
import { AddStationModal } from './AddStationModal';

type DominionStationTab = 'stations' | 'verified' | 'resolution';

export type StationFillSummary = {
  stationId: string;
  fillCount: number;
  lastFillAt: string | null;
};

interface StationDatabaseViewProps {
  /** Optional — when omitted (standalone Stations nav), this view loads fuel entries itself. */
  logs?: FuelEntry[];
  /** Staff-only visit counts. When set, this screen does not download customer fuel rows. */
  fillSummary?: StationFillSummary[];
  loading?: boolean;
  /** Top-level Station Database tab to open on load (e.g. resolution-queue for deep links). */
  defaultTab?: string;
  defaultResolutionSubTab?: ResolutionQueueSubTab;
  /** Dominion-only: Silent Attach sub-tab inside Resolution Queue. */
  enableSilentAttach?: boolean;
  silentAttachPanel?: React.ReactNode;
}

export function StationDatabaseView({
  logs: logsFromParent,
  fillSummary,
  loading = false,
  defaultTab = 'stations',
  defaultResolutionSubTab = 'unresolved-stops',
  enableSilentAttach = false,
  silentAttachPanel,
}: StationDatabaseViewProps) {
  const [selectedStation, setSelectedStation] = useState<StationProfile | null>(null);
  const [preferredStationIds, setPreferredStationIds] = useState<Set<string>>(new Set());
  const [stationOverrides, setStationOverrides] = useState<Record<string, StationOverride>>({});
  const [internalLogs, setInternalLogs] = useState<FuelEntry[]>([]);
  const [isBackendLoading, setIsBackendLoading] = useState(false);
  // Parent-supplied logs win; otherwise use self-fetched entries for the standalone page.
  const logs = logsFromParent ?? internalLogs;
  const [isAddStationOpen, setIsAddStationOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<StationProfile | null>(null);
  const [verifyingLearntId, setVerifyingLearntId] = useState<string | null>(null);
  const [verifyingNearbyStation, setVerifyingNearbyStation] = useState<any>(null);
  const [resolutionQueueCount, setResolutionQueueCount] = useState(0);
  const [stationSearch, setStationSearch] = useState('');
  const initialTab: DominionStationTab =
    defaultTab === 'verified-stations' || defaultTab === 'verified'
      ? 'verified'
      : defaultTab === 'resolution-queue' || defaultTab === 'resolution'
        ? 'resolution'
        : 'stations';
  const [activeTab, setActiveTab] = useState<DominionStationTab>(initialTab);

  const handleVerifyLearntLocation = useCallback((learntLoc: any) => {
    const pseudoStation: StationProfile = {
      id: generateStationId(
        normalizeStationName(learntLoc.name || 'Unknown Station'),
        learntLoc.address || `${learntLoc.location?.lat ?? 0},${learntLoc.location?.lng ?? 0}`,
      ),
      name: learntLoc.name || 'Unknown Station',
      brand: learntLoc.brand || 'Independent',
      address: learntLoc.address || '',
      city: learntLoc.city || '',
      parish: learntLoc.parish || '',
      country: learntLoc.country || 'Jamaica',
      plusCode: learntLoc.plusCode || '',
      location: {
        lat: learntLoc.location?.lat ?? 0,
        lng: learntLoc.location?.lng ?? 0,
      },
      isPreferred: false,
      stats: {
        avgPrice: 0,
        lastPrice: 0,
        priceTrend: 'Stable',
        totalVisits: 1,
        rating: 0,
        lastUpdated: learntLoc.timestamp || new Date().toISOString(),
      },
      amenities: [],
      dataSource: 'manual',
      contactInfo: {},
      status: 'unverified',
      operationalStatus: 'active',
      category: 'fuel',
    } as StationProfile;

    setEditingStation(pseudoStation);
    setVerifyingLearntId(learntLoc.id);
    const nearby = learntLoc.nearbyStation || null;
    if (nearby?.id) {
      const fromStore = stationOverrides[nearby.id];
      setVerifyingNearbyStation({
        ...nearby,
        status: fromStore?.status || nearby.status || 'unverified',
        brand: fromStore?.brand || nearby.brand || '',
        address: fromStore?.address || nearby.address || '',
        plusCode: fromStore?.plusCode || nearby.plusCode || '',
        geofenceRadius: fromStore?.geofenceRadius || nearby.geofenceRadius,
        matchType: nearby.matchType || 'geofence',
      });
    } else {
      setVerifyingNearbyStation(null);
    }
    setIsAddStationOpen(true);
  }, [stationOverrides]);

  const fetchData = useCallback(async () => {
    setIsBackendLoading(true);
    try {
      // 1. Stations + (when standalone) fuel entries for visit/stats aggregation
      const [backendStations, fuelEntries] = await Promise.all([
        fuelService.getAllStations({ fields: 'list' }),
        logsFromParent === undefined && fillSummary === undefined
          ? fuelService.getFuelEntries({ limit: 1500 })
          : Promise.resolve(null),
      ]);
      if (fuelEntries) {
        setInternalLogs(Array.isArray(fuelEntries) ? fuelEntries : []);
      }

      const overrides: Record<string, StationOverride> = {};
      backendStations.forEach(s => {
        overrides[s.id] = s;
      });

      // Preferred from server field (source of truth)
      setPreferredStationIds(
        new Set(backendStations.filter((s) => s.isPreferred).map((s) => s.id)),
      );

      // One-time status migration — completion is server-flagged, not localStorage
      try {
        const migFlag = await fuelService.getMigrationFlag('station_status_v1');
        if (!migFlag.done) {
          const result = await fuelService.migrateStationStatuses();
          if (result.patchedCount > 0) {
            console.log(`[Migration] Patched ${result.patchedCount}/${result.totalStations} stations to 'unverified' status.`);
            toast.success(`Station Migration: ${result.patchedCount} stations patched to 'unverified'.`);
          }
          await fuelService.setMigrationFlag('station_status_v1');
        }
      } catch (migErr) {
        console.error('[Migration] Station status migration failed:', migErr);
      }

      // Legacy localStorage overrides — migrate once then clear
      const storedOverrides = localStorage.getItem('station_overrides');
      if (storedOverrides) {
        try {
          const legacyData = JSON.parse(storedOverrides);
          const legacyKeys = Object.keys(legacyData);
          
          if (legacyKeys.length > 0) {
            console.log(`[Migration] Found ${legacyKeys.length} legacy stations. Migrating to Cloud...`);
            
            for (const key of legacyKeys) {
              if (!overrides[key]) {
                const station = legacyData[key];
                if (!station.id) station.id = key;
                await fuelService.saveStation(station);
                overrides[key] = station;
              }
            }
            localStorage.removeItem('station_overrides');
            toast.success(`Migrated ${legacyKeys.length} stations to cloud.`);
          } else {
            localStorage.removeItem('station_overrides');
          }
        } catch (e) {
          console.error('Failed to migrate legacy station overrides', e);
        }
      }

      setStationOverrides(overrides);
    } catch (e) {
      console.error('Failed to load station data from cloud', e);
      toast.error("Could not sync with cloud station database.");
    } finally {
      setIsBackendLoading(false);
    }
  }, [logsFromParent, fillSummary]);

  // Phase 9: Persistent Storage Migration
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Preferred is server-backed via StationProfile.isPreferred
  const togglePreferred = async (id: string) => {
    const currentlyPreferred = preferredStationIds.has(id);
    const nextPreferred = !currentlyPreferred;
    setPreferredStationIds(prev => {
      const next = new Set(prev);
      if (nextPreferred) next.add(id);
      else next.delete(id);
      return next;
    });
    try {
      await updateStationDetails(id, { isPreferred: nextPreferred });
    } catch (e) {
      console.error('Failed to persist preferred station', e);
      toast.error('Could not save preferred station');
      setPreferredStationIds(prev => {
        const next = new Set(prev);
        if (currentlyPreferred) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  };

  // Save Station Overrides (Cloud Persisted)
  const updateStationDetails = async (id: string, details: Partial<StationProfile>) => {
    const current = stationOverrides[id] || {};
    // Empty string clears; undefined keeps previous (??). Falsy || blocked clearing addresses/brands.
    const pickStr = (next: string | undefined, prev: string | undefined) =>
      next !== undefined ? next : prev;
    const updated: StationOverride = {
      ...current,
      id,
      name: pickStr(details.name, current.name),
      address: pickStr(details.address, current.address),
      brand: pickStr(details.brand, current.brand),
      city: pickStr(details.city, current.city),
      parish: pickStr(details.parish, current.parish),
      country: pickStr(details.country, current.country),
      plusCode: pickStr(details.plusCode, current.plusCode),
      geofenceRadius: details.geofenceRadius ?? current.geofenceRadius,
      location: details.location ?? current.location,
      amenities: details.amenities ?? current.amenities,
      contactInfo: details.contactInfo ?? current.contactInfo,
      status: details.status || current.status,
      operationalStatus: details.operationalStatus || current.operationalStatus,
      dataSource: details.dataSource || current.dataSource || 'manual',
      isPreferred: details.isPreferred ?? (current as StationProfile).isPreferred,
    };
    
    // Clean up undefined values
    Object.keys(updated).forEach(key => 
      (updated as any)[key] === undefined && delete (updated as any)[key]
    );

    try {
      const result = await fuelService.saveStation(updated);
      setStationOverrides(prev => ({ ...prev, [id]: updated }));
      
      if (details.status === 'verified' && current.status !== 'verified') {
        toast.success(`${updated.name} promoted to Master Verified Ledger`, {
          description: "Location successfully moved to Source of Truth.",
          icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />
        });
      } else if (details.status === 'unverified' && current.status === 'verified') {
        toast.success(`${updated.name} demoted to Unverified`, {
          description: "Station moved back to Unverified MGMT tab. Admin approval required to re-verify.",
          icon: <ShieldOff className="h-4 w-4 text-amber-500" />
        });
        // Close the detail sheet so the station disappears from the verified list immediately
        setSelectedStation(null);
      } else {
        toast.success("Station updated in cloud.");
      }

      // Phase 11: Show feedback when stale learnt locations were auto-cleaned
      if (result?.autoCleanedLearnt > 0) {
        const cleanedNames = (result.cleanupDetails || [])
          .map((d: any) => `"${d.learntName}" → ${d.stationName}`)
          .join(', ');
        toast.info(`Auto-resolved ${result.autoCleanedLearnt} learnt location(s)`, {
          description: cleanedNames || 'Stale entries removed from Evidence Bridge.',
          duration: 8000,
        });
      }
    } catch (e: any) {
      if (e?.duplicate) {
        // 409 Duplicate — show override confirmation with station details
        const existing = e.existingStation;
        console.warn(`[UpdateStation] Duplicate detected: conflicts with "${existing?.name}" (${e.message})`);
        toast.error(e.message || 'Duplicate station detected', {
          description: existing ? `Conflicts with "${existing.name}" (${existing.matchType}, ${existing.distance}m). Click below to save anyway.` : undefined,
          duration: 15000,
          action: {
            label: 'Save Anyway',
            onClick: async () => {
              try {
                await fuelService.saveStation({ ...updated, _overrideDuplicate: true });
                setStationOverrides(prev => ({ ...prev, [id]: updated }));
                toast.success("Station updated (duplicate override applied).");
              } catch (retryErr) {
                console.error("Override save failed", retryErr);
                toast.error("Save failed even with override.");
              }
            }
          }
        });
      } else {
        console.error("Failed to save station to cloud", e);
        toast.error("Cloud sync failed. Changes may not persist.");
      }
    }
  };

  const handleManualAdd = async (station: StationOverride) => {
    setIsBackendLoading(true);
    try {
      const result = await fuelService.saveStation(station);
      setStationOverrides(prev => ({ ...prev, [station.id!]: station }));

      // Phase 11: Show feedback when stale learnt locations were auto-cleaned on station add
      if (result?.autoCleanedLearnt > 0) {
        const cleanedNames = (result.cleanupDetails || [])
          .map((d: any) => `"${d.learntName}" → ${d.stationName}`)
          .join(', ');
        toast.info(`Auto-resolved ${result.autoCleanedLearnt} learnt location(s)`, {
          description: cleanedNames || 'Stale entries removed from Evidence Bridge.',
          duration: 8000,
        });
      }
    } catch (e) {
      console.error("Manual add failed", e);
      throw e; // Let the modal handle the error toast
    } finally {
      setIsBackendLoading(false);
    }
  };

  // Helper to generate context
  const buildContext = useCallback((inputLogs: FuelEntry[]) => {
    // 1. Start with stations derived from Logs
    const rawStations = aggregateStations(inputLogs);
    const stationMap = new Map(rawStations.map(s => [s.id, s]));

    // 2. Apply Overrides
    Object.entries(stationOverrides).forEach(([id, override]) => {
      if (stationMap.has(id)) {
        const existing = stationMap.get(id)!;
        stationMap.set(id, {
           ...existing,
           ...override,
           amenities: override.amenities || existing.amenities || [],
        });
      } else {
        if (override.name && override.address) {
           stationMap.set(id, {
             id,
             name: override.name,
             address: override.address,
             brand: override.brand || 'Unknown',
             city: override.city || 'Unknown City',
             parish: override.parish || 'Unknown Parish',
             country: override.country || 'Jamaica',
             plusCode: override.plusCode,
             geofenceRadius: override.geofenceRadius,
             location: override.location || { lat: 18.0179, lng: -76.8099 },
             isPreferred: false,
             stats: {
               avgPrice: override.initialStats?.avgPrice || 0,
               lastPrice: override.initialStats?.lastPrice || 0,
               priceTrend: 'Stable',
               totalVisits: override.initialStats?.totalVisits || 0,
               rating: 0,
               lastUpdated: override.initialStats?.lastUpdated || new Date().toISOString()
             },
             amenities: override.amenities || [],
             dataSource: override.dataSource || 'manual',
             contactInfo: override.contactInfo || {},
             status: override.status || 'unverified',
             operationalStatus: override.operationalStatus || 'active',
             category: override.category || 'fuel'
           });
        }
      }
    });

    const stations = Array.from(stationMap.values()).map(s => ({
       ...s,
       isPreferred: preferredStationIds.has(s.id)
    }));

    if (fillSummary) {
      const byId = new Map(fillSummary.map((row) => [row.stationId, row]));
      for (const station of stations) {
        const row = byId.get(station.id);
        if (!row) continue;
        station.stats = {
          ...station.stats,
          totalVisits: row.fillCount,
          lastUpdated: row.lastFillAt || station.stats.lastUpdated,
        };
      }
    }

    const regionalStats = calculateRegionalStats(stations);

    return {
      stations,
      regionalStats,
      loading,
      togglePreferred,
      updateStationDetails
    };
  }, [loading, preferredStationIds, stationOverrides, fillSummary]);

  const context = useMemo(() => buildContext(logs), [buildContext, logs]);

  const filteredStations = useMemo(() => {
    const q = stationSearch.trim().toLowerCase();
    const fuelStations = context.stations.filter((s) => s.category !== 'non_fuel');
    if (!q) return fuelStations;
    return fuelStations.filter((s) => {
      const name = (s.name || '').toLowerCase();
      const brand = (s.brand || '').toLowerCase();
      const parish = (s.parish || '').toLowerCase();
      return name.includes(q) || brand.includes(q) || parish.includes(q);
    });
  }, [context.stations, stationSearch]);

  const activeStation = selectedStation
    ? context.stations.find((s) => s.id === selectedStation.id) || selectedStation
    : null;

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl space-y-6 animate-in fade-in overflow-y-auto p-8 text-slate-900 duration-500">
      <div className="mb-4 flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <span>Dominion</span>
          <span className="text-slate-400">/</span>
          <span>Master data</span>
          <span className="text-slate-400">/</span>
          <span>Fuel</span>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-slate-800">Station database</span>
        </nav>
        <div className="flex items-center gap-1.5 rounded border border-slate-200/80 bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>REGION: JM-KGN</span>
        </div>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Station database</h1>
        <p className="mt-1 text-sm text-slate-500">Fuel stations in Jamaica.</p>
      </div>

      <div className="mb-6 rounded-[12px] border border-slate-200 bg-white p-4 shadow-none">
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="text"
              value={stationSearch}
              onChange={(e) => setStationSearch(e.target.value)}
              placeholder="Search station by name, brand, parish..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs placeholder:text-slate-400 focus:border-[#316bf3] focus:outline-none focus:ring-1 focus:ring-[#316bf3]"
            />
          </div>
          <span className="font-mono text-xs text-slate-500">
            Total stations: <strong className="text-slate-800">{filteredStations.length}</strong>
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-none">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-4 py-3">
          {(
            [
              { id: 'stations' as const, label: 'Stations' },
              { id: 'verified' as const, label: 'Verified' },
              { id: 'resolution' as const, label: 'Resolution' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={
                activeTab === tab.id
                  ? 'inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm'
                  : 'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white/70'
              }
            >
              {tab.id === 'resolution' ? <Inbox className="h-3.5 w-3.5 opacity-70" aria-hidden /> : null}
              {tab.label}
              {tab.id === 'resolution' && resolutionQueueCount > 0 ? (
                <span className="rounded border border-indigo-200 px-1 font-mono text-[10px] text-indigo-600">
                  {resolutionQueueCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {activeTab === 'stations' ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Brand</th>
                  <th className="px-5 py-3">Parish</th>
                  <th className="px-5 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center italic text-slate-400">
                      The data is not in yet.
                    </td>
                  </tr>
                ) : (
                  filteredStations.map((station) => {
                    const verified = station.status === 'verified';
                    return (
                      <tr
                        key={station.id}
                        className="cursor-pointer transition-colors hover:bg-slate-50/70"
                        onClick={() => setSelectedStation(station)}
                      >
                        <td className="px-5 py-3.5 font-medium text-slate-900">
                          <span className="inline-flex items-center gap-2.5">
                            <span className="h-2 w-2 rounded-full bg-[#316bf3]" />
                            <span>{station.name}</span>
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-slate-600">{station.brand || '—'}</td>
                        <td className="px-5 py-3.5 text-slate-600">{station.parish || '—'}</td>
                        <td className="px-5 py-3.5 text-right">
                          {verified ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-mono text-[11px] font-medium text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-mono text-[11px] font-medium text-amber-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              Not verified
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {activeTab === 'verified' ? (
          <VerifiedStationsTab
            stations={context.stations.filter((s) => s.status === 'verified')}
            onRefresh={fetchData}
            onSelectStation={(station) => setSelectedStation(station)}
            onSaveGeofenceRadius={async (stationId, radius) => {
              const current = stationOverrides[stationId] || {};
              const updated = {
                ...current,
                id: stationId,
                geofenceRadius: radius,
              };
              await fuelService.saveStation(updated);
              setStationOverrides((prev) => ({ ...prev, [stationId]: updated as any }));
              await fetchData();
            }}
          />
        ) : null}

        {activeTab === 'resolution' ? (
          <ResolutionQueueTab
            defaultSubTab={defaultResolutionSubTab}
            onPromoted={() => fetchData()}
            onVerifyLocation={handleVerifyLearntLocation}
            onResolved={() => fetchData()}
            onCountChange={setResolutionQueueCount}
            enableSilentAttach={enableSilentAttach}
            silentAttachPanel={silentAttachPanel}
          />
        ) : null}
      </div>

      <StationDetailView 
        station={activeStation} 
        onClose={() => setSelectedStation(null)} 
        logs={logs}
        onTogglePreferred={togglePreferred}
        onUpdateStation={updateStationDetails}
        onEditInModal={(station) => {
          setEditingStation(station);
          setIsAddStationOpen(true);
        }}
        onDemoteStation={async (stationId) => {
          try {
            const result = await fuelService.demoteStation(stationId);
            toast.success(result.message, {
              description: result.learntLocationId
                ? 'A learnt location has been created — open Resolution Queue → Unresolved stops to re-match.'
                : 'No fuel entries were linked to this station.',
              icon: <ShieldOff className="h-4 w-4 text-amber-500" />,
              duration: 8000,
            });
            setSelectedStation(null);
            await fetchData();
          } catch (e: any) {
            console.error('[Demote] Failed:', e);
            toast.error(`Demotion failed: ${e.message}`);
          }
        }}
      />

      <AddStationModal 
        isOpen={isAddStationOpen || !!editingStation}
        onClose={() => {
          setIsAddStationOpen(false);
          setEditingStation(null);
          setVerifyingLearntId(null);
          setVerifyingNearbyStation(null);
        }}
        onAdd={handleManualAdd}
        editStation={editingStation}
        verifyAsGodList={!!verifyingLearntId}
        initialNearbyStation={verifyingNearbyStation}
        onDeleteCsvReference={async (stationId: string) => {
          await fuelService.deleteStation(stationId);
          setStationOverrides((prev) => {
            const next = { ...prev };
            delete next[stationId];
            return next;
          });
          await fetchData();
        }}
        onMergeIntoExisting={async (existingStationId: string) => {
          // Merge only into Verified GOD — backend rejects Unverified CSV
          if (verifyingLearntId) {
            const promoteResult = await api.promoteLearntLocationToMaster({
              learntId: verifyingLearntId,
              action: 'merge',
              targetStationId: existingStationId,
            });
            const linked = promoteResult?.linkedEntries || 0;
            toast.success('Merged into Verified GOD station.', {
              description: linked > 0
                ? `${linked} fuel transaction${linked > 1 ? 's' : ''} linked.`
                : 'Learnt staging cleared.',
              icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
            });
            setVerifyingLearntId(null);
            await fetchData();
          } else {
            toast.info('Station already exists on the GOD list. No new station was created.');
          }
        }}
        onUpdate={async (id, stationData) => {
          // Verify Location from Resolution Queue: create fresh GOD from form only — never seed from CSV
          if (verifyingLearntId) {
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
                  description: linked > 0
                    ? `${linked} fuel transaction${linked > 1 ? 's' : ''} linked.`
                    : 'Payment holds for this stop will clear when matching picks up your pin.',
                  icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
                });
              }
              setVerifyingLearntId(null);
              await fetchData();
            } catch (promoteErr: any) {
              console.error('[Verify Learnt] Failed to promote:', promoteErr);
              toast.error(promoteErr?.message || 'Failed to save Verified GOD station.');
              throw promoteErr;
            }
            return;
          }

          // Regular edit of an existing station record
          const current = stationOverrides[id] || {};
          const updated: StationOverride = {
            ...current,
            ...stationData,
            id,
            status: current.status || stationData.status,
            dataSource: current.dataSource || stationData.dataSource,
            geofenceRadius: stationData.geofenceRadius ?? current.geofenceRadius,
          };
          
          try {
            await fuelService.saveStation(updated);
            setStationOverrides(prev => ({ ...prev, [id]: updated }));
            setSelectedStation(null);
          } catch (e) {
            console.error("Failed to update station via modal", e);
            throw e;
          }
        }}
      />

      <div className="flex items-center justify-between rounded-[12px] border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <div className="flex items-center gap-2.5">
          <MapPin className="h-4 w-4 text-slate-400" aria-hidden />
          <span>The data is not in yet.</span>
        </div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
          LOC: KINGSTON / PARISH REGISTRY JMD
        </div>
      </div>
    </div>
  );
}