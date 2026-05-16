import React from 'react';
import { Bell, RefreshCw } from 'lucide-react';

interface OfferMonitorProps {
  accessToken: string | undefined;
}

export function OfferMonitor({ accessToken }: OfferMonitorProps) {
  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-400" />
            Offer Monitor
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            View and manage active ride offers to drivers.
          </p>
        </div>
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-8 text-center">
        <Bell className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">
          Offer monitoring will include:
        </p>
        <ul className="text-sm text-slate-500 mt-4 space-y-1">
          <li>• Active offers awaiting response</li>
          <li>• Offer acceptance/decline rates</li>
          <li>• Timeout tracking</li>
          <li>• Manual offer cancellation</li>
        </ul>
        <p className="text-xs text-slate-600 mt-6">
          Requires driver Edge function deployment
        </p>
      </div>
    </div>
  );
}
