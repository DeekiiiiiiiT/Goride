import React from 'react';
import type { PricingParty } from '@roam/dash-admin-client';
import { layerLabel, PARTY_META } from './partyRulesUtils';

type ResolvedSection = Record<string, unknown>;

export function ResolvedRulesPanel({
  resolved,
  provenance,
  stack,
}: {
  resolved?: Partial<Record<PricingParty, ResolvedSection>>;
  provenance?: Partial<Record<PricingParty, Record<string, string>>>;
  stack?: string[];
}) {
  if (!resolved) return null;

  const parties: PricingParty[] = ['customer', 'rider', 'partner', 'platform'];

  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <div className="bg-slate-900 px-4 py-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-white">Resolved rules by party</span>
        {stack && stack.length > 0 && (
          <span className="text-xs text-slate-500">{stack.join(' → ')}</span>
        )}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
        {parties.map((party) => {
          const section = resolved[party] ?? {};
          const prov = provenance?.[party] ?? {};
          const keys = Object.keys(section).slice(0, 6);
          return (
            <div key={party} className="p-3 space-y-2">
              <p className="text-xs font-medium text-slate-300">{PARTY_META[party].label}</p>
              {keys.length === 0 ? (
                <p className="text-xs text-slate-500">Inherits default</p>
              ) : (
                <ul className="space-y-1 text-[11px]">
                  {keys.map((k) => {
                    const val = section[k];
                    const display =
                      typeof val === 'object' && val != null
                        ? JSON.stringify(val).slice(0, 40)
                        : String(val);
                    const source = prov[k] ?? prov[`${k}.${Object.keys(val as object)[0]}`];
                    return (
                      <li key={k} className="text-slate-400">
                        <span className="text-slate-500">{k}: </span>
                        <span className="text-slate-200">{display}</span>
                        {source && (
                          <span className="ml-1 text-amber-500/80">({layerLabel(source)})</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
