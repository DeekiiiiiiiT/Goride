import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { MapPin, ShieldCheck, Car, Users, Loader2, Route } from 'lucide-react';
import { toast } from 'sonner';
import { getDriverStats } from '../services/driverAdminService';
import {
  DriverDashboardDrilldown,
  type DriverDashboardTab,
} from '../components/DriverDashboardDrilldown';

interface OutletContext {
  session: Session;
}

type DriverStats = {
  total_drivers: number;
  active_drivers: number;
  pending_compliance: number;
  online_now: number;
  on_trip_now: number;
};

const CARD_TABS: Array<{
  tab: DriverDashboardTab;
  title: string;
  subtitle: string;
  statKey: keyof DriverStats;
  icon: React.ReactNode;
}> = [
  {
    tab: 'total',
    title: 'Total Drivers',
    subtitle: 'Registered drivers',
    statKey: 'total_drivers',
    icon: <Car className="w-5 h-5 text-violet-400" />,
  },
  {
    tab: 'online',
    title: 'Online Now',
    subtitle: 'Available for dispatch',
    statKey: 'online_now',
    icon: <MapPin className="w-5 h-5 text-emerald-400" />,
  },
  {
    tab: 'on_trip',
    title: 'On Trip',
    subtitle: 'Active rides in progress',
    statKey: 'on_trip_now',
    icon: <Route className="w-5 h-5 text-amber-400" />,
  },
  {
    tab: 'active',
    title: 'Active Drivers',
    subtitle: 'Onboarded & active',
    statKey: 'active_drivers',
    icon: <Users className="w-5 h-5 text-sky-400" />,
  },
  {
    tab: 'compliance',
    title: 'Compliance Queue',
    subtitle: 'Needs review',
    statKey: 'pending_compliance',
    icon: <ShieldCheck className="w-5 h-5 text-blue-400" />,
  },
];

export function DriverAdminDashboard() {
  const { session } = useOutletContext<OutletContext>();
  const accessToken = session.access_token;
  const [stats, setStats] = useState<DriverStats>({
    total_drivers: 0,
    active_drivers: 0,
    pending_compliance: 0,
    online_now: 0,
    on_trip_now: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DriverDashboardTab>('total');

  useEffect(() => {
    if (!accessToken) return;
    void getDriverStats(accessToken)
      .then(setStats)
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'Failed to load stats');
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
          Roam Driver admin overview and metrics. Click a card or tab to see the underlying list.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {CARD_TABS.map((card) => (
          <StatCard
            key={card.tab}
            title={card.title}
            value={String(stats[card.statKey])}
            subtitle={card.subtitle}
            icon={card.icon}
            selected={activeTab === card.tab}
            onClick={() => setActiveTab(card.tab)}
          />
        ))}
      </div>

      <DriverDashboardDrilldown
        accessToken={accessToken}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
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
