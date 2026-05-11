import React, { useState } from 'react';
import { Car, Fuel, Receipt, FileText, Loader2 } from 'lucide-react';
import { TripLedgerPage } from '../database/TripLedgerPage';
import { FuelLedgerPage } from '../database/FuelLedgerPage';
import { TollLedgerPage } from '../database/TollLedgerPage';
import { PlatformStatementSummary } from './PlatformStatementSummary';

type TransactionTab = 'trips' | 'fuel' | 'toll' | 'statement';

const TRANSACTION_TABS: { id: TransactionTab; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'trips', label: 'Trip Ledger', icon: Car, description: 'Individual trip records with earnings breakdown' },
  { id: 'fuel', label: 'Fuel Ledger', icon: Fuel, description: 'Fuel fill-ups, costs, and odometer readings' },
  { id: 'toll', label: 'Toll Ledger', icon: Receipt, description: 'Toll transactions and reconciliation status' },
  { id: 'statement', label: 'Statement Summary', icon: FileText, description: 'Period payouts, bank transfers, and statement totals' },
];

export function TabbedTransactionList() {
  const [activeTab, setActiveTab] = useState<TransactionTab>('trips');
  const [loading] = useState(false);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Transaction List
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          View and manage your complete transaction history across all ledgers.
        </p>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1 -mb-px overflow-x-auto">
          {TRANSACTION_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
                  ${isActive
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300 dark:hover:border-slate-600'
                  }
                `}
                title={tab.description}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <Loader2 className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-4 animate-spin" />
          <p className="text-slate-500 dark:text-slate-400">Loading...</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 md:p-6">
            {activeTab === 'trips' && (
              <TripLedgerPage />
            )}
            {activeTab === 'fuel' && (
              <FuelLedgerPage />
            )}
            {activeTab === 'toll' && (
              <TollLedgerPage />
            )}
            {activeTab === 'statement' && (
              <PlatformStatementSummary />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
