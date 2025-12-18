import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Map, Layers, ZoomIn, ZoomOut, RefreshCw, Car, Navigation } from "lucide-react";
import { Trip, VehicleMetrics } from '../../types/data';

interface FleetMapProps {
    vehicleMetrics?: VehicleMetrics[];
    trips?: Trip[];
}

export function FleetMap({ vehicleMetrics = [], trips = [] }: FleetMapProps) {
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showVehicles, setShowVehicles] = useState(true);

  // Derive active vehicles and their last locations from trips
  const activeVehicles = vehicleMetrics.filter(v => v.onlineHours > 0 || v.tripsPerHour > 0);
  
  const vehicleLocations = activeVehicles.map(v => {
      // Find latest trip for this vehicle
      const vehicleTrips = trips.filter(t => t.vehicleId === v.vehicleId || t.vehiclePlate === v.plateNumber);
      const latestTrip = vehicleTrips.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      
      return {
          ...v,
          lastLocation: latestTrip ? (latestTrip.dropoffLocation || latestTrip.pickupLocation || "Unknown") : "Depot",
          lastActive: latestTrip ? "Just now" : "Today",
          status: latestTrip && latestTrip.status === 'Processing' ? 'On Trip' : 'Available'
      };
  });

  return (
    <Card className="h-full flex flex-col border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="py-3 px-4 border-b bg-slate-50 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
            <Map className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm font-medium">Fleet Geographic Intelligence</CardTitle>
        </div>
        <div className="flex gap-1">
             <Button variant="ghost" size="icon" className="h-8 w-8">
                 <RefreshCw className="h-4 w-4" />
             </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-0 flex-1 relative bg-slate-100 min-h-[500px]">
        {/* Map Placeholder / Image */}
        <div className="absolute inset-0 flex items-center justify-center bg-slate-200 text-slate-400">
           {/* In a real app, this would be the Google Maps Embed */}
           <div className="text-center">
               <Map className="h-16 w-16 mx-auto mb-2 opacity-20" />
               <p className="text-sm font-medium opacity-60">Interactive Map View</p>
               <p className="text-xs opacity-40">Kingston, Jamaica</p>
               <p className="text-[10px] opacity-30 mt-2">GPS Integration Not Active</p>
           </div>
           
           {/* Simulated Heatmap Overlay */}
           {showHeatmap && (
               <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-red-500/10 to-transparent pointer-events-none" />
           )}
        </div>

        {/* Real Data Overlay: Live Fleet Status */}
        {showVehicles && vehicleLocations.length > 0 && (
            <div className="absolute top-4 left-4 w-64 bg-white/95 backdrop-blur shadow-lg rounded-lg overflow-hidden border border-slate-200 max-h-[400px] overflow-y-auto">
                <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Live Fleet Status</h4>
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">{vehicleLocations.length} Active</span>
                </div>
                <div className="divide-y divide-slate-100">
                    {vehicleLocations.map((v) => (
                        <div key={v.id} className="p-3 hover:bg-slate-50 transition-colors">
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-sm text-slate-800">{v.plateNumber}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                    v.status === 'On Trip' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                    {v.status}
                                </span>
                            </div>
                            <div className="flex items-start gap-1.5 text-xs text-slate-500">
                                <Navigation className="h-3 w-3 mt-0.5 shrink-0" />
                                <span className="truncate">{v.lastLocation}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Map Controls Overlay */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 bg-white/90 backdrop-blur p-2 rounded-lg shadow-sm border border-slate-200">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setShowVehicles(!showVehicles)}>
                <Car className={`h-4 w-4 ${showVehicles ? 'text-blue-600' : 'text-slate-400'}`} />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setShowHeatmap(!showHeatmap)}>
                <Layers className={`h-4 w-4 ${showHeatmap ? 'text-red-600' : 'text-slate-400'}`} />
            </Button>
            <div className="h-px bg-slate-200 my-1" />
            <Button variant="outline" size="icon" className="h-8 w-8">
                <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8">
                <ZoomOut className="h-4 w-4" />
            </Button>
        </div>
      </CardContent>
    </Card>
  );
}
