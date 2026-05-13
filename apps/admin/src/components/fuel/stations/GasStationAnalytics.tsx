import React from 'react';
import { Construction } from 'lucide-react';

interface GasStationAnalyticsProps {
  logs?: any[];
  loading?: boolean;
  onRequestRefresh?: () => void;
}

export function GasStationAnalytics({ logs, loading, onRequestRefresh }: GasStationAnalyticsProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="bg-blue-500/20 p-4 rounded-full mb-4">
        <Construction className="w-8 h-8 text-blue-400" />
      </div>
      <h2 className="text-xl font-semibold text-slate-200 mb-2">Gas Station Analytics</h2>
      <p className="text-slate-400 max-w-md">
        Gas station analytics is available in the Fleet Management portal.
        This view will be migrated to the admin portal in a future update.
      </p>
    </div>
  );
}
