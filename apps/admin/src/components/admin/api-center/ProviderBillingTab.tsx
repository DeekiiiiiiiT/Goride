/**
 * ProviderBillingTab.tsx
 *
 * Scaffolded placeholder for pulling REAL spend data from OpenAI's Usage API
 * and GCP Billing export. Until those credentials are configured, the panel
 * shows an empty state with setup instructions.
 */

import React from 'react';
import { Loader2, Info, AlertCircle, CheckCircle2, PlayCircle, CloudCog } from 'lucide-react';
import { useBillingStatus, useRunBillingSync } from './hooks';

export function ProviderBillingTab() {
  const { data, isLoading } = useBillingStatus();
  const run = useRunBillingSync();

  const openaiOk = !!data?.configured?.openai;
  const gcpOk = !!data?.configured?.google_cloud;
  const anyConfigured = openaiOk || gcpOk;

  return (
    <div className="space-y-5">
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3 flex items-start gap-2.5 text-sm text-slate-400">
        <Info className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
        <p>
          This panel reconciles our local cost estimate against the actual invoiced spend from each provider. It is
          scaffolded and ships disabled — once you add the credentials listed below as Edge Function secrets, the sync
          job will populate real numbers on a schedule.
        </p>
      </div>

      <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
        <header className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
          <CloudCog className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-white">Provider billing integrations</h3>
        </header>

        <div className="divide-y divide-slate-800">
          <IntegrationRow
            title="OpenAI Usage API"
            envVar="OPENAI_ADMIN_API_KEY"
            configured={openaiOk}
            isLoading={isLoading}
            note="Admin API key with usage.read scope. Queries daily spend by model."
          />
          <IntegrationRow
            title="Google Cloud Billing export"
            envVar="GCP_BILLING_ACCOUNT_ID"
            configured={gcpOk}
            isLoading={isLoading}
            note="Requires BigQuery billing export. Queried for Maps & Gemini SKUs."
          />
        </div>

        <div className="px-4 py-3 bg-slate-900/60 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Last sync result is stored as <span className="font-mono">api_billing_actual:*:YYYY-MM</span> rows.
          </span>
          <button
            onClick={() => run.mutate()}
            disabled={!anyConfigured || run.isPending}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
              ${anyConfigured
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-slate-800/60 text-slate-500 border border-slate-800 cursor-not-allowed'}
            `}
          >
            {run.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            {run.isPending ? 'Syncing...' : 'Run sync now'}
          </button>
        </div>
      </section>

      {run.data && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${run.data.ok ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/5 border-amber-500/30 text-amber-200'}`}>
          <div className="flex items-start gap-2">
            {run.data.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
            <div>
              <p className="font-semibold">{run.data.reason === 'not-configured' ? 'Not configured' : run.data.reason === 'stub' ? 'Detected — sync not yet implemented' : 'Sync complete'}</p>
              <p className="text-xs mt-1 opacity-80">{run.data.detail}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IntegrationRow({
  title,
  envVar,
  configured,
  isLoading,
  note,
}: {
  title: string;
  envVar: string;
  configured: boolean;
  isLoading: boolean;
  note: string;
}) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-white">{title}</h4>
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" />
          ) : configured ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-semibold">
              <CheckCircle2 className="w-3 h-3" /> Configured
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wider bg-slate-800/80 text-slate-400 border border-slate-700 px-1.5 py-0.5 rounded font-semibold">
              Missing
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">{note}</p>
      </div>
      <div className="font-mono text-[11px] text-slate-500 bg-slate-950/60 border border-slate-800 rounded px-2 py-1 shrink-0">
        {envVar}
      </div>
    </div>
  );
}
