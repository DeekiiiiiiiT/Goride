import React, { useEffect, useState } from 'react';
import { Car, Fuel, Receipt, FileText, Layers } from 'lucide-react';
import { TripLedgerPage } from '../database/TripLedgerPage';
import { FuelLedgerPage } from '../database/FuelLedgerPage';
import { TollLedgerPage } from '../database/TollLedgerPage';
import { PlatformStatementSummary } from './PlatformStatementSummary';
import { UnifiedLedgerAllTab } from './UnifiedLedgerAllTab';
import { LedgerPeriodProvider, useLedgerPeriod } from '../../contexts/LedgerPeriodContext';
import { useUnifiedLedgerFlag } from '../../hooks/useUnifiedLedgerFlag';
import { PeriodWeekDropdown } from '../ui/PeriodWeekDropdown';

type TransactionTab = 'trips' | 'fuel' | 'toll' | 'statement' | 'all';

const TRANSACTION_TABS: { id: TransactionTab; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'trips', label: 'Trip Ledger', icon: Car, description: 'Individual trip records with earnings breakdown' },
  { id: 'fuel', label: 'Fuel Ledger', icon: Fuel, description: 'Fuel fill-ups, costs, and odometer readings' },
  { id: 'toll', label: 'Toll Ledger', icon: Receipt, description: 'Toll transactions and reconciliation status' },
  { id: 'statement', label: 'Statement Summary', icon: FileText, description: 'Period payouts, bank transfers, and statement totals' },
];

function readTabFromUrl(): TransactionTab {
  try {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get('ledgerTab');
    if (t === 'trips' || t === 'fuel' || t === 'toll' || t === 'statement' || t === 'all') return t;
  } catch { /* ignore */ }
  return 'trips';
}

function writeTabToUrl(tab: TransactionTab) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('ledgerTab', tab);
    window.history.replaceState({}, '', url.toString());
  } catch { /* ignore */ }
}

function LedgersInner() {
  const [activeTab, setActiveTab] = useState<TransactionTab>(readTabFromUrl);
  const { period, setPeriod } = useLedgerPeriod();
  const unified = useUnifiedLedgerFlag();

  useEffect(() => {
    writeTabToUrl(activeTab);
  }, [activeTab]);

  const tabs = unified
    ? [
        ...TRANSACTION_TABS,
        { id: 'all' as const, label: 'All', icon: Layers, description: 'Cross-type unified ledger entries' },
      ]
    : TRANSACTION_TABS;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Ledgers
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Trip, fuel, and toll records with full financial detail.
          </p>
        </div>
        <div className="min-w-[220px]">
          <PeriodWeekDropdown
            selectedStart={period.startDate}
            selectedEnd={period.endDate}
            onSelect={(opt) => {
              if (opt.startDate && opt.endDate) {
                setPeriod({ startDate: opt.startDate, endDate: opt.endDate });
              }
            }}
            placeholder="Shared ledger period"
          />
        </div>
      </div>

      {unified && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
          Unified ledger read model (preview) — enable via localStorage <code>roam_ledger_read_model=1</code>.
        </div>
      )}

      <div className="border-b border-slate-200 dark:border-slate-700" role="tablist" aria-label="Ledger tabs">
        <div className="flex items-center gap-1 -mb-px overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
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

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 md:p-6" role="tabpanel">
          {activeTab === 'trips' && <TripLedgerPage />}
          {activeTab === 'fuel' && <FuelLedgerPage />}
          {activeTab === 'toll' && <TollLedgerPage />}
          {activeTab === 'statement' && <PlatformStatementSummary />}
          {activeTab === 'all' && unified && <UnifiedLedgerAllTab />}
        </div>
      </div>
    </div>
  );
}

export function TabbedTransactionList() {
  return (
    <LedgerPeriodProvider>
      <LedgersInner />
    </LedgerPeriodProvider>
  );
}
