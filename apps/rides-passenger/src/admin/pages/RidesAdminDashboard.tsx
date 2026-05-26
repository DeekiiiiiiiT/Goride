import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { Activity, Car, Loader2, MapPin, TrendingUp, Users } from 'lucide-react';
import { toast } from 'sonner';
import { getRidesAdminStats } from '../services/ridesAdminService';

interface OutletContext {
  session: Session;
  role: string | undefined;
}

export function RidesAdminDashboard() {
  const { session, role } = useOutletContext<OutletContext>();
  const accessToken = session.access_token;
  const [stats, setStats] = useState({
    active_rides: 0,
    riders_on_trip: 0,
    todays_completed_rides: 0,
    online_drivers: 0,
    drivers_on_trip: 0,
    avg_surge_multiplier: 1,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    void getRidesAdminStats(accessToken)
      .then(setStats)
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'Failed to load dashboard stats');
      })
      .finally(() => setLoading(false));
  }, [accessToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white">Dashboard</h2>
        <p className="text-sm text-slate-400 mt-1">
          Roam Rides admin overview and metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          title="Active Rides"
          value={String(stats.active_rides)}
          subtitle="Matching or in progress"
          icon={<Activity className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          title="Riders on Trip"
          value={String(stats.riders_on_trip)}
          subtitle="Driver assigned through on trip"
          icon={<Users className="w-5 h-5 text-violet-400" />}
        />
        <StatCard
          title="Today's Rides"
          value={String(stats.todays_completed_rides)}
          subtitle="Completed today (UTC)"
          icon={<Car className="w-5 h-5 text-sky-400" />}
        />
        <StatCard
          title="Drivers Online"
          value={String(stats.online_drivers)}
          subtitle="Available for dispatch"
          icon={<MapPin className="w-5 h-5 text-amber-400" />}
        />
        <StatCard
          title="Avg. Surge"
          value={stats.avg_surge_multiplier.toFixed(2)}
          subtitle="Across all cells"
          icon={<TrendingUp className="w-5 h-5 text-blue-400" />}
        />
      </div>

      <p className="text-xs text-slate-500">
        Logged in as: <span className="font-mono">{role || 'unknown'}</span>
        {stats.drivers_on_trip > 0 && (
          <>
            {' '}
            · <span className="text-slate-400">{stats.drivers_on_trip} driver(s) on trip</span>
          </>
        )}
      </p>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500 uppercase tracking-wide">{title}</p>
        {icon}
      </div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
    </div>
  );
}
