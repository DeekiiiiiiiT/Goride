import React from 'react';
import type { EarningsPolicy } from '../../types/earningsPolicy';

interface Props {
  policy: EarningsPolicy;
  compact?: boolean;
}

export function EarningsPolicyCardPreview({ policy, compact }: Props) {
  const topTier = policy.tiers.reduce(
    (max, t) => (t.sharePercentage > max.sharePercentage ? t : max),
    policy.tiers[0],
  );
  const paEnabled = policy.personalAllowance?.enabled;
  const topPaKm = paEnabled
    ? Math.max(...(policy.personalAllowance.bands || []).map((b) => b.earnedKm))
    : 0;
  const weeklyQuota = policy.quotas?.weekly?.enabled ? policy.quotas.weekly.amount : 0;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {weeklyQuota > 0 && <span>Weekly: ${weeklyQuota.toLocaleString()}</span>}
        {topTier && <span>Top share: {topTier.sharePercentage}%</span>}
        <span>PA: {paEnabled ? `${topPaKm} km` : 'Off'}</span>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Weekly Quota</p>
          <p className="font-semibold text-slate-900">
            {weeklyQuota > 0 ? `$${weeklyQuota.toLocaleString()}` : 'Disabled'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Top Tier</p>
          <p className="font-semibold text-slate-900">
            {topTier?.name || '—'} ({topTier?.sharePercentage || 0}%)
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Personal Allow.</p>
          <p className="font-semibold text-slate-900">
            {paEnabled ? `${topPaKm} km max` : 'Disabled'}
          </p>
        </div>
      </div>
    </div>
  );
}
