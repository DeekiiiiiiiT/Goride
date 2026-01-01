import React, { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { 
  Wrench, 
  User, 
  FileUp, 
  Fuel, 
  Flag, 
  MoreHorizontal, 
  Trash2,
  Calendar,
  RefreshCw,
  Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";
import { OdometerReading, OdometerSource } from '../../../types/vehicle';
import { odometerService } from '../../../services/odometerService';
import { toast } from "sonner@2.0.3";

interface OdometerHistoryProps {
  vehicleId: string;
  maintenanceLogs?: any[]; // Passed from parent to allow backfilling
  trips?: any[]; // Passed from parent to allow backfilling from imports
  onCorrectReading?: () => void;
  refreshTrigger?: number;
}

export const OdometerHistory: React.FC<OdometerHistoryProps> = ({ vehicleId, maintenanceLogs = [], trips = [], onCorrectReading, refreshTrigger = 0 }) => {
  const [history, setHistory] = useState<OdometerReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await odometerService.getHistory(vehicleId);
      setHistory(data || []);
    } catch (error) {
      console.error("Failed to load odometer history", error);
      toast.error("Failed to load odometer history");
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshTrigger]);

  // Calculate Virtual History by merging persistent history with trip data
  const combinedHistory = React.useMemo(() => {
    // 1. Start with Hard Readings
    const readings = [...history];

    // 2. Identify Trips not covered by Hard Readings
    // Strategy: Group trips by day. If a day has no Hard Reading, create a Virtual Reading.
    // Calculation: Previous Hard Reading + Sum(Trips since then)
    
    if (!trips || trips.length === 0) return readings;

    // Filter trips for this vehicle (though parent should have done this)
    const vehicleTrips = trips.filter(t => t.vehicleId === vehicleId || t.vehicleId === 'unknown' || !t.vehicleId);
    
    // Group by Day
    const dailyTrips: Record<string, number> = {};
    vehicleTrips.forEach(t => {
        const day = t.date.split('T')[0];
        dailyTrips[day] = (dailyTrips[day] || 0) + (t.distance || 0);
    });

    // Create a chronological timeline
    const allDates = new Set([
        ...readings.map(r => r.date.split('T')[0]),
        ...Object.keys(dailyTrips)
    ]);
    const sortedDates = Array.from(allDates).sort();

    const result: OdometerReading[] = [];
    let currentOdo = 0;
    
    // Initialize currentOdo from the very first reading if exists
    // Actually, we should iterate and sync.
    
    // Find baseline (earliest hard reading)
    const sortedReadings = [...readings].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (sortedReadings.length > 0) {
        currentOdo = sortedReadings[0].value;
        // If there are trips *before* the first reading, we might want to subtract? 
        // For now, let's assume we start tracking from the first Hard reading or 0.
        // If first reading is in 2025, and trips are in 2024, this logic is tricky.
        // Simplified: Start from 0 if no readings, or update as we go.
    }

    // Better approach: Iterate all events chronologically
    // Event types: 'Reading' | 'DailyTrip'
    
    const events: { date: string, type: 'Reading' | 'Trip', value?: number, distance?: number, obj?: any }[] = [];
    
    readings.forEach(r => {
        events.push({ date: r.date.split('T')[0], type: 'Reading', value: r.value, obj: r });
    });
    
    Object.entries(dailyTrips).forEach(([date, dist]) => {
        // Only add trip event if there isn't already a hard reading for this date?
        // Or strictly add it.
        // If there is a hard reading on this date, we assume it overrides/includes the trips of that day.
        if (!readings.some(r => r.date.split('T')[0] === date)) {
             events.push({ date, type: 'Trip', distance: dist });
        }
    });

    events.sort((a, b) => a.date.localeCompare(b.date));

    // Re-calculate rolling odometer
    // Reset state
    // We need to handle the case where we have trips *before* the first hard reading.
    // If we have no hard readings, we start at 0.
    // If we have hard readings, we align to them.

    // Pass 1: Find the first Hard Reading to establish baseline?
    // If we have trips before the first hard reading, we can't accurately know the odometer unless we back-calculate.
    // Let's keep it simple: Start accumulation from 0, but "snap" to hard readings when encountered.
    
    let runningOdo = 0;
    
    // Check if we have any hard reading to anchor to
    const firstHardIndex = events.findIndex(e => e.type === 'Reading');
    if (firstHardIndex > 0) {
        // We have trips before the first hard reading.
        // We can try to back-calculate?
        // e.g. Reading at index 5 is 10,000. Trips at 4, 3, 2, 1 sum to 500.
        // So start must have been 9,500.
        let backCalcOdo = events[firstHardIndex].value || 0;
        for (let i = firstHardIndex - 1; i >= 0; i--) {
            if (events[i].type === 'Trip') {
                backCalcOdo -= (events[i].distance || 0);
            }
        }
        runningOdo = Math.max(0, backCalcOdo);
    } else if (firstHardIndex === 0) {
        runningOdo = events[0].value || 0;
    }

    // Pass 2: Generate timeline
    const processedEvents: OdometerReading[] = [];

    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        
        if (e.type === 'Reading') {
            runningOdo = e.value!;
            processedEvents.push(e.obj);
        } else {
            runningOdo += e.distance!;
            processedEvents.push({
                id: `virtual-trip-${e.date}`,
                vehicleId,
                date: e.date,
                value: runningOdo,
                type: 'Calculated',
                source: 'Trip Import',
                notes: `Daily aggregate of ${(e.distance || 0).toFixed(1)} km`,
                isVirtual: true // Marker for UI
            } as any);
        }
    }
    
    return processedEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  }, [history, trips, vehicleId]);


  // Auto-sync when data changes (and history is loaded)
  // We disabled the naive auto-sync in favor of the virtual calculation above,
  // to avoid spamming the database.
  /* 
  useEffect(() => {
      if (!loading) {
          handleSyncFromLogs();
      }
  }, [loading, handleSyncFromLogs]);
  */
  
  // Re-enable sync only for explicit maintenance logs, not trips (since we virtualize trips now)
  useEffect(() => {
      if (!loading && maintenanceLogs.length > 0) {
          // Filter out trips part of the sync logic
          // Only sync maintenance
          // (Logic extracted from handleSyncFromLogs)
           const syncMaintenance = async () => {
                let count = 0;
                for (const log of maintenanceLogs) {
                    if (!log.odo || log.odo <= 0) continue;
                    const exists = history.some(h => 
                        h.value === log.odo && 
                        new Date(h.date).toISOString().split('T')[0] === new Date(log.date).toISOString().split('T')[0]
                    );
                    if (!exists) {
                        await odometerService.addReading({
                            vehicleId,
                            date: log.date,
                            value: log.odo,
                            type: 'Hard',
                            source: 'Service Log',
                            notes: `Backfilled from ${log.type} Service`
                        });
                        count++;
                    }
                }
                if (count > 0) {
                    toast.success(`Synced ${count} service records`);
                    fetchHistory();
                }
           };
           syncMaintenance();
      }
  }, [loading, maintenanceLogs, vehicleId, fetchHistory]); // Excluded trips

  const handleDelete = async (id: string, isVirtual?: boolean) => {
    if (isVirtual) {
        toast.info("Cannot delete calculated trip logs directly. Remove the trip data instead.");
        return;
    }
    if (!confirm("Are you sure you want to delete this reading?")) return;
    
    try {
      await odometerService.deleteReading(id, vehicleId);
      toast.success("Reading deleted");
      fetchHistory();
    } catch (error) {
      toast.error("Failed to delete reading");
    }
  };

  const getSourceIcon = (source: OdometerSource) => {
    switch (source) {
      case 'Service Log': return <Wrench className="h-4 w-4 text-blue-500" />;
      case 'Manual Update': return <User className="h-4 w-4 text-slate-500" />;
      case 'Trip Import': return <FileUp className="h-4 w-4 text-green-500" />;
      case 'Fuel Log': return <Fuel className="h-4 w-4 text-amber-500" />;
      case 'Baseline': return <Flag className="h-4 w-4 text-purple-500" />;
      default: return <Calendar className="h-4 w-4 text-slate-400" />;
    }
  };

  const getSourceLabel = (source: OdometerSource) => {
    switch (source) {
      case 'Trip Import': return 'Import';
      case 'Manual Update': return 'Manual';
      default: return source;
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading history...</div>;
  }

  // Calculate deltas using combinedHistory
  const sortedHistory = combinedHistory;
  
  // Get latest live reading
  const liveReading = sortedHistory.length > 0 ? sortedHistory[0].value : 0;
  const lastVerified = sortedHistory.find(r => !((r as any).isVirtual))?.date || '';
  const isProjected = sortedHistory.length > 0 && (sortedHistory[0] as any).isVirtual;

  // Digits for the counter
  const digits = liveReading.toLocaleString('en-US', { minimumIntegerDigits: 6, useGrouping: false }).split('').slice(-6);


  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    // If it looks like YYYY-MM-DD (length 10), treat as local date to prevent timezone shifts
    if (dateStr.length === 10 && dateStr.includes('-')) {
        const [year, month, day] = dateStr.split('-').map(Number);
        return format(new Date(year, month - 1, day), 'MMM d, yyyy');
    }
    return format(new Date(dateStr), 'MMM d, yyyy');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 rounded-xl p-6 text-white relative overflow-hidden shadow-lg">
        {/* Background Accent */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row justify-between items-end gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-4 text-indigo-300">
               <div className="h-5 w-5"><RefreshCw className="h-4 w-4" /></div>
               <span className="font-medium">Live Odometer Reading</span>
            </div>
            
            <div className="flex items-end gap-3">
               <div className="flex gap-1">
                  {digits.map((digit, i) => (
                      <div key={i} className="w-10 h-14 bg-slate-800 border border-slate-700 rounded flex items-center justify-center text-3xl font-mono font-bold shadow-inner">
                          {digit}
                      </div>
                  ))}
               </div>
               <div className="mb-2">
                   <span className="text-xl text-slate-400 font-mono ml-2">km</span>
                   {isProjected && (
                       <Badge variant="outline" className="ml-3 border-indigo-500/50 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20">
                           <RefreshCw className="w-3 h-3 mr-1" /> Projected
                       </Badge>
                   )}
               </div>
            </div>
            
            <p className="text-sm text-slate-400 mt-4 max-w-md">
                This reading is a synthesis of verified service logs, imported trip data, and daily usage projections.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
              <div className="text-right mb-2">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Last Verified</p>
                  <p className="text-lg font-medium">{lastVerified ? formatDate(lastVerified) : 'Never'}</p>
              </div>
              
              <Button onClick={onCorrectReading} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-900/20">
                  <Wrench className="w-4 h-4 mr-2" />
                  Correct Reading
              </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
            <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                    <CardTitle className="text-lg text-slate-900">Odometer History</CardTitle>
                    <CardDescription>Timeline of mileage readings from all sources</CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                {sortedHistory.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        <Calendar className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                        <p className="font-medium text-slate-900">No History Available</p>
                        <p className="text-sm mt-1 text-slate-500 max-w-xs mx-auto">Import trips or add service logs to start tracking your vehicle's mileage.</p>
                    </div>
                ) : (
                <Table>
                <TableHeader>
                    <TableRow className="hover:bg-transparent border-b-slate-100">
                    <TableHead className="w-[150px] font-semibold text-slate-900">Date</TableHead>
                    <TableHead className="w-[180px] font-semibold text-slate-900">Source</TableHead>
                    <TableHead className="font-semibold text-slate-900">Reading</TableHead>
                    <TableHead className="font-semibold text-slate-900">Delta</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedHistory.map((reading, index) => {
                    // Note: sortedHistory is DESC. Next item is previous in time.
                    const prevReading = sortedHistory[index + 1];
                    const delta = prevReading ? reading.value - prevReading.value : 0;
                    
                    // Type safety cast for virtual property
                    const isVirtual = (reading as any).isVirtual;

                    return (
                        <TableRow key={reading.id} className={`border-b-slate-50 group hover:bg-slate-50 ${isVirtual ? 'bg-slate-50/30' : ''}`}>
                        <TableCell className="font-medium text-slate-700 py-4">
                            {formatDate(reading.date)}
                        </TableCell>
                        <TableCell>
                            <div className="flex items-center gap-2">
                            {getSourceIcon(reading.source)}
                            <span className="text-sm text-slate-600">{getSourceLabel(reading.source)}</span>
                            {reading.type === 'Calculated' && (
                                <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1 border-slate-200 text-slate-400 font-normal bg-white">Calc</Badge>
                            )}
                            </div>
                        </TableCell>
                        <TableCell className="font-mono font-medium text-slate-900">
                            {reading.value.toLocaleString()} <span className="text-slate-400 text-xs ml-0.5">km</span>
                        </TableCell>
                        <TableCell>
                            {prevReading && (
                            <span className={`text-xs font-medium ${delta >= 0 ? 'text-slate-500' : 'text-red-500'}`}>
                                {delta > 0 && '+'}{delta.toLocaleString()} km
                            </span>
                            )}
                            {!prevReading && <span className="text-xs text-slate-400">-</span>}
                        </TableCell>
                        <TableCell>
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4 text-slate-400" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem 
                                    onClick={() => handleDelete(reading.id, isVirtual)} 
                                    className={`${isVirtual ? 'text-slate-400 cursor-not-allowed' : 'text-red-600 focus:text-red-600'}`}
                                    disabled={isVirtual}
                                >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                        </TableRow>
                    );
                    })}
                </TableBody>
                </Table>
                )}
            </CardContent>
            </Card>
        </div>

        <div className="lg:col-span-1">
             <Card className="border-slate-200 sticky top-6">
                 <CardHeader>
                     <CardTitle className="text-base text-slate-900">About Odometer History</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-6">
                     <p className="text-sm text-slate-500 leading-relaxed">
                         This timeline tracks your vehicle's mileage from multiple sources to provide a unified history.
                     </p>
                     
                     <div className="space-y-4">
                         <div className="flex gap-3">
                             <div className="mt-0.5"><Wrench className="h-4 w-4 text-blue-500" /></div>
                             <div>
                                 <p className="text-sm font-medium text-slate-900">Service Log</p>
                                 <p className="text-xs text-slate-500">Verified readings from maintenance visits.</p>
                             </div>
                         </div>
                         
                         <div className="flex gap-3">
                             <div className="mt-0.5"><FileUp className="h-4 w-4 text-green-500" /></div>
                             <div>
                                 <p className="text-sm font-medium text-slate-900">Trip Import</p>
                                 <p className="text-xs text-slate-500">Calculated mileage from uploaded trip logs.</p>
                             </div>
                         </div>

                         <div className="flex gap-3">
                             <div className="mt-0.5"><User className="h-4 w-4 text-slate-500" /></div>
                             <div>
                                 <p className="text-sm font-medium text-slate-900">Manual</p>
                                 <p className="text-xs text-slate-500">Ad-hoc readings you enter yourself.</p>
                             </div>
                         </div>

                         <div className="flex gap-3">
                             <div className="mt-0.5"><RefreshCw className="h-4 w-4 text-indigo-500" /></div>
                             <div>
                                 <p className="text-sm font-medium text-slate-900">Projected</p>
                                 <p className="text-xs text-slate-500">Estimated based on daily average usage.</p>
                             </div>
                         </div>
                     </div>
                 </CardContent>
             </Card>
        </div>
      </div>
    </div>
  );
};
