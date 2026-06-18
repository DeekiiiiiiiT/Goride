import React from 'react';
import { ExternalLink, Truck } from 'lucide-react';

interface HaulOverviewCardProps {
  onOpenAdmin?: () => void;
}

export function HaulOverviewCard({ onOpenAdmin }: HaulOverviewCardProps) {
  const handleOpenAdmin = () => {
    if (onOpenAdmin) {
      onOpenAdmin();
    } else {
      window.open('https://roamhaul.co/admin', '_blank');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-500" />
            Roam Haul
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Freight catalog, transport solutions, and hauler operations at roamhaul.co/admin.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleOpenAdmin}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 text-sm font-semibold"
        >
          Open Haul Admin
          <ExternalLink className="w-4 h-4" />
        </button>
        <a
          href="https://roamhaul.co/admin/settings"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Platform settings
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        </div>
      </div>
    </div>
  );
}
