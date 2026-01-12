import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Trip } from "../../types/data";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { format } from "date-fns";
import { MapPin, Calendar, Clock, CreditCard, User, Car, DollarSign, Navigation } from "lucide-react";

interface TripDetailsDialogProps {
  trip: Trip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripDetailsDialog({ trip, open, onOpenChange }: TripDetailsDialogProps) {
  if (!trip) return null;

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'bg-emerald-500 hover:bg-emerald-600';
      case 'cancelled': return 'bg-rose-500 hover:bg-rose-600';
      case 'processing': return 'bg-amber-500 hover:bg-amber-600';
      default: return 'bg-slate-500 hover:bg-slate-600';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <div className="flex items-center justify-between mr-8">
            <div className="space-y-1">
              <DialogTitle className="text-xl">Trip Details</DialogTitle>
              <DialogDescription>
                ID: {trip.id.slice(0, 8)}...
              </DialogDescription>
            </div>
            <Badge className={getStatusColor(trip.status)}>
              {trip.status}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-8 p-6 pt-4 pb-6">
            
            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-1">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-sm font-medium">Amount</span>
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  ${trip.amount.toFixed(2)}
                </div>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-1">
                  <CreditCard className="h-4 w-4" />
                  <span className="text-sm font-medium">Platform</span>
                </div>
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                  {trip.platform}
                </div>
              </div>
            </div>

            {/* Route Info */}
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                <Navigation className="h-4 w-4 text-indigo-500" />
                Route Information
              </h3>
              <div className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-800 space-y-6">
                <div className="relative">
                  <div className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-indigo-600 bg-white dark:bg-slate-950" />
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">Pickup</p>
                    <p className="text-sm text-slate-900 dark:text-slate-50 font-medium">{trip.pickupLocation || "Location not recorded"}</p>
                    {trip.requestTime && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {format(new Date(trip.requestTime), "h:mm a")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-rose-500 bg-white dark:bg-slate-950" />
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">Dropoff</p>
                    <p className="text-sm text-slate-900 dark:text-slate-50 font-medium">{trip.dropoffLocation || "Location not recorded"}</p>
                    {trip.dropoffTime && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {format(new Date(trip.dropoffTime), "h:mm a")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-6 pt-2 text-sm text-slate-600 dark:text-slate-400">
                {trip.distance && (
                  <div className="flex items-center gap-2">
                    <Car className="h-4 w-4 text-slate-400" />
                    <span>{trip.distance.toFixed(1)} km</span>
                  </div>
                )}
                {trip.duration && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <span>{trip.duration} min</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Driver & Vehicle */}
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                <User className="h-4 w-4 text-indigo-500" />
                Driver & Vehicle
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-slate-950 p-3 border rounded-md dark:border-slate-800">
                   <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Driver</p>
                   <p className="font-medium text-slate-900 dark:text-slate-50">{trip.driverName || trip.driverId}</p>
                </div>
                {trip.vehicleId && (
                  <div className="bg-white dark:bg-slate-950 p-3 border rounded-md dark:border-slate-800">
                     <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Vehicle ID</p>
                     <p className="font-medium text-slate-900 dark:text-slate-50">{trip.vehicleId}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Detailed Financials */}
            {(trip.fareBreakdown || trip.cashCollected !== undefined) && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-indigo-500" />
                    Financial Breakdown
                  </h3>
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    {trip.fareBreakdown && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Base Fare</span>
                          <span className="font-medium text-slate-900 dark:text-slate-50">${trip.fareBreakdown.baseFare.toFixed(2)}</span>
                        </div>
                        {trip.fareBreakdown.tips > 0 && (
                          <div className="flex justify-between text-emerald-600">
                            <span>Tip</span>
                            <span className="font-medium">+${trip.fareBreakdown.tips.toFixed(2)}</span>
                          </div>
                        )}
                        {trip.fareBreakdown.surge > 0 && (
                          <div className="flex justify-between text-indigo-600">
                            <span>Surge</span>
                            <span className="font-medium">+${trip.fareBreakdown.surge.toFixed(2)}</span>
                          </div>
                        )}
                        <Separator className="my-2" />
                      </>
                    )}
                    <div className="flex justify-between text-base font-bold text-slate-900 dark:text-slate-50">
                      <span>Total Earnings</span>
                      <span>${trip.amount.toFixed(2)}</span>
                    </div>
                    {trip.cashCollected !== undefined && (
                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
                        <div className="flex justify-between text-sm">
                           <span className="text-slate-500 dark:text-slate-400">Cash Collected</span>
                           <span className={`font-medium ${trip.cashCollected > 0 ? 'text-emerald-600' : 'text-slate-900 dark:text-slate-50'}`}>
                             ${trip.cashCollected.toFixed(2)}
                           </span>
                        </div>
                        <div className="flex justify-between text-sm">
                           <span className="text-slate-500 dark:text-slate-400">Net Payout</span>
                           <span className="font-medium text-slate-900 dark:text-slate-50">
                             ${(trip.netPayout ?? (trip.amount - trip.cashCollected)).toFixed(2)}
                           </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Metadata */}
            <Separator />
            <div className="grid grid-cols-2 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
              <div>Trip Date: {format(new Date(trip.date), "MMM d, yyyy")}</div>
              <div>Created At: {trip.date}</div>
              {trip.batchId && <div className="col-span-2">Import Batch: {trip.batchId}</div>}
            </div>

          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
