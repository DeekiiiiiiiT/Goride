import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FuelEntry } from '../../../types/fuel';
import { StationProfile, StationOverride } from '../../../types/station';
import { aggregateStations, calculateRegionalStats } from '../../../utils/stationUtils';
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
}

export function GasStationAnalytics({ logs, loading = false }: GasStationAnalyticsProps) {
  const [selectedStation, setSelectedStation] = useState<StationProfile | null>(null);
  const [stationOverrides, setStationOverrides] = useState<Record<string, StationOverride>>({});
  const [purchaseDateRange, setPurchaseDateRange] = useState<DateRange | undefined>();
  
  // Load overrides to ensure analytics reflect custom names/brands
  useEffect(() => {
    try {
      const storedOverrides = localStorage.getItem('station_overrides');
      if (storedOverrides) {
        setStationOverrides(JSON.parse(storedOverrides));
      }
    } catch (e) {
      console.error('Failed to load local storage data', e);
    }
  }, []);

  // Helper to generate context from logs
  const buildContext = useCallback((inputLogs: FuelEntry[]) => {
    // 1. Start with stations derived from Logs
    const rawStations = aggregateStations(inputLogs);
    const stationMap = new Map(rawStations.map(s => [s.id, s]));

    // 2. Apply Overrides (Read-Only for Analytics)
    Object.entries(stationOverrides).forEach(([id, override]) => {
      if (stationMap.has(id)) {
        // Update existing station data with overrides
        const existing = stationMap.get(id)!;
        stationMap.set(id, {
           ...existing,
           ...override,
           amenities: override.amenities || existing.amenities || [],
        });
      } 
      // Note: We do NOT add "Ghost Stations" (manual entries without logs) to Analytics view.
      // Analytics should strictly show where money was spent.
    });

    const stations = Array.from(stationMap.values());
    const regionalStats = calculateRegionalStats(stations); 
    
    return {
      stations,
      regionalStats,
      loading,
      togglePreferred: () => {}, // No-op in Analytics
      updateStationDetails: () => {} // No-op in Analytics
    };
  }, [loading, stationOverrides]);

  const context = useMemo(() => buildContext(logs), [buildContext, logs]);

  const purchaseDataLogs = useMemo(() => {
    if (!purchaseDateRange?.from) return logs;
    return logs.filter(log => {
      const logDate = new Date(log.date);
      const from = startOfDay(purchaseDateRange.from!);
      const to = purchaseDateRange.to ? endOfDay(purchaseDateRange.to) : endOfDay(purchaseDateRange.from!);
      return isWithinInterval(logDate, { start: from, end: to });
    });
  }, [logs, purchaseDateRange]);

  const purchaseContext = useMemo(() => buildContext(purchaseDataLogs), [buildContext, purchaseDataLogs]);

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
        logs={logs}
      />
    </div>
  );
}
