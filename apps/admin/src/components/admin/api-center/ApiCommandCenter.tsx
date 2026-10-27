// Stitch: dominion-redesign/03467b90d13346279b0c1ab439350075
import React from 'react';
import { Activity, Info } from 'lucide-react';
import { OverviewTab } from './OverviewTab';
import { UsageTab } from './UsageTab';
import { KeysTab } from './KeysTab';
import { BudgetsTab } from './BudgetsTab';
import { CallLogTab } from './CallLogTab';
import { ProviderBillingTab } from './ProviderBillingTab';
import { SupabasePlatformTab } from './SupabasePlatformTab';

export interface ApiCommandCenterProps {
  activeTab?: string;
  onNavigate?: (page: string) => void;
}

const TABS: { id: string; page: string; label: string; ownerOnly?: boolean }[] = [
  { id: 'overview', page: 'api-center-overview', label: 'Overview' },
  { id: 'usage', page: 'api-center-usage', label: 'Usage' },
  { id: 'supabase', page: 'api-center-supabase', label: 'Supabase' },
  { id: 'keys', page: 'api-center-keys', label: 'Keys', ownerOnly: true },
  { id: 'budgets', page: 'api-center-budgets', label: 'Budgets', ownerOnly: true },
  { id: 'logs', page: 'api-center-logs', label: 'Call log' },
  { id: 'billing', page: 'api-center-billing', label: 'Billing' },
];

export function ApiCommandCenter({ activeTab = 'overview', onNavigate }: ApiCommandCenterProps) {
  const tab = activeTab === 'api-center' ? 'overview' : activeTab;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-8 text-slate-900">
      <div className="flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <span className="text-slate-400">Dominion</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-400">Distribution</span>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-slate-800">Data API</span>
        </nav>
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-blue-50 px-2.5 py-1 font-mono text-[11px] text-blue-700">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          <span>REGION: JM-KGN</span>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Data API</h1>
        <p className="mt-1 text-xs text-slate-500">
          Data pipeline interfaces, rate distribution, and provider connectivity in Jamaica.
        </p>
      </div>

      <div className="border-b border-slate-200">
        <div className="-mb-px flex items-center gap-1 overflow-x-auto text-xs font-medium">
          {TABS.map((t) => {
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onNavigate?.(t.page)}
                className={
                  selected
                    ? 'inline-flex items-center gap-2 whitespace-nowrap border-b-2 border-blue-600 px-4 py-2.5 font-semibold text-blue-600'
                    : 'inline-flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800'
                }
              >
                <span>{t.label}</span>
                {t.ownerOnly ? (
                  <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600">
                    Owner only
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[12px] border border-slate-200/90 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600">
              <Activity className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">API Gateway &amp; Feed Distribution</h3>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  Active Node
                </span>
              </div>
              <p className="mt-0.5 font-mono text-xs text-slate-500">
                Partition: Kingston &amp; St. Andrew (JM-01) · Distribution Realm
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <div className="flex flex-col rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                Currency
              </span>
              <span className="font-bold text-slate-800">JMD</span>
            </div>
            <div className="flex flex-col rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                Partition Loc
              </span>
              <span className="font-bold text-slate-800">KINGSTON</span>
            </div>
          </div>
        </div>
      </div>

      {tab === 'overview' && <OverviewTab onNavigate={onNavigate} />}
      {tab === 'usage' && <UsageTab />}
      {tab === 'supabase' && <SupabasePlatformTab />}
      {tab === 'keys' && <KeysTab />}
      {tab === 'budgets' && <BudgetsTab />}
      {tab === 'logs' && <CallLogTab />}
      {tab === 'billing' && <ProviderBillingTab />}

      {tab === 'overview' ? (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between rounded-[12px] border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Activity className="h-[18px] w-[18px] text-slate-400" aria-hidden />
              <span className="text-xs font-medium text-slate-700">
                The provider bill is not connected yet.
              </span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
              BILLING_STATUS: PENDING
            </span>
          </div>
          <div className="flex items-center justify-between rounded-[12px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-500">
            <div className="flex items-center gap-2.5">
              <Info className="h-[17px] w-[17px] text-slate-400" aria-hidden />
              <span className="italic text-slate-500">The data is not in yet.</span>
            </div>
            <div className="font-mono text-[10px] uppercase text-slate-400">
              LOC: KINGSTON / PARISH REGISTRY JMD
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
