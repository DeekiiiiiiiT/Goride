import React, { useEffect, useMemo, useState } from 'react';
import { Car, Fuel, Receipt, FileText, Layers } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { TripLedgerPage } from '../database/TripLedgerPage';
import { FuelLedgerPage } from '../database/FuelLedgerPage';
import { TollLedgerPage } from '../database/TollLedgerPage';
import { mergeTripLedgerColumnConfig } from '../database/LedgerColumnSettings';
import { PlatformStatementSummary } from './PlatformStatementSummary';
import { UnifiedLedgerAllTab } from './UnifiedLedgerAllTab';
import { LedgerPeriodProvider, useLedgerPeriod } from '../../contexts/LedgerPeriodContext';
import { useUnifiedLedgerFlag } from '../../hooks/useUnifiedLedgerFlag';
import { PeriodWeekDropdown } from '../ui/PeriodWeekDropdown';
import { ALL_TIME_OPTION_ID } from '../../utils/periodWeekOptions';
import { useAuth } from '../auth/AuthContext';
import { useBusinessConfig } from '../auth/BusinessConfigContext';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { BusinessType } from '../../types/data';

type TransactionTab = 'trips' | 'fuel' | 'toll' | 'statement' | 'all';

type LedgerTab = 'main' | 'trip' | 'fuel' | 'toll';

interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  custom?: boolean;
}

interface LedgerConfig {
  businessType: BusinessType;
  enabledLedgers: LedgerTab[];
  columns?: Record<LedgerTab, ColumnConfig[]>;
}

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

function LedgersInner({
  onOpenTollRecon,
}: {
  onOpenTollRecon?: (opts: { startYmd: string; endYmd: string }) => void;
}) {
  const [activeTab, setActiveTab] = useState<TransactionTab>(readTabFromUrl);
  // R-03: mount panel content on first visit, then keep mounted behind hidden
  const [visited, setVisited] = useState<Set<TransactionTab>>(() => new Set([readTabFromUrl()]));
  const { period, setPeriod } = useLedgerPeriod();
  const unified = useUnifiedLedgerFlag();
  const { session } = useAuth();
  const { businessType } = useBusinessConfig();
  const accessToken = session?.access_token;

  // F-33: same Super-Admin ledger-config source as CustomerLedgerView / LedgerColumnSettings (API, not localStorage)
  const { data: ledgerConfig } = useQuery<LedgerConfig>({
    queryKey: ['ledgerConfig', businessType],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/ledger-config/${businessType}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        return { businessType, enabledLedgers: ['trip', 'fuel', 'toll'] };
      }
      return res.json();
    },
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000,
  });

  const tripColumnConfig = useMemo(
    () => (ledgerConfig?.columns?.trip ? mergeTripLedgerColumnConfig(ledgerConfig.columns.trip) : undefined),
    [ledgerConfig?.columns?.trip],
  );
  const fuelColumnConfig = ledgerConfig?.columns?.fuel;
  const tollColumnConfig = ledgerConfig?.columns?.toll;

  useEffect(() => {
    writeTabToUrl(activeTab);
  }, [activeTab]);

  const tabs = unified
    ? [
        ...TRANSACTION_TABS,
        { id: 'all' as const, label: 'All', icon: Layers, description: 'Cross-type unified ledger entries' },
      ]
    : TRANSACTION_TABS;

  const selectTab = (id: TransactionTab) => {
    setActiveTab(id);
    setVisited((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    selectTab(tabs[next].id);
    const btn = document.getElementById(`ledger-tab-${tabs[next].id}`);
    btn?.focus();
  };

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
            selectedStart={period.startDate || undefined}
            selectedEnd={period.endDate || undefined}
            prependAllTimeOption
            onSelect={(opt) => {
              if (opt.id === ALL_TIME_OPTION_ID || (!opt.startDate && !opt.endDate)) {
                setPeriod({ startDate: '', endDate: '' });
                return;
              }
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
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const panelId = `ledger-panel-${tab.id}`;
            return (
              <button
                key={tab.id}
                id={`ledger-tab-${tab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(e) => onTabKeyDown(e, index)}
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
        {/* Mount on first visit (R-03); keep mounted behind hidden after that (F-14) */}
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const panelId = `ledger-panel-${tab.id}`;
          return (
            <div
              key={tab.id}
              id={panelId}
              role="tabpanel"
              aria-labelledby={`ledger-tab-${tab.id}`}
              hidden={!isActive}
              className={isActive ? 'p-4 md:p-6' : undefined}
            >
              {visited.has(tab.id) && (
                <>
                  {tab.id === 'trips' && <TripLedgerPage columnConfig={tripColumnConfig} />}
                  {tab.id === 'fuel' && <FuelLedgerPage columnConfig={fuelColumnConfig} />}
                  {tab.id === 'toll' && <TollLedgerPage columnConfig={tollColumnConfig} />}
                  {tab.id === 'statement' && (
                    <PlatformStatementSummary onOpenTollRecon={onOpenTollRecon} />
                  )}
                  {tab.id === 'all' && unified && <UnifiedLedgerAllTab />}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TabbedTransactionList({
  onOpenTollRecon,
}: {
  onOpenTollRecon?: (opts: { startYmd: string; endYmd: string }) => void;
} = {}) {
  return (
    <LedgerPeriodProvider>
      <LedgersInner onOpenTollRecon={onOpenTollRecon} />
    </LedgerPeriodProvider>
  );
}
