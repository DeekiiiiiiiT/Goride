import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';

interface OutletContext {
  session: Session;
  role: string | undefined;
}

export function RidesAdminDashboard() {
  const { role } = useOutletContext<OutletContext>();
  
  return (
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white">Dashboard</h2>
        <p className="text-sm text-slate-400 mt-1">
          Roam Rides admin overview and metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Rides" value="—" subtitle="Real-time count coming soon" />
        <StatCard title="Today's Rides" value="—" subtitle="Completed rides" />
        <StatCard title="Active Drivers" value="—" subtitle="Currently online" />
        <StatCard title="Avg. Surge" value="—" subtitle="Across all cells" />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6">
        <h3 className="text-lg font-medium text-white mb-4">Quick Links</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <QuickLink
            title="User Management"
            description="Search riders, trip history, suspend or support actions"
            href="/admin/users"
          />
          <QuickLink
            title="Fare Rules"
            description="Configure base fares, per-km, per-min pricing"
            href="/admin/fare-rules"
          />
          <QuickLink
            title="Surge Pricing"
            description="Monitor and adjust surge multipliers"
            href="/admin/surge"
          />
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Logged in as: <span className="font-mono">{role || 'unknown'}</span>
      </p>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-semibold text-white mt-1">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
    </div>
  );
}

function QuickLink({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="block rounded-lg border border-slate-700 bg-slate-800/50 p-4 hover:bg-slate-800 transition-colors"
    >
      <p className="font-medium text-white">{title}</p>
      <p className="text-sm text-slate-400 mt-1">{description}</p>
    </a>
  );
}
