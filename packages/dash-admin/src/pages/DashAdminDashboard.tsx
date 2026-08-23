import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOutletContext } from 'react-router-dom';
import { Loader2, Store, ClipboardList, Clock, AlertTriangle, Bike, MapPin, ShieldCheck, Users, Package } from 'lucide-react';
import { toast } from 'sonner';
import { getDashboardStats, type DashboardStatsResponse } from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../DashAdminPortal';

function StatCard({
  title,
  value,
  icon,
  href,
  alert,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  href?: string;
  alert?: boolean;
}) {
  const inner = (
    <div
      className={`rounded-xl border p-5 ${alert ? 'border-red-500/40 bg-red-500/5' : 'border-slate-800 bg-slate-900/50'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">{title}</p>
          <p className="text-2xl font-semibold text-white mt-1">{value}</p>
        </div>
        <div className="text-slate-500">{icon}</div>
      </div>
    </div>
  );
  return href ? <Link to={href}>{inner}</Link> : inner;
}

const COURIER_CARDS: Array<{
  key: 'total_couriers' | 'online_now' | 'on_delivery_now' | 'active_couriers' | 'pending_compliance';
  title: string;
  subtitle: string;
  href: string;
  icon: React.ReactNode;
}> = [
  { key: 'total_couriers', title: 'Total Couriers', subtitle: 'Registered couriers', href: '/couriers', icon: <Bike className="w-5 h-5 text-emerald-400" /> },
  { key: 'online_now', title: 'Online Now', subtitle: 'Available for dispatch', href: '/couriers/presence', icon: <MapPin className="w-5 h-5 text-sky-400" /> },
  { key: 'on_delivery_now', title: 'On Delivery', subtitle: 'Active deliveries', href: '/couriers/presence', icon: <Package className="w-5 h-5 text-amber-400" /> },
  { key: 'active_couriers', title: 'Active Couriers', subtitle: 'Approved & onboarded', href: '/couriers?status=active', icon: <Users className="w-5 h-5 text-emerald-300" /> },
  { key: 'pending_compliance', title: 'Compliance Queue', subtitle: 'Needs review', href: '/couriers/compliance', icon: <ShieldCheck className="w-5 h-5 text-blue-400" /> },
];

export function DashAdminDashboard() {
  const { session } = useOutletContext<AdminOutletContext>();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);

  useEffect(() => {
    void getDashboardStats(session.access_token)
      .then(setStats)
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'Failed to load stats');
      })
      .finally(() => setLoading(false));
  }, [session.access_token]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  if (!stats) {
    return <p className="text-slate-400">Failed to load dashboard stats.</p>;
  }

  if (stats.scope === 'courier') {
    return (
      <div className="space-y-6 text-slate-200">
        <div>
          <h2 className="text-xl font-semibold text-white">Dashboard</h2>
          <p className="text-sm text-slate-400 mt-1">Courier operations overview. Click a card to drill down.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {COURIER_CARDS.map((card) => (
            <Link
              key={card.key}
              to={card.href}
              className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 hover:border-emerald-500/40 hover:bg-slate-900/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500 uppercase tracking-wide">{card.title}</p>
                {card.icon}
              </div>
              <p className="text-2xl font-semibold text-white">{stats.courier[card.key]}</p>
              <p className="text-xs text-slate-500 mt-1">{card.subtitle}</p>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (stats.scope !== 'platform' || !stats.platform) {
    return <p className="text-slate-400">Failed to load dashboard stats.</p>;
  }

  const platform = stats.platform;
  const staleVerifications = platform.sla?.staleVerifications ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Overview</h2>
        <p className="text-sm text-slate-400 mt-1">Platform health at a glance</p>
      </div>

      {staleVerifications > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {staleVerifications} verification{staleVerifications === 1 ? '' : 's'} pending over 48 hours
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Orders today" value={platform.orders.todayCount} icon={<ClipboardList className="w-5 h-5" />} href="/orders" />
        <StatCard title="GMV today" value={`$${platform.orders.todayGmv.toFixed(2)}`} icon={<ClipboardList className="w-5 h-5" />} />
        <StatCard title="Live orders" value={platform.orders.liveCount} icon={<Clock className="w-5 h-5" />} href="/orders?status=live" />
        <StatCard title="Total merchants" value={platform.merchants.total} icon={<Store className="w-5 h-5" />} href="/merchants" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Pending verification"
          value={platform.merchants.verification.pending}
          icon={<Store className="w-5 h-5" />}
          href="/merchants"
          alert={staleVerifications > 0}
        />
        <StatCard title="Suspended" value={platform.merchants.operational.suspended ?? 0} icon={<Store className="w-5 h-5" />} href="/merchants" />
        <StatCard title="Approved & active" value={platform.merchants.operational.active ?? 0} icon={<Store className="w-5 h-5" />} />
      </div>
    </div>
  );
}
