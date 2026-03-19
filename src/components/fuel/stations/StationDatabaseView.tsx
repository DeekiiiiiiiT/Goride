// cache-bust: v1.0.3 - Explicitly standardizing Badge import
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FuelEntry } from '../../../types/fuel';
import { StationProfile, StationOverride } from '../../../types/station';
import { aggregateStations, calculateRegionalStats, generateStationId, normalizeStationName } from '../../../utils/stationUtils';
import { getDefaultGeofenceRadius } from '../../../utils/plusCode';
import { StationList } from './StationList';
import { StationDetailView } from './StationDetailView';
import { StationImportWizard } from './StationImportWizard';
import { StationExport } from './StationExport';
import { BulkDeleteStationsModal } from './BulkDeleteStationsModal';
import { ParentCompanyManager } from './ParentCompanyManager';
import { VerifiedStationsTab } from './VerifiedStationsTab';
import { LearntLocationsTab } from './LearntLocationsTab';
import { UnverifiedVendorsTab } from './UnverifiedVendorsTab';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { Switch } from '../../ui/switch';
import { Label } from '../../ui/label';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Star, Loader2, Upload, Trash2, Plus, ShieldCheck, ShieldOff, Map as MapIcon } from 'lucide-react';
import { SpatialIntegrityMap } from './SpatialIntegrityMap';
import { fuelService } from '../../../services/fuelService';
import { api } from '../../../services/api';
import { toast } from 'sonner@2.0.3';
import { AddStationModal } from './AddStationModal';

interface StationDatabaseViewProps {
  logs: FuelEntry[];
  loading?: boolean;
}

export function StationDatabaseView({ logs, loading = false }: StationDatabaseViewProps) {
  const [selectedStation, setSelectedStation] = useState<StationProfile | null>(null);
  const [preferredStationIds, setPreferredStationIds] = useState<Set<string>>(new Set());
  const [stationOverrides, setStationOverrides] = useState<Record<string, StationOverride>>({});
  const [isBackendLoading, setIsBackendLoading] = useState(false);
  const [showPreferredOnly, setShowPreferredOnly] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isNonFuelImportOpen, setIsNonFuelImportOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAddStationOpen, setIsAddStationOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<StationProfile | null>(null);
  const [verifyingLearntId, setVerifyingLearntId] = useState<string | null>(null);
  const [verifyingNearbyStation, setVerifyingNearbyStation] = useState<any>(null);

  const fetchData = useCallback(async () => {
    setIsBackendLoading(true);
    try {
      // 0. Run one-time migration to patch any stations with missing/incorrect status
      const migrationKey = 'station_status_migration_v1';
      if (!localStorage.getItem(migrationKey)) {
        try {
          const result = await fuelService.migrateStationStatuses();
          if (result.patchedCount > 0) {
            console.log(`[Migration] Patched ${result.patchedCount}/${result.totalStations} stations to 'unverified' status.`);
            toast.success(`Station Migration: ${result.patchedCount} stations patched to 'unverified'.`);
          }
          localStorage.setItem(migrationKey, new Date().toISOString());
        } catch (migErr) {
          console.error('[Migration] Station status migration failed:', migErr);
        }
      }

      // 1. Fetch from backend
      const backendStations = await fuelService.getStations();
      const overrides: Record<string, StationOverride> = {};
      backendStations.forEach(s => {
        overrides[s.id] = s;
      });

      // 2. Check for legacy localStorage data
      const storedOverrides = localStorage.getItem('station_overrides');
      if (storedOverrides) {
        try {
          const legacyData = JSON.parse(storedOverrides);
          const legacyKeys = Object.keys(legacyData);
          
          if (legacyKeys.length > 0) {
            console.log(`[Migration] Found ${legacyKeys.length} legacy stations. Migrating to Cloud...`);
            
            // Only migrate if not already in backend
            for (const key of legacyKeys) {
              if (!overrides[key]) {
                const station = legacyData[key];
                if (!station.id) station.id = key;
                await fuelService.saveStation(station);
                overrides[key] = station;
              }
            }
            
            // Clear legacy data once migrated
            localStorage.removeItem('station_overrides');
            toast.success("Station database migrated to Cloud successfully.");
          }
        } catch (e) {
          console.error("Migration failed", e);
        }
      }

      setStationOverrides(overrides);

      // Load preferred stations
      const storedPreferred = localStorage.getItem('preferred_stations');
      if (storedPreferred) {
        setPreferredStationIds(new Set(JSON.parse(storedPreferred)));
      }
    } catch (e) {
      console.error('Failed to load station data from cloud', e);
      toast.error("Could not sync with cloud station database.");
    } finally {
      setIsBackendLoading(false);
    }
  }, []);

  // Phase 9: Persistent Storage Migration
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Save Preferred Stations
  const togglePreferred = (id: string) => {
    setPreferredStationIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem('preferred_stations', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  // Save Station Overrides (Cloud Persisted)
  const updateStationDetails = async (id: string, details: Partial<StationProfile>) => {
    const current = stationOverrides[id] || {};
    const updated: StationOverride = {
      ...current,
      id, // Ensure ID is present
      name: details.name || current.name,
      address: details.address || current.address,
      brand: details.brand || current.brand,
      city: details.city || current.city,
      parish: details.parish || current.parish,
      country: details.country || current.country,
      plusCode: details.plusCode || current.plusCode,
      geofenceRadius: details.geofenceRadius ?? current.geofenceRadius,
      location: details.location || current.location,
      amenities: details.amenities || current.amenities,
      contactInfo: details.contactInfo || current.contactInfo,
      status: details.status || current.status,
      operationalStatus: details.operationalStatus || current.operationalStatus,
      dataSource: details.dataSource || current.dataSource || 'manual' 
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

  const handleImportStations = async (imported: StationOverride[]) => {
    setIsBackendLoading(true);
    let count = 0;
    let dupeSkipped = 0;
    const newOverrides = { ...stationOverrides };
    
    try {
      for (const item of imported) {
        if (item.name && item.address) {
          // Fix 2: Normalize name before generating ID to match the wizard's duplicate-check logic
          const id = generateStationId(normalizeStationName(item.name), item.address);
          const updatedItem = {
            ...item,
            id,
            status: 'unverified', // CSV imports are always unverified
            dataSource: 'import',
            category: item.category || 'fuel',
            // Smart default geofence radius based on Plus Code precision (if available)
            geofenceRadius: item.geofenceRadius ?? (item.plusCode ? getDefaultGeofenceRadius(item.plusCode) : undefined),
          };
          
          try {
            await fuelService.saveStation(updatedItem);
            newOverrides[id] = updatedItem;
            count++;
          } catch (saveErr: any) {
            // Phase 8.3: Handle 409 duplicate gracefully — skip and continue
            if (saveErr?.duplicate) {
              dupeSkipped++;
              console.warn(`[Import] Skipped duplicate: "${item.name}" conflicts with "${saveErr.existingStation?.name || 'unknown'}"`);
            } else {
              throw saveErr; // Re-throw non-duplicate errors
            }
          }
        }
      }

      setStationOverrides(newOverrides);
      if (dupeSkipped > 0) {
        toast.success(`Cloud Sync: Imported ${count} locations. ${dupeSkipped} duplicate${dupeSkipped > 1 ? 's' : ''} skipped.`, {
          description: `${dupeSkipped} station${dupeSkipped > 1 ? 's' : ''} matched existing entries and ${dupeSkipped > 1 ? 'were' : 'was'} not re-created.`,
        });
      } else {
        toast.success(`Cloud Sync: Successfully imported ${count} locations.`);
      }
    } catch (e) {
      console.error("Import failed", e);
      toast.error("Import interrupted. Some stations might not have been saved.");
    } finally {
      setIsBackendLoading(false);
    }
  };

  const handleConfirmDelete = async (idsToDelete: string[]) => {
    setIsBackendLoading(true);
    try {
      // Delete from backend first
      for (const id of idsToDelete) {
        await fuelService.deleteStation(id);
      }
      
      // Immediately update local state to remove deleted stations
      setStationOverrides(prev => {
        const next = { ...prev };
        idsToDelete.forEach(id => {
          delete next[id];
        });
        return next;
      });
      
      toast.success(`Deleted ${idsToDelete.length} stations from cloud.`);
      
      // Re-fetch from backend to ensure local state is in sync with KV
      try {
        const freshStations = await fuelService.getStations();
        const freshOverrides: Record<string, StationOverride> = {};
        freshStations.forEach(s => {
          freshOverrides[s.id] = s;
        });
        setStationOverrides(freshOverrides);
      } catch (syncErr) {
        console.error('[Delete] Post-delete sync failed, using local state:', syncErr);
      }
    } catch (e) {
      console.error("Delete failed", e);
      toast.error("Cloud deletion failed.");
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

    const visibleStations = showPreferredOnly 
      ? stations.filter(s => s.isPreferred) 
      : stations;

    const regionalStats = calculateRegionalStats(stations); 
    
    return {
      stations: visibleStations,
      regionalStats,
      loading,
      togglePreferred,
      updateStationDetails
    };
  }, [loading, preferredStationIds, showPreferredOnly, stationOverrides]);

  const context = useMemo(() => buildContext(logs), [buildContext, logs]);

  const handleStationSelect = (stationId: string) => {
    const station = context.stations.find(s => s.id === stationId);
    if (station) {
      setSelectedStation(station);
    }
  };

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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <Tabs defaultValue="spatial-audit" className="w-full">
          <div className="border-b border-slate-200 px-4 py-3 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h3 className="font-semibold text-slate-900">Station Database</h3>
            </div>
            
            <TabsList className="bg-slate-200/50 p-1">
              <TabsTrigger value="spatial-audit" className="flex items-center gap-1.5 text-indigo-700 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <MapIcon className="h-3.5 w-3.5" />
                Spatial Audit
              </TabsTrigger>
              <TabsTrigger value="verified-stations">Verified Gas Station</TabsTrigger>
              <TabsTrigger value="parent-company">Parent Company</TabsTrigger>
              <TabsTrigger value="unverified-stations" className="flex items-center gap-1.5">
                Unverified
                <Badge variant="outline" className="h-4 px-1 text-[8px] border-slate-300 text-slate-400">MGMT</Badge>
              </TabsTrigger>
              <TabsTrigger value="accepted-stations">Accepted Gas Stations</TabsTrigger>
              <TabsTrigger value="non-fuel">Non-Fuel Locations</TabsTrigger>
              <TabsTrigger value="learnt-locations" className="flex items-center gap-1.5">
                Learnt
                <Badge variant="outline" className="h-4 px-1 text-[8px] border-amber-200 text-amber-500">STAGING</Badge>
              </TabsTrigger>
              <TabsTrigger value="unverified-vendors" className="flex items-center gap-1.5">
                Unverified Vendors
                <Badge variant="outline" className="h-4 px-1 text-[8px] border-red-200 text-red-500">GATE</Badge>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* --- Spatial Audit Tab --- */}
          <TabsContent value="spatial-audit" className="m-0 p-0 border-0">
             <div className="h-[700px] bg-slate-50">
               <SpatialIntegrityMap />
             </div>
          </TabsContent>

          {/* --- Verified Gas Station Tab --- */}
          <TabsContent value="verified-stations" className="m-0 p-0 border-0">
             <VerifiedStationsTab 
               stations={context.stations.filter(s => s.status === 'verified')} 
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
                 setStationOverrides(prev => ({ ...prev, [stationId]: updated as any }));
                 // Refresh to reflect the change in the table
                 await fetchData();
               }}
             />
          </TabsContent>

          {/* --- Parent Company Tab --- */}
          <TabsContent value="parent-company" className="m-0 p-0 border-0">
             <ParentCompanyManager />
          </TabsContent>

          {/* --- Unverified Gas Stations Tab --- */}
          <TabsContent value="unverified-stations" className="m-0 p-0 border-0">
             <div className="border-b border-slate-100 bg-white p-3 flex justify-end gap-3 items-center">
               {/* Preferred Toggle */}
                <div className="flex items-center space-x-2 mr-2">
                  <Switch 
                    id="preferred-mode" 
                    checked={showPreferredOnly}
                    onCheckedChange={setShowPreferredOnly}
                  />
                  <Label htmlFor="preferred-mode" className="text-sm text-slate-600 flex items-center cursor-pointer">
                    <Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />
                    Preferred Only
                  </Label>
                </div>
                
                {/* Actions */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-white text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  onClick={() => setIsAddStationOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  Add Station
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-white text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setIsDeleteModalOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Bulk Delete
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  onClick={() => setIsImportOpen(true)}
                >
                  <Upload className="h-3.5 w-3.5 mr-2" />
                  Import CSV
                </Button>
                <StationExport stations={context.stations.filter(s => (s.dataSource === 'manual' || s.dataSource === 'import') && s.category !== 'non_fuel')} />
             </div>

             <div className="p-4">
               <StationList 
                  context={{
                      ...context,
                      stations: context.stations.filter(s => s.status === 'unverified' && s.category !== 'non_fuel')
                  }} 
                  onSelectStation={handleStationSelect} 
                  variant="manager"
                  selectable
                  onDeleteSelected={async (ids) => {
                    await handleConfirmDelete(ids);
                  }}
               />
             </div>
          </TabsContent>

          {/* --- Accepted Gas Stations Tab --- */}
          <TabsContent value="accepted-stations" className="m-0 p-0 border-0">
             <div className="flex flex-col items-center justify-center py-20 text-slate-500">
               <p className="text-lg font-medium">Accepted Gas Stations</p>
               <p className="text-sm">Information for this section will be added soon.</p>
             </div>
          </TabsContent>

          {/* --- Non-Fuel Locations Tab --- */}
          <TabsContent value="non-fuel" className="m-0 p-0 border-0">
             <div className="border-b border-slate-100 bg-white p-3 flex justify-end gap-3 items-center">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  onClick={() => setIsNonFuelImportOpen(true)}
                >
                  <Upload className="h-3.5 w-3.5 mr-2" />
                  Import CSV
                </Button>
                <StationExport 
                  stations={context.stations.filter(s => s.category === 'non_fuel' && s.status === 'unverified')} 
                  filename="non-fuel-locations"
                />
             </div>

             <div className="p-4">
               <StationList 
                  context={{
                      ...context,
                      stations: context.stations.filter(s => s.category === 'non_fuel' && s.status === 'unverified')
                  }} 
                  onSelectStation={handleStationSelect} 
                  variant="manager"
               />
             </div>
          </TabsContent>

          {/* --- Learnt Location Tab --- */}
          <TabsContent value="learnt-locations" className="m-0 p-0 border-0">
             <LearntLocationsTab 
               onPromoted={() => fetchData()}
               onVerifyLocation={(learntLoc) => {
                 // Convert the learnt location into a pseudo-StationProfile
                 // so the AddStationModal can pre-fill the form with existing data
                 const pseudoStation: StationProfile = {
                   id: generateStationId(
                     normalizeStationName(learntLoc.name || 'Unknown Station'),
                     learntLoc.address || `${learntLoc.location.lat},${learntLoc.location.lng}`
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
                 // Phase 7: Pass nearby station data for pre-populating duplicate warning
                 setVerifyingNearbyStation(learntLoc.nearbyStation || null);
                 setIsAddStationOpen(true);
               }}
             />
          </TabsContent>

          {/* --- Unverified Vendors Tab --- */}
          <TabsContent value="unverified-vendors" className="m-0 p-0 border-0">
             <UnverifiedVendorsTab 
               onRefresh={() => fetchData()}
               onSelectVendor={(vendor) => {
                 // TODO: Open vendor detail modal
                 console.log('Selected vendor:', vendor);
               }}
             />
          </TabsContent>
        </Tabs>
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
                ? 'A Learnt Location has been created — go to the Learnt STAGING tab to re-match.'
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

      <StationImportWizard 
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImportStations}
        existingStations={context.stations}
        mode="fuel"
      />

      <StationImportWizard 
        isOpen={isNonFuelImportOpen}
        onClose={() => setIsNonFuelImportOpen(false)}
        onImport={handleImportStations}
        existingStations={context.stations}
        mode="non_fuel"
      />

      <BulkDeleteStationsModal 
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        stations={stationOverrides}
        onDelete={handleConfirmDelete}
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
        initialNearbyStation={verifyingNearbyStation}
        onMergeIntoExisting={async (existingStationId: string) => {
          // Phase 5: "Merge Into Existing" button in the duplicate warning
          if (verifyingLearntId) {
            // Came from Learnt tab → Verify flow: merge the learnt location into the existing station
            const promoteResult = await api.promoteLearntLocationToMaster({
              learntId: verifyingLearntId,
              action: 'merge',
              targetStationId: existingStationId,
            });
            const linked = promoteResult?.linkedEntries || 0;
            toast.success('Learnt location merged into existing station.', {
              description: linked > 0
                ? `${linked} fuel transaction${linked > 1 ? 's' : ''} linked. Anomaly resolved.`
                : 'The learnt location has been cleared from the Evidence Bridge.',
              icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
            });
            setVerifyingLearntId(null);
            await fetchData();
          } else {
            // Regular add-station flow: no learnt location to merge — just inform the user
            toast.info('Station already exists at this location. No new station was created.');
          }
        }}
        onUpdate={async (id, stationData) => {
          // Merge the updated fields while preserving existing metadata
          const current = stationOverrides[id] || {};
          const updated: StationOverride = {
            ...current,
            ...stationData,
            id,
            // Preserve the existing status (unverified) and dataSource
            status: current.status || stationData.status,
            dataSource: current.dataSource || stationData.dataSource,
            // Preserve geofenceRadius: use modal value if set, otherwise keep existing
            geofenceRadius: stationData.geofenceRadius ?? current.geofenceRadius,
          };
          
          try {
            await fuelService.saveStation(updated);
            setStationOverrides(prev => ({ ...prev, [id]: updated }));
            // Close the detail sheet to reflect changes when it re-opens
            setSelectedStation(null);

            // If this was triggered from the Learnt tab's "Verify" button,
            // also promote/remove the learnt location from the staging area
            if (verifyingLearntId) {
              try {
                const promoteResult = await api.promoteLearntLocationToMaster({
                  learntId: verifyingLearntId,
                  action: 'create',
                  stationData: updated,
                });

                if (promoteResult?.autoMerged) {
                  // Backend detected a duplicate and auto-merged instead of creating
                  const linked = promoteResult?.linkedEntries || 0;
                  const mergedName = promoteResult?.data?.name || 'existing station';
                  toast.success(`Duplicate detected! Auto-merged into "${mergedName}".`, {
                    description: `${promoteResult.message}${linked > 0 ? ` ${linked} transaction${linked > 1 ? 's' : ''} linked.` : ''}`,
                    icon: <ShieldCheck className="h-4 w-4 text-amber-500" />,
                  });
                } else {
                  const linked = promoteResult?.linkedEntries || 0;
                  toast.success('Learnt location verified and promoted to station database.', {
                    description: linked > 0 
                      ? `${linked} fuel transaction${linked > 1 ? 's' : ''} linked to this station. Anomaly resolved.`
                      : 'The anomaly has been resolved and removed from the Evidence Bridge.',
                    icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
                  });
                }
              } catch (promoteErr: any) {
                // Phase 7-8 fix: Show detailed error message
                console.error('[Verify Learnt] Failed to promote learnt location:', promoteErr);
                const errorMsg = promoteErr.message || String(promoteErr);
                toast.warning('Station saved, but failed to clear the learnt location from Evidence Bridge.', {
                  description: errorMsg
                });
              }
              setVerifyingLearntId(null);
              // Refresh both station data and trigger learnt tab refresh
              await fetchData();
            }
          } catch (e) {
            console.error("Failed to update station via modal", e);
            throw e;
          }
        }}
      />
    </div>
  );
}