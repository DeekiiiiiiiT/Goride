import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Calendar as CalendarIcon,
  Loader2,
  Search,
} from 'lucide-react';
import {
  Button,
  Calendar,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@roam/ui';
import type { RideRequestRow } from '@roam/types/rides';
import { DateRange } from 'react-day-picker';
import { endOfDay, startOfDay, subDays } from 'date-fns';
import { useIndependentTrips } from '../../hooks/useIndependentTrips';
import { TripDetailsSheet } from '../trips/TripDetailsSheet';
import { TripHistoryCard } from '../trips/TripHistoryCard';
import { tripWhen } from '../trips/tripDetailsUtils';

export function IndependentTripsPage() {
  const { trips, loading, error, loadAll, total } = useIndependentTrips();
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
    const thirtyDaysAgo = startOfDay(subDays(new Date(), 30));
    let filtered = trips.filter((t) => tripWhen(t) >= thirtyDaysAgo);

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

  const handleViewAll = () => {
    void loadAll().then(() => {
      setHasFetchedAll(true);
      toast.success('Loaded full trip history');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Search trips..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border-0 bg-white py-3 pl-11 pr-4 text-sm shadow-[0_4px_20px_rgba(0,0,0,0.05)] outline-none ring-0 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-colors hover:bg-slate-50 active:scale-95 dark:bg-slate-900 dark:text-blue-400',
                date?.from && 'ring-2 ring-blue-500/30',
              )}
              aria-label="Filter by date"
            >
              <CalendarIcon className="h-5 w-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar mode="range" selected={date} onSelect={setDate} initialFocus numberOfMonths={1} />
            {date?.from && (
              <div className="border-t border-slate-100 p-2 dark:border-slate-800">
                <Button
                  variant="ghost"
                  className="h-8 w-full text-xs text-slate-500"
                  onClick={() => setDate(undefined)}
                >
                  Clear filter
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Trip history</h2>
        <span className="text-sm text-slate-500 dark:text-slate-400">Showing last 30 days</span>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {loading && trips.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : filteredTrips.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">No trips found for this period.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredTrips.map((trip, index) => (
            <TripHistoryCard
              key={trip.id}
              trip={trip}
              faded={index >= 3}
              onClick={() => setSelectedTrip(trip)}
            />
          ))}
        </div>
      )}

      {!loading && filteredTrips.length > 0 && (
        <div className="flex flex-col items-center py-8">
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            {hasFetchedAll || total <= trips.length
              ? "You've reached the end of your recent trips."
              : 'Showing your most recent trips.'}
          </p>
          {!hasFetchedAll && total > trips.length && (
            <button
              type="button"
              onClick={handleViewAll}
              className="mt-4 text-sm font-bold text-[#004ac6] hover:underline dark:text-blue-400"
            >
              View all history
            </button>
          )}
        </div>
      )}

      <TripDetailsSheet
        trip={selectedTrip}
        open={!!selectedTrip}
        onOpenChange={(open) => !open && setSelectedTrip(null)}
      />
    </div>
  );
}
