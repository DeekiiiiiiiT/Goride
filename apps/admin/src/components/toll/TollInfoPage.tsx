import React from 'react';
import { Construction } from 'lucide-react';

export function TollInfoPage() {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="bg-amber-500/20 p-4 rounded-full mb-4">
        <Construction className="w-8 h-8 text-amber-400" />
      </div>
      <h2 className="text-xl font-semibold text-slate-200 mb-2">Toll Information</h2>
      <p className="text-slate-400 max-w-md">
        Toll information management is available in the Fleet Management portal.
        This view will be migrated to the admin portal in a future update.
      </p>
    </div>
  );
}
