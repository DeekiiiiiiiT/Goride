import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { Loader2, Store, ClipboardList, Clock, AlertTriangle } from 'lucide-react';
import { getDashboardStats } from '../services/dashAdminService';
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

export function DashAdminDashboard() {
  const { session } = useOutletContext<AdminOutletContext>();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getDashboardStats>> | null>(null);

  useEffect(() => {
    void getDashboardStats(session.access_token)
      .then(setStats)
      .catch(console.error)
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Overview</h2>
        <p className="text-sm text-slate-400 mt-1">Platform health at a glance</p>
      </div>

      {stats.sla.staleVerifications > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {stats.sla.staleVerifications} verification{stats.sla.staleVerifications === 1 ? '' : 's'} pending over 48 hours
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Orders today"
          value={stats.orders.todayCount}
          icon={<ClipboardList className="w-5 h-5" />}
          href="/orders"
        />
        <StatCard
          title="GMV today"
          value={`$${stats.orders.todayGmv.toFixed(2)}`}
          icon={<ClipboardList className="w-5 h-5" />}
        />
        <StatCard
          title="Live orders"
          value={stats.orders.liveCount}
          icon={<Clock className="w-5 h-5" />}
          href="/orders?status=live"
        />
        <StatCard
          title="Total merchants"
          value={stats.merchants.total}
          icon={<Store className="w-5 h-5" />}
          href="/merchants"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Pending verification"
          value={stats.merchants.verification.pending}
          icon={<Store className="w-5 h-5" />}
          href="/merchants"
          alert={stats.sla.staleVerifications > 0}
        />
        <StatCard
          title="Suspended"
          value={stats.merchants.operational.suspended ?? 0}
          icon={<Store className="w-5 h-5" />}
          href="/merchants"
        />
        <StatCard
          title="Approved & active"
          value={stats.merchants.operational.active ?? 0}
          icon={<Store className="w-5 h-5" />}
        />
      </div>
    </div>
  );
}
