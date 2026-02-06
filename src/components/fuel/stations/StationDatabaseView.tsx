import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FuelEntry } from '../../../types/fuel';
import { StationAnalyticsContextType, StationProfile, StationOverride } from '../../../types/station';
import { aggregateStations, calculateRegionalStats, generateStationId } from '../../../utils/stationUtils';
import { StationList } from './StationList';
import { StationDetailView } from './StationDetailView';
import { StationImportWizard } from './StationImportWizard';
import { StationExport } from './StationExport';
import { BulkDeleteStationsModal } from './BulkDeleteStationsModal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { Switch } from '../../ui/switch';
import { Label } from '../../ui/label';
import { Button } from '../../ui/button';
import { Star, Loader2, Upload, Trash2 } from 'lucide-react';

interface StationDatabaseViewProps {
  logs: FuelEntry[];
  loading?: boolean;
}

export function StationDatabaseView({ logs, loading = false }: StationDatabaseViewProps) {
  const [selectedStation, setSelectedStation] = useState<StationProfile | null>(null);
  const [preferredStationIds, setPreferredStationIds] = useState<Set<string>>(new Set());
  const [stationOverrides, setStationOverrides] = useState<Record<string, StationOverride>>({});
  const [showPreferredOnly, setShowPreferredOnly] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isNonFuelImportOpen, setIsNonFuelImportOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const storedPreferred = localStorage.getItem('preferred_stations');
      if (storedPreferred) {
        setPreferredStationIds(new Set(JSON.parse(storedPreferred)));
      }

      const storedOverrides = localStorage.getItem('station_overrides');
      if (storedOverrides) {
        setStationOverrides(JSON.parse(storedOverrides));
      }
    } catch (e) {
      console.error('Failed to load local storage data', e);
    }
  }, []);

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

  // Save Station Overrides
  const updateStationDetails = (id: string, details: Partial<StationProfile>) => {
    setStationOverrides(prev => {
      const current = prev[id] || {};
      const updated = {
        ...current,
        name: details.name,
        address: details.address,
        brand: details.brand,
        city: details.city,
        parish: details.parish,
        country: details.country,
        location: details.location,
        amenities: details.amenities,
        contactInfo: details.contactInfo,
        status: details.status,
        dataSource: details.dataSource || current.dataSource || 'manual' 
      };
      
      // Clean up undefined values
      Object.keys(updated).forEach(key => 
        (updated as any)[key] === undefined && delete (updated as any)[key]
      );

      const next = { ...prev, [id]: updated };
      localStorage.setItem('station_overrides', JSON.stringify(next));
      return next;
    });
  };

  const handleImportStations = (imported: StationOverride[]) => {
    setStationOverrides(prev => {
      const next = { ...prev };
      let count = 0;
      
      imported.forEach(item => {
        if (item.name && item.address) {
          const id = generateStationId(item.name, item.address);
          next[id] = {
            ...(next[id] || {}),
            ...item,
            dataSource: 'import',
            category: item.category || 'fuel'
          };
          count++;
        }
      });

      localStorage.setItem('station_overrides', JSON.stringify(next));
      console.log(`Imported ${count} stations`);
      return next;
    });
  };

  const handleConfirmDelete = (idsToDelete: string[]) => {
    setStationOverrides(prev => {
      const next = { ...prev };
      idsToDelete.forEach(id => {
        delete next[id];
      });
      localStorage.setItem('station_overrides', JSON.stringify(next));
      return next;
    });
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
             status: override.status || 'active',
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
        <Tabs defaultValue="all-stations" className="w-full">
          <div className="border-b border-slate-200 px-4 py-3 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h3 className="font-semibold text-slate-900">Station Database</h3>
            </div>
            
            <TabsList>
              <TabsTrigger value="all-stations">All Gas Stations</TabsTrigger>
              <TabsTrigger value="accepted-stations">Accepted Gas Stations</TabsTrigger>
              <TabsTrigger value="non-fuel">Non-Fuel Locations</TabsTrigger>
            </TabsList>
          </div>

          {/* --- All Gas Stations Tab --- */}
          <TabsContent value="all-stations" className="m-0 p-0 border-0">
             <div className="border-b border-slate-100 bg-white p-3 flex justify-end gap-3 items-center">
               {/* Preferred Toggle */}
                <div className="flex items-center space-x-2 mr-2">
                  <Switch 
                    id="preferred-mode-all" 
                    checked={showPreferredOnly}
                    onCheckedChange={setShowPreferredOnly}
                  />
                  <Label htmlFor="preferred-mode-all" className="text-sm text-slate-600 flex items-center cursor-pointer">
                    <Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />
                    Preferred Only
                  </Label>
                </div>
                
                {/* Actions */}
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
                <StationExport stations={context.stations.filter(s => s.dataSource === 'manual' || s.dataSource === 'import')} />
             </div>

             <div className="p-4">
               <StationList 
                  context={{
                      ...context,
                      stations: context.stations.filter(s => s.dataSource === 'manual' || s.dataSource === 'import')
                  }} 
                  onSelectStation={handleStationSelect} 
                  variant="manager"
               />
             </div>
          </TabsContent>

          {/* --- Accepted Gas Stations Tab (Formerly Gas Stations) --- */}
          <TabsContent value="accepted-stations" className="m-0 p-0 border-0">
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
                      stations: context.stations.filter(s => (s.dataSource === 'manual' || s.dataSource === 'import') && s.category !== 'non_fuel')
                  }} 
                  onSelectStation={handleStationSelect} 
                  variant="manager"
               />
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
                  stations={context.stations.filter(s => s.category === 'non_fuel')} 
                  filename="non-fuel-locations"
                />
             </div>

             <div className="p-4">
               <StationList 
                  context={{
                      ...context,
                      stations: context.stations.filter(s => s.category === 'non_fuel')
                  }} 
                  onSelectStation={handleStationSelect} 
                  variant="manager"
               />
             </div>
          </TabsContent>
        </Tabs>
      </div>

      <StationDetailView 
        station={activeStation} 
        onClose={() => setSelectedStation(null)} 
        logs={logs}
        onTogglePreferred={togglePreferred}
        onUpdateStation={updateStationDetails}
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
    </div>
  );
}
