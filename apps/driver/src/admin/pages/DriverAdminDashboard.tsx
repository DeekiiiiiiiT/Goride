import React, { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { MapPin, Bell, ShieldCheck, Car, Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getDriverStats } from '../services/driverAdminService';

interface OutletContext {
  session: Session;
}

export function DriverAdminDashboard() {
  const { session } = useOutletContext<OutletContext>();
  const accessToken = session.access_token;
  const [stats, setStats] = useState({
    total_drivers: 0,
    active_drivers: 0,
    pending_compliance: 0,
    online_now: 0,
  });
  const [loading, setLoading] = useState(true);

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
          Roam Driver admin overview and metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Drivers"
          value={String(stats.total_drivers)}
          subtitle="Registered drivers"
          icon={<Car className="w-5 h-5 text-violet-400" />}
        />
        <StatCard
          title="Online Now"
          value={String(stats.online_now)}
          subtitle="Available or on trip"
          icon={<MapPin className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          title="Active Drivers"
          value={String(stats.active_drivers)}
          subtitle="Onboarded & active"
          icon={<Users className="w-5 h-5 text-sky-400" />}
        />
        <StatCard
          title="Compliance Queue"
          value={String(stats.pending_compliance)}
          subtitle="Needs review"
          icon={<ShieldCheck className="w-5 h-5 text-blue-400" />}
        />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6">
        <h3 className="text-lg font-medium text-white mb-4">Quick Links</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickLink to="/users" title="User Management" description="Directory, metrics, live status" />
          <QuickLink to="/presence" title="Driver Presence" description="Monitor locations" color="emerald" />
          <QuickLink to="/offers" title="Offer Monitor" description="Active ride offers" color="amber" icon={<Bell className="w-4 h-4" />} />
          <QuickLink to="/compliance" title="Compliance" description="Verification queue" color="blue" />
        </div>
      </div>
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

function QuickLink({
  to,
  title,
  description,
  color = 'violet',
  icon,
}: {
  to: string;
  title: string;
  description: string;
  color?: 'violet' | 'emerald' | 'amber' | 'blue';
  icon?: React.ReactNode;
}) {
  const colorClasses = {
    violet: 'border-violet-500/30 hover:border-violet-500/50',
    emerald: 'border-emerald-500/30 hover:border-emerald-500/50',
    amber: 'border-amber-500/30 hover:border-amber-500/50',
    blue: 'border-blue-500/30 hover:border-blue-500/50',
  };

  return (
    <Link
      to={to}
      className={`block rounded-lg border bg-slate-800/30 p-4 transition-colors ${colorClasses[color]}`}
    >
      <p className="font-medium text-white flex items-center gap-2">
        {icon}
        {title}
      </p>
      <p className="text-sm text-slate-400 mt-1">{description}</p>
    </Link>
  );
}
