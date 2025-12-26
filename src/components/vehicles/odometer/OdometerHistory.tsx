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

  const handleSyncFromLogs = useCallback(async () => {
    const hasMaintenance = maintenanceLogs && maintenanceLogs.length > 0;
    const hasTrips = trips && trips.length > 0;
    
    if (!hasMaintenance && !hasTrips) return;
    
    setSyncing(true);
    try {
        let count = 0;
        
        // 1. Sync from Maintenance Logs
        if (hasMaintenance) {
            for (const log of maintenanceLogs) {
                // Skip if no odo
                if (!log.odo || log.odo <= 0) continue;
                
                // Check if this reading likely already exists to avoid dupes (naive check)
                const exists = history.some(h => 
                    h.value === log.odo && 
                    new Date(h.date).toISOString().split('T')[0] === new Date(log.date).toISOString().split('T')[0]
                );
                
                if (!exists) {
                    await odometerService.addReading({
                        vehicleId: vehicleId,
                        date: log.date,
                        value: log.odo,
                        type: 'Hard',
                        source: 'Service Log',
                        notes: `Backfilled from ${log.type} Service`
                    });
                    count++;
                }
            }
        }
        
        // 2. Sync from Trip Logs (if they have explicit odometer readings)
        if (hasTrips) {
             for (const trip of trips) {
                // Check for 'odometer' or 'endOdometer'
                const val = trip.odometer || trip.endOdometer;
                if (!val || val <= 0) continue;
                
                const exists = history.some(h => 
                    h.value === val && 
                    new Date(h.date).toISOString().split('T')[0] === new Date(trip.date).toISOString().split('T')[0]
                );

                if (!exists) {
                     await odometerService.addReading({
                        vehicleId: vehicleId,
                        date: trip.date,
                        value: val,
                        type: 'Soft', // Trips are usually less verifiable than service
                        source: 'Trip Import',
                        notes: `Imported from trip ${trip.id?.slice(0,8)}`
                    });
                    count++;
                }
             }
        }
        
        if (count > 0) {
            toast.success(`Auto-synced ${count} new odometer readings`);
            await fetchHistory();
        }
        
    } catch (e) {
        console.error("Sync failed", e);
    } finally {
        setSyncing(false);
    }
  }, [history, maintenanceLogs, trips, vehicleId, fetchHistory]);

  // Auto-sync when data changes (and history is loaded)
  useEffect(() => {
      if (!loading) {
          handleSyncFromLogs();
      }
  }, [loading, handleSyncFromLogs]);

  const handleDelete = async (id: string) => {
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

  // Calculate deltas
  // History is already sorted desc by backend, but let's be safe
  const sortedHistory = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
              const prevReading = sortedHistory[index + 1];
              const delta = prevReading ? reading.value - prevReading.value : 0;
              
              return (
                <TableRow key={reading.id}>
                  <TableCell className="font-medium">
                    {format(new Date(reading.date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getSourceIcon(reading.source)}
                      <span>{getSourceLabel(reading.source)}</span>
                      {reading.type === 'Calculated' && (
                        <Badge variant="outline" className="text-xs h-5 px-1.5 ml-1">Calc</Badge>
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
                        <DropdownMenuItem onClick={() => handleDelete(reading.id)} className="text-red-600 focus:text-red-600">
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
