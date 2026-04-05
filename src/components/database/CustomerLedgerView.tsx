import React, { useState, useEffect } from 'react';
import { ArrowLeft, HardDrive, Table2, Fuel, Tags, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';
import { BusinessType } from '../../types/data';
import { TripLedgerPage } from './TripLedgerPage';
import { FuelLedgerPage } from './FuelLedgerPage';
import { TollLedgerPage } from './TollLedgerPage';
import { DatabaseLedgerPage } from './DatabaseLedgerPage';

interface CustomerLedgerViewProps {
  customerId: string;
  customerData?: {
    id: string;
    name: string;
    email: string;
    businessType: BusinessType;
  };
  onBack: () => void;
}

type LedgerTab = 'main' | 'trip' | 'fuel' | 'toll';

interface LedgerConfig {
  businessType: BusinessType;
  enabledLedgers: LedgerTab[];
}

const LEDGER_TABS: { id: LedgerTab; label: string; icon: React.ElementType }[] = [
  { id: 'main', label: 'Main Ledger', icon: HardDrive },
  { id: 'trip', label: 'Trip Ledger', icon: Table2 },
  { id: 'fuel', label: 'Fuel Ledger', icon: Fuel },
  { id: 'toll', label: 'Toll Ledger', icon: Tags },
];

const DEFAULT_ENABLED_LEDGERS: LedgerTab[] = ['trip', 'fuel', 'toll'];

export function CustomerLedgerView({ customerId, customerData, onBack }: CustomerLedgerViewProps) {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [activeTab, setActiveTab] = useState<LedgerTab>('trip');

  const businessType = customerData?.businessType || 'rideshare';

  const { data: ledgerConfig } = useQuery<LedgerConfig>({
    queryKey: ['ledgerConfig', businessType],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/ledger-config/${businessType}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        return { businessType, enabledLedgers: DEFAULT_ENABLED_LEDGERS };
      }
      return res.json();
    },
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000,
  });

  const enabledLedgers = ledgerConfig?.enabledLedgers || DEFAULT_ENABLED_LEDGERS;
  const visibleTabs = LEDGER_TABS.filter(tab => enabledLedgers.includes(tab.id));

  useEffect(() => {
    if (!enabledLedgers.includes(activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [enabledLedgers, activeTab, visibleTabs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {customerData?.name || 'Customer'} — Ledgers
          </h1>
          <p className="text-sm text-slate-500">
            {customerData?.email}
          </p>
        </div>
      </div>

      {/* Tab Bar */}
      {visibleTabs.length > 0 ? (
        <>
          <div className="flex items-center gap-1 border-b border-slate-200">
            {visibleTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors
                    ${isActive
                      ? 'border-amber-500 text-amber-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Ledger Content */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden min-h-[500px]">
            {activeTab === 'main' && (
              <DatabaseLedgerPage ledger="main" organizationId={customerId} />
            )}
            {activeTab === 'trip' && (
              <TripLedgerPage organizationId={customerId} />
            )}
            {activeTab === 'fuel' && (
              <FuelLedgerPage organizationId={customerId} />
            )}
            {activeTab === 'toll' && (
              <TollLedgerPage organizationId={customerId} />
            )}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Loader2 className="w-8 h-8 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">Loading ledger configuration...</p>
        </div>
      )}
    </div>
  );
}
