import React, { useEffect, useState, useMemo } from 'react';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "../ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Loader2, Search, MapPin, MoreHorizontal, Copy } from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "../ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { toast } from "sonner";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { api } from '../../services/api';
import { Trip } from '../../types/data';
import { FleetMap } from '../dashboard/FleetMap';
import { TripStatsCard } from './TripStatsCard';
import { TripFilters, TripFilterState } from './TripFilters';
import { CancellationAnalysis } from './CancellationAnalysis';
import { RouteAnalysis } from './RouteAnalysis';
import { ReportGenerator } from './ReportGenerator';
import { startOfDay, subDays, isSameDay, isAfter, isBefore, endOfDay } from 'date-fns';

export function TripLogsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Action State
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [viewMode, setViewMode] = useState<'details' | 'map' | 'issue' | null>(null);
  const [issueReason, setIssueReason] = useState('');
  const [filters, setFilters] = useState<TripFilterState>({
    status: 'all',
    driverId: 'all',
    vehicleId: 'all',
    dateRange: 'today', // Default to Today
    dateStart: '',
    dateEnd: '',
    minEarnings: '',
    maxEarnings: '',
    minDistance: '',
    hasTip: 'all',
    hasSurge: 'all'
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    const fetchTrips = async () => {
      try {
        setLoading(true);
        const data = await api.getTrips();
        // Sort by requestTime or date descending
        const sorted = data.sort((a, b) => {
            const tA = new Date(a.requestTime || a.date).getTime();
            const tB = new Date(b.requestTime || b.date).getTime();
            return tB - tA;
        });
        setTrips(sorted);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTrips();
  }, []);

  // Derived Lists for Filters
  const uniqueDrivers = useMemo(() => {
      const map = new Map();
      trips.forEach(t => {
          if(t.driverId && !map.has(t.driverId)) {
              map.set(t.driverId, t.driverName || t.driverId);
          }
      });
      return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [trips]);

  const uniqueVehicles = useMemo(() => {
      const map = new Map();
      trips.forEach(t => {
          if(t.vehicleId && !map.has(t.vehicleId)) {
              map.set(t.vehicleId, t.vehicleId); 
          }
      });
      return Array.from(map.entries()).map(([id, plate]) => ({ id, plate }));
  }, [trips]);

  // Filter Logic
  const filteredTrips = useMemo(() => {
      return trips.filter(t => {
          // 1. Search Term
          const term = searchTerm.toLowerCase();
          const matchesSearch = !term || 
             t.id.toLowerCase().includes(term) ||
             (t.driverName || '').toLowerCase().includes(term) ||
             (t.pickupLocation || '').toLowerCase().includes(term) ||
             (t.dropoffLocation || '').toLowerCase().includes(term);

          if (!matchesSearch) return false;

          // 2. Status
          if (filters.status !== 'all' && t.status !== filters.status) return false;

          // 3. Driver
          if (filters.driverId !== 'all' && t.driverId !== filters.driverId) return false;

          // 4. Vehicle
          if (filters.vehicleId !== 'all' && t.vehicleId !== filters.vehicleId) return false;

          // 5. Date Range
          const tDate = new Date(t.requestTime || t.date);
          const today = new Date();
          
          // SEARCH OVERRIDE: If user is searching (min 2 chars) and hasn't changed the default 'today' filter,
          // we look across all time. This fixes "Can't search for a trip" even if it's old.
          const isDefaultDateFilter = filters.dateRange === 'today';
          const isSearching = searchTerm.length >= 2;

          if (isDefaultDateFilter && isSearching) {
              // Bypass date check to allow global search
          } else if (filters.dateRange === 'today') {
              if (!isSameDay(tDate, today)) return false;
          } else if (filters.dateRange === 'yesterday') {
              if (!isSameDay(tDate, subDays(today, 1))) return false;
          } else if (filters.dateRange === 'week') {
              if (isBefore(tDate, subDays(today, 7))) return false;
          } else if (filters.dateRange === 'month') {
              if (isBefore(tDate, subDays(today, 30))) return false;
          } else if (filters.dateRange === 'custom' && filters.dateStart && filters.dateEnd) {
              const start = startOfDay(new Date(filters.dateStart));
              const end = endOfDay(new Date(filters.dateEnd));
              if (isBefore(tDate, start) || isAfter(tDate, end)) return false;
          }

          // 6. Advanced Filters
          if (filters.minEarnings && (t.amount || 0) < parseFloat(filters.minEarnings)) return false;
          if (filters.maxEarnings && (t.amount || 0) > parseFloat(filters.maxEarnings)) return false;
          if (filters.minDistance && (t.distance || 0) < parseFloat(filters.minDistance)) return false;

          if (filters.hasTip !== 'all') {
              const tip = t.fareBreakdown?.tips || 0;
              if (filters.hasTip === 'yes' && tip <= 0) return false;
              if (filters.hasTip === 'no' && tip > 0) return false;
          }

          if (filters.hasSurge !== 'all') {
              const surge = t.fareBreakdown?.surge || 0;
              if (filters.hasSurge === 'yes' && surge <= 0) return false;
              if (filters.hasSurge === 'no' && surge > 0) return false;
          }

          return true;
      });
  }, [trips, filters, searchTerm]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredTrips.length / pageSize);
  const paginatedTrips = filteredTrips.slice((page - 1) * pageSize, page * pageSize);

  const handleFilterChange = (newFilters: TripFilterState) => {
      setFilters(newFilters);
      setPage(1);
  };

  const handleAction = (trip: Trip, mode: 'details' | 'map' | 'issue') => {
      setSelectedTrip(trip);
      setViewMode(mode);
      setIssueReason('');
  };

  const handleContactDriver = (trip: Trip) => {
      toast.success(`Contact request sent to ${trip.driverName || 'driver'}`);
  };

  const submitIssue = () => {
      if (!issueReason) {
          toast.error("Please provide a reason");
          return;
      }
      toast.success("Issue flagged successfully", {
          description: `Ticket created for Trip #${selectedTrip?.id.slice(0, 8)}`
      });
      setViewMode(null);
  };

  const handleCopyDetails = (e: React.MouseEvent) => {
      if (!selectedTrip) return;
      
      const details = `Trip Details
----------------
ID: ${selectedTrip.id}
Date: ${new Date(selectedTrip.requestTime || selectedTrip.date).toLocaleString()}
Status: ${selectedTrip.status}

Driver: ${selectedTrip.driverName || 'N/A'}
Vehicle: ${selectedTrip.vehicleId || 'N/A'}

Route:
Pickup: ${selectedTrip.pickupLocation || 'N/A'}
Dropoff: ${selectedTrip.dropoffLocation || 'N/A'}
Distance: ${selectedTrip.distance} km
Duration: ${selectedTrip.duration} min

Financials:
Total Fare: $${selectedTrip.amount?.toFixed(2)}
${selectedTrip.fareBreakdown ? Object.entries(selectedTrip.fareBreakdown).map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: $${Number(v).toFixed(2)}`).join('\n') : ''}
`;
      
      const copyToClipboardFallback = (text: string) => {
          try {
              const textArea = document.createElement("textarea");
              textArea.value = text;
              
              // Ensure it's not visible but part of the DOM
              textArea.style.position = "fixed";
              textArea.style.left = "-9999px";
              textArea.style.top = "0";
              textArea.setAttribute("readonly", "");
              
              // Append to the button's parent (DialogFooter) to ensure it's within the focus trap context
              // This is critical for modals that trap focus
              const container = e.currentTarget.parentNode || document.body;
              container.appendChild(textArea);
              
              textArea.focus();
              textArea.select();
              textArea.setSelectionRange(0, 99999); // For mobile devices
              
              const successful = document.execCommand('copy');
              container.removeChild(textArea);
              return successful;
          } catch (err) {
              console.error("Fallback copy failed", err);
              return false;
          }
      };

      // Try fallback (legacy execCommand) first to preserve user gesture context
      if (copyToClipboardFallback(details)) {
          toast.success("Trip details copied to clipboard");
          return;
      }

      // If legacy failed, try modern API as a backup
      navigator.clipboard.writeText(details)
          .then(() => {
              toast.success("Trip details copied to clipboard");
          })
          .catch((err) => {
              console.error("Copy failed", err);
              toast.error("Failed to copy details", {
                  description: "Please manually select and copy the text."
              });
          });
  };

  if (loading) {
     return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Trip Analytics</h2>
          <p className="text-slate-500">
            Real-time trip analytics, cancellation insights, and fleet performance.
          </p>
        </div>
        <ReportGenerator trips={filteredTrips} />
      </div>

      {/* Global Filter Bar */}
      <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur py-2 border-b border-slate-200 -mx-6 px-6 shadow-sm">
           <TripFilters 
              filters={filters} 
              onFilterChange={handleFilterChange}
              drivers={uniqueDrivers}
              vehicles={uniqueVehicles}
           />
      </div>

      {/* Summary Stats (Always visible) */}
      <TripStatsCard trips={filteredTrips} />

      <Tabs defaultValue="manifest" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-[700px]">
          <TabsTrigger value="manifest">Trip Manifest</TabsTrigger>
          <TabsTrigger value="analysis">Cancellation Analysis</TabsTrigger>
          <TabsTrigger value="routes">Route Analytics</TabsTrigger>
        </TabsList>
        
        <TabsContent value="manifest" className="mt-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b bg-slate-50/50">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                      <CardTitle>Detailed Logs</CardTitle>
                      <Badge variant="secondary" className="font-normal text-slate-500">
                          {filteredTrips.length} records
                      </Badge>
                  </div>
                  
                  {/* Search within filtered results */}
                  <div className="relative w-[300px]">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                    <Input 
                      placeholder="Search ID, driver, location..." 
                      className="pl-8 bg-white" 
                      value={searchTerm}
                      onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                    />
                  </div>
               </div>
            </CardHeader>
            
            <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead className="w-[180px]">Time / Date</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Metrics</TableHead>
                      <TableHead className="text-right">Earnings</TableHead>
                      <TableHead className="text-center">Eff.</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTrips.length > 0 ? (
                      paginatedTrips.map((trip) => (
                        <TableRow key={trip.id} className="hover:bg-slate-50/50 group">
                          <TableCell className="align-top">
                            <div className="flex flex-col">
                                <span className="font-medium text-slate-900">
                                    {new Date(trip.requestTime || trip.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                                <span className="text-xs text-slate-500">
                                    {new Date(trip.requestTime || trip.date).toLocaleDateString()}
                                </span>
                                {trip.timeOfDay !== undefined && (
                                    <Badge variant="outline" className="w-fit mt-1 text-[10px] h-5 px-1 font-normal text-slate-400 border-slate-200">
                                        {trip.timeOfDay}:00 Hour
                                    </Badge>
                                )}
                            </div>
                          </TableCell>
                          
                          <TableCell className="align-top">
                            <div className="flex flex-col">
                                <span className="font-medium text-slate-900">{trip.driverName || 'Unknown Driver'}</span>
                                <span className="text-xs text-slate-500 font-mono mb-1">{trip.vehicleId || 'No Vehicle'}</span>
                                {trip.productType && (
                                    <Badge variant="secondary" className="w-fit text-[10px] h-5 px-1 bg-slate-100 text-slate-600">
                                        {trip.productType}
                                    </Badge>
                                )}
                            </div>
                          </TableCell>

                          <TableCell className="align-top max-w-[300px]">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-start gap-2 text-sm">
                                    <div className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                                    <span className="text-slate-700 truncate" title={trip.pickupLocation}>
                                        {trip.pickupArea || trip.pickupLocation || 'Unknown Pickup'}
                                    </span>
                                </div>
                                <div className="pl-0.5 ml-0.5 border-l-2 border-slate-100 h-3" />
                                <div className="flex items-start gap-2 text-sm">
                                    <div className="mt-1 h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                                    <span className="text-slate-700 truncate" title={trip.dropoffLocation}>
                                        {trip.dropoffArea || trip.dropoffLocation || 'Unknown Dropoff'}
                                    </span>
                                </div>
                            </div>
                          </TableCell>

                          <TableCell className="align-top">
                            <div className="flex flex-col gap-1 text-sm text-slate-600">
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-3 w-3 text-slate-400" />
                                    <span>{(trip.distance || 0).toFixed(1)} km</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono bg-slate-100 px-1 rounded">
                                        {(trip.duration || 0).toFixed(0)} min
                                    </span>
                                </div>
                            </div>
                          </TableCell>

                          <TableCell className="align-top text-right">
                            <div className="flex flex-col items-end">
                                <span className="font-bold text-slate-900">
                                    ${(trip.amount || 0).toFixed(2)}
                                </span>
                                {trip.fareBreakdown?.tips ? (
                                    <span className="text-xs text-emerald-600 flex items-center gap-1">
                                        +${trip.fareBreakdown.tips.toFixed(2)} Tip
                                    </span>
                                ) : null}
                            </div>
                          </TableCell>

                          <TableCell className="align-top text-center">
                             {trip.efficiencyScore ? (
                                 <div className={`text-xs font-bold px-2 py-1 rounded-full inline-block
                                    ${trip.efficiencyScore >= 80 ? 'bg-emerald-50 text-emerald-700' :
                                      trip.efficiencyScore >= 50 ? 'bg-amber-50 text-amber-700' :
                                      'bg-rose-50 text-rose-700'
                                    }
                                 `}>
                                     {trip.efficiencyScore}
                                 </div>
                             ) : (
                                 <span className="text-slate-300">-</span>
                             )}
                          </TableCell>

                          <TableCell className="align-top text-center">
                            <Badge 
                              variant="outline"
                              className={`
                                ${trip.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                  trip.status === 'Cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200' : 
                                  'bg-amber-50 text-amber-700 border-amber-200'
                                }
                              `}
                            >
                              {trip.status}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handleAction(trip, 'details')}>View Details</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleAction(trip, 'map')}>Map Route</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleContactDriver(trip)}>Contact Driver</DropdownMenuItem>
                                <DropdownMenuItem className="text-rose-600" onClick={() => handleAction(trip, 'issue')}>Flag Issue</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="h-64 text-center text-slate-500">
                           <div className="flex flex-col items-center justify-center gap-2">
                               <Search className="h-8 w-8 text-slate-300" />
                               <p>No trips found matching your filters.</p>
                               <Button variant="link" onClick={() => setFilters({...filters, status: 'all', dateRange: 'all'})}>
                                   Clear Filters
                               </Button>
                           </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
            </CardContent>
            
            {/* Pagination Footer */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t bg-slate-50/50">
                   <div className="text-sm text-slate-500">
                       Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, filteredTrips.length)} of {filteredTrips.length} entries
                   </div>
                   <div className="flex gap-2">
                       <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                       >
                        Previous
                       </Button>
                       <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                       >
                        Next
                       </Button>
                   </div>
                </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="mt-4">
             <CancellationAnalysis trips={filteredTrips} />
        </TabsContent>

        <TabsContent value="routes" className="mt-4">
             <RouteAnalysis trips={filteredTrips} />
        </TabsContent>
      </Tabs>

      {/* Action Dialogs */}
      <Dialog open={!!selectedTrip && !!viewMode} onOpenChange={(open) => !open && setViewMode(null)}>
        <DialogContent className={`sm:max-w-[600px] ${viewMode === 'map' ? 'sm:max-w-[900px]' : ''}`}>
          <DialogHeader>
            <DialogTitle>
                {viewMode === 'details' && 'Trip Details'}
                {viewMode === 'map' && 'Route Map'}
                {viewMode === 'issue' && 'Flag Issue'}
            </DialogTitle>
            <DialogDescription>
                Trip ID: {selectedTrip?.id} • {selectedTrip?.date ? new Date(selectedTrip.date).toLocaleDateString() : ''}
            </DialogDescription>
          </DialogHeader>
          
          {viewMode === 'details' && selectedTrip && (
              <>
              <div className="grid grid-cols-2 gap-4 py-4">
                  <div className="space-y-1">
                      <Label className="text-slate-500">Driver</Label>
                      <div className="font-medium">{selectedTrip.driverName}</div>
                  </div>
                  <div className="space-y-1">
                      <Label className="text-slate-500">Vehicle</Label>
                      <div className="font-medium">{selectedTrip.vehicleId}</div>
                  </div>
                  <div className="space-y-1">
                      <Label className="text-slate-500">Pickup</Label>
                      <div className="font-medium">{selectedTrip.pickupLocation}</div>
                  </div>
                   <div className="space-y-1">
                      <Label className="text-slate-500">Dropoff</Label>
                      <div className="font-medium">{selectedTrip.dropoffLocation}</div>
                  </div>
                  <div className="space-y-1">
                      <Label className="text-slate-500">Fare</Label>
                      <div className="font-medium">${selectedTrip.amount?.toFixed(2)}</div>
                  </div>
                  <div className="space-y-1">
                      <Label className="text-slate-500">Status</Label>
                      <div className="font-medium">{selectedTrip.status}</div>
                  </div>
                  <div className="col-span-2 pt-2 border-t mt-2">
                       <Label className="text-slate-500">Notes / Breakdown</Label>
                       <div className="text-sm mt-1 text-slate-700 bg-slate-50 p-3 rounded-md border">
                           {selectedTrip.notes ? (
                               <p className="whitespace-pre-wrap">{selectedTrip.notes}</p>
                           ) : selectedTrip.fareBreakdown ? (
                               <div className="space-y-1.5">
                                   {Object.entries(selectedTrip.fareBreakdown).map(([key, value]) => {
                                       // Convert camelCase to Title Case (e.g., baseFare -> Base Fare)
                                       const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                       return (
                                           <div key={key} className="flex justify-between items-center text-xs">
                                               <span className="text-slate-500">{label}</span>
                                               <span className="font-medium text-slate-900">${Number(value).toFixed(2)}</span>
                                           </div>
                                       );
                                   })}
                               </div>
                           ) : (
                               <span className="text-slate-400 italic">No additional details available.</span>
                           )}
                       </div>
                  </div>
              </div>
              <DialogFooter className="sm:justify-between sm:space-x-2">
                 <Button type="button" variant="outline" size="sm" onClick={handleCopyDetails} className="gap-2">
                    <Copy className="h-4 w-4" />
                    Copy Details
                 </Button>
                 <Button type="button" onClick={() => setViewMode(null)}>Close</Button>
              </DialogFooter>
              </>
          )}

          {viewMode === 'map' && selectedTrip && (
              <div className="h-[500px] w-full mt-2">
                  <FleetMap trips={[selectedTrip]} />
              </div>
          )}

          {viewMode === 'issue' && (
              <div className="py-4 space-y-4">
                  <div className="space-y-2">
                      <Label>Reason for flagging</Label>
                      <Textarea 
                        placeholder="Describe the issue (e.g. Fare dispute, Driver behavior, Safety concern)..."
                        value={issueReason}
                        onChange={(e) => setIssueReason(e.target.value)}
                        className="min-h-[100px]"
                      />
                  </div>
                  <DialogFooter>
                      <Button variant="outline" onClick={() => setViewMode(null)}>Cancel</Button>
                      <Button variant="destructive" onClick={submitIssue}>Submit Report</Button>
                  </DialogFooter>
              </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
