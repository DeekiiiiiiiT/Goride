import React, { useState } from 'react';
import { Car, MapPin, ChevronDown, Clock } from 'lucide-react';

export function DriverTrips() {
  const [filter, setFilter] = useState<'all' | 'uber' | 'lyft' | 'bolt'>('all');

  const trips: unknown[] = [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Trips</h1>
        <div className="relative">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="appearance-none bg-white border border-slate-300 rounded-lg px-3 py-2 pr-8 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
          >
            <option value="all">All Platforms</option>
            <option value="uber">Uber</option>
            <option value="lyft">Lyft</option>
            <option value="bolt">Bolt</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 text-center shadow-sm sm:p-3 dark:border-slate-700/50 dark:bg-slate-800/50">
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white sm:text-xl">0</p>
          <p className="mt-0.5 text-[10px] font-semibold leading-tight text-slate-600 dark:text-slate-300 sm:text-[11px]">Today</p>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 text-center shadow-sm sm:p-3 dark:border-slate-700/50 dark:bg-slate-800/50">
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white sm:text-xl">0</p>
          <p className="mt-0.5 text-[10px] font-semibold leading-tight text-slate-600 dark:text-slate-300 sm:text-[11px]">This Week</p>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5 text-center shadow-sm sm:p-3 dark:border-slate-700/50 dark:bg-slate-800/50">
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white sm:text-xl">0</p>
          <p className="mt-0.5 text-[10px] font-semibold leading-tight text-slate-600 dark:text-slate-300 sm:text-[11px]">This Month</p>
        </div>
      </div>

      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center mb-4 dark:bg-slate-800">
            <Car className="w-8 h-8 text-slate-500 dark:text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No trips yet</h3>
          <p className="text-slate-600 dark:text-slate-300 text-sm max-w-xs font-medium leading-relaxed">
            Your trip history will appear here once you connect your rideshare platforms.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider px-1">
            Recent Trips
          </h2>
          <div className="space-y-2">
            {trips.map((trip, i) => (
              <TripCard key={i} trip={trip} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface TripCardProps {
  trip: unknown;
}

function TripCard({ trip: _trip }: TripCardProps) {
  return (
    <div className="bg-white/90 rounded-xl p-4 border border-slate-200 shadow-sm dark:bg-slate-800/50 dark:border-slate-700/50">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center dark:bg-slate-700">
            <Car className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Trip</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Platform</p>
          </div>
        </div>
        <span className="text-emerald-700 font-bold dark:text-emerald-400">$0.00</span>
      </div>
      <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300 font-medium">
        <div className="flex items-center gap-2">
          <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Pickup location</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="w-3 h-3 text-red-600 dark:text-red-400 shrink-0" />
          <span>Dropoff location</span>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600 dark:border-slate-700/50 dark:text-slate-400 font-medium">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>0 min</span>
        </div>
        <div className="flex items-center gap-1">
          <Car className="w-3 h-3" />
          <span>0.0 mi</span>
        </div>
      </div>
    </div>
  );
}
