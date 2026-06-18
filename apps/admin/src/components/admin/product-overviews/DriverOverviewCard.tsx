import React from 'react';
import { ExternalLink, Car, MapPin, ShieldCheck, Bell } from 'lucide-react';

interface DriverOverviewCardProps {
  onOpenAdmin?: () => void;
}

export function DriverOverviewCard({ onOpenAdmin }: DriverOverviewCardProps) {
  const handleOpenAdmin = () => {
    if (onOpenAdmin) {
      onOpenAdmin();
    } else {
      window.open('https://roamdriver.co/admin', '_blank');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Car className="w-5 h-5 text-violet-400" />
            Roam Driver Overview
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Read-only summary. Full driver management at roamdriver.co/admin.
          </p>
        </div>
        <button
          onClick={handleOpenAdmin}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white"
        >
          Open Driver Admin
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Drivers"
          value="—"
          subtitle="Registered"
          icon={<Car className="w-5 h-5 text-slate-400" />}
        />
        <StatCard
          title="Online Now"
          value="—"
          subtitle="Available"
          icon={<MapPin className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          title="Pending Offers"
          value="—"
          subtitle="Active"
          icon={<Bell className="w-5 h-5 text-amber-400" />}
        />
        <StatCard
          title="Compliance Queue"
          value="—"
          subtitle="Awaiting review"
          icon={<ShieldCheck className="w-5 h-5 text-blue-400" />}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30 p-4">
        <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-2">Quick Actions</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          To monitor driver presence, review compliance, or manage offers, open the full Driver Admin portal.
        </p>
        <button
          onClick={handleOpenAdmin}
          className="mt-3 text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1"
        >
          Go to Driver Admin <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      <p className="text-xs text-slate-500">
        Driver statistics will be populated once the driver Edge function is deployed.
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
    <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500 uppercase tracking-wide">{title}</p>
        {icon}
      </div>
      <p className="text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
    </div>
  );
}
