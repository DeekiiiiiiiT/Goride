// cache-bust: force recompile — 2026-02-10
import React, { useEffect, useState } from 'react';
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { 
  MapPin, 
  Calendar as CalendarIcon, 
  Search,
  ArrowRight,
  Loader2,
  X,
  Banknote,
  Clock,
  Car,
  Navigation
} from "lucide-react";
import { useAuth } from '../auth/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { api } from '../../services/api';
import { Trip } from '../../types/data';
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import { DateRange } from "react-day-picker";
import { startOfDay, endOfDay, format } from "date-fns";
import { 
  Drawer, 
  DrawerContent, 
  DrawerHeader, 
  DrawerTitle, 
  DrawerDescription 
} from "../ui/drawer";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";

export function DriverTrips() {
  const { user } = useAuth();
  const { driverRecord, loading: driverLoading } = useCurrentDriver();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [filteredTrips, setFilteredTrips] = useState<Trip[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  const [hasFetchedAll, setHasFetchedAll] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

  // Initial load: Get only last 4 trips for speed
  useEffect(() => {
    if (!user || driverLoading) return;

    const fetchInitial = async () => {
      try {
        setLoading(true);
        // Pass limit: 4 to only get the latest 4 trips
        const allTrips = await api.getTrips({ limit: 4 });
        
        // Filter by Auth ID OR Resolved Driver ID
        const myTrips = allTrips.filter(t => 
            t.driverId === user.id || 
            (driverRecord?.id && t.driverId === driverRecord.id) ||
            (driverRecord?.driverId && t.driverId === driverRecord.driverId)
        );
        
        // Server already sorts by date desc, but good to be safe if merged
        // myTrips.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        setTrips(myTrips);
        setFilteredTrips(myTrips);
      } catch (error) {
        console.error("Error fetching initial trips:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitial();
  }, [user?.id, driverRecord?.id, driverLoading]);

  // Search/Filter Handler: Fetch ALL if needed
  useEffect(() => {
    const handleSearch = async () => {
        // If user is searching or filtering and we haven't fetched all yet...
        if ((searchTerm || date?.from) && !hasFetchedAll) {
            setLoading(true);
            try {
                const allTrips = await api.getTrips(); // Fetch ALL
                const myTrips = allTrips.filter(t => 
                    t.driverId === user.id || 
                    (driverRecord?.id && t.driverId === driverRecord.id) ||
                    (driverRecord?.driverId && t.driverId === driverRecord.driverId)
                );
                setTrips(myTrips);
                setHasFetchedAll(true);
            } catch (error) {
                console.error("Error fetching all trips:", error);
            } finally {
                setLoading(false);
            }
        }
    };

    const timer = setTimeout(() => {
        handleSearch();
    }, 500); // Debounce slightly to avoid aggressive fetching on first keystroke

    return () => clearTimeout(timer);
  }, [searchTerm, date, hasFetchedAll, user?.id, driverRecord]);

  // Apply Filters Locally
  useEffect(() => {
    let filtered = trips;

    // Filter by Search
    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        filtered = filtered.filter(t => 
            t.pickupLocation?.toLowerCase().includes(lower) ||
            t.dropoffLocation?.toLowerCase().includes(lower) ||
            t.platform.toLowerCase().includes(lower) ||
            t.amount.toString().includes(lower)
        );
    }
    
    // Filter by Date Range
    if (date?.from) {
        const from = startOfDay(date.from);
        const to = date.to ? endOfDay(date.to) : endOfDay(date.from);
        
        filtered = filtered.filter(t => {
            const tripDate = new Date(t.date);
            return tripDate >= from && tripDate <= to;
        });
    }

    setFilteredTrips(filtered);
  }, [searchTerm, date, trips]);

  if (loading) {
      return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 sticky top-0 bg-slate-50 dark:bg-slate-900 pt-2 pb-4 z-10">
         <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input 
               placeholder="Search trips..." 
               className="pl-9 bg-white dark:bg-slate-950"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
            />
         </div>
         
         <Popover>
            <PopoverTrigger asChild>
                <Button 
                    variant="outline" 
                    className={cn(
                        "h-10 w-10 p-0 shrink-0", 
                        date?.from && "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100"
                    )}
                >
                    <CalendarIcon className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                    mode="range"
                    defaultMonth={date?.from}
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                    numberOfMonths={1}
                />
                {date?.from && (
                    <div className="p-2 border-t border-slate-100">
                        <Button 
                            variant="ghost" 
                            className="w-full text-xs h-8 text-slate-500 hover:text-slate-900"
                            onClick={() => setDate(undefined)}
                        >
                            Clear Filter
                        </Button>
                    </div>
                )}
            </PopoverContent>
         </Popover>
      </div>

      <div className="space-y-3">
         {filteredTrips.length === 0 ? (
             <div className="text-center py-10 text-slate-500">
                 No trips found.
             </div>
         ) : (
             filteredTrips.map(trip => (
                <TripCard 
                    key={trip.id}
                    trip={trip}
                    onClick={() => setSelectedTrip(trip)}
                />
             ))
         )}
      </div>

      <Drawer open={!!selectedTrip} onOpenChange={(open) => !open && setSelectedTrip(null)}>
        <DrawerContent className="max-h-[85vh] flex flex-col">
            <DrawerHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 text-left">
                <DrawerTitle>Trip Details</DrawerTitle>
                <DrawerDescription>
                    {selectedTrip && format(new Date(selectedTrip.date), 'MMMM d, yyyy • h:mm a')}
                </DrawerDescription>
            </DrawerHeader>
            {selectedTrip && (
                <ScrollArea className="flex-1">
                    <div className="p-6 space-y-6">
                        {/* Map / Route Visual Placeholder */}
                        <div className="relative space-y-6">
                            <div className="absolute left-[11px] top-2 bottom-8 w-0.5 bg-slate-200 dark:bg-slate-800" />
                            
                            <div className="flex items-start gap-3 relative">
                                <div className="h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 z-10 border border-slate-200 dark:border-slate-700">
                                    <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-0.5">Pickup</p>
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{selectedTrip.pickupLocation || 'Unknown Location'}</p>
                                    {selectedTrip.requestTime && (
                                        <p className="text-xs text-slate-500 mt-0.5">{format(new Date(selectedTrip.requestTime), 'h:mm a')}</p>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex items-start gap-3 relative">
                                <div className="h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 z-10 border border-slate-200 dark:border-slate-700">
                                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-0.5">Dropoff</p>
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{selectedTrip.dropoffLocation || 'Unknown Location'}</p>
                                    {selectedTrip.dropoffTime && (
                                        <p className="text-xs text-slate-500 mt-0.5">{format(new Date(selectedTrip.dropoffTime), 'h:mm a')}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <Separator />

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-1">
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> Duration
                                </p>
                                <p className="text-sm font-medium">{selectedTrip.duration ? `${Math.round(selectedTrip.duration)} min` : '--'}</p>
                             </div>
                             <div className="space-y-1">
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <Navigation className="h-3 w-3" /> Distance
                                </p>
                                <p className="text-sm font-medium">{selectedTrip.distance ? `${selectedTrip.distance.toFixed(1)} km` : '--'}</p>
                             </div>
                             <div className="space-y-1">
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <Car className="h-3 w-3" /> Vehicle
                                </p>
                                <p className="text-sm font-medium">{selectedTrip.vehicleId || '--'}</p>
                             </div>
                             <div className="space-y-1">
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                    Platform
                                </p>
                                <Badge variant="secondary" className="text-xs font-normal">
                                    {selectedTrip.platform}
                                </Badge>
                             </div>
                        </div>

                        <Separator />

                        {/* Financials */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-semibold">Earnings Breakdown</h4>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Base Fare</span>
                                    <span>${(selectedTrip.fareBreakdown?.baseFare || selectedTrip.amount || 0).toFixed(2)}</span>
                                </div>
                                {!!selectedTrip.fareBreakdown?.tips && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Tip</span>
                                        <span>${selectedTrip.fareBreakdown.tips.toFixed(2)}</span>
                                    </div>
                                )}
                                {!!selectedTrip.fareBreakdown?.surge && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Surge / Promotions</span>
                                        <span>${selectedTrip.fareBreakdown.surge.toFixed(2)}</span>
                                    </div>
                                )}
                                {!!selectedTrip.tollCharges && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Tolls</span>
                                        <span>${selectedTrip.tollCharges.toFixed(2)}</span>
                                    </div>
                                )}
                                <Separator className="my-2" />
                                <div className="flex justify-between text-sm font-bold">
                                    <span>Total Earnings</span>
                                    <span>${(selectedTrip.amount + (selectedTrip.fareBreakdown?.tips || 0) + (selectedTrip.tollCharges || 0) + (selectedTrip.fareBreakdown?.surge || 0)).toFixed(2)}</span>
                                </div>
                            </div>

                            {((Math.abs(Number(selectedTrip.cashCollected || 0)) > 0) || ['goride', 'private', 'cash'].includes((selectedTrip.platform || '').toLowerCase())) && (
                                <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900 mt-4">
                                    <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                                        <div className="flex items-center gap-2">
                                            <Banknote className="h-4 w-4" />
                                            <span className="text-sm font-medium">Cash Collected</span>
                                        </div>
                                        <span className="font-bold">-${(Math.abs(Number(selectedTrip.cashCollected)) || selectedTrip.amount || 0).toFixed(2)}</span>
                                    </div>
                                    <p className="text-xs text-emerald-600/80 dark:text-emerald-500/80 mt-1">
                                        Collected directly from rider. Deducted from payout.
                                    </p>
                                </div>
                            )}

                             <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg flex justify-between items-center">
                                <span className="font-medium text-slate-900 dark:text-slate-100">Net Payout</span>
                                <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
                                    ${(selectedTrip.netPayout || selectedTrip.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function TripCard({ trip, onClick }: { trip: Trip, onClick: () => void }) {
   // Heuristic: If we have explicit cash collected OR the net payout is negative (implying cash collection > earnings), treat as cash trip.
   const amount = trip.netPayout || trip.amount;
   const isCash = (Math.abs(Number(trip.cashCollected || 0)) > 0) || amount < 0 || ['goride', 'private', 'cash'].includes((trip.platform || '').toLowerCase());
   const date = new Date(trip.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

   const isResolving = (loc: string | undefined, lat: number | undefined) => {
       return (!loc || loc === 'Manual Entry' || loc.startsWith('Lat:')) && !!lat;
   };

   return (
      <Card 
        className="hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer transition-colors group"
        onClick={onClick}
      >
         <CardContent className="p-4">
            <div className="flex justify-between items-start mb-3">
               <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {date}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                      {trip.isLiveRecorded ? (
                          <Badge variant="outline" className="text-xs font-normal bg-indigo-50 text-indigo-600 border-indigo-200">
                             Live Trip
                          </Badge>
                      ) : (
                          <Badge variant="outline" className="text-xs font-normal text-slate-500 border-slate-200">
                             {trip.platform}
                          </Badge>
                      )}
                      {isCash && (
                          <Badge variant="secondary" className="text-xs font-normal bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-transparent flex items-center gap-1">
                              <Banknote className="h-3 w-3" />
                              Cash
                          </Badge>
                      )}
                  </div>
               </div>
               <span className={cn(
                   "font-bold text-slate-900 dark:text-slate-100",
               )}>
                   ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
               </span>
            </div>
            
            <div className="relative pl-4 space-y-4">
               {/* Line */}
               <div className="absolute left-[5px] top-2 bottom-6 w-0.5 bg-slate-200 dark:bg-slate-800" />
               
               <div className="flex items-start gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500 mt-1.5 shrink-0 relative z-10" />
                  {isResolving(trip.pickupLocation, trip.startLat) ? (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 animate-pulse font-medium">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Resolving location...
                      </div>
                  ) : (
                      <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{trip.pickupLocation || 'Unknown'}</p>
                  )}
               </div>
               <div className="flex items-start gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 mt-1.5 shrink-0 relative z-10" />
                  {isResolving(trip.dropoffLocation, trip.endLat) ? (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 animate-pulse font-medium">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Resolving location...
                      </div>
                  ) : (
                      <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{trip.dropoffLocation || 'Unknown'}</p>
                  )}
               </div>
            </div>
         </CardContent>
      </Card>
   )
}