import React from 'react';
import { Activity } from 'lucide-react';
import { OverviewTab } from './OverviewTab';
import { UsageTab } from './UsageTab';
import { KeysTab } from './KeysTab';
import { BudgetsTab } from './BudgetsTab';
import { CallLogTab } from './CallLogTab';
import { ProviderBillingTab } from './ProviderBillingTab';

export interface ApiCommandCenterProps {
  activeTab?: string;
  onNavigate?: (page: string) => void;
}

export function ApiCommandCenter({ activeTab = 'overview', onNavigate }: ApiCommandCenterProps) {
  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex items-start gap-3">
        <div className="bg-amber-500/10 p-2 rounded-lg">
          <Activity className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">API Command Center</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Monitor outbound third-party API usage, estimate spend, rotate keys, and enforce budgets.
          </p>
        </div>
      </header>

      {activeTab === 'overview' && <OverviewTab onNavigate={onNavigate} />}
      {activeTab === 'usage' && <UsageTab />}
      {activeTab === 'keys' && <KeysTab />}
      {activeTab === 'budgets' && <BudgetsTab />}
      {activeTab === 'logs' && <CallLogTab />}
      {activeTab === 'billing' && <ProviderBillingTab />}
    </div>
  );
}
