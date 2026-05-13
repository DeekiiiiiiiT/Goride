import React, { useState } from 'react';
import { Car, Calendar, MapPin, ChevronDown, Clock, DollarSign } from 'lucide-react';

export function DriverTrips() {
  const [filter, setFilter] = useState<'all' | 'uber' | 'lyft' | 'bolt'>('all');

  const trips: any[] = [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Trips</h1>
        <div className="relative">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="appearance-none bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="all">All Platforms</option>
            <option value="uber">Uber</option>
            <option value="lyft">Lyft</option>
            <option value="bolt">Bolt</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50 text-center">
          <p className="text-xl font-bold text-white">0</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Today</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50 text-center">
          <p className="text-xl font-bold text-white">0</p>
          <p className="text-[10px] text-slate-400 mt-0.5">This Week</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50 text-center">
          <p className="text-xl font-bold text-white">0</p>
          <p className="text-[10px] text-slate-400 mt-0.5">This Month</p>
        </div>
      </div>

      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
            <Car className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No trips yet</h3>
          <p className="text-slate-400 text-sm max-w-xs">
            Your trip history will appear here once you connect your rideshare platforms.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
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
  trip: any;
}

function TripCard({ trip }: TripCardProps) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
            <Car className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Trip</p>
            <p className="text-xs text-slate-500">Platform</p>
          </div>
        </div>
        <span className="text-emerald-400 font-semibold">$0.00</span>
      </div>
      <div className="space-y-2 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <MapPin className="w-3 h-3 text-emerald-400" />
          <span>Pickup location</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="w-3 h-3 text-red-400" />
          <span>Dropoff location</span>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-700/50 text-xs text-slate-500">
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
