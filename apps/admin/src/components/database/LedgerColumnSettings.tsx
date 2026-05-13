import React from 'react';
import { Construction } from 'lucide-react';

interface LedgerColumnSettingsProps {
  onBack?: () => void;
}

export function LedgerColumnSettings({ onBack }: LedgerColumnSettingsProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="bg-slate-500/20 p-4 rounded-full mb-4">
        <Construction className="w-8 h-8 text-slate-400" />
      </div>
      <h2 className="text-xl font-semibold text-slate-200 mb-2">Ledger Column Settings</h2>
      <p className="text-slate-400 max-w-md mb-4">
        Ledger column settings are available in the Fleet Management portal.
        This view will be migrated to the admin portal in a future update.
      </p>
      {onBack && (
        <button
          onClick={onBack}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
        >
          Go Back
        </button>
      )}
    </div>
  );
}
