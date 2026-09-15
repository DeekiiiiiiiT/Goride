/**
 * Courier remittance summary — cash held for Roam (never merged with earnings).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { formatJmd } from '@/lib/formatMoney';
import { fetchCourierRemittance, type CourierRemittanceSummary } from '@/lib/courierApi';

type Props = {
  onOpenDetail: () => void;
};

export function RemittanceCard({ onOpenDetail }: Props) {
  const [data, setData] = useState<CourierRemittanceSummary | null>(null);

  const load = useCallback(async () => {
    const r = await fetchCourierRemittance();
    setData(r);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data || data.balanceMinor <= 0) {
    return null;
  }

  const pct = Math.min(
    100,
    Math.round((data.balanceMinor / Math.max(data.thresholdMinor, 1)) * 100),
  );

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="w-full text-left bg-surface rounded-xl shadow-soft p-4 border border-amber-500/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted font-semibold">
            Cash you’re holding for Roam
          </p>
          <p className="text-2xl font-bold text-on-surface mt-1">
            J${formatJmd(data.balanceJmd)}
          </p>
          <p className="text-xs text-muted mt-1">
            Not your earnings — remit before you hit the pause limit.
          </p>
        </div>
        <MaterialIcon name="account_balance_wallet" className="text-2xl text-amber-600" />
      </div>
      <div className="mt-3 h-2 rounded-full bg-surface-variant overflow-hidden">
        <div
          className={`h-full rounded-full ${data.isPaused ? 'bg-red-500' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-muted mt-2">
        {data.isPaused
          ? 'Paused — remit to take new jobs'
          : `Pause at J$${formatJmd(data.thresholdJmd)}`}
      </p>
    </button>
  );
}
