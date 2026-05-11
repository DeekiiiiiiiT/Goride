import React, { useState } from 'react';
import { Trip } from '../../types/data';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from "sonner@2.0.3";

interface ErrorDiagnosticsTableProps {
  trips: Trip[];
}

export function ErrorDiagnosticsTable({ trips }: ErrorDiagnosticsTableProps) {
  const [retryIds, setRetryIds] = useState<Set<string>>(new Set());

  // Filter for trips that have errors or are pending resolution
  const problemTrips = trips.filter(t => 
    t.resolutionMethod === 'pending' || 
    t.geocodeError || 
    t.status === 'failed'
  );

  const handleRetry = (id: string) => {
    setRetryIds(prev => new Set(prev).add(id));
    
    // Simulate retry process
    setTimeout(() => {
      setRetryIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success("Resolution retry queued for Trip " + id);
    }, 1500);
  };

  if (problemTrips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-slate-500 border rounded-lg bg-slate-50">
        <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
        <p className="font-medium">No integrity issues detected</p>
        <p className="text-sm">All trips have been successfully resolved.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="max-h-[400px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Route ID</TableHead>
              <TableHead>Error Diagnostics</TableHead>
              <TableHead>Coordinates</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {problemTrips.map((trip) => (
              <TableRow key={trip.id}>
                <TableCell className="font-mono text-xs">
                  {new Date(trip.requestTime || trip.date).toLocaleTimeString()}
                </TableCell>
                <TableCell>{trip.routeId}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                       <Badge variant="destructive" className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-rose-200">
                         {trip.resolutionMethod === 'pending' ? 'Resolution Failed' : 'Data Error'}
                       </Badge>
                    </div>
                    {trip.geocodeError && (
                      <span className="text-xs text-rose-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {trip.geocodeError}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-500">
                  {trip.startLat?.toFixed(4)}, {trip.startLng?.toFixed(4)}
                </TableCell>
                <TableCell className="text-right">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="h-8 gap-1"
                    onClick={() => handleRetry(trip.id)}
                    disabled={retryIds.has(trip.id)}
                  >
                    <RefreshCw className={`h-3 w-3 ${retryIds.has(trip.id) ? 'animate-spin' : ''}`} />
                    {retryIds.has(trip.id) ? 'Retrying...' : 'Retry'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="bg-slate-50 p-3 text-xs text-slate-500 border-t flex justify-between items-center">
        <span>Showing {problemTrips.length} issues requiring attention</span>
        {problemTrips.length > 5 && (
            <span className="italic">Scroll for more</span>
        )}
      </div>
    </div>
  );
}
