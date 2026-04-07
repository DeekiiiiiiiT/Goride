import React, { useState, useMemo } from 'react';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "../ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Loader2, Search, MapPin, MoreHorizontal, Plus, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "../ui/dropdown-menu";
import { toast } from "sonner";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { api, TripFilterParams } from '../../services/api';
import { Trip } from '../../types/data';
import { useVocab } from '../../utils/vocabulary';
import { TripStatsCard } from './TripStatsCard';
import { ManualTripForm } from './ManualTripForm';
import { TripFilters, TripFilterState } from './TripFilters';
import { CancellationAnalysis } from './CancellationAnalysis';
import { RouteAnalysis } from './RouteAnalysis';
import { ReportGenerator } from './ReportGenerator';
import { IntegrityDashboard } from './IntegrityDashboard';
import { TripDetailsDialog } from './TripDetailsDialog';
import { TripMapDialog } from './TripMapDialog';
import { TripIssueDialog } from './TripIssueDialog';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { createManualTrip, ManualTripInput } from '../../utils/tripFactory';
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth } from 'date-fns';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { resolveMissingTripAddresses } from '../../utils/addressResolver';

// Helper to parse "YYYY-MM-DD" as local midnight to avoid UTC conversion issues
const parseLocalDate = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export function TripLogsPage() {
  const queryClient = useQueryClient();
  const { v } = useVocab();
  const [viewMode, setViewMode] = useState<'details' | 'map' | 'issue' | null>(null);
  const [isManualTripOpen, setIsManualTripOpen] = useState(false);
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);

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
    hasSurge: 'all',
    tripType: 'all',
    platform: 'all'
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // 1. Fetch Filter Options
  const { data: availableDrivers = [] } = useQuery({
    queryKey: ['drivers', 'options'],
    queryFn: async () => {
        const drivers = await api.getDrivers();
        return drivers.map((d: any) => ({
            id: d.id, 
            name: d.name || 'Unknown'
        }));
    }
  });

  const { data: availableVehicles = [] } = useQuery({
    queryKey: ['vehicles', 'options'],
    queryFn: async () => {
        const vehicles = await api.getVehicles();
        return vehicles.map((v: any) => ({
            id: v.id, 
            plate: v.plateNumber || v.id
        }));
    }
  });

  // 2. Construct Query Params
  const queryParams = useMemo(() => {
    const params: TripFilterParams = {
        limit: pageSize,
        offset: (page - 1) * pageSize
    };

    if (filters.driverId !== 'all') params.driverId = filters.driverId;
    if (filters.status !== 'all') params.status = filters.status;
    if (filters.platform !== 'all' && filters.platform) params.platform = filters.platform;
    if (filters.tripType !== 'all' && filters.tripType) params.tripType = filters.tripType;
    if (filters.vehicleId !== 'all' && filters.vehicleId) params.vehicleId = filters.vehicleId;
    if (filters.minEarnings) params.minEarnings = filters.minEarnings;
    if (filters.maxEarnings) params.maxEarnings = filters.maxEarnings;
    if (filters.minDistance) params.minDistance = filters.minDistance;
    if (filters.hasTip !== 'all' && filters.hasTip) params.hasTip = filters.hasTip;
    if (filters.hasSurge !== 'all' && filters.hasSurge) params.hasSurge = filters.hasSurge;

    // Date Logic
    const today = new Date();
    let start: Date | null = null;
    let end: Date | null = null;

    if (filters.dateRange === 'today') {
        start = startOfDay(today);
        end = endOfDay(today);
    } else if (filters.dateRange === 'yesterday') {
        const yest = subDays(today, 1);
        start = startOfDay(yest);
        end = endOfDay(yest);
    } else if (filters.dateRange === 'week') {
        // Changed to start of week (Monday) to match user expectation of "this week"
        // confusingly labeled "Last 7 Days" in UI, but usually users mean "This Week"
        start = startOfWeek(today, { weekStartsOn: 1 }); 
        end = endOfDay(today);
    } else if (filters.dateRange === 'month') {
        start = startOfMonth(today);
        end = endOfDay(today);
    } else if (filters.dateRange === 'custom' && filters.dateStart && filters.dateEnd) {
        start = startOfDay(parseLocalDate(filters.dateStart));
        end = endOfDay(parseLocalDate(filters.dateEnd));
    } else if (filters.dateRange === 'period' && filters.dateStart && filters.dateEnd) {
        start = startOfDay(parseLocalDate(filters.dateStart));
        end = endOfDay(parseLocalDate(filters.dateEnd));
    }

    if (start && end) {
        params.startDate = start.toISOString();
        params.endDate = end.toISOString();
    }
    return params;
  }, [filters, page]);

  // 3. Main Data Query
  const { 
    data: tripData, 
    isLoading: tripsLoading, 
    error: tripsError 
  } = useQuery({
    queryKey: ['trips', queryParams],
    queryFn: () => api.getTripsFiltered(queryParams),
    placeholderData: keepPreviousData,
  });

  const trips = tripData?.data || [];
  const hasMore = (tripData?.data?.length || 0) === pageSize;

  // Background Address Resolution - DISABLED to prevent infinite re-render loop.
  // The effect depended on `trips` array reference which changes on every query,
  // and invalidateQueries inside it would trigger another query → new reference → loop.
  // TODO: Re-implement with a stable dependency (e.g. trip IDs string) and a "resolved" cache.

  // 4. Stats Query (Independent of page)
  const statsParams = useMemo(() => {
    const { limit, offset, ...rest } = queryParams;
    return rest;
  }, [queryParams]);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['tripStats', statsParams],
    queryFn: () => api.getTripStats(statsParams),
  });

  // 5. Mutations
  const createTripMutation = useMutation({
    mutationFn: (trip: Trip) => api.saveTrips([trip]),
    onSuccess: () => {
        toast.success("Manual Trip Logged");
        queryClient.invalidateQueries({ queryKey: ['trips'] });
        queryClient.invalidateQueries({ queryKey: ['tripStats'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to save trip")
  });

  const deleteTripMutation = useMutation({
    mutationFn: (id: string) => api.deleteTrip(id),
    onSuccess: () => {
        toast.success("Trip deleted successfully");
        queryClient.invalidateQueries({ queryKey: ['trips'] });
        queryClient.invalidateQueries({ queryKey: ['tripStats'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        setTripToDelete(null);
    },
    onError: (err: any) => toast.error("Failed to delete trip")
  });

  const handleManualTripSubmit = async (data: ManualTripInput, driverId?: string) => {
    if (!driverId) {
        toast.error("Driver must be selected");
        return;
    }
    const driverName = availableDrivers.find((d: any) => d.id === driverId)?.name || 'Unknown';
    try {
        const trip = createManualTrip(data, driverId, driverName);
        createTripMutation.mutate(trip);
    } catch (e: any) {
        toast.error(e.message);
    }
  };

  const handleFilterChange = (newFilters: TripFilterState) => {
      setFilters(newFilters);
      setPage(1); 
  };

  const handleAction = (trip: Trip, mode: 'details' | 'map' | 'issue') => {
      setSelectedTrip(trip);
      setViewMode(mode);
  };

  const handleContactDriver = (trip: Trip) => {
      toast.success(`Contact request sent to ${trip.driverName || 'driver'}`);
  };

  const handleDeleteTrip = async (trip: Trip) => {
      setTripToDelete(trip);
  };
  
  const confirmDeleteTrip = async () => {
      if (!tripToDelete) return;
      deleteTripMutation.mutate(tripToDelete.id);
  };

  const handleIssueSubmit = async (tripId: string, reason: string) => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      toast.success("Issue flagged successfully", {
          description: `Ticket created for Trip #${tripId.slice(0, 8)}`
      });
      setViewMode(null);
  };

  // Convert a Trip object → initialData for the ManualTripForm edit mode
  const tripToInitialData = (trip: Trip) => {
    const tripDate = new Date(trip.requestTime || trip.date);
    const year = tripDate.getFullYear();
    const month = String(tripDate.getMonth() + 1).padStart(2, '0');
    const day = String(tripDate.getDate()).padStart(2, '0');
    const hours = String(tripDate.getHours()).padStart(2, '0');
    const minutes = String(tripDate.getMinutes()).padStart(2, '0');

    let endTime: string | undefined;
    let duration: number | undefined = trip.duration;
    if (trip.dropoffTime) {
      const dropoff = new Date(trip.dropoffTime);
      endTime = `${String(dropoff.getHours()).padStart(2, '0')}:${String(dropoff.getMinutes()).padStart(2, '0')}`;
      if (!duration) {
        duration = Math.round((dropoff.getTime() - tripDate.getTime()) / 60000);
      }
    }

    return {
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}`,
      endTime,
      duration,
      pickupLocation: trip.pickupLocation || '',
      pickupCoords: trip.startLat != null && trip.startLng != null ? { lat: trip.startLat, lon: trip.startLng } : undefined,
      endLocation: trip.dropoffLocation || '',
      dropoffCoords: trip.endLat != null && trip.endLng != null ? { lat: trip.endLat, lon: trip.endLng } : undefined,
      route: trip.route || [],
      stops: trip.stops || [],
      totalWaitTime: trip.totalWaitTime || 0,
      distance: trip.distance || 0,
      isLiveRecorded: false, // Always show all editable fields
      resolutionMethod: trip.resolutionMethod as any,
      resolutionTimestamp: trip.resolutionTimestamp,
      geocodeError: trip.geocodeError,
    };
  };

  const handleEditTrip = (trip: Trip) => {
    setEditingTrip(trip);
    setIsManualTripOpen(true);
  };

  const handleEditFormClose = (open: boolean) => {
    if (!open) {
      setEditingTrip(null);
    }
    setIsManualTripOpen(open);
  };

  // Edit-aware submit: deletes the old trip, saves the updated one with the same ID
  const handleEditTripSubmit = async (data: ManualTripInput, driverId?: string) => {
    if (!driverId) {
      toast.error("Driver must be selected");
      return;
    }
    if (!editingTrip) return;

    const driverName = availableDrivers.find((d: any) => d.id === driverId)?.name || 'Unknown';
    try {
      const newTrip = createManualTrip(data, driverId, driverName);
      // Preserve the original trip ID so the KV upsert overwrites the old entry
      newTrip.id = editingTrip.id;
      // Preserve metadata from the original trip that the form doesn't cover
      newTrip.batchId = editingTrip.batchId;
      newTrip.isManual = editingTrip.isManual;

      await api.saveTrips([newTrip]);
      toast.success("Trip Updated", { description: `Trip ${editingTrip.id.slice(0, 12)}… saved.` });
      setEditingTrip(null);
      setIsManualTripOpen(false);
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['tripStats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e: any) {
      console.error("Failed to update trip", e);
      toast.error(e.message || "Failed to update trip");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">{v('tripsPageTitle')}</h2>
          <p className="text-slate-500">
            {v('tripsPageSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
            <Button onClick={() => setIsManualTripOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="mr-2 h-4 w-4" />
                Log Manual Trip
            </Button>
            <ReportGenerator trips={trips} />
        </div>
      </div>

      {/* Global Filter Bar */}
      <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur py-2 border-b border-slate-200 -mx-6 px-6 shadow-sm">
           <TripFilters 
              filters={filters} 
              onFilterChange={handleFilterChange}
              drivers={availableDrivers}
              vehicles={availableVehicles}
           />
      </div>

      {/* Summary Stats (Reflects current filters) */}
      <TripStatsCard trips={trips} stats={stats} loading={statsLoading} />

      <Tabs defaultValue="manifest" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-[850px]">
          <TabsTrigger value="manifest">Trip Manifest</TabsTrigger>
          <TabsTrigger value="analysis">Cancellation Analysis</TabsTrigger>
          <TabsTrigger value="routes">Route Analytics</TabsTrigger>
          <TabsTrigger value="integrity">Data Integrity</TabsTrigger>
        </TabsList>
        
        <TabsContent value="manifest" className="mt-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b bg-slate-50/50">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                      <CardTitle>Detailed Logs</CardTitle>
                      <Badge variant="secondary" className="font-normal text-slate-500">
                          Page {page}
                      </Badge>
                  </div>
                  
                  {/* Search - Visual only for now */}
                  <div className="relative w-[300px]">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                    <Input 
                      placeholder="Search current page..." 
                      className="pl-8 bg-white" 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
               </div>
            </CardHeader>
            
            <CardContent className="p-0">
                {tripsLoading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                    </div>
                ) : (
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
                        {trips.length > 0 ? (
                          trips
                           .filter(t => !searchTerm || 
                               (t.driverName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                t.id.includes(searchTerm) || 
                                t.pickupLocation?.toLowerCase().includes(searchTerm.toLowerCase())))
                           .map((trip) => (
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
                                    {trip.isLiveRecorded && (
                                        <Badge variant="outline" className="w-fit text-[10px] h-5 px-1 bg-indigo-50 text-indigo-700 border-indigo-200">
                                            Live Trip
                                        </Badge>
                                    )}
                                    {trip.isManual && !trip.isLiveRecorded && (
                                        <Badge variant="outline" className="w-fit text-[10px] h-5 px-1 bg-amber-50 text-amber-700 border-amber-200">
                                            Manual Entry
                                        </Badge>
                                    )}
                                    {trip.productType && !trip.isManual && !trip.isLiveRecorded && (
                                        <Badge variant="secondary" className="w-fit text-[10px] h-5 px-1 bg-slate-100 text-slate-600">
                                            {trip.productType}
                                        </Badge>
                                    )}
                                    {trip.serviceCategory === 'courier' && (
                                        <Badge variant="outline" className="w-fit text-[10px] h-5 px-1 bg-amber-50 text-amber-600 border-amber-300">
                                            📦 Courier
                                        </Badge>
                                    )}
                                </div>
                              </TableCell>

                              <TableCell className="align-top max-w-[300px]">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-start gap-2 text-sm">
                                        <div className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                                        {(!trip.pickupLocation || trip.pickupLocation === 'Manual Entry' || trip.pickupLocation.startsWith('Lat:')) && !!trip.startLat ? (
                                            <span className="text-amber-600 text-xs flex items-center gap-1.5 animate-pulse">
                                                <Loader2 className="h-3 w-3 animate-spin" /> Resolving...
                                            </span>
                                        ) : (
                                            <span className="text-slate-700 truncate" title={trip.pickupLocation}>
                                                {trip.pickupArea || trip.pickupLocation || 'Unknown Pickup'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="pl-0.5 ml-0.5 border-l-2 border-slate-100 h-3" />
                                    <div className="flex items-start gap-2 text-sm">
                                        <div className="mt-1 h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                                        {(!trip.dropoffLocation || trip.dropoffLocation.startsWith('Lat:')) && !!trip.endLat ? (
                                            <span className="text-amber-600 text-xs flex items-center gap-1.5 animate-pulse">
                                                <Loader2 className="h-3 w-3 animate-spin" /> Resolving...
                                            </span>
                                        ) : (
                                            <span className="text-slate-700 truncate" title={trip.dropoffLocation}>
                                                {trip.dropoffArea || trip.dropoffLocation || 'Unknown Dropoff'}
                                            </span>
                                        )}
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
                                    <div className="flex items-center justify-end gap-2">
                                        {(trip.paymentMethod === 'Cash' || trip.cashCollected! > 0 || ['Roam', 'GoRide', 'Cash', 'Private'].includes(trip.platform)) && (
                                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal bg-emerald-50 text-emerald-700 border-emerald-200">
                                                Cash
                                            </Badge>
                                        )}
                                        <span className="font-bold text-slate-900">
                                            ${((trip.platform === 'InDrive' && trip.indriveNetIncome != null) ? trip.indriveNetIncome : (trip.amount || 0)).toFixed(2)}
                                        </span>
                                    </div>
                                    {trip.platform === 'InDrive' && trip.indriveNetIncome != null && trip.indriveNetIncome !== trip.amount && (
                                        <span className="text-[10px] text-slate-400">
                                            from ${(trip.amount || 0).toFixed(2)} fare
                                        </span>
                                    )}
                                    {trip.fareBreakdown?.tips ? (
                                        <span className="text-xs text-emerald-600 flex items-center gap-1">
                                            +${trip.fareBreakdown.tips.toFixed(2)} Tip
                                        </span>
                                    ) : null}
                                    {trip.status === 'Cancelled' && trip.cancellationFee !== undefined && trip.cancellationFee > 0 && (
                                        <span className="text-[10px] text-amber-600 block">
                                            Cancel fee: ${trip.cancellationFee.toFixed(2)}
                                        </span>
                                    )}
                                    {trip.estimatedLoss !== undefined && trip.estimatedLoss > 0 && (
                                        <span className="text-[10px] text-rose-500 block">
                                            Est. loss: ${trip.estimatedLoss.toFixed(2)}
                                        </span>
                                    )}
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
                                {trip.status === 'Cancelled' && trip.cancelledBy && (
                                  <p className="text-[10px] text-rose-500 mt-0.5 capitalize">
                                    by {trip.cancelledBy}
                                  </p>
                                )}
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
                                    <DropdownMenuItem onClick={() => handleEditTrip(trip)}>
                                        <Pencil className="mr-2 h-3.5 w-3.5" />
                                        Edit Trip
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleContactDriver(trip)}>Contact Driver</DropdownMenuItem>
                                    <DropdownMenuItem className="text-rose-600" onClick={() => handleAction(trip, 'issue')}>Flag Issue</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                        className="text-rose-600 focus:text-rose-700 focus:bg-rose-50" 
                                        onClick={() => handleDeleteTrip(trip)}
                                    >
                                        Delete Trip
                                    </DropdownMenuItem>
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
                                   <Button variant="link" onClick={() => setFilters({...filters, status: 'all', dateRange: 'all', driverId: 'all'})}>
                                       Clear Filters
                                   </Button>
                               </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                )}
            </CardContent>
            
            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || tripsLoading}
                >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Previous
                </Button>
                <div className="text-sm text-slate-500 font-medium">
                    Page {page}
                </div>
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setPage(p => p + 1)}
                    disabled={!hasMore || tripsLoading}
                >
                    Next
                    <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="analysis">
            <CancellationAnalysis trips={trips} />
        </TabsContent>

        <TabsContent value="routes">
            <RouteAnalysis trips={trips} />
        </TabsContent>

        <TabsContent value="integrity">
            <IntegrityDashboard trips={trips} />
        </TabsContent>
      </Tabs>
      
      <ManualTripForm 
        open={isManualTripOpen}
        onOpenChange={handleEditFormClose}
        onSubmit={editingTrip ? handleEditTripSubmit : handleManualTripSubmit}
        isAdmin={true}
        drivers={availableDrivers}
        vehicles={availableVehicles}
        editingTrip={editingTrip}
        initialData={editingTrip ? tripToInitialData(editingTrip) : undefined}
        currentDriverId={editingTrip?.driverId}
        defaultVehicleId={editingTrip?.vehicleId}
      />
      
      <TripDetailsDialog 
        trip={selectedTrip} 
        open={viewMode === 'details'} 
        onOpenChange={(open) => !open && setViewMode(null)} 
      />

      <TripMapDialog 
        trip={selectedTrip} 
        open={viewMode === 'map'} 
        onOpenChange={(open) => !open && setViewMode(null)} 
      />

      <TripIssueDialog 
        trip={selectedTrip} 
        open={viewMode === 'issue'} 
        onOpenChange={(open) => !open && setViewMode(null)} 
        onSubmit={handleIssueSubmit}
      />

      <DeleteConfirmationDialog 
        trip={tripToDelete}
        open={!!tripToDelete}
        onOpenChange={(open) => !open && setTripToDelete(null)}
        onConfirm={confirmDeleteTrip}
        isDeleting={deleteTripMutation.isPending}
      />
    </div>
  );
}