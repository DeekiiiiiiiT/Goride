import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Map, Layers, ZoomIn, ZoomOut, RefreshCw, Car, Navigation, Maximize2, X } from "lucide-react";
import { Trip, VehicleMetrics } from '../../types/data';

interface FleetMapProps {
    vehicleMetrics?: VehicleMetrics[];
    trips?: Trip[];
}

const MAP_OVERLAY = 'map-fullscreen';

export function FleetMap({ vehicleMetrics = [], trips = [] }: FleetMapProps) {
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showVehicles, setShowVehicles] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const activeVehicles = vehicleMetrics.filter(v => v.onlineHours > 0 || v.tripsPerHour > 0);
  
  const vehicleLocations = activeVehicles.map(v => {
      const vehicleTrips = trips.filter(t => t.vehicleId === v.vehicleId || t.vehiclePlate === v.plateNumber);
      const latestTrip = vehicleTrips.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      
      return {
          ...v,
          lastLocation: latestTrip ? (latestTrip.dropoffLocation || latestTrip.pickupLocation || "Unknown") : "Depot",
          lastActive: latestTrip ? "Just now" : "Today",
          status: latestTrip && latestTrip.status === 'Processing' ? 'On Trip' : 'Available'
      };
  });

  const exitFullscreen = React.useCallback(() => {
    const state = window.history.state as { overlay?: string } | null;
    if (state?.overlay === MAP_OVERLAY) {
      window.history.back();
    } else {
      setFullscreen(false);
    }
  }, []);

  const enterFullscreen = () => {
    const prev = (window.history.state && typeof window.history.state === 'object')
      ? window.history.state
      : {};
    window.history.pushState({ ...prev, overlay: MAP_OVERLAY }, '', window.location.href);
    setFullscreen(true);
  };

  useEffect(() => {
    if (!fullscreen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitFullscreen();
    };
    const onPop = () => setFullscreen(false);

    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
    };
  }, [fullscreen, exitFullscreen]);

  const mapBody = (
    <>
      <div className="absolute inset-0 flex items-center justify-center bg-slate-200 text-slate-400">
         <div className="text-center">
             <Map className="mx-auto mb-2 h-16 w-16 opacity-20" />
             <p className="text-sm font-medium opacity-60">Interactive Map View</p>
             <p className="text-xs opacity-40">Kingston, Jamaica</p>
             <p className="mt-2 text-[10px] opacity-30">GPS Integration Not Active</p>
         </div>
         
         {showHeatmap && (
             <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-red-500/10 to-transparent" />
         )}
      </div>

      {showVehicles && vehicleLocations.length > 0 && (
          <div className="absolute left-4 top-4 max-h-[400px] w-64 overflow-hidden overflow-y-auto rounded-lg border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Live Fleet Status</h4>
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">{vehicleLocations.length} Active</span>
              </div>
              <div className="divide-y divide-slate-100">
                  {vehicleLocations.map((v, index) => (
                      <div key={`${v.id}-${index}`} className="p-3 transition-colors hover:bg-slate-50">
                          <div className="mb-1 flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-800">{v.plateNumber}</span>
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                  v.status === 'On Trip' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                  {v.status}
                              </span>
                          </div>
                          <div className="flex items-start gap-1.5 text-xs text-slate-500">
                              <Navigation className="mt-0.5 h-3 w-3 shrink-0" />
                              <span className="truncate">{v.lastLocation}</span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      <div className="absolute right-4 top-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white/90 p-2 shadow-sm backdrop-blur">
          <Button variant="outline" size="icon" className="min-h-11 min-w-11 md:h-8 md:min-h-0 md:w-8 md:min-w-0" onClick={() => setShowVehicles(!showVehicles)}>
              <Car className={`h-4 w-4 ${showVehicles ? 'text-blue-600' : 'text-slate-400'}`} />
          </Button>
          <Button variant="outline" size="icon" className="min-h-11 min-w-11 md:h-8 md:min-h-0 md:w-8 md:min-w-0" onClick={() => setShowHeatmap(!showHeatmap)}>
              <Layers className={`h-4 w-4 ${showHeatmap ? 'text-red-600' : 'text-slate-400'}`} />
          </Button>
          <div className="my-1 h-px bg-slate-200" />
          <Button variant="outline" size="icon" className="min-h-11 min-w-11 md:h-8 md:min-h-0 md:w-8 md:min-w-0">
              <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="min-h-11 min-w-11 md:h-8 md:min-h-0 md:w-8 md:min-w-0">
              <ZoomOut className="h-4 w-4" />
          </Button>
          {!fullscreen ? (
            <Button
              variant="outline"
              size="icon"
              className="min-h-11 min-w-11 md:hidden"
              onClick={enterFullscreen}
              aria-label="Expand map"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="min-h-11 min-w-11"
              onClick={exitFullscreen}
              aria-label="Close fullscreen map"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
      </div>
    </>
  );

  return (
    <>
      <Card className="flex h-full flex-col overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
              <Map className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-sm font-medium">Fleet Geographic Intelligence</CardTitle>
          </div>
          <div className="flex gap-1">
               <Button variant="ghost" size="icon" className="h-8 w-8">
                   <RefreshCw className="h-4 w-4" />
               </Button>
               <Button
                 variant="ghost"
                 size="icon"
                 className="min-h-11 min-w-11 md:hidden"
                 onClick={enterFullscreen}
                 aria-label="Expand map"
               >
                 <Maximize2 className="h-4 w-4" />
               </Button>
          </div>
        </CardHeader>
        
        <CardContent className="relative min-h-[500px] flex-1 bg-slate-100 p-0">
          {mapBody}
        </CardContent>
      </Card>

      {fullscreen && createPortal(
        <div className="app-fullscreen-screen z-[100] bg-slate-100 safe-t safe-x safe-b">
          <div className="relative min-h-0 flex-1">
            {mapBody}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
