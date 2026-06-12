import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { Activity, CalendarClock, Car, Loader2, MapPin, TrendingUp, Users, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getRidesAdminStats, type RidesDashboardTab } from '../services/ridesAdminService';
import { RidesDashboardDrilldown } from '../components/RidesDashboardDrilldown';

interface OutletContext {
  session: Session;
  role: string | undefined;
}

type RidesAdminStats = {
  active_rides: number;
  riders_on_trip: number;
  todays_completed_rides: number;
  cancelled_rides_today: number;
  upcoming_scheduled_rides: number;
  online_drivers: number;
  drivers_on_trip: number;
  avg_surge_multiplier: number;
};

const CARD_TABS: Array<{
  tab: RidesDashboardTab;
  title: string;
  subtitle: string;
  statKey: keyof RidesAdminStats;
  icon: React.ReactNode;
}> = [
  {
    tab: 'active_rides',
    title: 'Active Rides',
    subtitle: 'Matching or in progress',
    statKey: 'active_rides',
    icon: <Activity className="w-5 h-5 text-emerald-400" />,
  },
  {
    tab: 'riders_on_trip',
    title: 'Riders on Trip',
    subtitle: 'Driver assigned through on trip',
    statKey: 'riders_on_trip',
    icon: <Users className="w-5 h-5 text-violet-400" />,
  },
  {
    tab: 'todays_rides',
    title: "Today's Rides",
    subtitle: 'Completed today (UTC)',
    statKey: 'todays_completed_rides',
    icon: <Car className="w-5 h-5 text-sky-400" />,
  },
  {
    tab: 'cancelled_rides',
    title: 'Cancellations',
    subtitle: 'Cancelled today (UTC)',
    statKey: 'cancelled_rides_today',
    icon: <XCircle className="w-5 h-5 text-rose-400" />,
  },
  {
    tab: 'scheduled_rides',
    title: 'Scheduled',
    subtitle: 'Upcoming reserve rides',
    statKey: 'upcoming_scheduled_rides',
    icon: <CalendarClock className="w-5 h-5 text-teal-400" />,
  },
  {
    tab: 'drivers_online',
    title: 'Drivers Online',
    subtitle: 'Available for dispatch',
    statKey: 'online_drivers',
    icon: <MapPin className="w-5 h-5 text-amber-400" />,
  },
  {
    tab: 'surge',
    title: 'Avg. Surge',
    subtitle: 'Across all cells',
    statKey: 'avg_surge_multiplier',
    icon: <TrendingUp className="w-5 h-5 text-blue-400" />,
  },
];

export function RidesAdminDashboard() {
  const { session, role } = useOutletContext<OutletContext>();
  const accessToken = session.access_token;
  const [stats, setStats] = useState<RidesAdminStats>({
    active_rides: 0,
    riders_on_trip: 0,
    todays_completed_rides: 0,
    cancelled_rides_today: 0,
    upcoming_scheduled_rides: 0,
    online_drivers: 0,
    drivers_on_trip: 0,
    avg_surge_multiplier: 1,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<RidesDashboardTab>('active_rides');

  useEffect(() => {
    if (!accessToken) return;
    void getRidesAdminStats(accessToken)
      .then((s) =>
        setStats({
          ...s,
          cancelled_rides_today: s.cancelled_rides_today ?? 0,
          upcoming_scheduled_rides: s.upcoming_scheduled_rides ?? 0,
        }),
      )
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
          Roam Rides admin overview and metrics. Click a card or tab to see the underlying list.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {CARD_TABS.map((card) => (
          <StatCard
            key={card.tab}
            title={card.title}
            value={
              card.tab === 'surge'
                ? stats.avg_surge_multiplier.toFixed(2)
                : String(stats[card.statKey])
            }
            subtitle={card.subtitle}
            icon={card.icon}
            selected={activeTab === card.tab}
            onClick={() => setActiveTab(card.tab)}
          />
        ))}
      </div>

      <RidesDashboardDrilldown
        accessToken={accessToken}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

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
  selected,
  onClick,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left w-full transition-colors ${
        selected
          ? 'border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/30'
          : 'border-slate-800 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-900/50'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500 uppercase tracking-wide">{title}</p>
        {icon}
      </div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
    </button>
  );
}
