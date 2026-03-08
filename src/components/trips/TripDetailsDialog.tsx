import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Trip } from "../../types/data";
import { normalizePlatform } from '../../utils/normalizePlatform';
import { TripStop } from "../../types/tripSession";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { format } from "date-fns";
import { MapPin, Calendar, Clock, CreditCard, User, Car, DollarSign, Navigation, XCircle } from "lucide-react";

interface TripDetailsDialogProps {
  trip: Trip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripDetailsDialog({ trip, open, onOpenChange }: TripDetailsDialogProps) {
  if (!trip) return null;

  // Calculate Total Wait Time
  const totalWaitSeconds = trip.stops?.reduce((acc, stop) => acc + (stop.durationSeconds || 0), 0) || 0;
  const waitMinutes = Math.floor(totalWaitSeconds / 60);
  const waitSeconds = totalWaitSeconds % 60;

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
                  <span className="text-sm font-medium">
                    {trip.platform === 'InDrive' && trip.indriveNetIncome ? 'Fare' : 'Amount'}
                  </span>
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  ${trip.amount.toFixed(2)}
                </div>
                {trip.platform === 'InDrive' && trip.indriveNetIncome && (
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                    You keep: ${trip.indriveNetIncome.toFixed(2)}
                  </div>
                )}
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-1">
                  <CreditCard className="h-4 w-4" />
                  <span className="text-sm font-medium">Platform</span>
                </div>
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                  {normalizePlatform(trip.platform)}
                </div>
                {trip.paymentMethod && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {trip.paymentMethod === 'Cash' ? '💵 Cash' : '💳 Card / Digital'}
                  </div>
                )}
              </div>
            </div>

            {/* Route Info */}
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                <Navigation className="h-4 w-4 text-indigo-500" />
                Route Information
              </h3>
              <div className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-800 space-y-8 pb-1">
                {/* Dynamic Timeline Generation */}
                {(() => {
                  const events = [];
                  
                  // 1. Pickup Event
                  events.push({
                    type: 'pickup',
                    label: 'Pickup',
                    location: trip.pickupLocation,
                    time: trip.requestTime,
                    color: 'border-indigo-600',
                    textColor: 'text-indigo-600'
                  });

                  // 2. Intermediate Stops (from trip.stops)
                  if (trip.stops && Array.isArray(trip.stops)) {
                    trip.stops.forEach((stop, index) => {
                      events.push({
                        type: 'stop',
                        label: `Stop #${index + 1}`,
                        location: stop.location,
                        time: stop.arrivalTime,
                        duration: stop.durationSeconds,
                        color: 'border-amber-500', 
                        textColor: 'text-amber-600'
                      });
                    });
                  }

                  // 3. Dropoff Event
                  events.push({
                    type: 'dropoff',
                    label: 'Dropoff',
                    location: trip.dropoffLocation,
                    time: trip.dropoffTime,
                    color: 'border-rose-500',
                    textColor: 'text-rose-600'
                  });

                  return events.map((event, index) => (
                    <div key={index} className="relative">
                      {/* Timeline Dot */}
                      <div className={`absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 bg-white dark:bg-slate-950 ${event.color}`} />
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-xs uppercase tracking-wide font-bold ${event.textColor}`}>
                            {event.label}
                          </p>
                          
                          {/* Wait Time Badge for Stops */}
                          {event.type === 'stop' && event.duration !== undefined && (
                            <Badge 
                              variant="outline" 
                              className={`h-5 px-1.5 text-[10px] font-normal flex items-center gap-1
                                ${event.duration > 300 
                                  ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400' 
                                  : 'border-slate-300 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                                }`}
                            >
                              <Clock className="h-3 w-3" />
                              {Math.floor(event.duration / 60)}m {event.duration % 60}s
                              {event.duration > 300 && <span className="font-bold ml-0.5">!</span>}
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-slate-900 dark:text-slate-50 font-medium">
                          {event.location || "Location not recorded"}
                        </p>
                        
                        {event.time && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {format(new Date(event.time), "h:mm a")}
                          </p>
                        )}
                      </div>
                    </div>
                  ));
                })()}
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
                {totalWaitSeconds > 0 && (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 font-medium">
                    <Clock className="h-4 w-4" />
                    <span>Wait: {waitMinutes}m {waitSeconds}s</span>
                  </div>
                )}
              </div>
            </div>

            {/* Cancellation Details — only shown for cancelled trips */}
            {trip.status === 'Cancelled' && (trip.cancelledBy || trip.cancellationReason || trip.cancellationFee || trip.estimatedLoss) && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    Cancellation Details
                  </h3>
                  <div className="bg-rose-50/50 dark:bg-rose-950/20 rounded-lg p-4 space-y-3 border border-rose-200 dark:border-rose-800">
                    {trip.cancelledBy && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Cancelled By</span>
                        <span className="font-medium text-rose-700 dark:text-rose-400 capitalize">{trip.cancelledBy}</span>
                      </div>
                    )}
                    {trip.cancellationReason && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Reason</span>
                        <span className="font-medium text-slate-900 dark:text-slate-50">{trip.cancellationReason}</span>
                      </div>
                    )}
                    {trip.cancellationFee !== undefined && trip.cancellationFee > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Cancellation Fee</span>
                        <span className="font-medium text-amber-600 dark:text-amber-400">${trip.cancellationFee.toFixed(2)}</span>
                      </div>
                    )}
                    {trip.estimatedLoss !== undefined && trip.estimatedLoss > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Estimated Revenue Loss</span>
                        <span className="font-medium text-rose-600 dark:text-rose-400">${trip.estimatedLoss.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

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
            {(trip.fareBreakdown || trip.cashCollected !== undefined || trip.indriveNetIncome) && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-indigo-500" />
                    Financial Breakdown
                  </h3>
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    
                    {/* InDrive trips with fee data: enhanced breakdown */}
                    {trip.platform === 'InDrive' && trip.indriveNetIncome ? (
                      <>
                        {/* Sub-branch: Cash vs Card */}
                        {(trip.paymentMethod === 'Cash' || !trip.paymentMethod) ? (
                          /* InDrive + Cash: Full cash flow story */
                          <>
                            <div className="flex justify-between">
                              <span className="text-slate-600 dark:text-slate-400">Fare (Cash from Passenger)</span>
                              <span className="font-medium text-slate-900 dark:text-slate-50">${trip.amount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-start text-amber-600 dark:text-amber-400">
                              <div>
                                <span className="flex items-center gap-1.5">
                                  InDrive Service Fee
                                  {trip.indriveServiceFeePercent != null && (
                                    <span className="text-[10px] font-normal text-amber-500 dark:text-amber-500">
                                      ({trip.indriveServiceFeePercent.toFixed(1)}%)
                                    </span>
                                  )}
                                </span>
                                <p className="text-[10px] text-amber-500/70 dark:text-amber-500/60 font-normal">Deducted from InDrive Balance</p>
                              </div>
                              <span className="font-medium">-${(trip.indriveServiceFee ?? 0).toFixed(2)}</span>
                            </div>
                            <Separator className="my-2" />
                            <div className="flex justify-between text-sm">
                              <span className="text-emerald-700 dark:text-emerald-400 font-medium">Cash in Hand</span>
                              <span className="font-medium text-emerald-700 dark:text-emerald-400">${trip.amount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-rose-600 dark:text-rose-400 font-medium">InDrive Balance Impact</span>
                              <span className="font-medium text-rose-600 dark:text-rose-400">-${(trip.indriveServiceFee ?? 0).toFixed(2)}</span>
                            </div>
                            <Separator className="my-2" />
                            <div className="flex justify-between text-base font-bold text-emerald-700 dark:text-emerald-400">
                              <span>True Profit</span>
                              <span>${trip.indriveNetIncome.toFixed(2)}</span>
                            </div>
                            {!trip.paymentMethod && (
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                                Payment method not recorded — assuming cash
                              </p>
                            )}
                          </>
                        ) : (
                          /* InDrive + Card: InDrive collects fare, deducts fee, pays driver */
                          <>
                            <div className="flex justify-between">
                              <span className="text-slate-600 dark:text-slate-400">Fare (Collected by InDrive)</span>
                              <span className="font-medium text-slate-900 dark:text-slate-50">${trip.amount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-start text-amber-600 dark:text-amber-400">
                              <div>
                                <span className="flex items-center gap-1.5">
                                  InDrive Service Fee
                                  {trip.indriveServiceFeePercent != null && (
                                    <span className="text-[10px] font-normal text-amber-500 dark:text-amber-500">
                                      ({trip.indriveServiceFeePercent.toFixed(1)}%)
                                    </span>
                                  )}
                                </span>
                                <p className="text-[10px] text-amber-500/70 dark:text-amber-500/60 font-normal">Retained by InDrive</p>
                              </div>
                              <span className="font-medium">-${(trip.indriveServiceFee ?? 0).toFixed(2)}</span>
                            </div>
                            <Separator className="my-2" />
                            <div className="flex justify-between text-base font-bold text-emerald-700 dark:text-emerald-400">
                              <span>Payout to Driver</span>
                              <span>${trip.indriveNetIncome.toFixed(2)}</span>
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      /* Standard breakdown for non-InDrive or legacy InDrive trips */
                      <>
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
                      </>
                    )}

                    {/* Cash / Payout section — hidden for InDrive trips with fee data (shown in their own layout) */}
                    {trip.cashCollected !== undefined && !(trip.platform === 'InDrive' && trip.indriveNetIncome) && (
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