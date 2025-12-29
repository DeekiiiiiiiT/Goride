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
}

export const OdometerHistory: React.FC<OdometerHistoryProps> = ({ vehicleId, maintenanceLogs = [], trips = [] }) => {
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
  }, [fetchHistory]);

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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1.5">
            <CardTitle>Odometer History</CardTitle>
            <CardDescription>Timeline of mileage readings from all sources</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {sortedHistory.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
                <p>No odometer history found for this vehicle.</p>
                <p className="text-sm mt-2 text-slate-400">Import trips or add service logs to populate history.</p>
            </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Reading</TableHead>
              <TableHead>Delta</TableHead>
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
                <TableRow key={reading.id} className={isVirtual ? 'bg-slate-50/50' : ''}>
                  <TableCell className="font-medium">
                    {formatDate(reading.date)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getSourceIcon(reading.source)}
                      <span>{getSourceLabel(reading.source)}</span>
                      {reading.type === 'Calculated' && (
                        <Badge variant="outline" className="text-xs h-5 px-1.5 ml-1 border-slate-200 text-slate-500">Calc</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">
                    {reading.value.toLocaleString()} km
                  </TableCell>
                  <TableCell>
                    {prevReading && (
                      <span className={`text-xs ${delta >= 0 ? 'text-slate-500' : 'text-red-500'}`}>
                        {delta >= 0 ? '+' : ''}{delta.toLocaleString()} km
                      </span>
                    )}
                    {!prevReading && <span className="text-xs text-slate-400">-</span>}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
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
  );
};
