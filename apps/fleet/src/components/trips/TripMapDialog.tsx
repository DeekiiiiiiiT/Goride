import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Trip } from "../../types/data";
import { LeafletMap } from "../maps/LeafletMap";
import { AlertCircle } from "lucide-react";

interface TripMapDialogProps {
  trip: Trip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripMapDialog({ trip, open, onOpenChange }: TripMapDialogProps) {
  if (!trip) return null;

  const hasRoute = trip.route && trip.route.length > 0;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            Route Visualization
            {trip.pickupLocation && trip.dropoffLocation && (
                <span className="text-sm font-normal text-slate-500 hidden sm:inline-block ml-2 truncate max-w-md">
                   • {trip.pickupLocation} ➔ {trip.dropoffLocation}
                </span>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="h-[400px] w-full bg-slate-50 dark:bg-slate-900 rounded-md overflow-hidden relative border border-slate-100 dark:border-slate-800">
           {hasRoute ? (
             <LeafletMap 
               route={trip.route || []} 
               height="100%"
               startMarker={trip.route![0]}
               endMarker={trip.route![trip.route!.length - 1]}
             />
           ) : (
             <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
               <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                <AlertCircle className="h-8 w-8" />
               </div>
               <p className="font-medium">No GPS route data available</p>
               <p className="text-sm text-slate-400">The driver app did not record location points for this trip.</p>
             </div>
           )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
