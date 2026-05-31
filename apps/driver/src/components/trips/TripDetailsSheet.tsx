import React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { format } from 'date-fns';
import {
  Circle,
  HelpCircle,
  MapPin,
  MessageCircle,
  Star,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';
import type { RideRequestRow } from '@roam/types/rides';
import { cn, Drawer, DrawerOverlay, DrawerPortal } from '@roam/ui';
import { LeafletMap } from '../maps/LeafletMap';
import {
  buildFareLines,
  formatTripTimeLabel,
  tripDisplayId,
  tripDropoffTime,
  tripPickupTime,
  tripRoutePoints,
  tripTotalEarnings,
  tripWhen,
  formatTripDuration,
} from './tripDetailsUtils';

type Props = {
  trip: RideRequestRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function LocationRow({
  kind,
  time,
  address,
}: {
  kind: 'pickup' | 'dropoff';
  time: string;
  address: string;
}) {
  const label = kind === 'pickup' ? 'PICKUP' : 'DROP-OFF';
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
        {label}
        {time ? ` • ${time}` : ''}
      </p>
      <p className="text-base font-semibold leading-snug text-slate-900 dark:text-white">{address}</p>
    </div>
  );
}

export function TripDetailsSheet({ trip, open, onOpenChange }: Props) {
  if (!trip) return null;

  const pickupAt = tripPickupTime(trip);
  const dropoffAt = tripDropoffTime(trip);
  const fareLines = buildFareLines(trip);
  const total = tripTotalEarnings(trip);
  const route = tripRoutePoints(trip);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerPortal>
        <DrawerOverlay className="bg-[rgba(25,28,30,0.4)] backdrop-blur-sm" />
        <DrawerPrimitive.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-lg flex-col outline-none',
            'rounded-t-[32px] border-0 bg-white shadow-2xl dark:bg-slate-900',
            'max-h-[92vh]',
          )}
          aria-describedby={undefined}
        >
          <div className="flex shrink-0 flex-col items-center pt-3 pb-4">
            <div className="mb-4 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />
            <div className="flex w-full items-center justify-between px-6">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Trip Details
              </h2>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                aria-label="Close trip details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
            <div className="relative mb-6 h-48 overflow-hidden rounded-2xl border border-slate-200 shadow-sm dark:border-slate-700">
              <LeafletMap
                route={route}
                startMarker={{ lat: trip.pickup_lat, lon: trip.pickup_lng }}
                endMarker={{ lat: trip.dropoff_lat, lon: trip.dropoff_lng }}
                height="100%"
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 to-transparent"
                aria-hidden
              />
            </div>

            <div className="mb-8 flex gap-4">
              <div className="flex flex-col items-center py-1">
                <Circle className="h-5 w-5 fill-[#004ac6] text-[#004ac6]" aria-hidden />
                <div className="my-1 h-full min-h-[2rem] w-0.5 bg-slate-200 dark:bg-slate-600" aria-hidden />
                <MapPin className="h-5 w-5 fill-red-500 text-red-500" aria-hidden />
              </div>
              <div className="flex flex-1 flex-col gap-6">
                <LocationRow
                  kind="pickup"
                  time={formatTripTimeLabel(pickupAt)}
                  address={trip.pickup_address ?? 'Pickup location'}
                />
                <LocationRow
                  kind="dropoff"
                  time={formatTripTimeLabel(dropoffAt)}
                  address={trip.dropoff_address ?? 'Drop-off location'}
                />
              </div>
            </div>

            <div className="mb-8 flex items-center justify-between rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/80">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-slate-200 shadow-sm dark:border-slate-700 dark:bg-slate-700">
                  <User className="h-6 w-6 text-slate-500 dark:text-slate-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900 dark:text-white">Rider</p>
                  <div className="flex items-center gap-1 text-sm text-slate-500">
                    <Star className="h-4 w-4 fill-amber-500 text-amber-500" aria-hidden />
                    <span>— • Rider</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toast.message('Rider chat is not available yet')}
                className="rounded-full bg-white p-2 shadow-sm transition-shadow hover:shadow-md dark:bg-slate-900"
                aria-label="Message rider"
              >
                <MessageCircle className="h-5 w-5 text-[#004ac6]" />
              </button>
            </div>

            <div className="mb-8">
              <h3 className="mb-4 px-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                Fare Breakdown
              </h3>
              <div className="space-y-4">
                {fareLines.length > 0 ? (
                  fareLines.map((line) => (
                    <div key={line.label} className="flex items-center justify-between px-1">
                      <span className="text-slate-500">{line.label}</span>
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          line.highlight ? 'font-bold text-[#004ac6]' : 'text-slate-900 dark:text-white',
                        )}
                      >
                        {line.amount}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="px-1 text-sm text-slate-500">Fare breakdown not available for this trip.</p>
                )}
                <div className="flex items-center justify-between border-t border-slate-200 px-1 pt-4 dark:border-slate-700">
                  <span className="text-lg font-bold text-slate-900 dark:text-white">Total Earnings</span>
                  <span className="text-lg font-bold tabular-nums text-[#004ac6]">{total}</span>
                </div>
              </div>
            </div>

            <div className="mb-8 grid grid-cols-2 gap-4">
              <MetadataTile label="Vehicle" value={vehicleTypeLabel(trip.vehicle_option)} />
              <MetadataTile label="Trip ID" value={tripDisplayId(trip)} />
              <MetadataTile label="Date" value={format(tripWhen(trip), 'MMM d, yyyy')} />
              <MetadataTile label="Duration" value={formatTripDuration(trip)} />
            </div>

            <button
              type="button"
              onClick={() => toast.message('Support for trip issues is coming soon')}
              className="group mb-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-200 py-4 transition-colors hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <HelpCircle className="h-5 w-5 text-slate-500 transition-colors group-hover:text-[#004ac6]" />
              <span className="font-bold text-slate-600 transition-colors group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white">
                I had an issue with this trip
              </span>
            </button>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPortal>
    </Drawer>
  );
}

function MetadataTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
