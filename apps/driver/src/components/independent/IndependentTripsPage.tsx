import React, { useEffect, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Car,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Badge, Button, Calendar, cn, Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, Input, Popover, PopoverContent, PopoverTrigger, ScrollArea, Separator } from '@roam/ui';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { DateRange } from 'react-day-picker';
import { endOfDay, format, startOfDay } from 'date-fns';
import { useIndependentTrips } from '../../hooks/useIndependentTrips';

function tripWhen(trip: RideRequestRow): Date {
  const iso = trip.completed_at ?? trip.created_at;
  return new Date(iso);
}

function statusBadgeClass(status: string): string {
  if (status === 'completed') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  if (status === 'cancelled') return 'bg-red-500/15 text-red-700 dark:text-red-300';
  return 'bg-slate-500/15 text-slate-600 dark:text-slate-300';
}

export function IndependentTripsPage() {
  const { trips, loading, error, refresh, loadAll } = useIndependentTrips();
  const [searchTerm, setSearchTerm] = useState('');
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  const [hasFetchedAll, setHasFetchedAll] = useState(false);
  const [filteredTrips, setFilteredTrips] = useState<RideRequestRow[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<RideRequestRow | null>(null);

  useEffect(() => {
    if ((searchTerm || date?.from) && !hasFetchedAll) {
      void loadAll().then(() => setHasFetchedAll(true));
    }
  }, [searchTerm, date, hasFetchedAll, loadAll]);

  useEffect(() => {
    let filtered = trips;
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          (t.pickup_address ?? '').toLowerCase().includes(lower) ||
          (t.dropoff_address ?? '').toLowerCase().includes(lower) ||
          t.status.toLowerCase().includes(lower),
      );
    }
    if (date?.from) {
      const from = startOfDay(date.from);
      const to = date.to ? endOfDay(date.to) : endOfDay(date.from);
      filtered = filtered.filter((t) => {
        const d = tripWhen(t);
        return d >= from && d <= to;
      });
    }
    setFilteredTrips(filtered);
  }, [searchTerm, date, trips]);

  if (loading && trips.length === 0) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 sticky top-0 bg-slate-50 dark:bg-slate-900 pt-2 pb-4 z-10">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search trips..."
            className="pl-9 bg-white dark:bg-slate-950"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'h-10 w-10 p-0 shrink-0',
                date?.from && 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100',
              )}
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={setDate}
              initialFocus
              numberOfMonths={1}
            />
            {date?.from && (
              <div className="p-2 border-t border-slate-100">
                <Button
                  variant="ghost"
                  className="w-full text-xs h-8 text-slate-500 hover:text-slate-900"
                  onClick={() => setDate(undefined)}
                >
                  Clear Filter
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={() => void refresh(false)}
          className="h-10 w-10 shrink-0 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
          aria-label="Refresh trips"
        >
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      <div className="space-y-3">
        {filteredTrips.length === 0 ? (
          <div className="text-center py-10 text-slate-500">No trips found.</div>
        ) : (
          filteredTrips.map((trip) => (
            <button
              key={trip.id}
              type="button"
              onClick={() => setSelectedTrip(trip)}
              className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-emerald-500/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <Badge className={cn('text-[10px] font-medium border-0', statusBadgeClass(trip.status))}>
                  {trip.status.replace(/_/g, ' ')}
                </Badge>
                <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatMoneyMinor(trip.fare_final_minor ?? trip.fare_estimate_minor, trip.currency)}
                </span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200 truncate flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                {trip.pickup_address ?? 'Pickup'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {format(tripWhen(trip), 'MMM d, yyyy • h:mm a')}
              </p>
            </button>
          ))
        )}
      </div>

      <Drawer open={!!selectedTrip} onOpenChange={(open) => !open && setSelectedTrip(null)}>
        <DrawerContent className="max-h-[85vh] flex flex-col">
          <DrawerHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 text-left">
            <DrawerTitle>Trip details</DrawerTitle>
            <DrawerDescription>
              {selectedTrip && format(tripWhen(selectedTrip), 'MMMM d, yyyy • h:mm a')}
            </DrawerDescription>
          </DrawerHeader>
          {selectedTrip && (
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-0.5">Pickup</p>
                    <p className="text-sm font-medium">{selectedTrip.pickup_address ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-0.5">Drop-off</p>
                    <p className="text-sm font-medium">{selectedTrip.dropoff_address ?? '—'}</p>
                  </div>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 flex items-center gap-1">
                    <Car className="h-3.5 w-3.5" /> Status
                  </span>
                  <span className="font-medium capitalize">{selectedTrip.status.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Payment</span>
                  <span className="font-medium capitalize">{selectedTrip.payment_method ?? '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Fare</span>
                  <span className="font-semibold tabular-nums">
                    {formatMoneyMinor(
                      selectedTrip.fare_final_minor ?? selectedTrip.fare_estimate_minor,
                      selectedTrip.currency,
                    )}
                  </span>
                </div>
              </div>
            </ScrollArea>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
