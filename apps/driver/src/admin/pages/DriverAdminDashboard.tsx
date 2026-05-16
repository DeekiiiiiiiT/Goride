import React from 'react';
import { MapPin, Bell, ShieldCheck, Car } from 'lucide-react';

interface DriverAdminDashboardProps {
  accessToken: string | undefined;
}

export function DriverAdminDashboard({ accessToken }: DriverAdminDashboardProps) {
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
          value="—"
          subtitle="Registered drivers"
          icon={<Car className="w-5 h-5 text-violet-400" />}
        />
        <StatCard
          title="Online Now"
          value="—"
          subtitle="Currently available"
          icon={<MapPin className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          title="Pending Offers"
          value="—"
          subtitle="Active ride offers"
          icon={<Bell className="w-5 h-5 text-amber-400" />}
        />
        <StatCard
          title="Compliance Queue"
          value="—"
          subtitle="Awaiting verification"
          icon={<ShieldCheck className="w-5 h-5 text-blue-400" />}
        />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6">
        <h3 className="text-lg font-medium text-white mb-4">Quick Links</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <QuickLink
            title="Driver Presence"
            description="Monitor driver locations and availability"
            color="emerald"
          />
          <QuickLink
            title="Offer Monitor"
            description="View and manage active ride offers"
            color="amber"
          />
          <QuickLink
            title="Compliance"
            description="Review driver verification status"
            color="blue"
          />
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Driver admin API endpoints are being developed. Dashboard stats will be populated once
        the Edge function is deployed.
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

function QuickLink({
  title,
  description,
  color,
}: {
  title: string;
  description: string;
  color: 'emerald' | 'amber' | 'blue';
}) {
  const colorClasses = {
    emerald: 'border-emerald-500/30 hover:border-emerald-500/50',
    amber: 'border-amber-500/30 hover:border-amber-500/50',
    blue: 'border-blue-500/30 hover:border-blue-500/50',
  };

  return (
    <div
      className={`block rounded-lg border bg-slate-800/30 p-4 transition-colors ${colorClasses[color]}`}
    >
      <p className="font-medium text-white">{title}</p>
      <p className="text-sm text-slate-400 mt-1">{description}</p>
    </div>
  );
}
