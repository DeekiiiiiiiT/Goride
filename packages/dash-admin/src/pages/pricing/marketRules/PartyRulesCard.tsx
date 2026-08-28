import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { PricingLayerResponse, PricingParty } from '@roam/dash-admin-client';
import type { MerchantTierRow } from '@roam/dash-admin-client';
import { PARTY_META, partyPreviewMetrics } from './partyRulesUtils';

export function PartyRulesCard({
  party,
  layer,
  tiers,
  onView,
  onEdit,
  canWrite,
}: {
  party: PricingParty;
  layer: PricingLayerResponse | null;
  tiers: MerchantTierRow[];
  onView: () => void;
  onEdit: () => void;
  canWrite: boolean;
}) {
  const meta = PARTY_META[party];
  const metrics = partyPreviewMetrics(party, layer, tiers);

  return (
    <div
      className={`rounded-xl border bg-slate-900/50 ${meta.accent} border-slate-800 overflow-hidden`}
    >
      <button
        type="button"
        onClick={onView}
        className="w-full text-left px-4 py-3 hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-white">{meta.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 mt-1" />
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-lg bg-slate-950/70 px-2 py-1.5 text-slate-400">
              <span className="block text-slate-500">{m.label}</span>
              <span className="text-slate-200">{m.value}</span>
            </div>
          ))}
        </div>
      </button>
      {canWrite && party !== 'partner' && (
        <div className="border-t border-slate-800 px-4 py-2 flex justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="text-xs text-amber-400 hover:text-amber-300"
          >
            Edit {meta.label.toLowerCase()}
          </button>
        </div>
      )}
      {party === 'partner' && (
        <div className="border-t border-slate-800 px-4 py-2 flex justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
            className="text-xs text-violet-400 hover:text-violet-300"
          >
            View tiers summary →
          </button>
        </div>
      )}
    </div>
  );
}
