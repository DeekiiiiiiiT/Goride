// Stitch: dominion-redesign/f213ca85e6014903b9a070adf73b86ba
/**
 * Dominion — JAA card catalogue (platform): programs only. Master data, so no statement rows here.
 * RF-04 (docs/roam-fuel-card-statement-audit.md): Roam's statement is uploaded in Fleet Admin →
 * Gas cards → Statement import (GasCardsOrgView), which also marks the weeks received.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { fleetCustomerOpsApi, type JaaProgram } from '../services/fleetCustomerOpsApi';
import { GasCardsOrgView } from './GasCardsOrgView';

type GasCardScope = 'platform' | 'org';

function GasCardsPlatformView() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [programs, setPrograms] = useState<JaaProgram[]>([]);
  const [progCode, setProgCode] = useState('');
  const [progName, setProgName] = useState('');
  const [progMode, setProgMode] = useState<'roam_managed' | 'self_serve'>('roam_managed');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setPrograms(await fleetCustomerOpsApi.getJaaPrograms());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load programs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveProgram = async () => {
    const companyCode = progCode.replace(/\D/g, '');
    if (!companyCode) {
      toast.error('Enter a company code');
      return;
    }
    try {
      await fleetCustomerOpsApi.saveJaaProgram({
        companyCode,
        displayName: progName || companyCode,
        mode: progMode,
      });
      toast.success('Program saved');
      setProgCode('');
      setProgName('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  if (loading && !programs.length) {
    return (
      <div className="flex h-[320px] items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (loadError && !programs.length) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-slate-900">JAA card catalogue</h1>
        <p className="mt-2 text-sm text-slate-600">{loadError}</p>
        <button
          type="button"
          className="mt-4 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
          onClick={() => void load()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl w-full space-y-6 p-8 text-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <span>Dominion</span>
          <span aria-hidden>›</span>
          <span>Master data</span>
          <span aria-hidden>›</span>
          <span>Fuel</span>
          <span aria-hidden>›</span>
          <span className="font-semibold text-slate-900">JAA card catalogue</span>
        </nav>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 font-mono text-[10px] text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          REGION: JM-KGN
        </div>
      </div>

      <div className="mb-2">
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900">JAA card catalogue</h1>
        <p className="mt-1 text-xs leading-normal text-slate-500">Platform gas-card programs.</p>
      </div>

      <div className="mb-6 overflow-hidden rounded-[12px] border border-slate-200/90 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-6 py-3.5">Program</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5">Mode</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {programs.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center italic text-slate-400">
                  The data is not in yet.
                </td>
              </tr>
            ) : (
              programs.map((program) => (
                <tr key={program.id || program.companyCode} className="transition-colors hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {program.displayName || program.companyCode || 'JAA'}
                    <div className="font-mono text-[11px] text-slate-400">{program.companyCode}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[11px] text-slate-600">
                    {program.mode === 'self_serve' ? 'Self-serve (fleet uploads its statement)' : 'Roam-managed (Roam uploads in Fleet Admin)'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-[12px] border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Register program</h2>
          <label className="block text-xs text-slate-500">Company code</label>
          <input
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={progCode}
            onChange={(e) => setProgCode(e.target.value)}
            placeholder="00002920"
          />
          <label className="block text-xs text-slate-500">Display name</label>
          <input
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={progName}
            onChange={(e) => setProgName(e.target.value)}
          />
          <label className="block text-xs text-slate-500">Mode</label>
          <select
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={progMode}
            onChange={(e) => setProgMode(e.target.value as 'roam_managed' | 'self_serve')}
          >
            <option value="roam_managed">Roam-managed (Roam uploads the statement)</option>
            <option value="self_serve">Self-serve (fleet uploads its statement)</option>
          </select>
          <button
            type="button"
            onClick={() => void handleSaveProgram()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white"
          >
            Save program
          </button>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm">
          <span>Cards and Roam&apos;s statement upload are in Fleet Admin → Gas cards.</span>
          <span className="font-mono text-[11px] text-slate-400">FLEET-ADMIN-ISO</span>
        </div>
      </div>
    </div>
  );
}

export function GasCardsPage({ scope = 'platform' }: { scope?: GasCardScope }) {
  if (scope === 'org') {
    return <GasCardsOrgView scope="org" />;
  }
  return <GasCardsPlatformView />;
}
