import React from 'react';
import type { MerchantTierRow } from '@roam/dash-admin-client';

export function PartnerRulesPanel({
  tiers,
  onGoToTiers,
}: {
  tiers: MerchantTierRow[];
  onGoToTiers: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Partner commission rates are managed on the <strong className="text-slate-300">Merchant Tiers</strong>{' '}
        tab — not duplicated here.
      </p>
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-950/80 text-slate-500 text-xs">
            <tr>
              <th className="text-left p-3">Tier</th>
              <th className="text-right p-3">Commission</th>
              <th className="text-right p-3">Merchants</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.id} className="border-t border-slate-800">
                <td className="p-3 text-white">{t.name}</td>
                <td className="p-3 text-right text-slate-200">
                  {Math.round(Number(t.commission_rate) * 100)}%
                </td>
                <td className="p-3 text-right text-slate-400">{t.merchant_count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={onGoToTiers}
        className="px-4 py-2 rounded-lg border border-violet-700 text-violet-300 text-sm hover:bg-violet-950/40"
      >
        Manage commission tiers →
      </button>
    </div>
  );
}
