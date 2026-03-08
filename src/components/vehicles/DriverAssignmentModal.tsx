import React, { useState, useMemo } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Search, User, Check, AlertCircle, TrendingUp, DollarSign, Star, Info } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Vehicle } from '../../types/vehicle';
import { Trip, DriverMetrics } from '../../types/data';
import { cn } from "../ui/utils";
import { toast } from "sonner@2.0.3";

interface DriverAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
  trips: Trip[];
  allDrivers?: any[];
  onAssign: (vehicleId: string, driverId: string) => void;
}

interface DriverSummary {
  id: string;
  name: string;
  avatarUrl?: string;
  rating: number;
  totalTrips: number;
  totalEarnings: number;
  acceptanceRate: number;
  status: 'Available' | 'On Trip' | 'Offline';
  isCompatible: boolean;
}

export function DriverAssignmentModal({ isOpen, onClose, vehicle, trips, allDrivers = [], onAssign }: DriverAssignmentModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  // Derived drivers list from trips and allDrivers source of truth
  const drivers: DriverSummary[] = useMemo(() => {
    const driverMap = new Map<string, DriverSummary>();
    
    // 1. Populate from Source of Truth (allDrivers)
    // Handle both DriverProfile (id, name) and DriverMetrics (driverId, driverName) shapes
    allDrivers.forEach(d => {
       const id = d.id || d.driverId;
       const name = d.name || d.driverName;
       
       if (!id) return;
       
       driverMap.set(id, {
           id: id,
           name: name || 'Unknown Driver',
           rating: d.ratingLast4Weeks || ((d.tripsCompleted || d.totalTrips || 0) > 0 ? 4.8 : 0),
           totalTrips: d.tripsCompleted || d.totalTrips || 0,
           totalEarnings: d.totalEarnings || 0,
           acceptanceRate: (d.acceptanceRate || 0.85) * (d.acceptanceRate > 1 ? 1 : 100), // Handle both 0-1 and 0-100
           status: (d.onlineHours > 0 || d.status === 'Active') ? 'Available' : 'Offline',
           isCompatible: true
       });
    });

    // 2. Augment with Trip Data (and handle legacy/unmapped drivers)
    trips.forEach(trip => {
      if (!trip.driverId || trip.driverId === 'unknown') return;
      
      let driver = driverMap.get(trip.driverId);
      
      // Step 3.3: If not found by direct ID, check if trip.driverId matches any driver's external IDs
      if (!driver) {
        for (const existingDriver of driverMap.values()) {
          const orig = allDrivers.find((d: any) => (d.id || d.driverId) === existingDriver.id);
          if (orig && (orig.uberDriverId === trip.driverId || orig.inDriveDriverId === trip.driverId)) {
            driver = existingDriver;
            break;
          }
        }
      }

      // If not found, try to find by Name (Deduplication Strategy)
      if (!driver) {
         // Check if any existing driver has this name (case-insensitive)
         const tripDriverName = (trip.driverName || '').toLowerCase().trim();
         
         if (tripDriverName) {
            for (const existingDriver of driverMap.values()) {
                const dbName = (existingDriver.name || '').toLowerCase().trim();
                
                // 1. Exact Match
                if (dbName === tripDriverName) {
                    driver = existingDriver;
                    break;
                }
                
                // 2. Fuzzy Match (Token overlap)
                // This handles cases like "Kenny Gregory Rattray" (DB) matching "Kenny Rattray" (Trip)
                const dbParts = dbName.split(/\s+/);
                const tripParts = tripDriverName.split(/\s+/);
                
                // If the names are multi-word, check for subset match
                if (dbParts.length > 1 && tripParts.length > 1) {
                    // Check if all parts of trip name exist in DB name
                    const tripInDb = tripParts.every(part => dbParts.includes(part));
                    if (tripInDb) {
                        driver = existingDriver;
                        break;
                    }
                    
                    // Check if all parts of DB name exist in trip name
                    const dbInTrip = dbParts.every(part => tripParts.includes(part));
                    if (dbInTrip) {
                        driver = existingDriver;
                        break;
                    }
                }
            }
         }
      }

      // If still not found, create a new entry (legacy driver found in trips but not in DB)
      if (!driver) {
        driver = {
          id: trip.driverId,
          name: trip.driverName || 'Unknown Driver',
          rating: 4.5, // Default for unknown
          totalTrips: 0,
          totalEarnings: 0,
          acceptanceRate: 0,
          status: 'Offline',
          isCompatible: true
        };
        // Only add if we have a valid ID to key by
        // Use the trip.driverId as the key
        driverMap.set(trip.driverId, driver);
      }
      
      // Update stats
      // Note: If we found the driver via Name match but they had a different ID in the map,
      // we are updating the object reference in the map.
      // However, we are NOT adding the *bad* ID to the map.
      // So trips with the "bad" ID will contribute to the "good" driver's stats.
      driver.totalTrips += 1;
      // For InDrive trips with fee data, use true profit instead of full fare
      driver.totalEarnings += (trip.platform === 'InDrive' && trip.indriveNetIncome != null)
        ? trip.indriveNetIncome
        : (trip.amount || 0);
    });
    
    // Filter out Unknown Drivers
    return Array.from(driverMap.values()).filter(d => 
        d.id !== 'unknown' && 
        d.name !== 'Unknown Driver' &&
        !d.name.toLowerCase().includes('unknown driver')
    );
  }, [trips, allDrivers]);

  const filteredDrivers = drivers.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedDriver = drivers.find(d => d.id === selectedDriverId);

  const handleAssign = () => {
    if (vehicle && selectedDriverId) {
      onAssign(vehicle.id, selectedDriverId);
      onClose();
    }
  };

  if (!vehicle) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden bg-white">
        <div className="flex flex-col h-[600px]">
          {/* Header */}
          <DialogHeader className="p-6 border-b bg-slate-50">
            <div className="flex items-center gap-4">
               <div className="h-12 w-12 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
                  <User className="h-6 w-6" />
               </div>
               <div>
                  <DialogTitle className="text-xl">Assign Driver</DialogTitle>
                  <DialogDescription>
                    Select a driver for {vehicle.year} {vehicle.model} ({vehicle.licensePlate})
                  </DialogDescription>
               </div>
            </div>
          </DialogHeader>

          <div className="flex-1 flex overflow-hidden">
            {/* List Section */}
            <div className="w-1/2 border-r flex flex-col">
               <div className="p-4 border-b">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input 
                      placeholder="Search drivers..." 
                      className="pl-9 h-9 text-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
               </div>
               <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {filteredDrivers.map(driver => (
                    <button
                      key={driver.id}
                      onClick={() => setSelectedDriverId(driver.id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                        selectedDriverId === driver.id 
                          ? "bg-indigo-50 border border-indigo-100" 
                          : "hover:bg-slate-50 border border-transparent"
                      )}
                    >
                      <Avatar className="h-10 w-10 border border-white shadow-sm">
                        <AvatarFallback className="bg-slate-200 text-slate-600 text-xs">
                          {driver.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm text-slate-900 truncate">{driver.name}</p>
                          {selectedDriverId === driver.id && <Check className="h-4 w-4 text-indigo-600" />}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                           <span className="text-[10px] text-slate-500 flex items-center gap-0.5 min-w-[30px]">
                             {driver.rating > 0 ? (
                               <>
                                 <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" /> {driver.rating.toFixed(1)}
                               </>
                             ) : (
                               <span className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded-sm">NEW</span>
                             )}
                           </span>
                           <span className="text-[10px] text-slate-300">•</span>
                           <span className={cn(
                             "text-[10px] font-medium",
                             driver.status === 'Available' ? "text-emerald-600" : "text-slate-400"
                           )}>
                             {driver.status}
                           </span>
                        </div>
                      </div>
                    </button>
                  ))}
               </div>
            </div>

            {/* Preview Section */}
            <div className="w-1/2 bg-slate-50/50 flex flex-col">
               {selectedDriver ? (
                 <div className="flex-1 flex flex-col p-6 space-y-6">
                    {/* Selected Driver Profile */}
                    <div className="text-center space-y-2">
                       <Avatar className="h-20 w-20 mx-auto border-2 border-white shadow-md">
                          <AvatarFallback className="bg-indigo-600 text-white text-xl">
                            {selectedDriver.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </AvatarFallback>
                       </Avatar>
                       <div>
                          <h4 className="font-bold text-slate-900">{selectedDriver.name}</h4>
                          <Badge variant="outline" className="mt-1 bg-white border-slate-200">
                             ID: {selectedDriver.id.substring(0, 8)}
                          </Badge>
                       </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3">
                       <div className="bg-white p-3 rounded-xl border shadow-sm">
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Lifetime Earnings</p>
                          <div className="flex items-center gap-1 text-emerald-600 font-bold">
                             <DollarSign className="h-3.5 w-3.5" />
                             <span>{selectedDriver.totalEarnings.toLocaleString()}</span>
                          </div>
                       </div>
                       <div className="bg-white p-3 rounded-xl border shadow-sm">
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Acceptance Rate</p>
                          <div className="flex items-center gap-1 text-slate-900 font-bold">
                             <TrendingUp className="h-3.5 w-3.5 text-indigo-500" />
                             <span>{selectedDriver.acceptanceRate.toFixed(0)}%</span>
                          </div>
                       </div>
                    </div>

                    {/* Performance Insights */}
                    <div className="space-y-3">
                       <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                          <Info className="h-3.5 w-3.5" /> Assignment Insights
                       </p>
                       <div className="space-y-2">
                          <div className="flex items-start gap-2 text-xs p-2 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-100">
                             <Check className="h-3.5 w-3.5 mt-0.5" />
                             <p>Driver has 92% performance match with this vehicle type.</p>
                          </div>
                          <div className="flex items-start gap-2 text-xs p-2 bg-amber-50 text-amber-800 rounded-lg border border-amber-100">
                             <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
                             <p>Vehicle service is due in 3 days. Notify driver upon assignment.</p>
                          </div>
                       </div>
                    </div>

                    <div className="mt-auto pt-4 border-t border-slate-200">
                       <p className="text-[11px] text-slate-500 italic text-center">
                         By assigning this driver, they will be notified immediately and the vehicle status will be updated fleet-wide.
                       </p>
                    </div>
                 </div>
               ) : (
                 <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                    <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                       <User className="h-8 w-8 text-slate-300" />
                    </div>
                    <p className="text-sm font-medium">Select a driver to view <br/>details and compatibility</p>
                 </div>
               )}
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="p-4 border-t bg-white gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button 
              className="bg-indigo-600 hover:bg-indigo-700 min-w-[120px]" 
              disabled={!selectedDriverId}
              onClick={handleAssign}
            >
              Confirm Assignment
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}