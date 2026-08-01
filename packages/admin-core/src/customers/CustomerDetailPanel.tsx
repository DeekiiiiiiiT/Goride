import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { CustomerFeatureModulesPanel } from './CustomerFeatureModulesPanel';

export type CustomerDetailPanelProps = {
  orgId: string;
  name: string;
  email: string;
  businessType?: string;
  apiBaseUrl: string;
  accessToken: string;
  canEditModules?: boolean;
  onBack: () => void;
};

export function CustomerDetailPanel({
  orgId,
  name,
  email,
  businessType,
  apiBaseUrl,
  accessToken,
  canEditModules = true,
  onBack,
}: CustomerDetailPanelProps) {
  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to customers
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">
          Enterprise customer
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{name || email}</h2>
        <p className="text-sm text-slate-500">{email}</p>
        {businessType && (
          <p className="mt-2 text-xs text-slate-400">Business type: {businessType}</p>
        )}
        <p className="mt-1 font-mono text-xs text-slate-400">{orgId}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <CustomerFeatureModulesPanel
          orgId={orgId}
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          canEdit={canEditModules}
        />
      </div>
    </div>
  );
}
