import React from 'react';
import type { PricingLayerResponse, PricingParty } from '@roam/dash-admin-client';
import { layerLabel, PARTY_META } from './partyRulesUtils';

export function ProvenanceChips({
  party,
  layer,
}: {
  party: PricingParty;
  layer: PricingLayerResponse | null;
}) {
  const prov = layer?.provenance?.[party];
  if (!prov || Object.keys(prov).length === 0) {
    return (
      <p className="text-xs text-slate-500">All values inherit from Default unless overridden at this layer.</p>
    );
  }

  const entries = Object.entries(prov).slice(0, 8);
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([path, source]) => (
        <span
          key={path}
          className="inline-flex items-center gap-1 rounded-md bg-slate-950 border border-slate-800 px-2 py-0.5 text-[10px] text-slate-400"
          title={path}
        >
          <span className="text-slate-500 truncate max-w-[120px]">{path.split('.').pop()}</span>
          <span className="text-amber-500/90">{layerLabel(source)}</span>
        </span>
      ))}
    </div>
  );
}

export function PartyRulesViewHeader({
  party,
  scopeTitle,
  mode,
}: {
  party: PricingParty;
  scopeTitle: string;
  mode: 'view' | 'edit';
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-white">
        {mode === 'edit' ? 'Edit' : 'View'} {PARTY_META[party].label} · {scopeTitle}
      </h2>
      <p className="text-xs text-slate-400 mt-0.5">{PARTY_META[party].description}</p>
    </div>
  );
}
