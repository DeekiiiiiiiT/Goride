import React from 'react';
import { Construction } from 'lucide-react';

interface StationDatabaseViewProps {
  logs?: any[];
  loading?: boolean;
}

export function StationDatabaseView({ logs, loading }: StationDatabaseViewProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="bg-emerald-500/20 p-4 rounded-full mb-4">
        <Construction className="w-8 h-8 text-emerald-400" />
      </div>
      <h2 className="text-xl font-semibold text-slate-200 mb-2">Fuel Station Database</h2>
      <p className="text-slate-400 max-w-md">
        Fuel station management is available in the Fleet Management portal.
        This view will be migrated to the admin portal in a future update.
      </p>
    </div>
  );
}
